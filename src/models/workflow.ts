/**
 * workflow.ts
 * Types for Phase A2: TaskWorkflow model — single-trigger task enumeration
 * with deterministic effect closure and constraint classification.
 *
 * Authority: docs/paper/approach.md — A2 Typed Schemas (normative).
 * Do not modify without spec amendment.
 */

import type { Atom, ConstraintSurface, EdgeKind } from './multigraph.js';

// ---------------------------------------------------------------------------
// PhaseAInputRef — audit traceability back to A1
// ---------------------------------------------------------------------------

/** A reference to an A1 bundle used to produce workflows (for audit reproducibility). */
export interface PhaseAInputRef {
  /** Stable identifier for the analyzed project/version (e.g., git sha or provided build id). */
  projectId: string;
  /** Hash of the multigraph JSON or canonical serialization (to detect drift). */
  multigraphHash: string;
}

// ---------------------------------------------------------------------------
// A2.2 Classification types
// ---------------------------------------------------------------------------

/** Feasibility verdict computed in A2.2. */
export type WorkflowVerdict = 'FEASIBLE' | 'CONDITIONAL' | 'PRUNED';

/** Explanation payload for non-trivial verdicts. */
export interface WorkflowExplanation {
  /** Missing route params required by aggregated cw.requiredParams (edge-local from A1 navigation edges). */
  missingParams?: string[];
  /** Guards required by any visited route contexts. */
  requiredGuards?: string[];
  /** Roles required by any visited route contexts. Non-exclusive by default. */
  requiredRoles?: string[];
  /** Unresolved navigation targets encountered during traversal. */
  unresolvedTargets?: Array<{
    edgeId: string;
    targetText?: string;
  }>;
  /** Contradictory atoms that caused pruning (only when provable). */
  contradictions?: Atom[];
  /** UI-gate atoms. */
  uiGates?: Atom[];
  /** Requires a form to be valid. */
  requiresFormValid?: boolean;
  /** Redirect loop evidence if detected. */
  redirectLoop?: {
    /** Route id where redirect closure failed to stabilize. */
    routeId: string;
    /** Edge ids participating in the loop (captured during redirect closure). */
    edgeIds: string[];
  };
  /** True iff redirect closure stabilized (terminated without cycle/cap-block failure) at every point it was applied. */
  redirectClosureStabilized?: boolean;
}

// ---------------------------------------------------------------------------
// TaskWorkflow — single-trigger task model
// ---------------------------------------------------------------------------

/** A step within a TaskWorkflow, carrying the edge ID and its kind for audit. */
export interface TaskStep {
  edgeId: string;
  kind: EdgeKind;
}

/** A task workflow: one trigger edge + deterministic effect closure. */
export interface TaskWorkflow {
  /** ID = trigger edge ID (unique per trigger site). */
  id: string;
  /** The trigger edge ID that initiates this task. */
  triggerEdgeId: string;
  /** Entry route IDs where this trigger is active (sorted, aggregated across entries). */
  startRouteIds: string[];
  /** Ordered steps: [trigger, ...CCS(by ordinal), CNR?, ...redirects]. */
  steps: TaskStep[];
  /** Terminal node ID (route or external). */
  terminalNodeId: string;
  /** effectGroupId linking trigger to its CCS/CNR effects. */
  effectGroupId?: string;
  /** Merged constraint surface across all step edges. */
  cw: ConstraintSurface;
  /** Feasibility verdict. */
  verdict: WorkflowVerdict;
  /** Machine-readable explanation for verdict. */
  explanation: WorkflowExplanation;
  /** Workflow-level metadata. */
  meta: {
    unresolvedTargets?: Array<{ edgeId: string; targetText?: string }>;
    redirectLoop?: { routeId: string; edgeIds: string[] };
    redirectClosureStabilized?: boolean;
  };
}

/** Output artifact for task-mode A2. */
export interface TaskWorkflowBundle {
  /** Reference to the A1 input used. */
  input: PhaseAInputRef;
  /** Configuration. */
  config: { mode: 'task' };
  /** All task workflows, sorted by id. */
  workflows: TaskWorkflow[];
  /** Convenience partitions. */
  partitions: {
    feasibleIds: string[];
    conditionalIds: string[];
    prunedIds: string[];
  };
  /** Summary stats. */
  stats: {
    workflowCount: number;
    feasibleCount: number;
    conditionalCount: number;
    prunedCount: number;
    triggerEdgeCount: number;
    enumeratedRouteCount: number;
  };
}
