/**
 * path-finder.ts
 * Bounded DFS path enumeration for visualization exemplars.
 *
 * Algorithm:
 *   - Build adjacency Map<nodeId, VizEdge[]> sorted by edge.id lexicographically.
 *   - Entry nodes = entryNodeIds.filter(id !== '__entry__').sort().
 *   - For each entry: DFS up to MAX_DEPTH=6 edges, collecting at most
 *     MAX_PATHS_PER_ENTRY=2 terminal-reaching paths.
 *   - Simple-path rule: no node is visited twice on a single path.
 *   - Deterministic: edges sorted by id, entries sorted alphabetically.
 *
 * This is a VISUALIZATION TOOL only — not an A2 deliverable.
 * The paths it produces are exemplars for the HTML pages, not exhaustive enumeration.
 */

import type {
  VizNode,
  VizEdge,
  ExemplarPath,
  PathStep,
  AggregatedConstraints,
} from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_DEPTH = 6;
const MAX_PATHS_PER_ENTRY = 2;

/** Edge kinds that represent forward progress for path-finding. */
const NAVIGATING_KINDS = new Set<string>([
  'WIDGET_NAVIGATES_ROUTE',
  'WIDGET_NAVIGATES_EXTERNAL',
  'COMPONENT_NAVIGATES_ROUTE',
  'ROUTE_REDIRECTS_TO_ROUTE',
  'ROUTE_ACTIVATES_COMPONENT',
]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function findExemplarPaths(
  nodes: VizNode[],
  edges: VizEdge[],
  entryNodeIds: string[],
): ExemplarPath[] {
  // Build nodeById map
  const nodeById = new Map<string, VizNode>();
  for (const n of nodes) {
    nodeById.set(n.id, n);
  }

  // Build adjacency: from → edges sorted by edge.id (deterministic)
  const adj = new Map<string, VizEdge[]>();
  for (const e of [...edges].sort((a, b) => a.id.localeCompare(b.id))) {
    let list = adj.get(e.from);
    if (list === undefined) {
      list = [];
      adj.set(e.from, list);
    }
    list.push(e);
  }

  const isTerminal = (nodeId: string): boolean => {
    const outEdges = adj.get(nodeId);
    if (outEdges === undefined) return true;
    return !outEdges.some((e) => NAVIGATING_KINDS.has(e.kind));
  };

  // Entry nodes: sort for determinism
  const startNodes = [...entryNodeIds].sort();

  const results: ExemplarPath[] = [];

  for (const startId of startNodes) {
    const pathsFromEntry: ExemplarPath[] = [];
    const startNode = nodeById.get(startId);
    if (startNode === undefined) continue;

    const emptyConstraints: AggregatedConstraints = {
      uiPreconditions: [],
      requiredParams: [],
      authRequired: false,
      rolesRequired: [],
      featureFlags: [],
    };

    // Accumulate any constraints contributed by the start node itself
    const startConstraints = accumulateFromNode(emptyConstraints, startNode);

    const initialStep: PathStep = {
      nodeId: startId,
      constraintsSoFar: startConstraints,
    };

    _dfs(
      startId,
      [initialStep],
      new Set<string>([startId]),
      0,
      nodeById,
      adj,
      isTerminal,
      pathsFromEntry,
    );

    results.push(...pathsFromEntry);
  }

  return results;
}

// ---------------------------------------------------------------------------
// DFS (internal)
// ---------------------------------------------------------------------------

function _dfs(
  currentId: string,
  steps: PathStep[],
  visited: Set<string>,
  depth: number,
  nodeById: Map<string, VizNode>,
  adj: Map<string, VizEdge[]>,
  isTerminal: (id: string) => boolean,
  results: ExemplarPath[],
): void {
  if (results.length >= MAX_PATHS_PER_ENTRY) return;

  // Emit the path when we hit a terminal or the depth limit
  if (isTerminal(currentId) || depth >= MAX_DEPTH) {
    const lastStep = steps[steps.length - 1];
    if (lastStep === undefined) return;
    const firstStep = steps[0];
    if (firstStep === undefined) return;
    const aggregated = lastStep.constraintsSoFar;
    const pathId = steps.map((s) => s.nodeId).join('>');
    results.push({
      id: pathId,
      entryNodeId: firstStep.nodeId,
      steps: [...steps],
      aggregated,
      // verdict and pruneReason filled in by pruning-policy.ts
      verdict: 'FEASIBLE',
    });
    return;
  }

  const outEdges = adj.get(currentId) ?? [];
  for (const edge of outEdges) {
    if (results.length >= MAX_PATHS_PER_ENTRY) break;
    if (edge.to === null) continue; // Skip unresolved navigation
    if (visited.has(edge.to)) continue;

    const targetNode = nodeById.get(edge.to);
    if (targetNode === undefined) continue;

    const prevStep = steps[steps.length - 1];
    const prevConstraints: AggregatedConstraints =
      prevStep !== undefined
        ? prevStep.constraintsSoFar
        : {
            uiPreconditions: [],
            requiredParams: [],
            authRequired: false,
            rolesRequired: [],
            featureFlags: [],
          };

    const nextConstraints = accumulateStep(prevConstraints, targetNode, edge);

    const nextStep: PathStep = {
      nodeId: edge.to,
      edgeId: edge.id,
      constraintsSoFar: nextConstraints,
    };

    visited.add(edge.to);
    _dfs(
      edge.to,
      [...steps, nextStep],
      visited,
      depth + 1,
      nodeById,
      adj,
      isTerminal,
      results,
    );
    visited.delete(edge.to);
  }
}

// ---------------------------------------------------------------------------
// Constraint accumulation
// ---------------------------------------------------------------------------

function accumulateStep(
  prev: AggregatedConstraints,
  targetNode: VizNode,
  edge: VizEdge,
): AggregatedConstraints {
  return {
    uiPreconditions: _sortedUnique([...prev.uiPreconditions, ...edge.uiPreconditions]),
    requiredParams: _sortedUnique([...prev.requiredParams, ...(targetNode.routeParams ?? [])]),
    authRequired: prev.authRequired || (targetNode.authRequired === true),
    rolesRequired: _sortedUnique([...prev.rolesRequired]),
    featureFlags: _sortedUnique([...prev.featureFlags]),
  };
}

function accumulateFromNode(
  prev: AggregatedConstraints,
  node: VizNode,
): AggregatedConstraints {
  return {
    uiPreconditions: prev.uiPreconditions,
    requiredParams: _sortedUnique([...prev.requiredParams, ...(node.routeParams ?? [])]),
    authRequired: prev.authRequired || (node.authRequired === true),
    rolesRequired: prev.rolesRequired,
    featureFlags: prev.featureFlags,
  };
}

function _sortedUnique(arr: string[]): string[] {
  return [...new Set(arr)].sort();
}
