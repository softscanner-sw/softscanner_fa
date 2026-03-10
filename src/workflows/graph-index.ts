/**
 * graph-index.ts
 * Immutable index structures built from a Phase1Bundle for fast edge/node lookups.
 * Pure data transformation — no mutation, no side effects.
 *
 * Isolation: imports only types from src/models/.
 */

import { createHash } from 'node:crypto';
import type { Edge, EdgeKind, Node, Phase1Bundle, RouteNode } from '../models/multigraph.js';
import type { PhaseAInputRef } from '../models/workflow.js';

/** Immutable lookup index over the A1 multigraph. */
export interface GraphIndex {
  /** Quick node lookup by id. */
  readonly nodeMap: ReadonlyMap<string, Node>;
  /** All edges grouped by source node id. */
  readonly edgesByFrom: ReadonlyMap<string, readonly Edge[]>;
  /** ROUTE_ACTIVATES_COMPONENT: routeId → componentId[]. */
  readonly routeActivatesComponent: ReadonlyMap<string, readonly string[]>;
  /** COMPONENT_COMPOSES_COMPONENT: parentComponentId → childComponentId[]. */
  readonly componentComposesComponent: ReadonlyMap<string, readonly string[]>;
  /** COMPONENT_CONTAINS_WIDGET: componentId → widgetId[]. */
  readonly componentContainsWidget: ReadonlyMap<string, readonly string[]>;
  /** Entry route IDs (meta.isEntry === true), sorted deterministically. */
  readonly entryRouteIds: readonly string[];
  /** Edge lookup by id. */
  readonly edgeById: ReadonlyMap<string, Edge>;
  /** ROUTE_REDIRECTS_TO_ROUTE edges grouped by source route id. */
  readonly redirectEdgesByFrom: ReadonlyMap<string, readonly Edge[]>;
  /** Edges grouped by effectGroupId for handler-scoped effect lookup. */
  readonly edgesByEffectGroupId: ReadonlyMap<string, readonly Edge[]>;
  /**
   * Bootstrap component IDs (sorted): components that are not route-activated
   * and not composed by any other component, yet have outgoing composition or
   * widget edges.  These are the app-shell roots (e.g. AppComponent) whose
   * widgets are always visible regardless of the active route.
   */
  readonly bootstrapComponentIds: readonly string[];
  /**
   * Reverse ROUTE_HAS_CHILD index: childRouteId → parentRouteId.
   * Used to walk up the route ancestry and include parent route components
   * (Angular co-renders parent and child route components via <router-outlet>).
   */
  readonly routeParentOf: ReadonlyMap<string, string>;
  /**
   * All component-bearing route IDs (sorted): routes with at least one
   * ROUTE_ACTIVATES_COMPONENT edge.  Superset of entryRouteIds.
   */
  readonly enumerableRouteIds: readonly string[];
}

/** Progress edge kinds that count toward k (§2.A). */
export const PROGRESS_EDGE_KINDS: ReadonlySet<EdgeKind> = new Set<EdgeKind>([
  'WIDGET_TRIGGERS_HANDLER',
  'WIDGET_SUBMITS_FORM',
  'WIDGET_NAVIGATES_ROUTE',
  'WIDGET_NAVIGATES_EXTERNAL',
  'COMPONENT_CALLS_SERVICE',
  'COMPONENT_NAVIGATES_ROUTE',
]);

/** All executable edge kinds traversable in A2 (progress + system). */
export const EXECUTABLE_EDGE_KINDS: ReadonlySet<EdgeKind> = new Set<EdgeKind>([
  ...PROGRESS_EDGE_KINDS,
  'ROUTE_REDIRECTS_TO_ROUTE',
]);

/** Widget-origin edge kinds (§3.3). */
export const WIDGET_ORIGIN_EDGE_KINDS: ReadonlySet<EdgeKind> = new Set<EdgeKind>([
  'WIDGET_NAVIGATES_EXTERNAL',
  'WIDGET_NAVIGATES_ROUTE',
  'WIDGET_SUBMITS_FORM',
  'WIDGET_TRIGGERS_HANDLER',
]);

/** Component-origin edge kinds (§3.3 — gated by pendingEffect). */
export const COMPONENT_ORIGIN_EDGE_KINDS: ReadonlySet<EdgeKind> = new Set<EdgeKind>([
  'COMPONENT_CALLS_SERVICE',
  'COMPONENT_NAVIGATES_ROUTE',
]);

/**
 * Build an immutable index from a Phase1Bundle.
 * The index is a pure function of the bundle — no randomness, no side effects.
 */
export function buildGraphIndex(bundle: Phase1Bundle): GraphIndex {
  const { multigraph } = bundle;

  const nodeMap = new Map<string, Node>();
  for (const node of multigraph.nodes) {
    nodeMap.set(node.id, node);
  }

  const edgesByFrom = new Map<string, Edge[]>();
  const edgeById = new Map<string, Edge>();
  const redirectEdgesByFrom = new Map<string, Edge[]>();

  const routeActivatesComponent = new Map<string, string[]>();
  const componentComposesComponent = new Map<string, string[]>();
  const componentContainsWidget = new Map<string, string[]>();
  const routeParentOf = new Map<string, string>();

  for (const edge of multigraph.edges) {
    edgeById.set(edge.id, edge);

    // Group all edges by from
    let fromList = edgesByFrom.get(edge.from);
    if (fromList === undefined) {
      fromList = [];
      edgesByFrom.set(edge.from, fromList);
    }
    fromList.push(edge);

    // Build structural indexes
    switch (edge.kind) {
      case 'ROUTE_ACTIVATES_COMPONENT': {
        let list = routeActivatesComponent.get(edge.from);
        if (list === undefined) {
          list = [];
          routeActivatesComponent.set(edge.from, list);
        }
        if (edge.to !== null) list.push(edge.to);
        break;
      }
      case 'COMPONENT_COMPOSES_COMPONENT': {
        let list = componentComposesComponent.get(edge.from);
        if (list === undefined) {
          list = [];
          componentComposesComponent.set(edge.from, list);
        }
        if (edge.to !== null) list.push(edge.to);
        break;
      }
      case 'COMPONENT_CONTAINS_WIDGET': {
        let list = componentContainsWidget.get(edge.from);
        if (list === undefined) {
          list = [];
          componentContainsWidget.set(edge.from, list);
        }
        if (edge.to !== null) list.push(edge.to);
        break;
      }
      case 'ROUTE_REDIRECTS_TO_ROUTE': {
        let list = redirectEdgesByFrom.get(edge.from);
        if (list === undefined) {
          list = [];
          redirectEdgesByFrom.set(edge.from, list);
        }
        list.push(edge);
        break;
      }
      case 'ROUTE_HAS_CHILD': {
        if (edge.to !== null) {
          routeParentOf.set(edge.to, edge.from);
        }
        break;
      }
    }
  }

  // Build effectGroupId index
  const edgesByEffectGroupId = new Map<string, Edge[]>();
  for (const edge of multigraph.edges) {
    if (edge.effectGroupId !== undefined) {
      let list = edgesByEffectGroupId.get(edge.effectGroupId);
      if (list === undefined) {
        list = [];
        edgesByEffectGroupId.set(edge.effectGroupId, list);
      }
      list.push(edge);
    }
  }

  // Collect entry routes (isEntry === true), sorted by id
  const entryRouteIds: string[] = [];
  for (const node of multigraph.nodes) {
    if (node.kind === 'Route' && (node as RouteNode).meta.isEntry) {
      entryRouteIds.push(node.id);
    }
  }
  entryRouteIds.sort();

  // Identify bootstrap components: not route-activated, not composed by anyone,
  // yet have outgoing COMPONENT_COMPOSES_COMPONENT or COMPONENT_CONTAINS_WIDGET edges.
  const routeActivatedIds = new Set<string>();
  for (const ids of routeActivatesComponent.values()) {
    for (const id of ids) routeActivatedIds.add(id);
  }
  const composedByOtherIds = new Set<string>();
  for (const ids of componentComposesComponent.values()) {
    for (const id of ids) composedByOtherIds.add(id);
  }
  const bootstrapComponentIds: string[] = [];
  for (const node of multigraph.nodes) {
    if (node.kind !== 'Component') continue;
    if (routeActivatedIds.has(node.id)) continue;       // route-activated → not bootstrap
    if (composedByOtherIds.has(node.id)) continue;       // composed by another component → not root
    // Must have outgoing composition or widget edges (not an orphan)
    const hasComposition = componentComposesComponent.has(node.id);
    const hasWidgets = componentContainsWidget.has(node.id);
    if (hasComposition || hasWidgets) {
      bootstrapComponentIds.push(node.id);
    }
  }
  bootstrapComponentIds.sort();

  // Enumerable routes: all routes with at least one ROUTE_ACTIVATES_COMPONENT edge.
  const enumerableRouteIds = [...routeActivatesComponent.keys()].sort();

  return {
    nodeMap,
    edgesByFrom,
    routeActivatesComponent,
    componentComposesComponent,
    componentContainsWidget,
    entryRouteIds,
    edgeById,
    redirectEdgesByFrom,
    edgesByEffectGroupId,
    bootstrapComponentIds,
    routeParentOf,
    enumerableRouteIds,
  };
}

/**
 * Compute the active component set for a given route context.
 * §3.1: seed from ROUTE_ACTIVATES_COMPONENT, then transitive closure via
 * COMPONENT_COMPOSES_COMPONENT.  Bootstrap components (app-shell roots) and
 * their composition closure are included for all routes.
 */
export function computeActiveComponentIds(routeId: string, index: GraphIndex): ReadonlySet<string> {
  const seed = index.routeActivatesComponent.get(routeId) ?? [];

  // Seed from route-activated + bootstrap components
  const active = new Set<string>([...seed, ...index.bootstrapComponentIds]);

  // Include components from ancestor routes (Angular co-renders parent + child
  // route components via <router-outlet>).
  let ancestor = index.routeParentOf.get(routeId);
  const seenAncestors = new Set<string>();
  while (ancestor !== undefined && !seenAncestors.has(ancestor)) {
    seenAncestors.add(ancestor);
    const parentComponents = index.routeActivatesComponent.get(ancestor) ?? [];
    for (const cId of parentComponents) active.add(cId);
    ancestor = index.routeParentOf.get(ancestor);
  }
  const queue = [...active];

  while (queue.length > 0) {
    const cId = queue.pop()!;
    const children = index.componentComposesComponent.get(cId);
    if (children !== undefined) {
      for (const child of children) {
        if (!active.has(child)) {
          active.add(child);
          queue.push(child);
        }
      }
    }
  }

  return active;
}

/**
 * Compute the active widget set for a given set of active components.
 * §3.2: w is active iff its owning component is active and COMPONENT_CONTAINS_WIDGET(c→w) exists.
 */
export function computeActiveWidgetIds(
  activeComponentIds: ReadonlySet<string>,
  index: GraphIndex,
): ReadonlySet<string> {
  const widgets = new Set<string>();
  for (const cId of activeComponentIds) {
    const widgetList = index.componentContainsWidget.get(cId);
    if (widgetList !== undefined) {
      for (const wId of widgetList) {
        widgets.add(wId);
      }
    }
  }
  return widgets;
}

// ---------------------------------------------------------------------------
// Input reference (audit traceability)
// ---------------------------------------------------------------------------

/**
 * Compute an A1 input reference for audit traceability.
 * SHA-256 hash of the multigraph JSON ensures drift detection.
 */
export function computeInputRef(bundle: Phase1Bundle): PhaseAInputRef {
  const canonical = JSON.stringify(bundle.multigraph);
  const hash = createHash('sha256').update(canonical).digest('hex');
  return {
    projectId: '', // Set by CLI from project metadata
    multigraphHash: hash,
  };
}
