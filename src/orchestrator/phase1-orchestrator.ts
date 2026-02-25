/**
 * phase1-orchestrator.ts
 * Single entry-point for a complete Phase 1 static extraction run.
 *
 * Pipeline order (hard — do not reorder):
 *   1. TsProjectBuilder.build(cfg)
 *   2. ComponentRegistryBuilder.build(project)
 *   3. ModuleRegistryBuilder.build(project)
 *   4. RouteMapBuilder.build(project, componentRegistry)
 *   5. WidgetEventMapBuilder.build(project, componentRegistry, routeMap, widgets)
 *   6. NavigationGraphBuilder.build(componentRouteMap, componentRegistry,
 *                                   widgetEventMaps, moduleRegistry, widgets)
 *   7. Assemble Phase1AnalysisBundle
 *   8. AnalysisValidator.validatePhase1(bundle)  ← fails-fast on invariant violations
 *   9. Optional disk output (synchronous)
 *  10. Return bundle
 *
 * Prohibited:
 *   - DB writes
 *   - LLM calls
 *   - Runtime execution
 *   - UserJourneys / Scenarios / WorkflowResults
 */

import type { AnalyzerConfig } from '../models/analyzer-config.js';
import type { Phase1AnalysisBundle } from '../models/analysis-bundle.js';
import { TsProjectBuilder } from '../builders/ts-project-builder.js';
import { ComponentRegistryBuilder } from '../builders/component-registry-builder.js';
import { ModuleRegistryBuilder } from '../builders/module-registry-builder.js';
import { RouteMapBuilder } from '../builders/route-map-builder.js';
import { WidgetEventMapBuilder } from '../builders/widget-event-map-builder.js';
import { NavigationGraphBuilder } from '../builders/navigation-graph-builder.js';
import { AnalysisValidator } from '../services/analysis-validator.js';
import { AnalysisExporter } from '../services/analysis-exporter.js';
import { SilentLogger } from '../services/logger.js';
import type { Logger } from '../services/logger.js';

export interface Phase1OrchestratorOptions {
  /**
   * If set, write the full JSON bundle to this file path after a
   * successful run. Written synchronously before run() returns.
   */
  outputPath?: string;
  /**
   * If set, write split debug artifacts (modules/routes/components/graph)
   * to this directory. Written synchronously before run() returns.
   */
  debugOutputDir?: string;
  /**
   * Skip AnalysisValidator.validatePhase1() after bundle assembly.
   * Not recommended for production runs; useful for partial fixture tests.
   */
  skipValidation?: boolean;
  /**
   * Logger instance. Defaults to SilentLogger (no output).
   * Pass a ConsoleLogger for CLI runs.
   */
  logger?: Logger;
}

export class Phase1Orchestrator {
  private readonly _cfg: AnalyzerConfig;
  private readonly _options: Phase1OrchestratorOptions;
  private readonly _log: Logger;

  constructor(cfg: AnalyzerConfig, options: Phase1OrchestratorOptions = {}) {
    this._cfg = cfg;
    this._options = options;
    this._log = options.logger ?? new SilentLogger();
  }

  /**
   * Run the full Phase 1 pipeline and return the analysis bundle.
   * Throws ValidationError on invariant violations (unless skipValidation is set).
   */
  run(): Phase1AnalysisBundle {
    this._log.info('Phase 1 pipeline starting');

    // Step 1 — Project
    this._log.info('Step 1/6  Building TypeScript project', { tsConfigPath: this._cfg.tsConfigPath });
    const project = TsProjectBuilder.build(this._cfg);
    this._log.info('Step 1/6  Done', { sourceFiles: project.getSourceFiles().length });

    // Step 2 — Component registry (also produces full WidgetInfo objects)
    this._log.info('Step 2/6  Building component registry');
    const componentRegistryBuilder = new ComponentRegistryBuilder(this._cfg, this._log);
    const componentRegistry = componentRegistryBuilder.build(project);
    const widgetsByComponentId = componentRegistryBuilder.getWidgetsByComponentId();
    const totalWidgets = [...widgetsByComponentId.values()].reduce((s, ws) => s + ws.length, 0);
    this._log.info('Step 2/6  Done', {
      components: componentRegistry.components.length,
      widgets: totalWidgets,
    });

    // Step 3 — Module registry (optional; recommended)
    this._log.info('Step 3/6  Building module registry');
    const moduleRegistryBuilder = new ModuleRegistryBuilder(this._cfg, this._log);
    const moduleRegistry = moduleRegistryBuilder.build(project);
    this._log.info('Step 3/6  Done', { modules: moduleRegistry.modules.length });

    // Step 4 — Route map (with guard constraint summaries)
    this._log.info('Step 4/6  Building route map');
    const routeMapBuilder = new RouteMapBuilder(this._cfg, this._log);
    const componentRouteMap = routeMapBuilder.build(project, componentRegistry);
    const { routeMap } = componentRouteMap;
    this._log.info('Step 4/6  Done', { routes: routeMap.routes.length });

    // Step 5 — Widget event maps
    this._log.info('Step 5/6  Building widget event maps');
    const widgetEventMapBuilder = new WidgetEventMapBuilder(this._cfg, this._log);
    const widgetEventMaps = widgetEventMapBuilder.build(
      project,
      componentRegistry,
      routeMap,
      widgetsByComponentId,
    );
    this._log.info('Step 5/6  Done', { eventMaps: widgetEventMaps.length });

    // Step 6 — Navigation multigraph
    this._log.info('Step 6/6  Building navigation graph');
    const navigationGraphBuilder = new NavigationGraphBuilder(this._cfg, this._log);
    const navigation = navigationGraphBuilder.build(
      componentRouteMap,
      componentRegistry,
      widgetEventMaps,
      moduleRegistry,
      widgetsByComponentId,
    );
    this._log.info('Step 6/6  Done', {
      nodes: navigation.nodes.length,
      edges: navigation.edges.length,
    });

    // Step 7 — Assemble bundle
    const bundle: Phase1AnalysisBundle = {
      config: this._cfg,
      moduleRegistry,
      routeMap,
      componentRegistry,
      widgetEventMaps,
      navigation,
      stats: {
        modules: moduleRegistry.modules.length,
        routes: routeMap.routes.length,
        components: componentRegistry.components.length,
        widgets: componentRegistry.components.reduce(
          (sum, c) => sum + c.widgets.length,
          0,
        ),
        edges: navigation.edges.length,
        transitions: navigation.edges.reduce(
          (sum, e) => sum + e.transitions.length,
          0,
        ),
      },
    };

    // Step 8 — Validate
    if (this._options.skipValidation !== true) {
      this._log.info('Validating bundle invariants');
      AnalysisValidator.validatePhase1(bundle);
      this._log.info('Validation passed');
    }

    // Step 9 — Optional disk output (synchronous — completes before run() returns)
    if (this._options.outputPath !== undefined) {
      this._log.info('Writing bundle JSON', { path: this._options.outputPath });
      AnalysisExporter.writeToFile(bundle, this._options.outputPath);
      this._log.info('Bundle JSON written');
    }
    if (this._options.debugOutputDir !== undefined) {
      this._log.info('Writing debug artifacts', { dir: this._options.debugOutputDir });
      AnalysisExporter.writeDebugArtifacts(bundle, this._options.debugOutputDir);
      this._log.info('Debug artifacts written');
    }

    this._log.info('Phase 1 pipeline complete');
    return bundle;
  }
}
