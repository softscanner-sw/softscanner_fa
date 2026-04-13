/**
 * analysis-bundle.ts
 * Phase 1 output artifact types.
 *
 * A1Multigraph (spec-compliant) is the sole A1 output: multigraph + stats.
 * A1InternalBundle extends it with internal registries for debug artifacts.
 */

import type { AnalyzerConfig } from './analyzer-config.js';
import type { ModuleRegistry } from './module.js';
import type { RouteMap } from './routes.js';
import type { ComponentRegistry } from './components.js';
import type { WidgetEventMap } from './events.js';

// Re-export the spec-compliant A1Multigraph from multigraph.ts
export type { A1Multigraph } from './multigraph.js';

/**
 * Internal extended bundle with debug registries.
 * Used only within A1 for debug output; NOT the spec artifact.
 * The spec artifact is A1Multigraph (multigraph + stats only).
 */
export interface A1InternalBundle {
  /** Configuration used to produce this bundle. */
  config: AnalyzerConfig;

  /** All NgModules discovered. */
  moduleRegistry: ModuleRegistry;
  /** All routes in normalized, flat form. */
  routeMap: RouteMap;
  /** All components with widget lists. */
  componentRegistry: ComponentRegistry;
  /** Per-component widget–event mappings. */
  widgetEventMaps: WidgetEventMap[];
}
