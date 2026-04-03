/**
 * plan-types.ts
 * ActionPlan and related types for Phase B1.2.
 *
 * Authority: docs/paper/approach.md — Phase B §B1 ActionPlan schema.
 * Do not modify without spec amendment.
 *
 * Phase isolation: imports only from src/models/ (types only).
 */

import type { PhaseAInputRef } from '../../models/workflow.js';

// ---------------------------------------------------------------------------
// ScopedLocator — deterministic element location strategy
// ---------------------------------------------------------------------------

export type LocatorStrategy =
  | 'data-testid'
  | 'id'
  | 'name'
  | 'formcontrolname'
  | 'aria-label'
  | 'routerlink'
  | 'href'
  | 'placeholder'
  | 'tag-position'
  | 'custom';

export interface ScopedLocator {
  componentSelector?: string;
  formSelector?: string;
  strategy: LocatorStrategy;
  value: string;
  tagName?: string;
  fallbacks?: ScopedLocator[];
}

// ---------------------------------------------------------------------------
// ActionStep — a single browser action
// ---------------------------------------------------------------------------

export type ActionStepType =
  | 'click'
  | 'type'
  | 'clear-and-type'
  | 'submit'
  | 'select-option'
  | 'navigate'
  | 'wait-for-navigation'
  | 'wait-for-dialog'
  | 'wait-for-element';

export interface ActionStep {
  type: ActionStepType;
  locator: ScopedLocator;
  value?: string;
  edgeId?: string;
  description: string;
}

// ---------------------------------------------------------------------------
// PreCondition — setup before action steps
// ---------------------------------------------------------------------------

export type PreConditionType =
  | 'auth-setup'
  | 'navigate-to-route'
  | 'trigger-dialog-open';

export interface PreCondition {
  type: PreConditionType;
  config: Record<string, string>;
}

// ---------------------------------------------------------------------------
// PostCondition — assertions after action steps
// ---------------------------------------------------------------------------

export type PostConditionType =
  | 'assert-url-matches'
  | 'assert-no-crash';

export interface PostCondition {
  type: PostConditionType;
  expected?: string;
}

// ---------------------------------------------------------------------------
// Assignment — concrete value bindings for a workflow
// ---------------------------------------------------------------------------

export interface AssignmentAccount {
  username: string;
  password: string;
  roles: string[];
}

export interface Assignment {
  account?: AssignmentAccount;
  routeParams: Record<string, string>;
  formData: Record<string, string>;
}

// ---------------------------------------------------------------------------
// ActionPlan — fully bound plan for one workflow
// ---------------------------------------------------------------------------

/**
 * Structural context of the trigger widget, propagated from B1 intent
 * for B2 wait emission (B5.2). Determines whether pre-action waits
 * are needed for async/permission gates or repeater data readiness.
 */
export interface TriggerContext {
  /** Composition gates from ancestor CCC insideNgIf expressions (e.g., "project$ | async"). */
  compositionGates?: string[];
  /** NgFor iteration variable if trigger widget is inside a repeater. */
  insideNgFor?: string;
  /** Component selector containing the trigger widget (for scoped waits). */
  componentSelector?: string;
}

export interface ActionPlan {
  workflowId: string;
  planVersion: number;
  assignment: Assignment;
  preConditions: PreCondition[];
  steps: ActionStep[];
  postConditions: PostCondition[];
  /** B5.2: structural context for pre-action wait derivation. */
  triggerContext?: TriggerContext;
}

// ---------------------------------------------------------------------------
// B1PlanSet — output artifact
// ---------------------------------------------------------------------------

export interface B1PlanSet {
  input: PhaseAInputRef;
  plans: ActionPlan[];
  stats: {
    totalPlanned: number;
    skipped: number;
  };
}
