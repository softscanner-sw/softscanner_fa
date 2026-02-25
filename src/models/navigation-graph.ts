/**
 * navigation-graph.ts
 * The navigation–interaction multigraph assembled from all Phase 1 extractions.
 *
 * Node ID convention:
 *   Route nodes    → Route.id
 *   Component nodes → ComponentInfo.id
 *   External nodes  → stable hash of the external URL
 *   Virtual nodes   → well-known string (e.g. "__root__", "__entry__")
 *
 * Edge ID convention: sourceNodeId + transition.signature + targetNodeId + stableIndex
 * Ordering: nodes and edges sorted by id lexicographically.
 */

import type { Origin } from './origin.js';
import type { Predicate, ConstraintSummary } from './constraints.js';
import type { UserEventType, NavEventType } from './events.js';

// ---------------------------------------------------------------------------
// Graph nodes
// ---------------------------------------------------------------------------

export type GraphNodeType =
  | 'Route'
  | 'Component'
  | 'External'
  | 'Virtual'; // e.g. synthetic entry / root node

/**
 * A vertex in the navigation–interaction multigraph.
 *
 * Exactly one of `routeId`, `componentId`, or `url` should be set,
 * matching the node's `type`. Virtual nodes may have none of these.
 */
export interface GraphNode {
  /** Stable node id (see convention above). */
  id: string;
  type: GraphNodeType;

  /** Human-readable label: route path, component name, or domain. */
  label: string;

  /** Origin of the corresponding source declaration. Undefined for Virtual nodes. */
  origin?: Origin;

  /** Populated when type === 'Route'. */
  routeId?: string;
  /** Populated when type === 'Component'. */
  componentId?: string;
  /** Populated when type === 'External'. */
  url?: string;

  /** Bounded key–value metadata for tooling or rendering hints. */
  metadata?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Transitions (edge labels)
// ---------------------------------------------------------------------------

/**
 * Semantic kind of a graph transition (edge label).
 */
export type TransitionKind =
  | 'NAVIGATE_ROUTE'
  | 'NAVIGATE_EXTERNAL'
  | 'SUBMIT_FORM'
  | 'SERVICE_CALL'
  | 'UI_EFFECT'
  | 'REDIRECT'
  | 'UNKNOWN';

/**
 * A single labeled transition between two nodes.
 *
 * One GraphEdge may carry multiple GraphTransitions (multigraph semantics):
 * e.g. two different buttons in the same component that both navigate to
 * the same target route produce two transitions on one edge.
 *
 * Validation rules:
 *   - `origin` MUST always be populated (template, handler, or route declaration).
 *   - When trigger.widgetId is set, it must exist in the source component's
 *     widget list and `origin` must point to the template.
 */
export interface GraphTransition {
  kind: TransitionKind;

  trigger?: {
    /** WidgetInfo.id if the transition is initiated by a UI widget. */
    widgetId?: string;
    eventType?: UserEventType;
    navType?: NavEventType;
  };

  handler?: {
    name?: string;
    origin?: Origin;
  };

  selectors?: {
    /** CSS selector for the triggering element, if extractable. */
    css?: string;
    /** XPath for the triggering element, if extractable. */
    xpath?: string;
  };

  /** Provenance: must point to template element, handler, or route declaration. */
  origin: Origin;

  /**
   * Visibility/enablement predicates inherited from the triggering widget.
   * Copied from WidgetInfo.visibilityPredicates + enablementPredicates.
   */
  uiPreconditions: Predicate[];

  /**
   * Merged constraint view (route guards + widget predicates + handler checks).
   * Optional at extraction time; populated by the Phase 1 constraint post-pass.
   */
  constraintSummary?: ConstraintSummary;
}

// ---------------------------------------------------------------------------
// Graph edges
// ---------------------------------------------------------------------------

/**
 * A directed edge in the multigraph.
 * Multiple transitions between the same (from, to) pair are collected here.
 * `transitions` is sorted by kind + trigger.eventType + origin.file + origin.startLine.
 */
export interface GraphEdge {
  /** Stable edge id (see convention above). */
  id: string;
  /** Source GraphNode.id. */
  from: string;
  /** Target GraphNode.id. */
  to: string;

  transitions: GraphTransition[];
}

// ---------------------------------------------------------------------------
// Top-level graph
// ---------------------------------------------------------------------------

/**
 * The complete navigation–interaction multigraph for the application.
 *
 * Validation rules:
 *   - Every GraphEdge.from and GraphEdge.to must exist in `nodes`.
 *   - `entryNodeIds` must be a subset of node ids in `nodes`.
 */
export interface AppNavigation {
  /** All graph nodes, sorted by id lexicographically. */
  nodes: GraphNode[];
  /** All graph edges, sorted by id lexicographically. */
  edges: GraphEdge[];
  /** IDs of entry-point nodes (e.g. the root route); sorted, unique. */
  entryNodeIds: string[];
}
