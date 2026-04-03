/**
 * b2-runner.ts
 * Orchestrates B2 code generation for all subjects.
 * Loads b1-plans.json + subject manifests, generates Selenium test files,
 * computes pre-execution generation coverage, writes outputs and logs.
 *
 * Phase isolation: imports only from src/models/, src/phase-b/b1/, src/phase-b/b2/.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { A2WorkflowSet } from '../../models/workflow.js';
import type { SubjectManifest } from '../b0/manifest-schema.js';
import type { B1PlanSet } from '../b1/plan-types.js';
import type { B2CoverageReport, B2TestEntry, B2TestSet } from './codegen-types.js';
import { emitTestSet } from './test-emitter.js';

// ---------------------------------------------------------------------------
// Filename sanitization
// ---------------------------------------------------------------------------

/**
 * Convert a workflowId (which may contain file paths, colons, pipes, etc.)
 * into a valid, deterministic filename.
 */
function sanitizeFileName(workflowId: string): string {
  // Hash-based approach: use a short deterministic hash + human-readable suffix
  // to keep filenames short and valid on all platforms
  let hash = 0;
  for (let i = 0; i < workflowId.length; i++) {
    hash = ((hash << 5) - hash + workflowId.charCodeAt(i)) | 0;
  }
  const hexHash = (hash >>> 0).toString(16).padStart(8, '0');

  // Extract a readable suffix from the workflowId:
  // component#Class|file:line:col|WidgetKind|ordinal::EdgeKind::target::stableIndex
  // Try to get the component class + edge kind
  const parts = workflowId.split('::');
  const edgeKind = parts.length > 1 ? parts[1]! : '';
  const shortKind = edgeKind
    .replace('WIDGET_TRIGGERS_HANDLER', 'WTH')
    .replace('WIDGET_SUBMITS_FORM', 'WSF')
    .replace('WIDGET_NAVIGATES_ROUTE', 'WNR')
    .replace('WIDGET_NAVIGATES_EXTERNAL', 'WNE');

  // Extract component class name
  const hashIdx = workflowId.indexOf('#');
  const pipeIdx = workflowId.indexOf('|');
  const className = hashIdx >= 0 && pipeIdx > hashIdx
    ? workflowId.substring(hashIdx + 1, pipeIdx)
    : '';

  const suffix = className && shortKind
    ? `${className}_${shortKind}`
    : className || shortKind || 'test';

  return `${hexHash}_${suffix}`;
}

// ---------------------------------------------------------------------------
// Config + Summary types
// ---------------------------------------------------------------------------

export interface B2RunnerConfig {
  outputDir: string;
  subjectsDir: string;
  logsDir: string;
}

export interface B2SubjectSummary {
  subject: string;
  status: 'OK' | 'ERROR';
  testsGenerated: number;
  coverage: B2CoverageReport;
}

export interface B2Summary {
  subjects: B2SubjectSummary[];
}

// ---------------------------------------------------------------------------
// Subject discovery
// ---------------------------------------------------------------------------

function discoverSubjects(outputDir: string): string[] {
  if (!fs.existsSync(outputDir)) return [];
  return fs.readdirSync(outputDir)
    .filter((name) => {
      const jsonDir = path.join(outputDir, name, 'json');
      return fs.existsSync(path.join(jsonDir, 'b1-plans.json')) &&
             fs.existsSync(path.join(jsonDir, 'a2-workflows.json'));
    })
    .sort();
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export function runB2CodeGeneration(config: B2RunnerConfig): B2Summary {
  const subjects = discoverSubjects(config.outputDir);
  const logLines: string[] = [];
  const summaries: B2SubjectSummary[] = [];

  logLines.push(`B2 Code Generation — ${new Date().toISOString()}`);
  logLines.push(`Output directory: ${config.outputDir}`);
  logLines.push(`Subjects directory: ${config.subjectsDir}`);
  logLines.push(`Discovered ${subjects.length} subject(s): ${subjects.join(', ')}`);
  logLines.push('');

  for (const subjectName of subjects) {
    logLines.push(`--- ${subjectName} ---`);

    try {
      const jsonDir = path.join(config.outputDir, subjectName, 'json');

      // Load B1 plans
      const planSet: B1PlanSet = JSON.parse(
        fs.readFileSync(path.join(jsonDir, 'b1-plans.json'), 'utf-8'),
      ) as B1PlanSet;

      // Load A2 workflows (for coverage denominator)
      const a2: A2WorkflowSet = JSON.parse(
        fs.readFileSync(path.join(jsonDir, 'a2-workflows.json'), 'utf-8'),
      ) as A2WorkflowSet;

      // Load manifest (for baseUrl)
      const manifestPath = path.join(config.subjectsDir, subjectName, 'subject-manifest.json');
      if (!fs.existsSync(manifestPath)) {
        logLines.push('  ERROR: subject-manifest.json not found');
        logLines.push('');
        summaries.push({
          subject: subjectName, status: 'ERROR',
          testsGenerated: 0,
          coverage: { eligibleWorkflows: 0, plansGenerated: 0, testsGenerated: 0, generationRate: 0, upstreamRate: 0 },
        });
        continue;
      }
      const manifest: SubjectManifest = JSON.parse(
        fs.readFileSync(manifestPath, 'utf-8'),
      ) as SubjectManifest;

      // Generate test code (B5.1: timeout profile, CDP: optional network evidence)
      const emitOpts: import('./test-emitter.js').EmitOptions = {};
      if (manifest.executionConfig?.timeoutProfile !== undefined) emitOpts.timeoutProfile = manifest.executionConfig.timeoutProfile;
      if (manifest.executionConfig?.enableNetworkEvidence === true) emitOpts.enableNetworkEvidence = true;
      const testMap = emitTestSet(planSet.plans, manifest.baseUrl, emitOpts);

      // Write test files
      const testsDir = path.join(config.outputDir, subjectName, 'tests');
      fs.mkdirSync(testsDir, { recursive: true });

      // Remove existing test files for clean generation
      const existingFiles = fs.existsSync(testsDir) ? fs.readdirSync(testsDir) : [];
      for (const f of existingFiles) {
        if (f.endsWith('.test.ts')) {
          fs.unlinkSync(path.join(testsDir, f));
        }
      }

      const testEntries: B2TestEntry[] = [];
      for (const plan of planSet.plans) {
        const code = testMap.get(plan.workflowId);
        if (code === undefined) continue;

        const safeName = sanitizeFileName(plan.workflowId);
        const fileName = `${safeName}.test.ts`;
        fs.writeFileSync(path.join(testsDir, fileName), code, 'utf-8');

        testEntries.push({
          workflowId: plan.workflowId,
          fileName,
          preConditionCount: plan.preConditions.length,
          stepCount: plan.steps.length,
          postConditionCount: plan.postConditions.length,
        });
      }

      // Compute coverage
      const eligibleWorkflows = a2.stats.workflowCount - (a2.stats.prunedCount ?? 0);
      const plansGenerated = planSet.stats.totalPlanned;
      const testsGenerated = testEntries.length;
      const coverage: B2CoverageReport = {
        eligibleWorkflows,
        plansGenerated,
        testsGenerated,
        generationRate: plansGenerated > 0 ? testsGenerated / plansGenerated : 0,
        upstreamRate: eligibleWorkflows > 0 ? testsGenerated / eligibleWorkflows : 0,
      };

      // Write b2-tests.json
      const testSet: B2TestSet = {
        input: planSet.input,
        tests: testEntries,
        stats: {
          generated: testsGenerated,
          skipped: planSet.stats.skipped,
        },
      };
      fs.writeFileSync(
        path.join(jsonDir, 'b2-tests.json'),
        JSON.stringify(testSet, null, 2) + '\n',
        'utf-8',
      );

      // Structural validation
      let structuralOk = true;
      if (testsGenerated !== plansGenerated) {
        logLines.push(`  STRUCTURAL WARNING: ${testsGenerated} tests != ${plansGenerated} plans`);
        structuralOk = false;
      }

      for (const entry of testEntries) {
        const plan = planSet.plans.find(p => p.workflowId === entry.workflowId);
        if (plan) {
          if (entry.preConditionCount !== plan.preConditions.length) {
            logLines.push(`  STRUCTURAL WARNING: ${entry.workflowId} preConditions ${entry.preConditionCount} != ${plan.preConditions.length}`);
            structuralOk = false;
          }
          if (entry.stepCount !== plan.steps.length) {
            logLines.push(`  STRUCTURAL WARNING: ${entry.workflowId} steps ${entry.stepCount} != ${plan.steps.length}`);
            structuralOk = false;
          }
          if (entry.postConditionCount !== plan.postConditions.length) {
            logLines.push(`  STRUCTURAL WARNING: ${entry.workflowId} postConditions ${entry.postConditionCount} != ${plan.postConditions.length}`);
            structuralOk = false;
          }
        }
      }

      logLines.push(`  Tests generated: ${testsGenerated}`);
      logLines.push(`  Coverage: ${(coverage.generationRate * 100).toFixed(1)}% (${testsGenerated}/${plansGenerated} plans)`);
      logLines.push(`  Upstream: ${(coverage.upstreamRate * 100).toFixed(1)}% (${testsGenerated}/${eligibleWorkflows} eligible workflows)`);
      logLines.push(`  Structural: ${structuralOk ? 'OK' : 'WARNINGS'}`);
      logLines.push('');

      summaries.push({
        subject: subjectName,
        status: 'OK',
        testsGenerated,
        coverage,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logLines.push(`  ERROR: ${msg}`);
      logLines.push('');
      summaries.push({
        subject: subjectName, status: 'ERROR',
        testsGenerated: 0,
        coverage: { eligibleWorkflows: 0, plansGenerated: 0, testsGenerated: 0, generationRate: 0, upstreamRate: 0 },
      });
    }
  }

  // Write log
  fs.mkdirSync(config.logsDir, { recursive: true });
  fs.writeFileSync(
    path.join(config.logsDir, 'b2-codegen.log'),
    logLines.join('\n') + '\n',
    'utf-8',
  );

  // Write summary
  const summary: B2Summary = { subjects: summaries };
  fs.writeFileSync(
    path.join(config.logsDir, 'b2-summary.json'),
    JSON.stringify(summary, null, 2) + '\n',
    'utf-8',
  );

  return summary;
}
