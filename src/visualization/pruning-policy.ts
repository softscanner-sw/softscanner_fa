/**
 * pruning-policy.ts
 * Demo pruning policy for visualization purposes only.
 * NOT an A3 deliverable — no SAT solving, no formal feasibility analysis.
 *
 * Rules (applied in order):
 *   1. PRUNED      — authRequired === true (no auth context available)
 *   2. CONDITIONAL — requiredParams.length > 0 (params must be supplied)
 *   3. FEASIBLE    — otherwise
 */

import type { ExemplarPath, PruningVerdict } from './types.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function applyPruningPolicy(paths: ExemplarPath[]): ExemplarPath[] {
  return paths.map(_applyToPath);
}

export function computeVerdictCounts(paths: ExemplarPath[]): {
  feasible: number;
  conditional: number;
  pruned: number;
} {
  let feasible = 0;
  let conditional = 0;
  let pruned = 0;
  for (const p of paths) {
    if (p.verdict === 'FEASIBLE') feasible++;
    else if (p.verdict === 'CONDITIONAL') conditional++;
    else pruned++;
  }
  return { feasible, conditional, pruned };
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function _applyToPath(p: ExemplarPath): ExemplarPath {
  const verdict = _computeVerdict(p);
  const pruneReason = _computePruneReason(verdict, p);

  const result: ExemplarPath = { ...p, verdict };
  if (pruneReason !== undefined) {
    result.pruneReason = pruneReason;
  }
  return result;
}

function _computeVerdict(p: ExemplarPath): PruningVerdict {
  if (p.aggregated.authRequired) return 'PRUNED';
  if (p.aggregated.requiredParams.length > 0) return 'CONDITIONAL';
  return 'FEASIBLE';
}

function _computePruneReason(verdict: PruningVerdict, p: ExemplarPath): string | undefined {
  if (verdict === 'PRUNED') {
    return 'authRequired=true detected along path. No authentication context available.';
  }
  if (verdict === 'CONDITIONAL') {
    const params = p.aggregated.requiredParams.join(', ');
    return (
      'Route params required: [' +
      params +
      ']. Path is conditionally feasible when params are provided.'
    );
  }
  return undefined;
}
