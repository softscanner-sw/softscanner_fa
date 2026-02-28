/**
 * analysis-bundle.ts
 * Phase 1 output artifact types.
 *
 * Phase1Bundle (spec-compliant) is the sole A1 output: multigraph + stats.
 * A1InternalBundle extends it with internal registries for debug artifacts.
 */

import type { AnalyzerConfig } from './analyzer-config.js';
import type { ModuleRegistry } from './module.js';
import type { RouteMap } from './routes.js';
import type { ComponentRegistry } from './components.js';
import type { WidgetEventMap } from './events.js';

// Re-export the spec-compliant Phase1Bundle from multigraph.ts
export type { Phase1Bundle } from './multigraph.js';

/**
 * Internal extended bundle with debug registries.
 * Used only within A1 for debug output; NOT the spec artifact.
 * The spec artifact is Phase1Bundle (multigraph + stats only).
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
