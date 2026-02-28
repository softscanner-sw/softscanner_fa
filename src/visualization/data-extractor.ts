/**
 * data-extractor.ts
 * Extracts VizData from a Phase1Bundle.
 * Pure function — no I/O, no side effects.
 */

import type { Phase1Bundle } from '../models/multigraph.js';
import type {
  VizData,
  VizNode,
  VizEdge,
  VizStats,
  ExemplarPath,
} from './types.js';

/**
 * Derive a short display label for a Widget node.
 * Priority: id, name, formcontrolname, aria-label, placeholder, title.
 * Falls back to the subtypeKey (e.g., "input:email").
 */
function _widgetDisplayLabel(
  attrs: Record<string, string>,
  subtypeKey: string,
): string {
  const priority = ['id', 'name', 'formcontrolname', 'aria-label', 'placeholder', 'title'];
  for (const key of priority) {
    const val = attrs[key];
    if (val !== undefined && val.length > 0) return val;
  }
  return subtypeKey;
}

/**
 * Extract VizData from a Phase1Bundle.
 */
export function extractVizData(
  bundle: Phase1Bundle,
  exemplarPaths: ExemplarPath[],
): VizData {
  const { multigraph, stats } = bundle;

  // ── Nodes ─────────────────────────────────────────────────────────────────

  const nodes: VizNode[] = multigraph.nodes
    .map((n): VizNode => {
      const base: VizNode = {
        id: n.id,
        type: n.kind,
        label: n.label,
      };

      if (n.kind === 'Route') {
        const params = n.meta.params;
        const authFlag = n.meta.guards.some((g) => g.includes('Auth'));
        return {
          ...base,
          ...(params.length > 0 ? { routeParams: params } : {}),
          ...(authFlag ? { authRequired: true as const } : {}),
          ...(n.meta.isEntry ? { isEntry: true as const } : {}),
        };
      }

      if (n.kind === 'Widget') {
        const tagName = n.meta.tagName;
        const attrs = n.meta.attributes ?? {};
        // Compute subtypeKey: tagName:typeValue when type attr present, else tagName
        const typeVal = attrs['type'];
        const subtypeKey = tagName !== undefined
          ? (typeVal !== undefined ? `${tagName}:${typeVal}` : tagName)
          : n.meta.widgetKind.toLowerCase();
        // Compute short display label from attrs priority order
        const displayLabel = _widgetDisplayLabel(attrs, subtypeKey);
        return {
          ...base,
          label: displayLabel,
          widgetKind: n.meta.widgetKind,
          ...(tagName !== undefined ? { tagName } : {}),
          subtypeKey,
          attrs,
        };
      }

      return base;
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  // ── Edges ─────────────────────────────────────────────────────────────────

  const edges: VizEdge[] = multigraph.edges
    .map((e): VizEdge => ({
      id: e.id,
      from: e.from,
      to: e.to,
      kind: e.kind,
      ...(e.isSystem === true ? { isSystem: true as const } : {}),
      uiPreconditionCount: e.constraints.uiAtoms.length,
      uiPreconditions: e.constraints.uiAtoms.map((a) => a.args.join(', ')),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  // ── Stats ─────────────────────────────────────────────────────────────────

  let moduleNodes = 0;
  let routeNodes = 0;
  let componentNodes = 0;
  let widgetNodes = 0;
  let serviceNodes = 0;
  let externalNodes = 0;

  for (const n of multigraph.nodes) {
    switch (n.kind) {
      case 'Module': moduleNodes++; break;
      case 'Route': routeNodes++; break;
      case 'Component': componentNodes++; break;
      case 'Widget': widgetNodes++; break;
      case 'Service': serviceNodes++; break;
      case 'External': externalNodes++; break;
    }
  }

  const feasible = exemplarPaths.filter((p) => p.verdict === 'FEASIBLE').length;
  const conditional = exemplarPaths.filter((p) => p.verdict === 'CONDITIONAL').length;
  const pruned = exemplarPaths.filter((p) => p.verdict === 'PRUNED').length;

  const vizStats: VizStats = {
    nodeCount: stats.nodeCount,
    edgeCount: stats.edgeCount,
    structuralEdgeCount: stats.structuralEdgeCount,
    executableEdgeCount: stats.executableEdgeCount,
    moduleNodes,
    routeNodes,
    componentNodes,
    widgetNodes,
    serviceNodes,
    externalNodes,
    exemplarPaths: exemplarPaths.length,
    feasible,
    conditional,
    pruned,
  };

  // ── Entry node IDs ────────────────────────────────────────────────────────

  const entryNodeIds = multigraph.nodes
    .filter((n) => n.kind === 'Route' && n.meta.isEntry)
    .map((n) => n.id)
    .sort();

  // ── Assemble ──────────────────────────────────────────────────────────────

  return {
    generatedFromProject: 'softscanner_fa',
    nodes,
    edges,
    entryNodeIds,
    exemplarPaths,
    stats: vizStats,
  };
}
