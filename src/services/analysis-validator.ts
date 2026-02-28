/**
 * analysis-validator.ts
 * Phase 1 invariant checks per approach.md §10.
 * Throws a descriptive error on the first violation found.
 *
 * Invariants enforced:
 *   1. Every edge.from references an existing node id.
 *   2. edge.to references an existing node id OR is null (unresolved navigation).
 *   3. refs non-empty on every node.
 *   4. refs non-empty on every edge.
 *   5. Unresolved navigation: to===null iff targetRouteId===null.
 *   6. nodes sorted by id.
 *   7. edges sorted by (from, kind, to ?? '', id).
 *   8. No duplicate node ids.
 *   9. stats consistency.
 */

import type { Phase1Bundle } from '../models/multigraph.js';
import { STRUCTURAL_EDGE_KINDS } from '../models/multigraph.js';

export class AnalysisValidator {
  static validatePhase1(bundle: Phase1Bundle): void {
    const { multigraph, stats } = bundle;
    const { nodes, edges } = multigraph;

    // Build node id set
    const nodeIds = new Set<string>();
    for (const node of nodes) {
      if (nodeIds.has(node.id)) {
        throw new ValidationError(`Duplicate node id: "${node.id}"`);
      }
      nodeIds.add(node.id);
    }

    // Rule 1+2: edge endpoint existence
    for (const edge of edges) {
      if (!nodeIds.has(edge.from)) {
        throw new ValidationError(
          `Edge "${edge.id}": from="${edge.from}" does not exist in nodes.`,
        );
      }
      if (edge.to !== null && !nodeIds.has(edge.to)) {
        throw new ValidationError(
          `Edge "${edge.id}": to="${edge.to}" does not exist in nodes.`,
        );
      }
    }

    // Rule 3: non-empty refs on nodes
    for (const node of nodes) {
      if (node.refs.length === 0) {
        throw new ValidationError(`Node "${node.id}": refs must be non-empty.`);
      }
    }

    // Rule 4: non-empty refs on edges
    for (const edge of edges) {
      if (edge.refs.length === 0) {
        throw new ValidationError(`Edge "${edge.id}": refs must be non-empty.`);
      }
    }

    // Rule 5: unresolved navigation coupling
    for (const edge of edges) {
      if (edge.targetRouteId === null && edge.to !== null) {
        throw new ValidationError(
          `Edge "${edge.id}": targetRouteId is null but to is not null ("${edge.to}").`,
        );
      }
      if (edge.targetRouteId !== undefined && edge.targetRouteId !== null && edge.to === null) {
        throw new ValidationError(
          `Edge "${edge.id}": targetRouteId is "${edge.targetRouteId}" but to is null.`,
        );
      }
    }

    // Rule 6: nodes sorted by id
    for (let i = 1; i < nodes.length; i++) {
      const prev = nodes[i - 1]!;
      const curr = nodes[i]!;
      if (prev.id.localeCompare(curr.id) > 0) {
        throw new ValidationError(
          `Nodes not sorted: "${prev.id}" appears before "${curr.id}".`,
        );
      }
    }

    // Rule 7: edges sorted by (from, kind, to, id)
    for (let i = 1; i < edges.length; i++) {
      const prev = edges[i - 1]!;
      const curr = edges[i]!;
      const cmp = compareEdgeSort(prev, curr);
      if (cmp > 0) {
        throw new ValidationError(
          `Edges not sorted: "${prev.id}" appears before "${curr.id}".`,
        );
      }
    }

    // Rule 9: stats consistency
    if (stats.nodeCount !== nodes.length) {
      throw new ValidationError(
        `stats.nodeCount (${stats.nodeCount}) !== nodes.length (${nodes.length}).`,
      );
    }
    if (stats.edgeCount !== edges.length) {
      throw new ValidationError(
        `stats.edgeCount (${stats.edgeCount}) !== edges.length (${edges.length}).`,
      );
    }
    const actualStructural = edges.filter((e) => STRUCTURAL_EDGE_KINDS.has(e.kind)).length;
    if (stats.structuralEdgeCount !== actualStructural) {
      throw new ValidationError(
        `stats.structuralEdgeCount (${stats.structuralEdgeCount}) !== actual (${actualStructural}).`,
      );
    }
    const actualExecutable = edges.length - actualStructural;
    if (stats.executableEdgeCount !== actualExecutable) {
      throw new ValidationError(
        `stats.executableEdgeCount (${stats.executableEdgeCount}) !== actual (${actualExecutable}).`,
      );
    }
  }
}

function compareEdgeSort(
  a: { from: string; kind: string; to: string | null; id: string },
  b: { from: string; kind: string; to: string | null; id: string },
): number {
  const fromCmp = a.from.localeCompare(b.from);
  if (fromCmp !== 0) return fromCmp;
  const kindCmp = a.kind.localeCompare(b.kind);
  if (kindCmp !== 0) return kindCmp;
  const aTo = a.to ?? '';
  const bTo = b.to ?? '';
  const toCmp = aTo.localeCompare(bTo);
  if (toCmp !== 0) return toCmp;
  return a.id.localeCompare(b.id);
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
