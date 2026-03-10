/**
 * classifier.ts
 * Shared constraint merge utility for Phase A2.
 *
 * Provides mergeConstraints() which accumulates constraint surfaces
 * across workflow step edges. Used by the task-mode enumerator.
 *
 * Authority: docs/paper/approach.md §A2.2 §1 (normative).
 * Isolation: imports only types from src/models/ and local graph-index.
 */

import type {
  ConstraintSurface,
} from '../models/multigraph.js';
import { emptyConstraintSurface } from '../models/multigraph.js';
import type { GraphIndex } from './graph-index.js';

// ---------------------------------------------------------------------------
// Constraint merge operator (§A2.2 §1)
// ---------------------------------------------------------------------------

/**
 * Merge constraints across all step edges of a workflow.
 * - requiredParams: set union (dedup)
 * - guards: set union (dedup)
 * - roles: set union (dedup)
 * - uiAtoms: concatenation preserving order
 * - evidence: concatenation + dedup by (file, start, end)
 */
export function mergeConstraints(
  steps: readonly string[],
  index: GraphIndex,
): ConstraintSurface {
  const cs = emptyConstraintSurface();
  const paramSet = new Set<string>();
  const guardSet = new Set<string>();
  const roleSet = new Set<string>();
  const evidenceKey = new Set<string>();

  for (const edgeId of steps) {
    const edge = index.edgeById.get(edgeId);
    if (edge === undefined) continue;

    // requiredParams: set union
    for (const p of edge.constraints.requiredParams) {
      if (!paramSet.has(p)) {
        paramSet.add(p);
        cs.requiredParams.push(p);
      }
    }

    // guards: set union
    for (const g of edge.constraints.guards) {
      if (!guardSet.has(g)) {
        guardSet.add(g);
        cs.guards.push(g);
      }
    }

    // roles: set union
    for (const r of edge.constraints.roles) {
      if (!roleSet.has(r)) {
        roleSet.add(r);
        cs.roles.push(r);
      }
    }

    // uiAtoms: concatenation preserving order
    for (const atom of edge.constraints.uiAtoms) {
      cs.uiAtoms.push(atom);
    }

    // evidence: concatenation + dedup by (file, start, end)
    for (const ev of edge.constraints.evidence) {
      const key = `${ev.file}:${ev.start}:${ev.end}`;
      if (!evidenceKey.has(key)) {
        evidenceKey.add(key);
        cs.evidence.push(ev);
      }
    }

    // Also include edge.refs as evidence (§A2.2 §1)
    for (const ref of edge.refs) {
      const key = `${ref.file}:${ref.start}:${ref.end}`;
      if (!evidenceKey.has(key)) {
        evidenceKey.add(key);
        cs.evidence.push(ref);
      }
    }
  }

  return cs;
}
