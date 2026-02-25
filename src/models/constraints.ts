/**
 * constraints.ts
 * Bounded constraint schema used for feasibility pruning (Phase 2 input).
 * Phase 1 populates these summaries; satisfiability checking is excluded.
 */

import type { Origin } from './origin.js';

/**
 * Bounded constraint summary attached to routes, guards, resolvers, and widgets.
 *
 * Invariants:
 * - All array fields MUST be unique and lexicographically sorted.
 * - This object is a summary only — not a full predicate tree.
 */
export interface ConstraintSummary {
  /** True if authentication is required to access this entity. */
  authRequired?: boolean;
  /** Role names required; canonicalized (sorted, unique). */
  rolesRequired?: string[];
  /** Feature flag keys that gate this entity (sorted, unique). */
  featureFlags?: string[];
  /** Route/form/query param names required (sorted, unique). */
  requiredParams?: string[];
  /** Resolver or data tokens that must resolve successfully (sorted, unique). */
  requiredResolvedData?: string[];
  /** Required application-level entity states, e.g. "accountActive" (sorted, unique). */
  requiresEntityState?: string[];
  /** Optional bounded notes; avoid free-form essays. */
  notes?: string[];
}

/**
 * Discriminates the source of a UI-level visibility/enablement predicate.
 */
export type PredicateKind =
  | 'ngIf'
  | 'ngSwitchCase'
  | 'disabled'
  | 'hidden'
  | 'customDirective'
  | 'permissionDirective'
  | 'unknown';

/**
 * A single UI-level executability constraint extracted from a template.
 * `expr` is bounded to `AnalyzerConfig.maxTemplateSnippetLength` (default 200 chars);
 * truncate with a deterministic suffix when exceeded.
 */
export interface Predicate {
  kind: PredicateKind;
  /** Raw expression string, trimmed and bounded. */
  expr: string;
  /** Identifiers referenced in the expression (sorted, unique), if extractable. */
  refs?: string[];
  origin: Origin;
}
