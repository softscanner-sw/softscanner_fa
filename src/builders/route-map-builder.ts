/**
 * route-map-builder.ts
 * Produces ComponentRouteMap by running RouteAnalyzer then enriching
 * guard bindings with GuardConstraintSummarizer.
 *
 * Pipeline:
 *   1. RouteAnalyzer.analyzeRoutes(componentRegistry)  → ComponentRouteMap
 *   2. GuardConstraintSummarizer.summarize(project, routeMap)
 *   3. Rebuild ComponentRouteMap with the enriched RouteMap
 *   4. Stable ordering asserted
 */

import type { Project } from 'ts-morph';
import type { AnalyzerConfig } from '../models/analyzer-config.js';
import type { ComponentRegistry } from '../models/components.js';
import type { ComponentRouteMap } from '../models/routes.js';
import { RouteAnalyzer } from '../analyzers/routes/route-analyzer.js';
import { GuardConstraintSummarizer } from '../analyzers/guards/guard-constraint-summarizer.js';
import { SilentLogger } from '../services/logger.js';
import type { Logger } from '../services/logger.js';

export class RouteMapBuilder {
  private readonly _cfg: AnalyzerConfig;
  private readonly _log: Logger;

  constructor(cfg: AnalyzerConfig, logger?: Logger) {
    this._cfg = cfg;
    this._log = logger ?? new SilentLogger();
  }

  build(project: Project, componentRegistry: ComponentRegistry): ComponentRouteMap {
    // Step 1: extract routes
    const analyzer = new RouteAnalyzer(project, this._cfg);
    const componentRouteMap = analyzer.analyzeRoutes(componentRegistry);
    this._log.debug('Routes extracted', { count: componentRouteMap.routeMap.routes.length });

    // Step 2: enrich guard bindings with constraint summaries
    const summarizer = new GuardConstraintSummarizer(this._cfg);
    const enrichedRouteMap = summarizer.summarize(project, componentRouteMap.routeMap);
    this._log.debug('Guard constraints summarized', { routes: enrichedRouteMap.routes.length });

    // Step 3: rebuild component route map with enriched route map
    const enrichedRoutesByComponentId: typeof componentRouteMap.routesByComponentId = {};
    const enrichedUsageCounts: typeof componentRouteMap.componentUsageCounts = {};

    for (const route of enrichedRouteMap.routes) {
      if (route.kind !== 'ComponentRoute') continue;
      const cid = route.componentId;
      if (enrichedRoutesByComponentId[cid] === undefined) enrichedRoutesByComponentId[cid] = [];
      enrichedRoutesByComponentId[cid].push(route);
      enrichedUsageCounts[cid] = (enrichedUsageCounts[cid] ?? 0) + 1;
    }

    // Sort inner arrays
    for (const cid of Object.keys(enrichedRoutesByComponentId)) {
      enrichedRoutesByComponentId[cid]!.sort((a, b) => a.fullPath.localeCompare(b.fullPath));
    }

    return {
      routeMap: enrichedRouteMap,
      routesByComponentId: enrichedRoutesByComponentId,
      componentUsageCounts: enrichedUsageCounts,
    };
  }
}
