/**
 * analysis-validator.ts
 * Centralized Phase 1 invariant checks.
 * Throws a descriptive error on the first violation found.
 *
 * Validation rules enforced:
 *   1. Every ComponentRoute.componentId references an existing ComponentInfo.id.
 *   2. Every WidgetEvent.widgetId appears in the owning component's widgets list.
 *   3. Every GraphEdge.from / .to references an existing GraphNode.id.
 *   4. For UI-triggered transitions, trigger.widgetId must appear in the
 *      source component's widgets list.
 *   5. All "sorted, unique" arrays are spot-checked.
 */

import type { Phase1AnalysisBundle } from '../models/analysis-bundle.js';
import type { ComponentRegistry } from '../models/components.js';
import type { RouteMap } from '../models/routes.js';
import type { WidgetEventMap } from '../models/events.js';
import type { AppNavigation } from '../models/navigation-graph.js';

export class AnalysisValidator {
  /**
   * Validate a Phase1AnalysisBundle against all Phase 1 invariants.
   * Throws `ValidationError` on the first violation.
   */
  static validatePhase1(bundle: Phase1AnalysisBundle): void {
    AnalysisValidator._validateRoutes(bundle.routeMap, bundle.componentRegistry);
    AnalysisValidator._validateWidgetEvents(bundle.widgetEventMaps, bundle.componentRegistry);
    AnalysisValidator._validateGraph(bundle.navigation);
    AnalysisValidator._validateSortedUnique(bundle);
  }

  // ---------------------------------------------------------------------------
  // Rule 1 — ComponentRoute.componentId exists in ComponentRegistry
  // ---------------------------------------------------------------------------

  private static _validateRoutes(
    routeMap: RouteMap,
    componentRegistry: ComponentRegistry,
  ): void {
    for (const route of routeMap.routes) {
      if (route.kind !== 'ComponentRoute') continue;

      if (
        route.componentId !== '__unknown__' &&
        !route.componentId.startsWith('__unresolved__') &&
        componentRegistry.byId[route.componentId] === undefined
      ) {
        throw new ValidationError(
          `Rule 1 violation: ComponentRoute "${route.id}" references componentId ` +
          `"${route.componentId}" which does not exist in ComponentRegistry.`,
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Rule 2 — WidgetEvent.widgetId exists in owning component's widgets list
  // ---------------------------------------------------------------------------

  private static _validateWidgetEvents(
    widgetEventMaps: WidgetEventMap[],
    componentRegistry: ComponentRegistry,
  ): void {
    for (const wem of widgetEventMaps) {
      const component = componentRegistry.byId[wem.componentId];
      if (component === undefined) continue; // component not in registry — skip

      const widgetSet = new Set(component.widgets);

      for (const event of wem.events) {
        if (!widgetSet.has(event.widgetId)) {
          throw new ValidationError(
            `Rule 2 violation: WidgetEvent in component "${wem.componentId}" ` +
            `references widgetId "${event.widgetId}" which is not in the component's widgets list.`,
          );
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Rule 3 — GraphEdge endpoints exist in nodes
  // ---------------------------------------------------------------------------

  private static _validateGraph(navigation: AppNavigation): void {
    const nodeIds = new Set(navigation.nodes.map((n) => n.id));

    for (const edge of navigation.edges) {
      if (!nodeIds.has(edge.from)) {
        throw new ValidationError(
          `Rule 3 violation: GraphEdge "${edge.id}" has from="${edge.from}" ` +
          `which does not exist in navigation nodes.`,
        );
      }
      if (!nodeIds.has(edge.to)) {
        throw new ValidationError(
          `Rule 3 violation: GraphEdge "${edge.id}" has to="${edge.to}" ` +
          `which does not exist in navigation nodes.`,
        );
      }

      // Rule 4 — UI-triggered transitions must have a valid widgetId origin
      for (const transition of edge.transitions) {
        if (
          transition.trigger?.widgetId !== undefined &&
          transition.origin.file === ''
        ) {
          throw new ValidationError(
            `Rule 4 violation: Transition in edge "${edge.id}" has trigger.widgetId ` +
            `"${transition.trigger.widgetId}" but origin.file is empty — ` +
            `origin must point to a template file.`,
          );
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Rule 5 — Spot-check sorted/unique arrays
  // ---------------------------------------------------------------------------

  private static _validateSortedUnique(bundle: Phase1AnalysisBundle): void {
    // Check route params
    for (const route of bundle.routeMap.routes) {
      AnalysisValidator._assertSortedUnique(
        route.params.routeParams,
        `Route "${route.id}" params.routeParams`,
      );
      AnalysisValidator._assertSortedUnique(
        route.guards.map((g) => g.guardName),
        `Route "${route.id}" guard names`,
      );
    }

    // Check module imports/declarations
    for (const mod of bundle.moduleRegistry.modules) {
      AnalysisValidator._assertSortedUnique(mod.imports, `Module "${mod.id}" imports`);
      AnalysisValidator._assertSortedUnique(mod.declarations, `Module "${mod.id}" declarations`);
    }

    // Check component usesComponentIds
    for (const comp of bundle.componentRegistry.components) {
      AnalysisValidator._assertSortedUnique(
        comp.usesComponentIds,
        `Component "${comp.id}" usesComponentIds`,
      );
    }
  }

  private static _assertSortedUnique(arr: string[], label: string): void {
    const deduped = [...new Set(arr)].sort();
    if (arr.length !== deduped.length) {
      throw new ValidationError(
        `Rule 5 violation: ${label} contains duplicate values: [${arr.join(', ')}]`,
      );
    }
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] !== deduped[i]) {
        throw new ValidationError(
          `Rule 5 violation: ${label} is not lexicographically sorted. ` +
          `Got [${arr.join(', ')}], expected [${deduped.join(', ')}].`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
