/**
 * routes.ts
 * Route declarations extracted from the Angular router configuration
 * (or equivalent framework router).
 *
 * ID convention: stable string derived from normalized fullPath + moduleId.
 * Ordering: sorted by fullPath lexicographically.
 */

import type { Origin } from './origin.js';
import type { ConstraintSummary } from './constraints.js';

// ---------------------------------------------------------------------------
// Supporting types
// ---------------------------------------------------------------------------

export type RouteKind = 'ComponentRoute' | 'RedirectRoute' | 'WildcardRoute';

/** Binding of a route guard (canActivate, canLoad, etc.) to a route. */
export interface RouteGuardBinding {
  kind: 'canActivate' | 'canLoad' | 'canActivateChild' | 'canDeactivate';
  /** Guard identifier as written in source. */
  guardName: string;
  origin: Origin;
  /** Optional summary filled by GuardConstraintSummarizer (Phase 1 post-pass). */
  constraintSummary?: ConstraintSummary;
}

/** Binding of a route resolver to a route. */
export interface RouteResolverBinding {
  /** The resolve token key in the route config object. */
  key: string;
  resolverName: string;
  origin: Origin;
  /** Optional summary, e.g. requiredResolvedData. */
  constraintSummary?: ConstraintSummary;
}

/** A single static `data` property bound to a route. */
export interface RouteDataBinding {
  key: string;
  /** Stringified / serialized value. */
  value: string;
  origin: Origin;
}

// ---------------------------------------------------------------------------
// Base route — fields shared by all route kinds
// ---------------------------------------------------------------------------

export interface BaseRoute {
  /** Stable id derived from fullPath + moduleId. */
  id: string;
  kind: RouteKind;

  moduleId: string;
  origin: Origin;

  /** Raw path segment as written (e.g. "users/:id"). */
  path: string;
  /** Normalized absolute path (e.g. "/admin/users/:id"). */
  fullPath: string;
  parentId?: string;

  /** Child route IDs (sorted, unique). */
  childrenIds: string[];
  /** Named router outlet, if specified. */
  outlet?: string;

  guards: RouteGuardBinding[];
  resolvers: RouteResolverBinding[];
  data: RouteDataBinding[];

  params: {
    /** Colon-prefixed params extracted from fullPath, e.g. ["id"] (sorted, unique). */
    routeParams: string[];
    /** Query params if statically detectable (sorted, unique). */
    queryParams?: string[];
  };

  /**
   * Aggregate constraint summary across guards, resolvers, and data.
   * Computed during Phase 1 post-pass; optional at extraction time.
   */
  constraintSummary?: ConstraintSummary;
}

// ---------------------------------------------------------------------------
// Concrete route kinds
// ---------------------------------------------------------------------------

/** A route that renders a component. */
export interface ComponentRoute extends BaseRoute {
  kind: 'ComponentRoute';
  /** ComponentInfo.id of the rendered component. */
  componentId: string;
  /** Human-readable component class name (convenience field). */
  componentName?: string;
}

/** A route that redirects to another path. */
export interface RedirectRoute extends BaseRoute {
  kind: 'RedirectRoute';
  /** Raw redirectTo value as written in source. */
  redirectTo: string;
  /** Normalized absolute target path. */
  redirectToFullPath: string;
  pathMatch?: 'full' | 'prefix';
}

/** A wildcard/catch-all route (path: '**'). */
export interface WildcardRoute extends BaseRoute {
  kind: 'WildcardRoute';
  /** ComponentInfo.id of the rendered component, if specified. */
  componentId?: string;
  /** Human-readable component class name (convenience field). */
  componentName?: string;
}

// ---------------------------------------------------------------------------
// Union type and registry
// ---------------------------------------------------------------------------

export type Route = ComponentRoute | RedirectRoute | WildcardRoute;

/**
 * Flat collection of all routes.
 * `routes` is sorted by `fullPath` lexicographically.
 * `byId` provides O(1) lookup.
 */
export interface RouteMap {
  routes: Route[];
  byId: Record<string, Route>;
}

// ---------------------------------------------------------------------------
// Component route map (RouteAnalyzer output)
// ---------------------------------------------------------------------------

/**
 * Output of RouteAnalyzer.analyzeRoutes().
 * Bundles the normalized RouteMap with per-component usage information,
 * enabling downstream phases to find which routes render each component
 * and how often each component is reused across the route tree.
 *
 * `routesByComponentId` is sorted by componentId; inner arrays are sorted
 * by route fullPath.
 */
export interface ComponentRouteMap {
  routeMap: RouteMap;
  /** All ComponentRoutes indexed by their componentId for O(1) lookup. */
  routesByComponentId: Record<string, ComponentRoute[]>;
  /** Number of routes that reference each componentId (sorted, unique keys). */
  componentUsageCounts: Record<string, number>;
}
