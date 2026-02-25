/**
 * events.ts
 * User event and handler call-context metadata extracted from component
 * templates and class methods during Phase 1.
 */

import type { Origin } from './origin.js';
import type { ConstraintSummary } from './constraints.js';

// ---------------------------------------------------------------------------
// Event type enumerations
// ---------------------------------------------------------------------------

/**
 * DOM / framework event type that the user triggers on a widget.
 */
export type UserEventType =
  | 'click'
  | 'input'
  | 'change'
  | 'submit'
  | 'keydown'
  | 'keyup'
  | 'navigation'
  | 'unknown';

/**
 * Navigation mechanism that produces a route transition.
 */
export type NavEventType =
  | 'routerLink'
  | 'href'
  | 'programmaticNavigate'
  | 'redirect'
  | 'unknown';

// ---------------------------------------------------------------------------
// EventHandlerCallContext
// ---------------------------------------------------------------------------

/**
 * Static summary of one observable effect inside an event handler method.
 * A single handler may produce multiple call contexts (e.g. a service call
 * followed by a navigation).
 *
 * Phase 1 does NOT perform satisfiability checking; these are best-effort
 * static summaries extracted from AST analysis.
 */
export interface EventHandlerCallContext {
  kind:
    | 'Navigate'
    | 'ServiceCall'
    | 'StateUpdate'
    | 'UIEffect'
    | 'Unknown';

  target?: {
    /** Raw route path string if detectable (e.g. "/users/list"). */
    route?: string;
    /** Fully qualified service method, e.g. "UserService.create". */
    serviceMethod?: string;
    /** External URL if navigating outside the SPA. */
    url?: string;
  };

  /** Raw argument expressions, bounded. */
  args?: string[];
  origin: Origin;
}

// ---------------------------------------------------------------------------
// WidgetEvent
// ---------------------------------------------------------------------------

/**
 * Maps a user event on a widget to its static handler analysis.
 *
 * Validation rule: `widgetId` must exist in the owning ComponentInfo.widgets list.
 */
export interface WidgetEvent {
  /** WidgetInfo.id of the widget that owns this event binding. */
  widgetId: string;
  eventType: UserEventType;

  /** Name of the component method bound to handle this event. */
  handlerName?: string;
  handlerOrigin?: Origin;

  /**
   * Ordered list of call contexts detected inside the handler.
   * Empty when no handler is bound or the handler body is opaque.
   */
  callContexts: EventHandlerCallContext[];

  /**
   * Optional constraint summary derived from static analysis of the handler
   * body (e.g., auth checks, permission guards called inline).
   */
  constraintSummary?: ConstraintSummary;
}

// ---------------------------------------------------------------------------
// WidgetEventMap
// ---------------------------------------------------------------------------

/**
 * All widget events extracted from a single component.
 * `events` is sorted by widgetId + eventType lexicographically.
 */
export interface WidgetEventMap {
  componentId: string;
  events: WidgetEvent[];
}
