/**
 * models/index.ts
 * Barrel export for the Phase 1 model package.
 * Import from this file to consume the full model surface.
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

export type {
  GraphNodeType,
  GraphNode,
  TransitionKind,
  GraphTransition,
  GraphEdge,
  AppNavigation,
} from './navigation-graph.js';

export type { Phase1AnalysisBundle } from './analysis-bundle.js';
