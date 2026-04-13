/**
 * b1-runner.ts
 * Orchestrates B1.1 intent derivation and B1.2 plan generation for all subjects.
 * Loads A1+A2 artifacts, derives intents, generates plans, writes outputs,
 * validates against GT.
 *
 * Phase isolation: imports only from src/models/, src/workflows/graph-index.ts,
 * src/phase-b/b0/, and src/phase-b/b1/.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { A1Multigraph, RouteNode } from '../../models/multigraph.js';
import type { A2WorkflowSet } from '../../models/workflow.js';
import type { GraphIndex } from '../../workflows/graph-index.js';
import { buildGraphIndex } from '../../workflows/graph-index.js';
import type { SubjectManifest } from '../b0/manifest-schema.js';
import { deriveIntents, resolveTerminalExternalUrl } from './intent-deriver.js';
import type { RealizationIntent, B1IntentSet } from './intent-types.js';
import { derivePlans } from './plan-deriver.js';
import type { ActionPlan } from './plan-types.js';

// ---------------------------------------------------------------------------
// GT types (for validation only)
// ---------------------------------------------------------------------------

interface GTExpectedIntent {
  triggerKind: string;
  triggerEvent?: string;
  triggerWidgetTag?: string;
  triggerWidgetKind?: string;
  componentSelector?: string;
  startRouteFullPaths?: string[];
  requiresAuth: boolean;
  requiresParams: boolean;
  hasFormSchema: boolean;
  terminalRoutePath?: string | null;
  terminalExternalUrl?: string;
  formFields?: unknown[];
}

interface GTExpectedPlan {
  assignment: {
    account: null | { note: string };
    routeParams: Record<string, string>;
    formData: Record<string, unknown>;
  };
  preConditions: Array<{ type: string; url?: string; note?: string }>;
  steps: Array<{
    type: string;
    locatorStrategy?: string;
    locatorValue?: string;
    componentScope?: string;
    edgeKind?: string;
    value?: string;
    fields?: Array<{ locatorStrategy: string; locatorValue: string; value: string }>;
  }>;
  terminalUrl: string;
}

interface GTEntry {
  gtId: string;
  workflowId: string;
  a2WorkflowIndex: number;
  expectedIntent: GTExpectedIntent;
  expectedPlan?: GTExpectedPlan;
}

interface GTFile {
  subject: string;
  totalEntries: number;
  entries: GTEntry[];
}

// ---------------------------------------------------------------------------
// GT mismatch tracking
// ---------------------------------------------------------------------------

interface GTMismatch {
  gtId: string;
  workflowId: string;
  field: string;
  expected: unknown;
  actual: unknown;
}

// GT uses abbreviated edge kind names; normalize for comparison
const GT_TRIGGER_KIND_MAP: Record<string, string> = {
  'WTH': 'WIDGET_TRIGGERS_HANDLER',
  'WSF': 'WIDGET_SUBMITS_FORM',
  'WNR': 'WIDGET_NAVIGATES_ROUTE',
  'WNE': 'WIDGET_NAVIGATES_EXTERNAL',
};

// GT uses "Unknown" for SpecWidgetKind "OtherInteractive"
const GT_WIDGET_KIND_MAP: Record<string, string> = {
  'Unknown': 'OtherInteractive',
  'Textarea': 'TextArea',
};

// ---------------------------------------------------------------------------
// Summary types
// ---------------------------------------------------------------------------

export interface B1SubjectSummary {
  subject: string;
  status: 'OK' | 'ERROR';
  intentCount: number;
  feasibleCount: number;
  conditionalCount: number;
  prunedCount: number;
  gtMatched: number;
  gtMismatches: number;
  gtMissing: number;
}

export interface B1Summary {
  subjects: B1SubjectSummary[];
}

export interface B1RunnerConfig {
  outputDir: string;
  logsDir: string;
  gtDir: string;
}

export interface B1PlanRunnerConfig {
  outputDir: string;
  subjectsDir: string;
  logsDir: string;
  gtDir: string;
}

export interface B1PlanSubjectSummary {
  subject: string;
  status: 'OK' | 'ERROR';
  planCount: number;
  skipped: number;
  gtMatched: number;
  gtMismatches: number;
  gtMissing: number;
}

export interface B1PlanSummary {
  subjects: B1PlanSubjectSummary[];
}

// ---------------------------------------------------------------------------
// GT validation
// ---------------------------------------------------------------------------

function validateIntentAgainstGT(
  intent: RealizationIntent,
  gt: GTExpectedIntent,
  gtId: string,
  index: GraphIndex,
): GTMismatch[] {
  const nodeMap = index.nodeMap;
  const mismatches: GTMismatch[] = [];
  const wfId = intent.workflowId;

  // triggerKind (GT uses abbreviations: WTH, WSF, WNR, WNE)
  const normalizedGtKind = GT_TRIGGER_KIND_MAP[gt.triggerKind] ?? gt.triggerKind;
  if (intent.triggerKind !== normalizedGtKind) {
    mismatches.push({ gtId, workflowId: wfId, field: 'triggerKind', expected: gt.triggerKind, actual: intent.triggerKind });
  }

  // triggerEvent (optional in GT)
  if (gt.triggerEvent !== undefined && (intent.triggerEvent ?? 'click') !== gt.triggerEvent) {
    mismatches.push({ gtId, workflowId: wfId, field: 'triggerEvent', expected: gt.triggerEvent, actual: intent.triggerEvent });
  }

  // triggerWidgetTag (optional in GT)
  if (gt.triggerWidgetTag !== undefined && (intent.triggerWidget.tagName ?? '') !== gt.triggerWidgetTag) {
    mismatches.push({ gtId, workflowId: wfId, field: 'triggerWidgetTag', expected: gt.triggerWidgetTag, actual: intent.triggerWidget.tagName });
  }

  // triggerWidgetKind (GT uses "Unknown" for SpecWidgetKind "OtherInteractive"; optional in GT)
  if (gt.triggerWidgetKind !== undefined) {
    const normalizedGtWidgetKind = GT_WIDGET_KIND_MAP[gt.triggerWidgetKind] ?? gt.triggerWidgetKind;
    if (intent.triggerWidget.widgetKind !== normalizedGtWidgetKind) {
      mismatches.push({ gtId, workflowId: wfId, field: 'triggerWidgetKind', expected: gt.triggerWidgetKind, actual: intent.triggerWidget.widgetKind });
    }
  }

  // componentSelector (optional in GT)
  if (gt.componentSelector !== undefined && (intent.triggerWidget.componentSelector ?? '') !== gt.componentSelector) {
    mismatches.push({ gtId, workflowId: wfId, field: 'componentSelector', expected: gt.componentSelector, actual: intent.triggerWidget.componentSelector });
  }

  // startRouteFullPaths (optional in GT — some subjects have minimal GT format)
  if (gt.startRouteFullPaths !== undefined) {
    const intentPaths = intent.startRoutes.map(r => r.fullPath).sort();
    const gtPaths = [...gt.startRouteFullPaths].sort();
    if (JSON.stringify(intentPaths) !== JSON.stringify(gtPaths)) {
      mismatches.push({ gtId, workflowId: wfId, field: 'startRouteFullPaths', expected: gtPaths, actual: intentPaths });
    }
  }

  // requiresAuth: true iff ALL start routes require auth guards (including inherited
  // from ancestor routes). If any start route is guard-free, the workflow is reachable
  // without auth.
  const allStartRoutesRequireAuth = intent.startRoutes.length > 0 &&
    intent.startRoutes.every(r => {
      // Collect guards from this route + ancestors via ROUTE_HAS_CHILD
      const guards: string[] = [];
      const routeNode = nodeMap.get(r.routeId);
      if (routeNode?.kind === 'Route') {
        guards.push(...(routeNode as RouteNode).meta.guards);
      }
      let parentId = index.routeParentOf.get(r.routeId);
      const seen = new Set<string>();
      while (parentId !== undefined && !seen.has(parentId)) {
        seen.add(parentId);
        const parentNode = nodeMap.get(parentId);
        if (parentNode?.kind === 'Route') {
          guards.push(...(parentNode as RouteNode).meta.guards);
        }
        parentId = index.routeParentOf.get(parentId);
      }
      const authGuards = guards.filter(g => !g.toLowerCase().includes('noauth'));
      return authGuards.length > 0;
    });
  if (allStartRoutesRequireAuth !== gt.requiresAuth) {
    mismatches.push({ gtId, workflowId: wfId, field: 'requiresAuth', expected: gt.requiresAuth, actual: allStartRoutesRequireAuth });
  }

  // requiresParams
  if (intent.requiresParams !== gt.requiresParams) {
    mismatches.push({ gtId, workflowId: wfId, field: 'requiresParams', expected: gt.requiresParams, actual: intent.requiresParams });
  }

  // hasFormSchema
  const intentHasForm = intent.formSchema !== undefined;
  if (intentHasForm !== gt.hasFormSchema) {
    mismatches.push({ gtId, workflowId: wfId, field: 'hasFormSchema', expected: gt.hasFormSchema, actual: intentHasForm });
  }

  // terminalRoutePath (optional in GT)
  if (gt.terminalRoutePath !== undefined) {
    const intentTerminal = intent.terminalRoutePath ?? null;
    if (intentTerminal !== gt.terminalRoutePath) {
      mismatches.push({ gtId, workflowId: wfId, field: 'terminalRoutePath', expected: gt.terminalRoutePath, actual: intentTerminal });
    }
  }

  // terminalExternalUrl (WNE only)
  if (gt.terminalExternalUrl !== undefined) {
    const actualExtUrl = resolveTerminalExternalUrl(intent.terminalNodeId, nodeMap);
    if (actualExtUrl !== gt.terminalExternalUrl) {
      mismatches.push({ gtId, workflowId: wfId, field: 'terminalExternalUrl', expected: gt.terminalExternalUrl, actual: actualExtUrl });
    }
  }

  // formFields count parity (optional in GT)
  if (gt.formFields !== undefined) {
    const intentFieldCount = intent.formSchema?.length ?? 0;
    if (intentFieldCount !== gt.formFields.length) {
      mismatches.push({ gtId, workflowId: wfId, field: 'formFieldCount', expected: gt.formFields.length, actual: intentFieldCount });
    }
  }

  return mismatches;
}

// ---------------------------------------------------------------------------
// Subject discovery
// ---------------------------------------------------------------------------

function discoverSubjects(outputDir: string): string[] {
  if (!fs.existsSync(outputDir)) return [];
  return fs.readdirSync(outputDir)
    .filter((name) => {
      const jsonDir = path.join(outputDir, name, 'json');
      return fs.existsSync(path.join(jsonDir, 'a1-multigraph.json')) &&
             fs.existsSync(path.join(jsonDir, 'a2-workflows.json'));
    })
    .sort();
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export function runB1IntentDerivation(config: B1RunnerConfig): B1Summary {
  const subjects = discoverSubjects(config.outputDir);
  const logLines: string[] = [];
  const summaries: B1SubjectSummary[] = [];

  logLines.push(`B1 Intent Derivation — ${new Date().toISOString()}`);
  logLines.push(`Output directory: ${config.outputDir}`);
  logLines.push(`GT directory: ${config.gtDir}`);
  logLines.push(`Discovered ${subjects.length} subject(s): ${subjects.join(', ')}`);
  logLines.push('');

  for (const subjectName of subjects) {
    logLines.push(`--- ${subjectName} ---`);

    try {
      // Load A1 + A2
      const jsonDir = path.join(config.outputDir, subjectName, 'json');
      const a1: A1Multigraph = JSON.parse(
        fs.readFileSync(path.join(jsonDir, 'a1-multigraph.json'), 'utf-8'),
      ) as A1Multigraph;
      const a2: A2WorkflowSet = JSON.parse(
        fs.readFileSync(path.join(jsonDir, 'a2-workflows.json'), 'utf-8'),
      ) as A2WorkflowSet;

      // Derive intents
      const intentSet = deriveIntents(a1, a2);

      // Write b1-intents.json
      const outputPath = path.join(jsonDir, 'b1-intents.json');
      fs.writeFileSync(outputPath, JSON.stringify(intentSet, null, 2) + '\n', 'utf-8');

      logLines.push(`  Intents derived: ${intentSet.intents.length}`);
      logLines.push(`  Feasible: ${intentSet.stats.feasibleCount}`);
      logLines.push(`  Conditional: ${intentSet.stats.conditionalCount}`);
      logLines.push(`  Pruned (skipped): ${intentSet.stats.prunedCount}`);

      // GT validation
      let gtMatched = 0;
      let gtMismatchCount = 0;
      let gtMissing = 0;

      const gtPath = path.join(config.gtDir, `${subjectName}.json`);
      if (fs.existsSync(gtPath)) {
        const gtFile: GTFile = JSON.parse(fs.readFileSync(gtPath, 'utf-8')) as GTFile;
        const index = buildGraphIndex(a1);
        const allMismatches: GTMismatch[] = [];
        for (const entry of gtFile.entries) {
          // Match by a2WorkflowIndex (GT uses hand-written short IDs; index is authoritative)
          const intent = intentSet.intents[entry.a2WorkflowIndex];
          if (intent === undefined) {
            gtMissing++;
            logLines.push(`  [GT MISSING] ${entry.gtId}: a2WorkflowIndex ${entry.a2WorkflowIndex} out of range (${intentSet.intents.length} intents)`);
            continue;
          }

          const mismatches = validateIntentAgainstGT(
            intent,
            entry.expectedIntent,
            entry.gtId,
            index,
          );

          if (mismatches.length === 0) {
            gtMatched++;
          } else {
            gtMismatchCount++;
            for (const m of mismatches) {
              allMismatches.push(m);
              logLines.push(`  [GT MISMATCH] ${m.gtId} field=${m.field}: expected=${JSON.stringify(m.expected)} actual=${JSON.stringify(m.actual)}`);
            }
          }
        }

        logLines.push(`  GT validation: ${gtMatched} matched, ${gtMismatchCount} with mismatches, ${gtMissing} missing`);
        if (allMismatches.length > 0) {
          logLines.push(`  Total mismatch fields: ${allMismatches.length}`);
        }
      } else {
        logLines.push('  GT file not found — skipping validation');
      }

      logLines.push('');

      summaries.push({
        subject: subjectName,
        status: 'OK',
        intentCount: intentSet.intents.length,
        feasibleCount: intentSet.stats.feasibleCount,
        conditionalCount: intentSet.stats.conditionalCount,
        prunedCount: intentSet.stats.prunedCount,
        gtMatched,
        gtMismatches: gtMismatchCount,
        gtMissing,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logLines.push(`  ERROR: ${msg}`);
      logLines.push('');
      summaries.push({
        subject: subjectName,
        status: 'ERROR',
        intentCount: 0,
        feasibleCount: 0,
        conditionalCount: 0,
        prunedCount: 0,
        gtMatched: 0,
        gtMismatches: 0,
        gtMissing: 0,
      });
    }
  }

  // Write log
  fs.mkdirSync(config.logsDir, { recursive: true });
  fs.writeFileSync(
    path.join(config.logsDir, 'b1-intent-validation.log'),
    logLines.join('\n') + '\n',
    'utf-8',
  );

  // Write summary
  const summary: B1Summary = { subjects: summaries };
  fs.writeFileSync(
    path.join(config.logsDir, 'b1-intent-summary.json'),
    JSON.stringify(summary, null, 2) + '\n',
    'utf-8',
  );

  return summary;
}

// ---------------------------------------------------------------------------
// Plan GT validation
// ---------------------------------------------------------------------------

// Normalize GT precondition types to spec types
const GT_PRECOND_TYPE_MAP: Record<string, string> = {
  'authenticate': 'auth-setup',
  'trigger-dialog': 'trigger-dialog-open',
  'trigger-modal': 'trigger-dialog-open',
};

// GT precondition types that have no spec equivalent (informational only)
const GT_ONLY_PRECOND_TYPES = new Set([
  'precondition',
  'ensure-logged-out',
  'ensure-panel-open',
]);

function validatePlanAgainstGT(
  plan: ActionPlan,
  gt: GTExpectedPlan,
  gtId: string,
): GTMismatch[] {
  const mismatches: GTMismatch[] = [];
  const wfId = plan.workflowId;

  // assignment.account parity: both null or both present
  const planHasAccount = plan.assignment.account !== undefined;
  const gtHasAccount = gt.assignment.account !== null;
  if (planHasAccount !== gtHasAccount) {
    mismatches.push({ gtId, workflowId: wfId, field: 'plan.assignment.account', expected: gtHasAccount, actual: planHasAccount });
  }

  // assignment.routeParams: key set match (GT values may use angle brackets)
  const planParamKeys = Object.keys(plan.assignment.routeParams).sort();
  const gtParamKeys = Object.keys(gt.assignment.routeParams).sort();
  if (JSON.stringify(planParamKeys) !== JSON.stringify(gtParamKeys)) {
    mismatches.push({ gtId, workflowId: wfId, field: 'plan.assignment.routeParams', expected: gt.assignment.routeParams, actual: plan.assignment.routeParams });
  }

  // assignment.formData: key set match (values may differ)
  const planFormKeys = Object.keys(plan.assignment.formData).sort();
  const gtFormKeys = Object.keys(gt.assignment.formData).sort();
  if (JSON.stringify(planFormKeys) !== JSON.stringify(gtFormKeys)) {
    mismatches.push({ gtId, workflowId: wfId, field: 'plan.assignment.formDataKeys', expected: gtFormKeys, actual: planFormKeys });
  }

  // preConditions: type match after normalization (skip GT-only types)
  const gtPrecondTypes = gt.preConditions
    .map(pc => GT_PRECOND_TYPE_MAP[pc.type] ?? pc.type)
    .filter(t => !GT_ONLY_PRECOND_TYPES.has(t));
  const planPrecondTypes = plan.preConditions.map(pc => pc.type);

  // Compare navigate-to-route URL (normalize: substitute :param with plan's routeParams)
  const gtNavUrl = gt.preConditions.find(pc => pc.type === 'navigate-to-route')?.url;
  const planNavUrl = plan.preConditions.find(pc => pc.type === 'navigate-to-route')?.config['url'];
  if (gtNavUrl !== undefined && planNavUrl !== undefined) {
    let gtNavResolved = gtNavUrl;
    for (const [k, v] of Object.entries(plan.assignment.routeParams)) {
      gtNavResolved = gtNavResolved.replace(`:${k}`, v);
    }
    if (gtNavResolved !== planNavUrl) {
      mismatches.push({ gtId, workflowId: wfId, field: 'plan.preCondition.navigateUrl', expected: gtNavUrl, actual: planNavUrl });
    }
  }

  // Auth consistency: GT expresses auth via account field (non-null), not via
  // preCondition type. The account parity check above already validates the auth
  // decision semantically. Only flag if GT has an explicit authenticate preCondition
  // that disagrees with the plan's auth-setup presence.
  const gtHasAuthPrecond = gtPrecondTypes.includes('auth-setup');
  const planHasAuth = planPrecondTypes.includes('auth-setup');
  if (gtHasAuthPrecond !== planHasAuth) {
    // Only mismatch if account parity also disagrees (otherwise it's just schema diff)
    if (planHasAccount !== gtHasAccount) {
      mismatches.push({ gtId, workflowId: wfId, field: 'plan.preCondition.authSetup', expected: gtHasAuthPrecond, actual: planHasAuth });
    }
  }

  // Compare dialog presence
  const gtHasDialog = gtPrecondTypes.includes('trigger-dialog-open');
  const planHasDialog = planPrecondTypes.includes('trigger-dialog-open');
  if (gtHasDialog !== planHasDialog) {
    mismatches.push({ gtId, workflowId: wfId, field: 'plan.preCondition.dialogOpen', expected: gtHasDialog, actual: planHasDialog });
  }

  // steps: expand fill-form fields into individual steps for comparison
  // GT fill-form = N field steps; the submit is a separate GT step entry
  let gtStepCount = 0;
  for (const step of gt.steps) {
    if (step.type === 'fill-form' && step.fields !== undefined) {
      gtStepCount += step.fields.length; // each field = one step
    } else {
      gtStepCount += 1;
    }
  }
  // Plan steps may include wait-for-element, so exclude those for comparison
  const planActionSteps = plan.steps.filter(s => s.type !== 'wait-for-element');
  if (planActionSteps.length !== gtStepCount) {
    mismatches.push({ gtId, workflowId: wfId, field: 'plan.stepCount', expected: gtStepCount, actual: planActionSteps.length });
  }

  // terminalUrl: GT may use param templates (:id), plan may use resolved values or templates.
  // For WSF create workflows, plan keeps :param templates (server-generated IDs).
  const planTerminalUrl = plan.postConditions.find(pc => pc.type === 'assert-url-matches')?.expected;
  if (planTerminalUrl !== undefined && gt.terminalUrl !== undefined) {
    // Resolve GT params for comparison
    let gtTerminalResolved = gt.terminalUrl;
    for (const [k, v] of Object.entries(plan.assignment.routeParams)) {
      gtTerminalResolved = gtTerminalResolved.replace(`:${k}`, v);
    }
    // Also check if unsubstituted templates match (for WSF create workflows)
    if (gtTerminalResolved !== planTerminalUrl && gt.terminalUrl !== planTerminalUrl) {
      mismatches.push({ gtId, workflowId: wfId, field: 'plan.terminalUrl', expected: gt.terminalUrl, actual: planTerminalUrl });
    }
  }

  return mismatches;
}

// ---------------------------------------------------------------------------
// Plan runner
// ---------------------------------------------------------------------------

export function runB1PlanGeneration(config: B1PlanRunnerConfig): B1PlanSummary {
  const subjects = discoverSubjects(config.outputDir);
  const logLines: string[] = [];
  const summaries: B1PlanSubjectSummary[] = [];

  logLines.push(`B1 Plan Generation — ${new Date().toISOString()}`);
  logLines.push(`Output directory: ${config.outputDir}`);
  logLines.push(`Subjects directory: ${config.subjectsDir}`);
  logLines.push(`GT directory: ${config.gtDir}`);
  logLines.push(`Discovered ${subjects.length} subject(s): ${subjects.join(', ')}`);
  logLines.push('');

  for (const subjectName of subjects) {
    logLines.push(`--- ${subjectName} ---`);

    try {
      const jsonDir = path.join(config.outputDir, subjectName, 'json');

      // Load A1
      const a1: A1Multigraph = JSON.parse(
        fs.readFileSync(path.join(jsonDir, 'a1-multigraph.json'), 'utf-8'),
      ) as A1Multigraph;

      // Load b1-intents.json
      const intentSetPath = path.join(jsonDir, 'b1-intents.json');
      if (!fs.existsSync(intentSetPath)) {
        logLines.push('  ERROR: b1-intents.json not found — run B1.1 first');
        logLines.push('');
        summaries.push({
          subject: subjectName, status: 'ERROR',
          planCount: 0, skipped: 0, gtMatched: 0, gtMismatches: 0, gtMissing: 0,
        });
        continue;
      }
      const intentSet: B1IntentSet = JSON.parse(
        fs.readFileSync(intentSetPath, 'utf-8'),
      ) as B1IntentSet;

      // Load manifest
      const manifestPath = path.join(config.subjectsDir, subjectName, 'subject-manifest.json');
      if (!fs.existsSync(manifestPath)) {
        logLines.push('  ERROR: subject-manifest.json not found');
        logLines.push('');
        summaries.push({
          subject: subjectName, status: 'ERROR',
          planCount: 0, skipped: 0, gtMatched: 0, gtMismatches: 0, gtMissing: 0,
        });
        continue;
      }
      const manifest: SubjectManifest = JSON.parse(
        fs.readFileSync(manifestPath, 'utf-8'),
      ) as SubjectManifest;

      // Generate plans
      const planSet = derivePlans(intentSet, manifest, a1);

      // Write b1-plans.json
      const outputPath = path.join(jsonDir, 'b1-plans.json');
      fs.writeFileSync(outputPath, JSON.stringify(planSet, null, 2) + '\n', 'utf-8');

      logLines.push(`  Plans generated: ${planSet.stats.totalPlanned}`);
      logLines.push(`  Skipped: ${planSet.stats.skipped}`);

      // GT plan validation
      let gtMatched = 0;
      let gtMismatchCount = 0;
      let gtMissing = 0;

      const gtPath = path.join(config.gtDir, `${subjectName}.json`);
      if (fs.existsSync(gtPath)) {
        const gtFile: GTFile = JSON.parse(fs.readFileSync(gtPath, 'utf-8')) as GTFile;
        const allMismatches: GTMismatch[] = [];

        for (const entry of gtFile.entries) {
          if (entry.expectedPlan === undefined) continue;

          // Find plan by matching a2WorkflowIndex → intent → plan
          const intent = intentSet.intents[entry.a2WorkflowIndex];
          if (intent === undefined) {
            gtMissing++;
            logLines.push(`  [PLAN GT MISSING] ${entry.gtId}: intent index ${entry.a2WorkflowIndex} out of range`);
            continue;
          }

          const plan = planSet.plans.find(p => p.workflowId === intent.workflowId);
          if (plan === undefined) {
            gtMissing++;
            logLines.push(`  [PLAN GT MISSING] ${entry.gtId}: no plan for ${intent.workflowId}`);
            continue;
          }

          const mismatches = validatePlanAgainstGT(plan, entry.expectedPlan, entry.gtId);
          if (mismatches.length === 0) {
            gtMatched++;
          } else {
            gtMismatchCount++;
            for (const m of mismatches) {
              allMismatches.push(m);
              logLines.push(`  [PLAN GT MISMATCH] ${m.gtId} field=${m.field}: expected=${JSON.stringify(m.expected)} actual=${JSON.stringify(m.actual)}`);
            }
          }
        }

        logLines.push(`  Plan GT: ${gtMatched} matched, ${gtMismatchCount} with mismatches, ${gtMissing} missing`);
        if (allMismatches.length > 0) {
          logLines.push(`  Total plan mismatch fields: ${allMismatches.length}`);
        }
      } else {
        logLines.push('  GT file not found — skipping plan validation');
      }

      logLines.push('');

      summaries.push({
        subject: subjectName,
        status: 'OK',
        planCount: planSet.stats.totalPlanned,
        skipped: planSet.stats.skipped,
        gtMatched,
        gtMismatches: gtMismatchCount,
        gtMissing,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logLines.push(`  ERROR: ${msg}`);
      logLines.push('');
      summaries.push({
        subject: subjectName, status: 'ERROR',
        planCount: 0, skipped: 0, gtMatched: 0, gtMismatches: 0, gtMissing: 0,
      });
    }
  }

  // Write log
  fs.mkdirSync(config.logsDir, { recursive: true });
  fs.writeFileSync(
    path.join(config.logsDir, 'b1-plan-validation.log'),
    logLines.join('\n') + '\n',
    'utf-8',
  );

  // Write summary
  const summary: B1PlanSummary = { subjects: summaries };
  fs.writeFileSync(
    path.join(config.logsDir, 'b1-plan-summary.json'),
    JSON.stringify(summary, null, 2) + '\n',
    'utf-8',
  );

  return summary;
}
