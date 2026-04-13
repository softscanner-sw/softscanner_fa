/**
 * task-enumerator.ts
 * Phase A2 enumerator: one TaskWorkflow per trigger edge.
 *
 * Produces exactly one task per trigger site, with deterministic
 * effect closure (handler-scoped CCS/CNR + redirect closure).
 *
 * Isolation: imports only types from src/models/ and local workflow utilities.
 */

import type { Edge, A1Multigraph } from '../models/multigraph.js';
import { emptyConstraintSurface } from '../models/multigraph.js';
import type {
  TaskWorkflow,
  A2WorkflowSet,
  TaskStep,
  WorkflowVerdict,
  WorkflowExplanation,
} from '../models/workflow.js';
import {
  buildGraphIndex,
  computeActiveComponentIds,
  computeActiveWidgetIds,
  WIDGET_ORIGIN_EDGE_KINDS,
} from './graph-index.js';
import type { GraphIndex } from './graph-index.js';
import { computeInputRef } from './graph-index.js';
import { mergeConstraints } from './classifier.js';

// ---------------------------------------------------------------------------
// Redirect closure (pure function, per approach.md A2.1 §6)
// ---------------------------------------------------------------------------

interface RedirectResult {
  finalRouteId: string;
  redirectEdgeIds: string[];
  redirectLoop?: { routeId: string; edgeIds: string[] };
  stabilized: boolean;
  unresolvedTarget?: { edgeId: string; targetText?: string };
}

/**
 * Compare redirect edges for deterministic selection (§10.2).
 * Sort by (to asc, id asc), pick first.
 */
function compareRedirectEdges(a: Edge, b: Edge): number {
  const aTo = a.to ?? '';
  const bTo = b.to ?? '';
  if (aTo !== bTo) return aTo.localeCompare(bTo);
  return a.id.localeCompare(b.id);
}

/**
 * Resolve redirect closure from a given route.
 * Pure function: no mutation of external state.
 */
function resolveRedirectClosure(
  startRouteId: string,
  index: GraphIndex,
  routeVisitCap: number,
): RedirectResult {
  let currentRouteId = startRouteId;
  const seenRoutes = new Set<string>([currentRouteId]);
  const redirectEdgeIds: string[] = [];
  const visitCount = new Map<string, number>([[currentRouteId, 1]]);

  for (;;) {
    const redirectEdges = index.redirectEdgesByFrom.get(currentRouteId);
    if (redirectEdges === undefined || redirectEdges.length === 0) {
      break; // No redirects — closure stabilized normally
    }

    // Deterministic selection (§10.2): sort by (to asc, id asc), pick first
    const sorted = [...redirectEdges].sort(compareRedirectEdges);
    const e = sorted[0]!;

    // Unresolved redirect target
    if (e.targetRouteId === undefined || e.targetRouteId === null) {
      redirectEdgeIds.push(e.id);
      const evidence: { edgeId: string; targetText?: string } = { edgeId: e.id };
      if (e.targetText !== undefined) evidence.targetText = e.targetText;
      return {
        finalRouteId: currentRouteId,
        redirectEdgeIds,
        stabilized: false,
        unresolvedTarget: evidence,
      };
    }

    const nextRouteId = e.targetRouteId;
    const currentCount = visitCount.get(nextRouteId) ?? 0;
    const nextCount = currentCount + 1;

    // Route-visit cap check
    if (nextCount > routeVisitCap) {
      return {
        finalRouteId: currentRouteId,
        redirectEdgeIds,
        redirectLoop: { routeId: currentRouteId, edgeIds: [e.id] },
        stabilized: false,
      };
    }

    // Apply the redirect
    currentRouteId = nextRouteId;
    redirectEdgeIds.push(e.id);
    visitCount.set(nextRouteId, nextCount);

    // Cycle detection
    if (seenRoutes.has(currentRouteId)) {
      return {
        finalRouteId: currentRouteId,
        redirectEdgeIds,
        redirectLoop: { routeId: currentRouteId, edgeIds: [...redirectEdgeIds] },
        stabilized: false,
      };
    }

    seenRoutes.add(currentRouteId);
  }

  return {
    finalRouteId: currentRouteId,
    redirectEdgeIds,
    stabilized: true,
  };
}

// ---------------------------------------------------------------------------
// Effect edge collection
// ---------------------------------------------------------------------------

interface EffectEdges {
  /** CCS edges sorted by callsiteOrdinal. */
  ccsEdges: Edge[];
  /** CNR edge if present (at most one per handler). */
  cnrEdge?: Edge;
}

/**
 * Collect handler-scoped effect edges for a trigger edge.
 * Returns CCS sorted by callsiteOrdinal, then optional CNR.
 */
function collectEffectEdges(
  triggerEdge: Edge,
  index: GraphIndex,
): EffectEdges {
  if (triggerEdge.effectGroupId === undefined) {
    return { ccsEdges: [] };
  }

  const effectEdges = index.edgesByEffectGroupId.get(triggerEdge.effectGroupId);
  if (effectEdges === undefined) {
    return { ccsEdges: [] };
  }

  const ccsEdges: Edge[] = [];
  let cnrEdge: Edge | undefined;

  for (const e of effectEdges) {
    if (e.kind === 'COMPONENT_CALLS_SERVICE') {
      ccsEdges.push(e);
    } else if (e.kind === 'COMPONENT_NAVIGATES_ROUTE') {
      // Take the first CNR by deterministic sort (id asc)
      if (cnrEdge === undefined || e.id.localeCompare(cnrEdge.id) < 0) {
        cnrEdge = e;
      }
    }
  }

  // Sort CCS by callsiteOrdinal (then by id for determinism)
  ccsEdges.sort((a, b) => {
    const ordA = a.callsiteOrdinal ?? 0;
    const ordB = b.callsiteOrdinal ?? 0;
    if (ordA !== ordB) return ordA - ordB;
    return a.id.localeCompare(b.id);
  });

  return { ccsEdges, ...(cnrEdge !== undefined ? { cnrEdge } : {}) };
}

// ---------------------------------------------------------------------------
// Classification (reuses mergeConstraints from classifier.ts)
// ---------------------------------------------------------------------------

/**
 * Classify a task workflow's verdict and explanation.
 * Applies constraint merge + deterministic verdict rules per approach.md A2.2.
 */
function classifyTask(
  steps: readonly TaskStep[],
  meta: TaskWorkflow['meta'],
  index: GraphIndex,
): { cw: ReturnType<typeof emptyConstraintSurface>; verdict: WorkflowVerdict; explanation: WorkflowExplanation } {
  const edgeIds = steps.map(s => s.edgeId);
  const cw = mergeConstraints(edgeIds, index);

  let verdict: WorkflowVerdict = 'FEASIBLE';
  const explanation: WorkflowExplanation = {};

  // PRUNED: redirect deadlock (stabilized=false AND no trigger steps)
  const userSteps = steps.filter(s =>
    s.kind !== 'ROUTE_REDIRECTS_TO_ROUTE',
  );
  if (meta.redirectClosureStabilized === false && userSteps.length === 0) {
    verdict = 'PRUNED';
    explanation.redirectClosureStabilized = false;
    if (meta.redirectLoop !== undefined) {
      explanation.redirectLoop = {
        routeId: meta.redirectLoop.routeId,
        edgeIds: [...meta.redirectLoop.edgeIds],
      };
    }
    return { cw, verdict, explanation };
  }

  // PRUNED: literal UI impossibility
  for (const atom of cw.uiAtoms) {
    if (
      (atom.kind === 'WidgetVisible' || atom.kind === 'WidgetEnabled') &&
      atom.args[1] === 'false'
    ) {
      verdict = 'PRUNED';
      explanation.contradictions = [atom];
      return { cw, verdict, explanation };
    }
  }

  // CONDITIONAL checks
  let isConditional = false;

  if (meta.unresolvedTargets !== undefined && meta.unresolvedTargets.length > 0) {
    explanation.unresolvedTargets = meta.unresolvedTargets.map(t => {
      const entry: { edgeId: string; targetText?: string } = { edgeId: t.edgeId };
      if (t.targetText !== undefined) entry.targetText = t.targetText;
      return entry;
    });
    isConditional = true;
  }

  if (cw.requiredParams.length > 0) {
    explanation.missingParams = [...cw.requiredParams];
    isConditional = true;
  }

  if (cw.guards.length > 0) {
    explanation.requiredGuards = [...cw.guards];
    isConditional = true;
  }

  if (cw.roles.length > 0) {
    explanation.requiredRoles = [...cw.roles];
    isConditional = true;
  }

  const EXPR_GATE_ATOM_KINDS = new Set([
    'WidgetVisibleExpr', 'WidgetEnabledExpr',
    'WidgetRequiredExpr', 'InputConstraintExpr',
  ]);
  const exprGates = cw.uiAtoms.filter(a => EXPR_GATE_ATOM_KINDS.has(a.kind));
  if (exprGates.length > 0) {
    explanation.uiGates = exprGates;
    isConditional = true;
  }

  if (cw.uiAtoms.some(a => a.kind === 'FormValid')) {
    explanation.requiresFormValid = true;
    isConditional = true;
  }

  if (meta.redirectClosureStabilized === false) {
    explanation.redirectClosureStabilized = false;
    if (meta.redirectLoop !== undefined) {
      explanation.redirectLoop = {
        routeId: meta.redirectLoop.routeId,
        edgeIds: [...meta.redirectLoop.edgeIds],
      };
    }
    isConditional = true;
  }

  if (isConditional) verdict = 'CONDITIONAL';

  return { cw, verdict, explanation };
}

// ---------------------------------------------------------------------------
// Main task enumeration
// ---------------------------------------------------------------------------

/** Default route visit cap for redirect closure in task mode. */
const TASK_ROUTE_VISIT_CAP = 2;

/**
 * Enumerate task workflows from a A1Multigraph.
 * Produces exactly one TaskWorkflow per trigger edge, with handler-scoped
 * effect closure and deterministic redirect resolution.
 */
export function enumerateTaskWorkflows(bundle: A1Multigraph): A2WorkflowSet {
  const index = buildGraphIndex(bundle);
  const inputRef = computeInputRef(bundle);

  // Accumulate: triggerEdgeId → { startRouteIds, ... }
  const taskMap = new Map<string, {
    triggerEdge: Edge;
    startRouteIds: string[];
    steps: TaskStep[];
    terminalNodeId: string;
    meta: TaskWorkflow['meta'];
  }>();

  // Process each component-bearing route (sorted)
  for (const routeId of index.enumerableRouteIds) {
    // Apply redirect closure at entry
    const entryRedirect = resolveRedirectClosure(routeId, index, TASK_ROUTE_VISIT_CAP);
    const activeRouteId = entryRedirect.finalRouteId;

    // If redirect closure failed fatally (unresolved), skip this route
    if (entryRedirect.unresolvedTarget !== undefined) {
      continue;
    }

    // Compute active components and widgets at the resolved route
    const activeComponentIds = computeActiveComponentIds(activeRouteId, index);
    const activeWidgetIds = computeActiveWidgetIds(activeComponentIds, index);

    // Collect all trigger edges from active widgets (sorted by id for determinism)
    const triggerEdges: Edge[] = [];
    for (const wId of [...activeWidgetIds].sort()) {
      const edges = index.edgesByFrom.get(wId);
      if (edges === undefined) continue;
      for (const e of edges) {
        if (WIDGET_ORIGIN_EDGE_KINDS.has(e.kind)) {
          triggerEdges.push(e);
        }
      }
    }
    triggerEdges.sort((a, b) => a.id.localeCompare(b.id));

    for (const triggerEdge of triggerEdges) {
      // Build steps for this trigger
      const steps: TaskStep[] = [];
      const meta: TaskWorkflow['meta'] = {
        redirectClosureStabilized: entryRedirect.stabilized,
      };

      // Add entry redirect steps (if any)
      for (const redirId of entryRedirect.redirectEdgeIds) {
        const redirEdge = index.edgeById.get(redirId);
        if (redirEdge !== undefined) {
          steps.push({ edgeId: redirId, kind: redirEdge.kind });
        }
      }
      if (entryRedirect.redirectLoop !== undefined) {
        meta.redirectLoop = entryRedirect.redirectLoop;
      }

      // Add the trigger step
      steps.push({ edgeId: triggerEdge.id, kind: triggerEdge.kind });

      // Determine terminal based on trigger type
      let terminalNodeId = activeRouteId;

      if (triggerEdge.kind === 'WIDGET_NAVIGATES_EXTERNAL') {
        // Terminal = External node
        terminalNodeId = triggerEdge.to ?? activeRouteId;
      } else if (triggerEdge.kind === 'WIDGET_NAVIGATES_ROUTE') {
        // Direct navigation
        if (triggerEdge.targetRouteId === undefined || triggerEdge.targetRouteId === null) {
          // Unresolved navigation
          const evidence: { edgeId: string; targetText?: string } = { edgeId: triggerEdge.id };
          if (triggerEdge.targetText !== undefined) evidence.targetText = triggerEdge.targetText;
          if (meta.unresolvedTargets === undefined) meta.unresolvedTargets = [];
          meta.unresolvedTargets.push(evidence);
        } else {
          // Apply redirect closure at target route
          const navRedirect = resolveRedirectClosure(
            triggerEdge.targetRouteId, index, TASK_ROUTE_VISIT_CAP,
          );
          terminalNodeId = navRedirect.finalRouteId;
          for (const redirId of navRedirect.redirectEdgeIds) {
            const redirEdge = index.edgeById.get(redirId);
            if (redirEdge !== undefined) {
              steps.push({ edgeId: redirId, kind: redirEdge.kind });
            }
          }
          if (!navRedirect.stabilized) meta.redirectClosureStabilized = false;
          if (navRedirect.redirectLoop !== undefined) meta.redirectLoop = navRedirect.redirectLoop;
          if (navRedirect.unresolvedTarget !== undefined) {
            if (meta.unresolvedTargets === undefined) meta.unresolvedTargets = [];
            meta.unresolvedTargets.push(navRedirect.unresolvedTarget);
          }
        }
      } else if (
        triggerEdge.kind === 'WIDGET_TRIGGERS_HANDLER' ||
        triggerEdge.kind === 'WIDGET_SUBMITS_FORM'
      ) {
        // Collect handler-scoped effect edges
        const effects = collectEffectEdges(triggerEdge, index);

        // Add CCS steps (sorted by callsiteOrdinal)
        for (const ccs of effects.ccsEdges) {
          steps.push({ edgeId: ccs.id, kind: ccs.kind });
        }

        // Add CNR step and resolve navigation
        if (effects.cnrEdge !== undefined) {
          steps.push({ edgeId: effects.cnrEdge.id, kind: effects.cnrEdge.kind });

          if (effects.cnrEdge.targetRouteId === undefined || effects.cnrEdge.targetRouteId === null) {
            // Unresolved CNR
            const evidence: { edgeId: string; targetText?: string } = { edgeId: effects.cnrEdge.id };
            if (effects.cnrEdge.targetText !== undefined) evidence.targetText = effects.cnrEdge.targetText;
            if (meta.unresolvedTargets === undefined) meta.unresolvedTargets = [];
            meta.unresolvedTargets.push(evidence);
          } else {
            // Apply redirect closure at CNR target
            const cnrRedirect = resolveRedirectClosure(
              effects.cnrEdge.targetRouteId, index, TASK_ROUTE_VISIT_CAP,
            );
            terminalNodeId = cnrRedirect.finalRouteId;
            for (const redirId of cnrRedirect.redirectEdgeIds) {
              const redirEdge = index.edgeById.get(redirId);
              if (redirEdge !== undefined) {
                steps.push({ edgeId: redirId, kind: redirEdge.kind });
              }
            }
            if (!cnrRedirect.stabilized) meta.redirectClosureStabilized = false;
            if (cnrRedirect.redirectLoop !== undefined) meta.redirectLoop = cnrRedirect.redirectLoop;
            if (cnrRedirect.unresolvedTarget !== undefined) {
              if (meta.unresolvedTargets === undefined) meta.unresolvedTargets = [];
              meta.unresolvedTargets.push(cnrRedirect.unresolvedTarget);
            }
          }
        }
      }

      // Deduplicate by triggerEdgeId: aggregate startRouteIds
      const existing = taskMap.get(triggerEdge.id);
      if (existing !== undefined) {
        if (!existing.startRouteIds.includes(routeId)) {
          existing.startRouteIds.push(routeId);
        }
      } else {
        taskMap.set(triggerEdge.id, {
          triggerEdge,
          startRouteIds: [routeId],
          steps,
          terminalNodeId,
          meta,
        });
      }
    }
  }

  // Build TaskWorkflow array and classify
  const workflows: TaskWorkflow[] = [];

  for (const [triggerId, data] of taskMap) {
    // Sort startRouteIds for determinism
    data.startRouteIds.sort();

    // Classify
    const { cw, verdict, explanation } = classifyTask(data.steps, data.meta, index);

    workflows.push({
      id: triggerId,
      triggerEdgeId: triggerId,
      startRouteIds: data.startRouteIds,
      steps: data.steps,
      terminalNodeId: data.terminalNodeId,
      ...(data.triggerEdge.effectGroupId !== undefined
        ? { effectGroupId: data.triggerEdge.effectGroupId }
        : {}),
      cw,
      verdict,
      explanation,
      meta: data.meta,
    });
  }

  // Sort by id for determinism
  workflows.sort((a, b) => a.id.localeCompare(b.id));

  // Build partitions
  const feasibleIds: string[] = [];
  const conditionalIds: string[] = [];
  const prunedIds: string[] = [];
  for (const w of workflows) {
    switch (w.verdict) {
      case 'FEASIBLE': feasibleIds.push(w.id); break;
      case 'CONDITIONAL': conditionalIds.push(w.id); break;
      case 'PRUNED': prunedIds.push(w.id); break;
    }
  }

  return {
    input: inputRef,
    config: { mode: 'task' },
    workflows,
    partitions: { feasibleIds, conditionalIds, prunedIds },
    stats: {
      workflowCount: workflows.length,
      feasibleCount: feasibleIds.length,
      conditionalCount: conditionalIds.length,
      prunedCount: prunedIds.length,
      triggerEdgeCount: workflows.length,
      enumeratedRouteCount: index.enumerableRouteIds.length,
    },
  };
}
