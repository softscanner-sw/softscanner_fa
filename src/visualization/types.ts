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
  /** Widget-specific: owning component ID. */
  componentId?: string;
}

export interface VizEdge {
  id: string;
  from: string;
  to: string | null;
  kind: VizTransitionKind;
  isSystem?: true;
  uiPreconditionCount: number;
  uiPreconditions: string[];
  /** Handler metadata for edges tied to a component method. */
  handler?: { componentId: string; methodName: string };
  /** Trigger metadata for widget-origin edges. */
  trigger?: { event?: string; viaRouterLink?: boolean };
  /** Raw target expression text for unresolved navigation edges. */
  targetText?: string;
  /** Handler-scoped effect group identifier. */
  effectGroupId?: string;
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
}

// ---------------------------------------------------------------------------
// Root contract
// ---------------------------------------------------------------------------

export interface VizData {
  generatedFromProject: string;
  nodes: VizNode[];
  edges: VizEdge[];
  entryNodeIds: string[];
  stats: VizStats;
}
