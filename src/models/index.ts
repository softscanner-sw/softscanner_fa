/**
 * models/index.ts
 * Barrel export for the Phase 1 model package.
 */

export type { Origin } from './origin.js';

export type {
  ConstraintSummary,
  PredicateKind,
  Predicate,
} from './constraints.js';

export type {
  BackendGranularity,
  AnalyzerConfig,
} from './analyzer-config.js';

export type {
  ModuleRole,
  ModuleInfo,
  ModuleRegistry,
} from './module.js';

export type {
  RouteKind,
  RouteGuardBinding,
  RouteResolverBinding,
  RouteDataBinding,
  BaseRoute,
  ComponentRoute,
  RedirectRoute,
  WildcardRoute,
  Route,
  RouteMap,
  ComponentRouteMap,
} from './routes.js';

export type {
  ComponentSymbol,
  ComponentInfo,
  ComponentRegistry,
} from './components.js';

export type {
  WidgetKind,
  WidgetPathInfo,
  WidgetBinding,
  WidgetInfo,
} from './widgets.js';

export type {
  UserEventType,
  NavEventType,
  EventHandlerCallContext,
  WidgetEvent,
  WidgetEventMap,
} from './events.js';

// Spec-compliant multigraph types (approach.md §9)
export type {
  SourceRef,
  NodeKind,
  SpecWidgetKind,
  EdgeKind,
  Atom,
  ConstraintSurface,
  NodeBase,
  ModuleNode,
  RouteNode,
  ComponentNode,
  WidgetNode,
  ServiceNode,
  ExternalNode,
  Node,
  TriggerRef,
  HandlerRef,
  Edge,
  Multigraph,
  Phase1Bundle,
} from './multigraph.js';

export { emptyConstraintSurface, STRUCTURAL_EDGE_KINDS } from './multigraph.js';

export type { A1InternalBundle } from './analysis-bundle.js';
