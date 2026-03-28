/**
 * intent-types.ts
 * RealizationIntent and B1IntentSet types for Phase B1.1.
 *
 * Authority: docs/paper/approach.md — Phase B §B1 RealizationIntent schema.
 * Do not modify without spec amendment.
 *
 * Phase isolation: imports only from src/models/ (types only).
 */

import type {
  ConstraintSurface,
  EdgeKind,
  SpecWidgetKind,
} from '../../models/multigraph.js';
import type {
  PhaseAInputRef,
  TaskStep,
  WorkflowExplanation,
  WorkflowVerdict,
} from '../../models/workflow.js';

// ---------------------------------------------------------------------------
// RealizationIntent — auditable intermediate for B1
// ---------------------------------------------------------------------------

/** Start route info for a workflow. */
export interface IntentStartRoute {
  routeId: string;
  fullPath: string;
  requiredParams: string[];
}

/** Trigger widget metadata extracted from A1. */
export interface IntentTriggerWidget {
  nodeId: string;
  tagName?: string;
  widgetKind: SpecWidgetKind;
  attributes: Record<string, string>;
  componentSelector?: string;
  formControlName?: string;
  routerLinkText?: string;
  containingFormId?: string;
}

/** Form field schema entry (WSF triggers only). */
export interface IntentFormField {
  fieldNodeId: string;
  tagName: string;
  widgetKind: SpecWidgetKind;
  formControlName?: string;
  nameAttr?: string;
  idAttr?: string;
  inputType?: string;
  required: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  /** Date format detected from Angular date pipe in ngModelText (e.g. 'yyyy-MM-dd'). */
  dateFormat?: string;
  /** First option/child value when extractable (for select/radio). */
  firstOptionValue?: string;
}

/**
 * RealizationIntent — one per non-PRUNED TaskWorkflow.
 * Pure derivation from A1 + A2 — no manifest, no LLM.
 */
export interface RealizationIntent {
  workflowId: string;
  verdict: WorkflowVerdict;
  triggerKind: EdgeKind;
  triggerEvent?: string;
  startRoutes: IntentStartRoute[];
  triggerWidget: IntentTriggerWidget;
  formSchema?: IntentFormField[];
  effectSteps: TaskStep[];
  terminalNodeId: string;
  terminalRoutePath?: string;
  constraints: ConstraintSurface;
  explanation: WorkflowExplanation;
  guardNames: string[];
  requiresParams: boolean;
  hasUnresolvedTargets: boolean;
}

// ---------------------------------------------------------------------------
// B1IntentSet — output artifact
// ---------------------------------------------------------------------------

/** Output artifact for B1.1 intent derivation. */
export interface B1IntentSet {
  input: PhaseAInputRef;
  intents: RealizationIntent[];
  stats: {
    totalCount: number;
    feasibleCount: number;
    conditionalCount: number;
    prunedCount: number;
  };
}
