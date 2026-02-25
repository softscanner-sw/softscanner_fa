/**
 * analysis-bundle.ts
 * Aggregator DTO returned by the Phase 1 orchestrator.
 *
 * This is the single output object of a complete Phase 1 static extraction run.
 * It bundles all registries and the assembled navigation–interaction multigraph,
 * along with the config used and optional summary statistics.
 *
 * Excluded by design (non-goals for Phase 1):
 *   - UserJourney, Scenario, WorkflowResult
 *   - Screenshot, Execution, CoverageResult
 *   - Satisfiability / feasibility results
 */

import type { AnalyzerConfig } from './analyzer-config.js';
import type { ModuleRegistry } from './module.js';
import type { RouteMap } from './routes.js';
import type { ComponentRegistry } from './components.js';
import type { WidgetEventMap } from './events.js';
import type { AppNavigation } from './navigation-graph.js';

/**
 * Complete output of a Phase 1 static extraction run.
 *
 * Given the same codebase and `config`, this object must be deterministic:
 * same IDs, same ordering, same content.
 */
export interface Phase1AnalysisBundle {
  /** Configuration used to produce this bundle. */
  config: AnalyzerConfig;

  /** All NgModules (or equivalent) discovered. */
  moduleRegistry: ModuleRegistry;
  /** All routes in normalized, flat form. */
  routeMap: RouteMap;
  /** All components with widget lists. */
  componentRegistry: ComponentRegistry;
  /** Per-component widget–event mappings. */
  widgetEventMaps: WidgetEventMap[];

  /** The assembled navigation–interaction multigraph. */
  navigation: AppNavigation;

  /** Optional extraction summary for quick inspection. */
  stats?: {
    modules: number;
    routes: number;
    components: number;
    widgets: number;
    edges: number;
    transitions: number;
  };
}
