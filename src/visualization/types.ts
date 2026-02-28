/**
 * types.ts
 * VizData contract — the serialized data blob consumed by all HTML pages.
 */

import type { EdgeKind, NodeKind } from '../models/multigraph.js';

// ---------------------------------------------------------------------------
// Node / edge types
// ---------------------------------------------------------------------------

export type VizNodeType = NodeKind;

export type VizTransitionKind = EdgeKind;

export interface VizNode {
  id: string;
  type: VizNodeType;
  label: string;
  routeParams?: string[];
  authRequired?: true;
  isEntry?: true;
  /** Widget-specific: spec widget kind (e.g., Button, Input, Link). */
  widgetKind?: string;
  /** Widget-specific: HTML tag name (e.g., button, input, a). */
  tagName?: string;
  /** Widget-specific: deterministic subtype key for coloring (e.g., "button", "input[type=submit]"). */
  subtypeKey?: string;
  /** Widget-specific: relevant HTML attributes (e.g., { type: 'submit' }). Empty if not available. */
  attrs?: Record<string, string>;
}

export interface VizEdge {
  id: string;
  from: string;
  to: string | null;
  kind: VizTransitionKind;
  isSystem?: true;
  uiPreconditionCount: number;
  uiPreconditions: string[];
}

// ---------------------------------------------------------------------------
// Path-finding output
// ---------------------------------------------------------------------------

export interface AggregatedConstraints {
  uiPreconditions: string[];
  requiredParams: string[];
  authRequired: boolean;
  rolesRequired: string[];
  featureFlags: string[];
}

export interface PathStep {
  nodeId: string;
  edgeId?: string;
  constraintsSoFar: AggregatedConstraints;
}

export type PruningVerdict = 'FEASIBLE' | 'CONDITIONAL' | 'PRUNED';

export interface ExemplarPath {
  id: string;
  entryNodeId: string;
  steps: PathStep[];
  aggregated: AggregatedConstraints;
  verdict: PruningVerdict;
  pruneReason?: string;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export interface VizStats {
  nodeCount: number;
  edgeCount: number;
  structuralEdgeCount: number;
  executableEdgeCount: number;
  moduleNodes: number;
  routeNodes: number;
  componentNodes: number;
  widgetNodes: number;
  serviceNodes: number;
  externalNodes: number;
  exemplarPaths: number;
  feasible: number;
  conditional: number;
  pruned: number;
}

// ---------------------------------------------------------------------------
// Root contract
// ---------------------------------------------------------------------------

export interface VizData {
  generatedFromProject: string;
  nodes: VizNode[];
  edges: VizEdge[];
  entryNodeIds: string[];
  exemplarPaths: ExemplarPath[];
  stats: VizStats;
}
