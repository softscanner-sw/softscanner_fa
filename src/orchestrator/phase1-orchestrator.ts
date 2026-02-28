/**
 * phase1-orchestrator.ts
 * Single entry-point for a complete Phase 1 static extraction run.
 *
 * Pipeline order:
 *   1. TsProjectBuilder.build(cfg)
 *   2. ComponentRegistryBuilder.build(project)
 *   3. ModuleRegistryBuilder.build(project)
 *   4. RouteMapBuilder.build(project, componentRegistry)
 *   5. WidgetEventMapBuilder.build(...)
 *   6. ServiceExtraction (resolve @Injectable classes)
 *   7. NavigationGraphBuilder.build(...) → Multigraph
 *   8. Assemble Phase1Bundle (multigraph + stats)
 *   9. AnalysisValidator.validatePhase1(bundle)
 *  10. Optional disk output
 *  11. Return bundle
 */

import type { Project, Decorator } from 'ts-morph';
import type { AnalyzerConfig } from '../models/analyzer-config.js';
import type { Phase1Bundle } from '../models/multigraph.js';
import { STRUCTURAL_EDGE_KINDS } from '../models/multigraph.js';
import type { A1InternalBundle } from '../models/analysis-bundle.js';
import { TsProjectBuilder } from '../builders/ts-project-builder.js';
import { ComponentRegistryBuilder } from '../builders/component-registry-builder.js';
import { ModuleRegistryBuilder } from '../builders/module-registry-builder.js';
import { RouteMapBuilder } from '../builders/route-map-builder.js';
import { WidgetEventMapBuilder } from '../builders/widget-event-map-builder.js';
import { NavigationGraphBuilder } from '../builders/navigation-graph-builder.js';
import type { ServiceInfo } from '../builders/navigation-graph-builder.js';
import { AnalysisValidator } from '../services/analysis-validator.js';
import { AnalysisExporter } from '../services/analysis-exporter.js';
import { TsAstUtils } from '../parsers/ts/ts-ast-utils.js';
import { SilentLogger } from '../services/logger.js';
import type { Logger } from '../services/logger.js';

export interface Phase1OrchestratorOptions {
  outputPath?: string;
  debugOutputDir?: string;
  skipValidation?: boolean;
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

  run(): Phase1Bundle {
    this._log.info('Phase 1 pipeline starting');

    // Step 1 — Project
    this._log.info('Step 1/7  Building TypeScript project', { tsConfigPath: this._cfg.tsConfigPath });
    const project = TsProjectBuilder.build(this._cfg);
    this._log.info('Step 1/7  Done', { sourceFiles: project.getSourceFiles().length });

    // Step 2 — Component registry
    this._log.info('Step 2/7  Building component registry');
    const componentRegistryBuilder = new ComponentRegistryBuilder(this._cfg, this._log);
    const componentRegistry = componentRegistryBuilder.build(project);
    const widgetsByComponentId = componentRegistryBuilder.getWidgetsByComponentId();
    const totalWidgets = [...widgetsByComponentId.values()].reduce((s, ws) => s + ws.length, 0);
    this._log.info('Step 2/7  Done', {
      components: componentRegistry.components.length,
      widgets: totalWidgets,
    });

    // Step 3 — Module registry
    this._log.info('Step 3/7  Building module registry');
    const moduleRegistryBuilder = new ModuleRegistryBuilder(this._cfg, this._log);
    const moduleRegistry = moduleRegistryBuilder.build(project);
    this._log.info('Step 3/7  Done', { modules: moduleRegistry.modules.length });

    // Module audit log
    for (const mod of moduleRegistry.modules) {
      this._log.debug('  module', {
        name: mod.name,
        role: mod.role,
        declarations: mod.declarations.length,
        providers: mod.providers.length,
      });
    }

    // Step 4 — Route map
    this._log.info('Step 4/7  Building route map');
    const routeMapBuilder = new RouteMapBuilder(this._cfg, this._log);
    const componentRouteMap = routeMapBuilder.build(project, componentRegistry);
    const { routeMap } = componentRouteMap;
    this._log.info('Step 4/7  Done', { routes: routeMap.routes.length });

    // Route audit log
    for (const route of routeMap.routes) {
      this._log.debug('  route', {
        fullPath: route.fullPath,
        kind: route.kind,
        hasParent: route.parentId !== undefined,
        children: route.childrenIds.length,
      });
    }

    // Step 4b — Populate module routesOwned (post-hoc linkage)
    // Route.moduleId is the source file path where the route was found,
    // which matches Module.id (also the source file path).
    const moduleById = new Map(moduleRegistry.modules.map((m) => [m.id, m]));
    for (const route of routeMap.routes) {
      const mod = moduleById.get(route.moduleId);
      if (mod !== undefined) {
        mod.routesOwned.push(route.id);
      }
    }
    // Sort routesOwned for determinism
    for (const mod of moduleRegistry.modules) {
      mod.routesOwned.sort();
    }

    // Step 5 — Widget event maps
    this._log.info('Step 5/7  Building widget event maps');
    const widgetEventMapBuilder = new WidgetEventMapBuilder(this._cfg, this._log);
    const widgetEventMaps = widgetEventMapBuilder.build(
      project,
      componentRegistry,
      routeMap,
      widgetsByComponentId,
    );
    this._log.info('Step 5/7  Done', { eventMaps: widgetEventMaps.length });

    // Step 6 — Service extraction
    this._log.info('Step 6/7  Extracting services');
    const serviceInfos = this._extractServices(project);
    this._log.info('Step 6/7  Done', { services: serviceInfos.length });

    // Service audit log
    for (const svc of serviceInfos) {
      this._log.debug('  service', { name: svc.name, file: svc.file });
    }

    // Step 7 — Build multigraph
    this._log.info('Step 7/7  Building multigraph');
    const graphBuilder = new NavigationGraphBuilder(this._cfg, this._log);
    const multigraph = graphBuilder.build(
      componentRouteMap,
      componentRegistry,
      widgetEventMaps,
      moduleRegistry,
      widgetsByComponentId,
      serviceInfos,
    );
    this._log.info('Step 7/7  Done', {
      nodes: multigraph.nodes.length,
      edges: multigraph.edges.length,
    });

    // Edge-kind breakdown for audit
    const edgeKindCounts: Record<string, number> = {};
    for (const e of multigraph.edges) {
      edgeKindCounts[e.kind] = (edgeKindCounts[e.kind] ?? 0) + 1;
    }
    this._log.debug('Edge kinds', edgeKindCounts);

    // Unresolved navigation audit
    const unresolvedEdges = multigraph.edges.filter((e) => e.to === null);
    if (unresolvedEdges.length > 0) {
      this._log.debug('Unresolved navigation edges', {
        count: unresolvedEdges.length,
        targets: unresolvedEdges.map((e) => e.targetText ?? '(none)'),
      });
    }

    // Step 8 — Assemble Phase1Bundle (spec-compliant)
    const structuralEdgeCount = multigraph.edges.filter(
      (e) => STRUCTURAL_EDGE_KINDS.has(e.kind),
    ).length;
    const executableEdgeCount = multigraph.edges.length - structuralEdgeCount;

    const bundle: Phase1Bundle = {
      multigraph,
      stats: {
        nodeCount: multigraph.nodes.length,
        edgeCount: multigraph.edges.length,
        structuralEdgeCount,
        executableEdgeCount,
      },
    };

    // Step 9 — Validate
    if (this._options.skipValidation !== true) {
      this._log.info('Validating bundle invariants');
      AnalysisValidator.validatePhase1(bundle);
      this._log.info('Validation passed');
    }

    // Step 10 — Disk output
    if (this._options.outputPath !== undefined) {
      this._log.info('Writing bundle JSON', { path: this._options.outputPath });
      AnalysisExporter.writeBundle(bundle, this._options.outputPath);
      this._log.info('Bundle JSON written');
    }
    if (this._options.debugOutputDir !== undefined) {
      this._log.info('Writing debug artifacts', { dir: this._options.debugOutputDir });
      const internal: A1InternalBundle = {
        config: this._cfg,
        moduleRegistry,
        routeMap,
        componentRegistry,
        widgetEventMaps,
      };
      AnalysisExporter.writeDebugArtifacts(internal, bundle, this._options.debugOutputDir);
      this._log.info('Debug artifacts written');
    }

    this._log.info('Phase 1 pipeline complete');
    return bundle;
  }

  // ---------------------------------------------------------------------------
  // Service extraction — scan @Injectable classes
  // ---------------------------------------------------------------------------

  private _extractServices(project: Project): ServiceInfo[] {
    const services: ServiceInfo[] = [];
    const seen = new Set<string>();

    const sourceFiles = [...project.getSourceFiles()].sort((a, b) =>
      a.getFilePath().localeCompare(b.getFilePath()),
    );

    for (const sourceFile of sourceFiles) {
      const filePath = sourceFile.getFilePath();

      // Skip test files
      if (
        filePath.endsWith('.spec.ts') ||
        filePath.endsWith('.stub.ts') ||
        filePath.includes('/testing/') ||
        filePath.includes('/test/') ||
        filePath.includes('/__tests__/')
      ) continue;

      for (const classDecl of sourceFile.getClasses()) {
        const injectableDecorator = TsAstUtils.findDecorator(classDecl, 'Injectable');
        if (injectableDecorator === null) continue;

        const className = classDecl.getName() ?? 'UnknownService';
        const id = `${filePath}#${className}`;
        if (seen.has(id)) continue;
        seen.add(id);

        const origin = TsAstUtils.getOrigin(classDecl, className);
        const providedIn = this._extractProvidedIn(injectableDecorator);
        services.push({ id, name: className, file: filePath, origin, ...(providedIn !== undefined ? { providedIn } : {}) });
      }
    }

    services.sort((a, b) => a.id.localeCompare(b.id));
    this._log.debug('Services extracted', { count: services.length });
    return services;
  }

  private _extractProvidedIn(decorator: Decorator): string | undefined {
    const args = decorator.getArguments();
    if (args.length === 0) return undefined;
    const configArg = args[0];
    if (configArg === undefined) return undefined;
    // @Injectable({ providedIn: 'root' }) — configArg is the object literal
    for (const child of configArg.getChildren()) {
      for (const prop of child.getChildren()) {
        const propText = prop.getText();
        if (propText.startsWith('providedIn')) {
          const val = prop.getChildren().at(-1);
          if (val !== undefined) {
            return TsAstUtils.getStringLiteralValue(val) ?? undefined;
          }
        }
      }
    }
    return undefined;
  }
}
