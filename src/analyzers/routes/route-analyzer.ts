/**
 * route-analyzer.ts
 * Orchestrates extraction, normalization, lazy-load recursion, and deduplication
 * of all route declarations from the TypeScript project.
 *
 * Outputs: ComponentRouteMap (RouteMap + per-component usage info).
 *
 * Responsibilities:
 *   1. Route file discovery
 *   2. Route extraction (via RouteParser)
 *   3. Lazy-load recursion (via TsAstUtils.resolveImportTarget + RouteParser)
 *   4. fullPath normalization and ID generation
 *   5. Deduplication
 *   6. Component usage counting
 *
 * Prohibited:
 *   - Guard-body summarization (GuardConstraintSummarizer's job)
 *   - Workflow/journey/path enumeration
 */

import type { Project } from 'ts-morph';
import type { ComponentRegistry } from '../../models/components.js';
import type { AnalyzerConfig } from '../../models/analyzer-config.js';
import type { Route, RouteMap, ComponentRouteMap, ComponentRoute, RedirectRoute, WildcardRoute } from '../../models/routes.js';
import { RouteParser, type ParsedRouteRecord } from '../../parsers/angular/route-parser.js';
import { TsAstUtils } from '../../parsers/ts/ts-ast-utils.js';
import {
  buildFullPath,
  normalizeRedirectTarget,
  extractRouteParams,
  isRedirect,
  isWildcard,
  makeRouteId,
} from './route-utils.js';

// ---------------------------------------------------------------------------
// Analyzer
// ---------------------------------------------------------------------------

export class RouteAnalyzer {
  private readonly _project: Project;
  private readonly _cfg: AnalyzerConfig;

  constructor(project: Project, cfg?: AnalyzerConfig) {
    this._project = project;
    this._cfg = cfg ?? { projectRoot: '', tsConfigPath: '' };
  }

  /**
   * Analyze all routes in the project and return a ComponentRouteMap.
   *
   * @param componentRegistry - Used to validate componentId references.
   * @param moduleRegistry    - Optional; used to attribute routes to modules.
   */
  analyzeRoutes(componentRegistry: ComponentRegistry): ComponentRouteMap {
    const allRoutes: Route[] = [];
    const visited = new Set<string>(); // guard against infinite lazy recursion
    // Global dedup across all source-file iterations: prevents the same route
    // object literal (resolved cross-file) from being processed twice when both
    // the importing file and the original definition file are visited.
    const seenRecordOrigins = new Set<string>();

    // Walk every source file looking for route arrays
    for (const sourceFile of this._project.getSourceFiles()) {
      const filePath = sourceFile.getFilePath();
      if (visited.has(filePath)) continue;
      visited.add(filePath);

      const records = RouteParser.extractRoutesFromSourceFile(sourceFile, this._cfg);

      if (records.length === 0) continue;

      const moduleId = filePath;
      this._convertRecords(records, '/', moduleId, null, allRoutes, visited, seenRecordOrigins, componentRegistry);
    }

    // Sort by fullPath (deterministic)
    allRoutes.sort((a, b) => a.fullPath.localeCompare(b.fullPath));

    // Dedup routes by canonical fullPath.
    // When multiple routes share the same fullPath (e.g., a lazy-load placeholder
    // from app.module.ts and the actual ComponentRoute from the feature module),
    // prefer the route that carries a resolved component. Guards are merged from
    // all routes in the group so metadata is not lost.
    const groupsByFullPath = new Map<string, Route[]>();
    for (const route of allRoutes) {
      let group = groupsByFullPath.get(route.fullPath);
      if (group === undefined) {
        group = [];
        groupsByFullPath.set(route.fullPath, group);
      }
      group.push(route);
    }

    const dedupedRoutes: Route[] = [];
    for (const [, group] of groupsByFullPath) {
      const canonical = this._selectCanonicalRoute(group);
      dedupedRoutes.push(canonical);
    }

    // Build RouteMap
    const byId: Record<string, Route> = {};
    for (const route of dedupedRoutes) {
      byId[route.id] = route;
    }
    const routeMap: RouteMap = { routes: dedupedRoutes, byId };

    // Build component usage index
    const routesByComponentId: Record<string, ComponentRoute[]> = {};
    const componentUsageCounts: Record<string, number> = {};

    for (const route of dedupedRoutes) {
      if (route.kind === 'ComponentRoute') {
        const cid = route.componentId;
        if (routesByComponentId[cid] === undefined) routesByComponentId[cid] = [];
        routesByComponentId[cid].push(route);
        componentUsageCounts[cid] = (componentUsageCounts[cid] ?? 0) + 1;
      }
    }

    // Sort inner arrays by fullPath
    for (const cid of Object.keys(routesByComponentId)) {
      routesByComponentId[cid]!.sort((a, b) => a.fullPath.localeCompare(b.fullPath));
    }

    return { routeMap, routesByComponentId, componentUsageCounts };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _convertRecords(
    records: ParsedRouteRecord[],
    parentFullPath: string,
    moduleId: string,
    parentId: string | null,
    out: Route[],
    visited: Set<string>,
    seenRecordOrigins: Set<string>,
    componentRegistry: ComponentRegistry,
  ): string[] {
    const childIds: string[] = [];

    for (const record of records) {
      // Skip route literals that were already converted via cross-file resolution.
      const originKey = `${record.origin.file}::${record.origin.startLine}::${record.origin.startCol}`;
      if (seenRecordOrigins.has(originKey)) continue;
      seenRecordOrigins.add(originKey);

      const fullPath = buildFullPath(parentFullPath, record.path);
      const routeId = makeRouteId(fullPath, moduleId);

      const base = {
        id: routeId,
        moduleId,
        origin: record.origin,
        path: record.path,
        fullPath,
        childrenIds: [] as string[],
        guards: record.guards.map((g) => ({
          kind: g.kind as 'canActivate' | 'canLoad' | 'canActivateChild' | 'canDeactivate',
          guardName: g.guardName,
          origin: g.origin,
        })),
        resolvers: record.resolvers.map((r) => ({
          key: r.key,
          resolverName: r.resolverName,
          origin: r.origin,
        })),
        data: record.data.map((d) => ({
          key: d.key,
          value: d.value,
          origin: d.origin,
        })),
        params: {
          routeParams: extractRouteParams(fullPath),
        },
      };
      if (parentId !== null) (base as { parentId?: string }).parentId = parentId;

      let route: Route;

      if (isRedirect(record)) {
        const redirectToFullPath = normalizeRedirectTarget(record.redirectTo!, parentFullPath);
        const r: RedirectRoute = { ...base, kind: 'RedirectRoute', redirectTo: record.redirectTo!, redirectToFullPath };
        if (record.pathMatch !== undefined) r.pathMatch = record.pathMatch;
        route = r;
      } else if (isWildcard(record)) {
        const w: WildcardRoute = { ...base, kind: 'WildcardRoute' };
        // Wildcard routes may still specify a component (e.g., PageNotFoundComponent)
        if (record.componentName !== undefined) {
          const componentId = this._resolveComponentId(
            record.componentName,
            record.componentImportPathHint,
            componentRegistry,
          );
          w.componentId = componentId;
          w.componentName = record.componentName;
        }
        route = w;
      } else {
        // ComponentRoute (or lazy — treat as ComponentRoute with unknown componentId)
        const componentId = this._resolveComponentId(
          record.componentName,
          record.componentImportPathHint,
          componentRegistry,
        );
        const cr: ComponentRoute = { ...base, kind: 'ComponentRoute', componentId };
        if (record.componentName !== undefined) cr.componentName = record.componentName;
        route = cr;
      }

      out.push(route);
      childIds.push(routeId);

      // Recurse into inline children[] array
      if (record.children !== undefined && record.children.length > 0) {
        const childrenIds = this._convertRecords(
          record.children,
          fullPath,
          moduleId,
          routeId,
          out,
          visited,
          seenRecordOrigins,
          componentRegistry,
        );
        route.childrenIds.push(...childrenIds);
      }

      // Recurse into lazy-loaded modules
      if (record.loadChildrenExpr !== undefined) {
        this._recurseIntoLazyModule(record.loadChildrenExpr, fullPath, routeId, out, visited, seenRecordOrigins, componentRegistry);
      }
    }

    return childIds;
  }

  /**
   * Given a group of routes that share the same fullPath, select the canonical
   * representative. Prefers a route with a resolved component over a lazy-load
   * placeholder (`__unknown__`). Merges guards and childrenIds from all group
   * members into the canonical so no metadata is lost.
   */
  private _selectCanonicalRoute(group: Route[]): Route {
    if (group.length === 1) return group[0]!;

    // Score: higher = better component info
    const score = (r: Route): number => {
      if (r.kind === 'ComponentRoute') {
        if (r.componentId !== '__unknown__' && !r.componentId.startsWith('__unresolved__')) return 3;
        if (r.componentId !== '__unknown__') return 2;
        return 1;
      }
      if (r.kind === 'WildcardRoute' && r.componentId !== undefined) return 3;
      return 0;
    };

    // Sort descending by score, then by id for determinism
    const sorted = [...group].sort((a, b) => {
      const sd = score(b) - score(a);
      if (sd !== 0) return sd;
      return a.id.localeCompare(b.id);
    });

    const canonical = sorted[0]!;

    // Merge guards from other routes (dedup by kind+guardName)
    const seenGuards = new Set(canonical.guards.map((g) => `${g.kind}::${g.guardName}`));
    for (const other of sorted) {
      if (other === canonical) continue;
      for (const g of other.guards) {
        const key = `${g.kind}::${g.guardName}`;
        if (!seenGuards.has(key)) {
          seenGuards.add(key);
          canonical.guards.push(g);
        }
      }
    }
    canonical.guards.sort((a, b) => a.guardName.localeCompare(b.guardName));

    // Merge childrenIds (union, sorted, deduped)
    const allChildIds = new Set(canonical.childrenIds);
    for (const other of sorted) {
      if (other === canonical) continue;
      for (const cid of other.childrenIds) allChildIds.add(cid);
    }
    canonical.childrenIds = [...allChildIds].sort();

    return canonical;
  }

  private _resolveComponentId(
    componentName: string | undefined,
    importPathHint: string | undefined,
    componentRegistry: ComponentRegistry,
  ): string {
    if (componentName === undefined) return '__unknown__';

    // Try to find in registry by class name
    for (const component of componentRegistry.components) {
      if (component.symbol.className === componentName) return component.id;
    }

    // Fall back: synthesize a best-guess id from the import hint
    if (importPathHint !== undefined) {
      return `${importPathHint}#${componentName}`;
    }

    return `__unresolved__#${componentName}`;
  }

  private _recurseIntoLazyModule(
    loadChildrenExpr: string,
    parentFullPath: string,
    parentRouteId: string,
    out: Route[],
    visited: Set<string>,
    seenRecordOrigins: Set<string>,
    componentRegistry: ComponentRegistry,
  ): void {
    // Extract the import path from the loadChildren expression.
    // Common patterns:
    //   () => import('./feature/feature.module').then(m => m.FeatureModule)
    //   () => import('./feature/feature.routes')
    const importPathMatch = loadChildrenExpr.match(/import\(['"]([^'"]+)['"]\)/);
    if (importPathMatch === null || importPathMatch[1] === undefined) return;

    const specifier = importPathMatch[1];

    // Find a source file matching this specifier
    for (const sourceFile of this._project.getSourceFiles()) {
      const filePath = sourceFile.getFilePath();
      if (visited.has(filePath)) continue;

      if (filePath.includes(specifier.replace(/^\.\//, ''))) {
        visited.add(filePath);
        const records = RouteParser.extractRoutesFromSourceFile(sourceFile, {
          projectRoot: '',
          tsConfigPath: '',
        });
        if (records.length > 0) {
          this._convertRecords(records, parentFullPath, filePath, parentRouteId, out, visited, seenRecordOrigins, componentRegistry);
        }
        break;
      }
    }
  }

  /**
   * Resolve a lazy-module import path to an absolute file path.
   * Returns null if the file cannot be found in the project.
   */
  private _resolveImportSpecifier(specifier: string): string | null {
    for (const sourceFile of this._project.getSourceFiles()) {
      const resolved = TsAstUtils.resolveImportTarget(sourceFile, specifier);
      if (resolved !== null) return resolved;
    }
    return null;
  }
}
