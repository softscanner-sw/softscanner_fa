/**
 * navigation-graph-builder.test.ts
 *
 * Tests for NavigationGraphBuilder covering spec-compliant Multigraph construction:
 *   1. Module, Route, Component, Widget, Service, External nodes created
 *   2. Structural edges: ROUTE_ACTIVATES_COMPONENT, MODULE_DECLARES_COMPONENT, etc.
 *   3. Executable edges: WIDGET_NAVIGATES_ROUTE, COMPONENT_NAVIGATES_ROUTE, etc.
 *   4. Entry context computation (isEntry on RouteNode)
 *   5. External node stable hash IDs (FNV-1a, deterministic)
 *   6. Edge ID format: ${from}::${kind}::${to}::${stableIndex}
 *   7. Nodes sorted by id, edges sorted by (from, kind, to, id)
 *   8. ConstraintSurface on edges, SourceRef refs on nodes/edges
 *   9. Unresolved navigation (to=null, targetRouteId=null)
 */

import {
  NavigationGraphBuilder,
  externalNodeId,
} from '../navigation-graph-builder.js';
import type { ServiceInfo } from '../navigation-graph-builder.js';
import type { ComponentRouteMap, ComponentRoute, RedirectRoute } from '../../models/routes.js';
import type { ComponentRegistry, ComponentInfo } from '../../models/components.js';
import type { ModuleRegistry, ModuleInfo } from '../../models/module.js';
import type { WidgetEventMap } from '../../models/events.js';
import type { WidgetInfo } from '../../models/widgets.js';
import type { AnalyzerConfig } from '../../models/analyzer-config.js';
import type { RouteNode, ComponentNode, Phase1Bundle } from '../../models/multigraph.js';
import { STRUCTURAL_EDGE_KINDS } from '../../models/multigraph.js';
import { extractVizData } from '../../visualization/data-extractor.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeConfig(): AnalyzerConfig {
  return {
    projectRoot: '/project',
    tsConfigPath: '/project/tsconfig.json',
    framework: 'Angular',
  };
}

function makeOrigin(file: string, startLine = 1, startCol = 0) {
  return { file, startLine, startCol, endLine: startLine, start: 0, end: 10 };
}

const MODULE_ID = '/project/src/app/app.module.ts';
const POSTS_COMP_ID =
  '/project/src/app/post-list/post-list.component.ts#PostListComponent';
const USERS_COMP_ID =
  '/project/src/app/user-list/user-list.component.ts#UserListComponent';
const HEADER_COMP_ID =
  '/project/src/app/header/header.component.ts#HeaderComponent';

function makeRouteMap(): ComponentRouteMap {
  const postsRoute: ComponentRoute = {
    kind: 'ComponentRoute',
    id: `/posts@${MODULE_ID}`,
    moduleId: MODULE_ID,
    origin: makeOrigin(MODULE_ID, 10),
    path: 'posts',
    fullPath: '/posts',
    childrenIds: [],
    guards: [],
    resolvers: [],
    data: [],
    params: { routeParams: [] },
    componentId: POSTS_COMP_ID,
    componentName: 'PostListComponent',
  };
  const usersRoute: ComponentRoute = {
    kind: 'ComponentRoute',
    id: `/users@${MODULE_ID}`,
    moduleId: MODULE_ID,
    origin: makeOrigin(MODULE_ID, 15),
    path: 'users',
    fullPath: '/users',
    childrenIds: [],
    guards: [],
    resolvers: [],
    data: [],
    params: { routeParams: [] },
    componentId: USERS_COMP_ID,
    componentName: 'UserListComponent',
  };
  const redirectRoute: RedirectRoute = {
    kind: 'RedirectRoute',
    id: `/@${MODULE_ID}`,
    moduleId: MODULE_ID,
    origin: makeOrigin(MODULE_ID, 5),
    path: '',
    fullPath: '/',
    childrenIds: [],
    guards: [],
    resolvers: [],
    data: [],
    params: { routeParams: [] },
    redirectTo: '/posts',
    redirectToFullPath: '/posts',
    pathMatch: 'full',
  };

  const routes = [redirectRoute, postsRoute, usersRoute];
  const byId: Record<string, ComponentRoute | RedirectRoute> = {};
  for (const r of routes) byId[r.id] = r;

  return {
    routeMap: { routes, byId },
    routesByComponentId: {
      [POSTS_COMP_ID]: [postsRoute],
      [USERS_COMP_ID]: [usersRoute],
    },
    componentUsageCounts: { [POSTS_COMP_ID]: 1, [USERS_COMP_ID]: 1 },
  };
}

function makeComponentInfo(id: string, className: string, file: string): ComponentInfo {
  return {
    id,
    symbol: { className, file, canonicalName: id },
    origin: makeOrigin(file, 5),
    declaredInModuleIds: [],
    usesComponentIds: [],
    widgets: [],
  };
}

function makeComponentRegistry(): ComponentRegistry {
  const postListComp = makeComponentInfo(POSTS_COMP_ID, 'PostListComponent',
    '/project/src/app/post-list/post-list.component.ts');
  const userListComp = makeComponentInfo(USERS_COMP_ID, 'UserListComponent',
    '/project/src/app/user-list/user-list.component.ts');
  const headerComp: ComponentInfo = {
    ...makeComponentInfo(HEADER_COMP_ID, 'HeaderComponent',
      '/project/src/app/header/header.component.ts'),
    widgets: [
      `${HEADER_COMP_ID}|/project/src/app/header/header.component.html:3:0|Link|0`,
    ],
  };
  const components = [postListComp, userListComp, headerComp];
  const byId: Record<string, ComponentInfo> = {};
  for (const c of components) byId[c.id] = c;
  return { components, byId };
}

function makeModuleRegistry(): ModuleRegistry {
  const mod: ModuleInfo = {
    id: MODULE_ID,
    name: 'AppModule',
    role: 'Root',
    origin: makeOrigin(MODULE_ID, 1),
    imports: [],
    declarations: ['PostListComponent', 'UserListComponent', 'HeaderComponent'],
    providers: [],
    exports: [],
    routesOwned: [
      `/@${MODULE_ID}`,
      `/posts@${MODULE_ID}`,
      `/users@${MODULE_ID}`,
    ],
  };
  return { modules: [mod] };
}

// ---------------------------------------------------------------------------
// Interpolation fixtures (used by interpolation + regression tests)
// ---------------------------------------------------------------------------

const OWNER_COMP_ID = '/project/src/app/owners/owners.component.ts#OwnersComponent';

function makeInterpolationRouteMap(): ComponentRouteMap {
  const ownersRoute: ComponentRoute = {
    kind: 'ComponentRoute',
    id: `/owners@${MODULE_ID}`,
    moduleId: MODULE_ID,
    origin: makeOrigin(MODULE_ID, 10),
    path: 'owners',
    fullPath: '/owners',
    childrenIds: [],
    guards: [],
    resolvers: [],
    data: [],
    params: { routeParams: [] },
    componentId: POSTS_COMP_ID,
    componentName: 'PostListComponent',
  };
  const ownersIdRoute: ComponentRoute = {
    kind: 'ComponentRoute',
    id: `/owners/:id@${MODULE_ID}`,
    moduleId: MODULE_ID,
    origin: makeOrigin(MODULE_ID, 15),
    path: ':id',
    fullPath: '/owners/:id',
    childrenIds: [],
    guards: [],
    resolvers: [],
    data: [],
    params: { routeParams: ['id'] },
    componentId: USERS_COMP_ID,
    componentName: 'UserListComponent',
  };
  const ownersAddRoute: ComponentRoute = {
    kind: 'ComponentRoute',
    id: `/owners/add@${MODULE_ID}`,
    moduleId: MODULE_ID,
    origin: makeOrigin(MODULE_ID, 18),
    path: 'add',
    fullPath: '/owners/add',
    childrenIds: [],
    guards: [],
    resolvers: [],
    data: [],
    params: { routeParams: [] },
    componentId: OWNER_COMP_ID,
    componentName: 'OwnersComponent',
  };
  const petsIdEditRoute: ComponentRoute = {
    kind: 'ComponentRoute',
    id: `/pets/:id/edit@${MODULE_ID}`,
    moduleId: MODULE_ID,
    origin: makeOrigin(MODULE_ID, 20),
    path: ':id/edit',
    fullPath: '/pets/:id/edit',
    childrenIds: [],
    guards: [],
    resolvers: [],
    data: [],
    params: { routeParams: ['id'] },
    componentId: POSTS_COMP_ID,
    componentName: 'PostListComponent',
  };
  const routes = [ownersRoute, ownersIdRoute, ownersAddRoute, petsIdEditRoute];
  const byId: Record<string, ComponentRoute> = {};
  for (const r of routes) byId[r.id] = r;
  return {
    routeMap: { routes, byId },
    routesByComponentId: {
      [POSTS_COMP_ID]: [ownersRoute, petsIdEditRoute],
      [USERS_COMP_ID]: [ownersIdRoute],
      [OWNER_COMP_ID]: [ownersAddRoute],
    },
    componentUsageCounts: { [POSTS_COMP_ID]: 2, [USERS_COMP_ID]: 1, [OWNER_COMP_ID]: 1 },
  };
}

function makeInterpolationModuleRegistry(): ModuleRegistry {
  const mod: ModuleInfo = {
    id: MODULE_ID,
    name: 'AppModule',
    role: 'Root',
    origin: makeOrigin(MODULE_ID, 1),
    imports: [],
    declarations: ['PostListComponent', 'UserListComponent', 'HeaderComponent', 'OwnersComponent'],
    providers: [],
    exports: [],
    routesOwned: [
      `/owners@${MODULE_ID}`,
      `/owners/:id@${MODULE_ID}`,
      `/owners/add@${MODULE_ID}`,
      `/pets/:id/edit@${MODULE_ID}`,
    ],
  };
  return { modules: [mod] };
}

function makeInterpolationComponentRegistry(): ComponentRegistry {
  const ownerComp = makeComponentInfo(OWNER_COMP_ID, 'OwnersComponent',
    '/project/src/app/owners/owners.component.ts');
  const cr = makeComponentRegistry();
  cr.components.push(ownerComp);
  cr.byId[ownerComp.id] = ownerComp;
  return cr;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function buildGraph(
  routeMap = makeRouteMap(),
  componentRegistry = makeComponentRegistry(),
  widgetEventMaps: WidgetEventMap[] = [],
  widgetsByComponentId = new Map<string, WidgetInfo[]>(),
  moduleRegistry = makeModuleRegistry(),
  serviceInfos: ServiceInfo[] = [],
) {
  const builder = new NavigationGraphBuilder(makeConfig());
  return builder.build(
    routeMap,
    componentRegistry,
    widgetEventMaps,
    moduleRegistry,
    widgetsByComponentId,
    serviceInfos,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NavigationGraphBuilder', () => {
  describe('Node construction', () => {
    it('does NOT include a Virtual __entry__ node', () => {
      const g = buildGraph();
      const entry = g.nodes.find((n) => n.id === '__entry__');
      expect(entry).toBeUndefined();
    });

    it('includes Module nodes', () => {
      const g = buildGraph();
      const moduleNodes = g.nodes.filter((n) => n.kind === 'Module');
      expect(moduleNodes).toHaveLength(1);
      expect(moduleNodes[0].label).toBe('AppModule');
    });

    it('includes Route nodes for all routes', () => {
      const g = buildGraph();
      const routeIds = g.nodes.filter((n) => n.kind === 'Route').map((n) => n.id);
      expect(routeIds).toContain(`/posts@${MODULE_ID}`);
      expect(routeIds).toContain(`/users@${MODULE_ID}`);
      expect(routeIds).toContain(`/@${MODULE_ID}`);
    });

    it('includes Component nodes for ALL components in registry', () => {
      const g = buildGraph();
      const compIds = g.nodes.filter((n) => n.kind === 'Component').map((n) => n.id);
      expect(compIds).toContain(POSTS_COMP_ID);
      expect(compIds).toContain(USERS_COMP_ID);
      expect(compIds).toContain(HEADER_COMP_ID);
    });

    it('Component nodes have correct kind and label', () => {
      const g = buildGraph();
      const headerNode = g.nodes.find((n) => n.id === HEADER_COMP_ID) as ComponentNode;
      expect(headerNode).toBeDefined();
      expect(headerNode.kind).toBe('Component');
      expect(headerNode.label).toBe('HeaderComponent');
      expect(headerNode.meta.name).toBe('HeaderComponent');
    });

    it('Route nodes have isEntry computed', () => {
      const g = buildGraph();
      const routeNodes = g.nodes.filter((n): n is RouteNode => n.kind === 'Route');
      // Redirect / and /posts should be entry (redirect closure)
      const entryRoutes = routeNodes.filter((n) => n.meta.isEntry);
      expect(entryRoutes.length).toBeGreaterThanOrEqual(2);
    });

    it('nodes are sorted by id lexicographically', () => {
      const g = buildGraph();
      const ids = g.nodes.map((n) => n.id);
      const sorted = [...ids].sort((a, b) => a.localeCompare(b));
      expect(ids).toEqual(sorted);
    });

    it('all nodes have non-empty refs', () => {
      const g = buildGraph();
      for (const node of g.nodes) {
        expect(node.refs.length).toBeGreaterThan(0);
        for (const ref of node.refs) {
          expect(typeof ref.file).toBe('string');
          expect(ref.file.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Structural edges', () => {
    it('creates ROUTE_ACTIVATES_COMPONENT for ComponentRoutes', () => {
      const g = buildGraph();
      const activationEdges = g.edges.filter((e) => e.kind === 'ROUTE_ACTIVATES_COMPONENT');
      expect(activationEdges).toHaveLength(2);
    });

    it('ROUTE_ACTIVATES_COMPONENT from Route node to Component node', () => {
      const g = buildGraph();
      const edge = g.edges.find(
        (e) => e.kind === 'ROUTE_ACTIVATES_COMPONENT' &&
               e.from === `/posts@${MODULE_ID}` && e.to === POSTS_COMP_ID,
      );
      expect(edge).toBeDefined();
    });

    it('creates MODULE_DECLARES_COMPONENT edges', () => {
      const g = buildGraph();
      const declEdges = g.edges.filter((e) => e.kind === 'MODULE_DECLARES_COMPONENT');
      expect(declEdges.length).toBeGreaterThanOrEqual(1);
    });

    it('creates MODULE_DECLARES_ROUTE edges', () => {
      const g = buildGraph();
      const declEdges = g.edges.filter((e) => e.kind === 'MODULE_DECLARES_ROUTE');
      expect(declEdges).toHaveLength(3);
    });

    it('creates ROUTE_HAS_CHILD edges for child routes', () => {
      // Use a route map with children
      const rm = makeRouteMap();
      const parentRoute = rm.routeMap.routes.find((r) => r.id === `/posts@${MODULE_ID}`);
      if (parentRoute) {
        parentRoute.childrenIds = [`/users@${MODULE_ID}`];
      }
      const g = buildGraph(rm);
      const childEdges = g.edges.filter((e) => e.kind === 'ROUTE_HAS_CHILD');
      expect(childEdges).toHaveLength(1);
      expect(childEdges[0].from).toBe(`/posts@${MODULE_ID}`);
      expect(childEdges[0].to).toBe(`/users@${MODULE_ID}`);
    });
  });

  describe('Executable edges: ROUTE_REDIRECTS_TO_ROUTE', () => {
    it('creates ROUTE_REDIRECTS_TO_ROUTE for redirect routes', () => {
      const g = buildGraph();
      const redirectEdges = g.edges.filter((e) => e.kind === 'ROUTE_REDIRECTS_TO_ROUTE');
      expect(redirectEdges).toHaveLength(1);
      expect(redirectEdges[0].from).toBe(`/@${MODULE_ID}`);
      expect(redirectEdges[0].to).toBe(`/posts@${MODULE_ID}`);
      expect(redirectEdges[0].isSystem).toBe(true);
    });
  });

  describe('Executable edges: WIDGET_NAVIGATES_ROUTE', () => {
    it('creates WIDGET_NAVIGATES_ROUTE from Widget node for routerLink binding', () => {
      const widgetId =
        `${HEADER_COMP_ID}|/project/src/app/header/header.component.html:3:0|Link|0`;

      const widget: WidgetInfo = {
        id: widgetId,
        componentId: HEADER_COMP_ID,
        kind: 'Link',
        origin: makeOrigin('/project/src/app/header/header.component.html', 3, 0),
        path: { componentId: HEADER_COMP_ID, path: 'HeaderComponent>Link' },
        attributes: {},
        bindings: [
          {
            kind: 'boundAttr',
            name: 'routerLink',
            value: '/posts',
            origin: makeOrigin('/project/src/app/header/header.component.html', 3, 10),
          },
        ],
        visibilityPredicates: [],
        enablementPredicates: [],
      };

      const widgetsByComponentId = new Map([[HEADER_COMP_ID, [widget]]]);
      const g = buildGraph(makeRouteMap(), makeComponentRegistry(), [], widgetsByComponentId);

      const edge = g.edges.find(
        (e) => e.kind === 'WIDGET_NAVIGATES_ROUTE' &&
               e.from === widgetId && e.to === `/posts@${MODULE_ID}`,
      );
      expect(edge).toBeDefined();
      expect(edge!.trigger?.viaRouterLink).toBe(true);
    });
  });

  describe('Executable edges: COMPONENT_NAVIGATES_ROUTE', () => {
    it('creates COMPONENT_NAVIGATES_ROUTE for programmatic navigation', () => {
      const widgetId =
        `${HEADER_COMP_ID}|/project/src/app/header/header.component.html:3:0|Link|0`;

      const widget: WidgetInfo = {
        id: widgetId,
        componentId: HEADER_COMP_ID,
        kind: 'Link',
        origin: makeOrigin('/project/src/app/header/header.component.html', 3, 0),
        path: { componentId: HEADER_COMP_ID, path: 'HeaderComponent>Link' },
        attributes: {},
        bindings: [],
        visibilityPredicates: [],
        enablementPredicates: [],
      };

      const widgetsByComponentId = new Map([[HEADER_COMP_ID, [widget]]]);

      const widgetEventMaps: WidgetEventMap[] = [
        {
          componentId: HEADER_COMP_ID,
          events: [
            {
              widgetId,
              eventType: 'click',
              handlerName: 'goToUsers',
              handlerOrigin: makeOrigin(
                '/project/src/app/header/header.component.ts',
                20,
              ),
              callContexts: [
                {
                  kind: 'Navigate',
                  target: { route: '/users' },
                  origin: makeOrigin(
                    '/project/src/app/header/header.component.ts',
                    21,
                  ),
                },
              ],
            },
          ],
        },
      ];

      const g = buildGraph(makeRouteMap(), makeComponentRegistry(), widgetEventMaps, widgetsByComponentId);

      const edge = g.edges.find(
        (e) => e.kind === 'COMPONENT_NAVIGATES_ROUTE' &&
               e.from === HEADER_COMP_ID && e.to === `/users@${MODULE_ID}`,
      );
      expect(edge).toBeDefined();
    });
  });

  describe('Executable edges: WIDGET_NAVIGATES_EXTERNAL', () => {
    it('creates External node and WIDGET_NAVIGATES_EXTERNAL edge for href binding', () => {
      const extUrl = 'https://external-docs.example.com';
      const widgetId =
        `${HEADER_COMP_ID}|/project/src/app/header/header.component.html:5:0|Link|0`;

      const widget: WidgetInfo = {
        id: widgetId,
        componentId: HEADER_COMP_ID,
        kind: 'Link',
        origin: makeOrigin('/project/src/app/header/header.component.html', 5, 0),
        path: { componentId: HEADER_COMP_ID, path: 'HeaderComponent>Link' },
        attributes: {},
        bindings: [
          {
            kind: 'attr',
            name: 'href',
            value: extUrl,
            origin: makeOrigin('/project/src/app/header/header.component.html', 5, 5),
          },
        ],
        visibilityPredicates: [],
        enablementPredicates: [],
      };

      const widgetsByComponentId = new Map([[HEADER_COMP_ID, [widget]]]);
      const g = buildGraph(makeRouteMap(), makeComponentRegistry(), [], widgetsByComponentId);

      const extId = externalNodeId(extUrl);
      const extNode = g.nodes.find((n) => n.id === extId);
      expect(extNode).toBeDefined();
      expect(extNode!.kind).toBe('External');

      const edge = g.edges.find((e) => e.from === widgetId && e.to === extId);
      expect(edge).toBeDefined();
      expect(edge!.kind).toBe('WIDGET_NAVIGATES_EXTERNAL');
    });
  });

  describe('External nodes', () => {
    it('uses stable FNV-1a hash for external node IDs', () => {
      const url = 'https://example.com/docs';
      const id1 = externalNodeId(url);
      const id2 = externalNodeId(url);
      expect(id1).toBe(id2);
      expect(id1).toMatch(/^__ext__[0-9a-f]{8}$/);
    });

    it('different URLs produce different IDs', () => {
      expect(externalNodeId('https://a.com')).not.toBe(externalNodeId('https://b.com'));
    });
  });

  describe('Edge model', () => {
    it('edge IDs follow ${from}::${kind}::${to}::${index} format', () => {
      const g = buildGraph();
      for (const edge of g.edges) {
        const parts = edge.id.split('::');
        expect(parts.length).toBeGreaterThanOrEqual(4);
        expect(parts[0]).toBe(edge.from);
        expect(parts[1]).toBe(edge.kind);
      }
    });

    it('edge IDs end with ::stableIndex (a digit)', () => {
      const g = buildGraph();
      for (const edge of g.edges) {
        const parts = edge.id.split('::');
        const lastPart = parts[parts.length - 1];
        expect(lastPart).toMatch(/^\d+$/);
      }
    });

    it('edges are sorted by (from, kind, to, id)', () => {
      const g = buildGraph();
      for (let i = 1; i < g.edges.length; i++) {
        const prev = g.edges[i - 1];
        const curr = g.edges[i];
        const fromCmp = prev.from.localeCompare(curr.from);
        if (fromCmp > 0) fail(`edges not sorted by from: ${prev.id} before ${curr.id}`);
        if (fromCmp < 0) continue;
        const kindCmp = prev.kind.localeCompare(curr.kind);
        if (kindCmp > 0) fail(`edges not sorted by kind: ${prev.id} before ${curr.id}`);
        if (kindCmp < 0) continue;
        const toCmp = (prev.to ?? '').localeCompare(curr.to ?? '');
        if (toCmp > 0) fail(`edges not sorted by to: ${prev.id} before ${curr.id}`);
        if (toCmp < 0) continue;
        expect(prev.id.localeCompare(curr.id)).toBeLessThanOrEqual(0);
      }
    });

    it('all edges have non-empty refs', () => {
      const g = buildGraph();
      for (const edge of g.edges) {
        expect(edge.refs.length).toBeGreaterThan(0);
      }
    });

    it('all edges have constraints', () => {
      const g = buildGraph();
      for (const edge of g.edges) {
        expect(edge.constraints).toBeDefined();
        expect(Array.isArray(edge.constraints.requiredParams)).toBe(true);
        expect(Array.isArray(edge.constraints.guards)).toBe(true);
        expect(Array.isArray(edge.constraints.roles)).toBe(true);
        expect(Array.isArray(edge.constraints.uiAtoms)).toBe(true);
      }
    });
  });

  describe('Service nodes', () => {
    it('creates Service nodes from serviceInfos', () => {
      const serviceInfos: ServiceInfo[] = [
        {
          id: '/project/src/app/services/user.service.ts#UserService',
          name: 'UserService',
          file: '/project/src/app/services/user.service.ts',
          origin: makeOrigin('/project/src/app/services/user.service.ts', 5),
        },
      ];
      const g = buildGraph(
        makeRouteMap(), makeComponentRegistry(), [], new Map(), makeModuleRegistry(), serviceInfos,
      );
      const svcNode = g.nodes.find((n) => n.kind === 'Service');
      expect(svcNode).toBeDefined();
      expect(svcNode!.label).toBe('UserService');
    });
  });

  describe('Widget nodes', () => {
    it('creates Widget nodes from widgetsByComponentId', () => {
      const widgetId =
        `${HEADER_COMP_ID}|/project/src/app/header/header.component.html:3:0|Link|0`;
      const widget: WidgetInfo = {
        id: widgetId,
        componentId: HEADER_COMP_ID,
        kind: 'Link',
        origin: makeOrigin('/project/src/app/header/header.component.html', 3, 0),
        path: { componentId: HEADER_COMP_ID, path: 'HeaderComponent>Link' },
        attributes: {},
        bindings: [],
        visibilityPredicates: [],
        enablementPredicates: [],
      };
      const widgetsByComponentId = new Map([[HEADER_COMP_ID, [widget]]]);
      const g = buildGraph(makeRouteMap(), makeComponentRegistry(), [], widgetsByComponentId);
      const widgetNode = g.nodes.find((n) => n.kind === 'Widget');
      expect(widgetNode).toBeDefined();
      expect(widgetNode!.id).toBe(widgetId);
    });

    it('creates COMPONENT_CONTAINS_WIDGET structural edge', () => {
      const widgetId =
        `${HEADER_COMP_ID}|/project/src/app/header/header.component.html:3:0|Link|0`;
      const widget: WidgetInfo = {
        id: widgetId,
        componentId: HEADER_COMP_ID,
        kind: 'Link',
        origin: makeOrigin('/project/src/app/header/header.component.html', 3, 0),
        path: { componentId: HEADER_COMP_ID, path: 'HeaderComponent>Link' },
        attributes: {},
        bindings: [],
        visibilityPredicates: [],
        enablementPredicates: [],
      };
      const widgetsByComponentId = new Map([[HEADER_COMP_ID, [widget]]]);
      const g = buildGraph(makeRouteMap(), makeComponentRegistry(), [], widgetsByComponentId);
      const edge = g.edges.find(
        (e) => e.kind === 'COMPONENT_CONTAINS_WIDGET' &&
               e.from === HEADER_COMP_ID && e.to === widgetId,
      );
      expect(edge).toBeDefined();
    });
  });

  describe('Wildcard route activation', () => {
    it('emits ROUTE_ACTIVATES_COMPONENT for wildcard route with component', () => {
      // Create a wildcard route with componentId
      const wildcardRouteId = `/**@${MODULE_ID}`;
      const notFoundCompId = '/project/src/app/not-found.component.ts#NotFoundComponent';
      const routeMap: ComponentRouteMap = {
        routeMap: {
          routes: [
            {
              id: wildcardRouteId,
              kind: 'WildcardRoute',
              moduleId: MODULE_ID,
              origin: makeOrigin(MODULE_ID, 20),
              path: '**',
              fullPath: '/**',
              childrenIds: [],
              guards: [],
              resolvers: [],
              data: [],
              params: { routeParams: [] },
              componentId: notFoundCompId,
              componentName: 'NotFoundComponent',
            },
          ],
          byId: {},
        },
        routesByComponentId: {},
        componentUsageCounts: {},
      };
      routeMap.routeMap.byId[wildcardRouteId] = routeMap.routeMap.routes[0]!;

      const comp: ComponentInfo = {
        id: notFoundCompId,
        origin: makeOrigin('/project/src/app/not-found.component.ts', 1),
        symbol: { className: 'NotFoundComponent', file: '/project/src/app/not-found.component.ts', canonicalName: notFoundCompId },
        declaredInModuleIds: [],
        usesComponentIds: [],
        widgets: [],
      };
      const registry: ComponentRegistry = { components: [comp], byId: { [notFoundCompId]: comp } };
      const g = buildGraph(routeMap, registry, [], new Map());

      const activateEdge = g.edges.find(
        (e) => e.kind === 'ROUTE_ACTIVATES_COMPONENT' &&
               e.from === wildcardRouteId && e.to === notFoundCompId,
      );
      expect(activateEdge).toBeDefined();

      // The route node should have isWildcard=true
      const routeNode = g.nodes.find((n) => n.id === wildcardRouteId);
      expect(routeNode).toBeDefined();
      expect((routeNode as RouteNode).meta.isWildcard).toBe(true);
    });
  });

  describe('MODULE_PROVIDES_SERVICE', () => {
    it('emits MODULE_PROVIDES_SERVICE edges for module providers', () => {
      const svcId = '/project/src/app/services/user.service.ts#UserService';
      const serviceInfos: ServiceInfo[] = [
        {
          id: svcId,
          name: 'UserService',
          file: '/project/src/app/services/user.service.ts',
          origin: makeOrigin('/project/src/app/services/user.service.ts', 5),
        },
      ];
      const modRegistry: ModuleRegistry = {
        modules: [{
          id: MODULE_ID,
          name: 'AppModule',
          role: 'Root',
          origin: makeOrigin(MODULE_ID, 1),
          imports: [],
          declarations: [],
          providers: ['UserService'],
          exports: [],
          routesOwned: [],
        }],
      };
      const g = buildGraph(
        makeRouteMap(), makeComponentRegistry(), [], new Map(), modRegistry, serviceInfos,
      );
      const edge = g.edges.find(
        (e) => e.kind === 'MODULE_PROVIDES_SERVICE' && e.from === MODULE_ID && e.to === svcId,
      );
      expect(edge).toBeDefined();
    });
  });

  describe('MODULE_IMPORTS_MODULE', () => {
    it('emits MODULE_IMPORTS_MODULE edge when module imports a project module', () => {
      const sharedModId = '/project/src/app/shared.module.ts';
      const modRegistry: ModuleRegistry = {
        modules: [
          {
            id: MODULE_ID,
            name: 'AppModule',
            role: 'Root',
            origin: makeOrigin(MODULE_ID, 1),
            imports: ['SharedModule'],
            declarations: ['PostListComponent', 'UserListComponent', 'HeaderComponent'],
            providers: [],
            exports: [],
            routesOwned: [`/@${MODULE_ID}`, `/posts@${MODULE_ID}`, `/users@${MODULE_ID}`],
          },
          {
            id: sharedModId,
            name: 'SharedModule',
            role: 'GlobalShared',
            origin: makeOrigin(sharedModId, 1),
            imports: [],
            declarations: [],
            providers: [],
            exports: [],
            routesOwned: [],
          },
        ],
      };
      const g = buildGraph(makeRouteMap(), makeComponentRegistry(), [], new Map(), modRegistry);
      const edge = g.edges.find(
        (e) => e.kind === 'MODULE_IMPORTS_MODULE' && e.from === MODULE_ID && e.to === sharedModId,
      );
      expect(edge).toBeDefined();
      expect(edge!.refs.length).toBeGreaterThan(0);
    });

    it('does NOT emit MODULE_IMPORTS_MODULE for library modules', () => {
      const g = buildGraph(); // default AppModule has imports: []
      const importEdges = g.edges.filter((e) => e.kind === 'MODULE_IMPORTS_MODULE');
      expect(importEdges.length).toBe(0);
    });
  });

  describe('MODULE_EXPORTS_MODULE', () => {
    it('emits MODULE_EXPORTS_MODULE edge when module exports a project module', () => {
      const sharedModId = '/project/src/app/shared.module.ts';
      const modRegistry: ModuleRegistry = {
        modules: [
          {
            id: MODULE_ID,
            name: 'AppModule',
            role: 'Root',
            origin: makeOrigin(MODULE_ID, 1),
            imports: [],
            declarations: ['PostListComponent', 'UserListComponent', 'HeaderComponent'],
            providers: [],
            exports: ['SharedModule'],
            routesOwned: [`/@${MODULE_ID}`, `/posts@${MODULE_ID}`, `/users@${MODULE_ID}`],
          },
          {
            id: sharedModId,
            name: 'SharedModule',
            role: 'GlobalShared',
            origin: makeOrigin(sharedModId, 1),
            imports: [],
            declarations: [],
            providers: [],
            exports: [],
            routesOwned: [],
          },
        ],
      };
      const g = buildGraph(makeRouteMap(), makeComponentRegistry(), [], new Map(), modRegistry);
      const edge = g.edges.find(
        (e) => e.kind === 'MODULE_EXPORTS_MODULE' && e.from === MODULE_ID && e.to === sharedModId,
      );
      expect(edge).toBeDefined();
    });
  });

  describe('providedIn root service', () => {
    it('emits MODULE_PROVIDES_SERVICE for providedIn:root service from AppModule', () => {
      const svcId = '/project/src/app/services/hero.service.ts#HeroService';
      const serviceInfos: ServiceInfo[] = [
        {
          id: svcId,
          name: 'HeroService',
          file: '/project/src/app/services/hero.service.ts',
          origin: makeOrigin('/project/src/app/services/hero.service.ts', 5),
          providedIn: 'root',
        },
      ];
      const g = buildGraph(
        makeRouteMap(), makeComponentRegistry(), [], new Map(), makeModuleRegistry(), serviceInfos,
      );
      const edge = g.edges.find(
        (e) => e.kind === 'MODULE_PROVIDES_SERVICE' && e.from === MODULE_ID && e.to === svcId,
      );
      expect(edge).toBeDefined();
    });

    it('does NOT duplicate MODULE_PROVIDES_SERVICE if already in module providers', () => {
      const svcId = '/project/src/app/services/user.service.ts#UserService';
      const serviceInfos: ServiceInfo[] = [
        {
          id: svcId,
          name: 'UserService',
          file: '/project/src/app/services/user.service.ts',
          origin: makeOrigin('/project/src/app/services/user.service.ts', 5),
          providedIn: 'root',
        },
      ];
      const modRegistry: ModuleRegistry = {
        modules: [{
          id: MODULE_ID,
          name: 'AppModule',
          role: 'Root',
          origin: makeOrigin(MODULE_ID, 1),
          imports: [],
          declarations: [],
          providers: ['UserService'],
          exports: [],
          routesOwned: [],
        }],
      };
      const g = buildGraph(
        makeRouteMap(), makeComponentRegistry(), [], new Map(), modRegistry, serviceInfos,
      );
      const edges = g.edges.filter(
        (e) => e.kind === 'MODULE_PROVIDES_SERVICE' && e.to === svcId,
      );
      expect(edges.length).toBe(1);
    });
  });

  describe('Unresolved navigation', () => {
    it('emits edge with to=null for unresolved routerLink', () => {
      const widgetId =
        `${HEADER_COMP_ID}|/project/src/app/header/header.component.html:3:0|Link|0`;
      const widget: WidgetInfo = {
        id: widgetId,
        componentId: HEADER_COMP_ID,
        kind: 'Link',
        origin: makeOrigin('/project/src/app/header/header.component.html', 3, 0),
        path: { componentId: HEADER_COMP_ID, path: 'HeaderComponent>Link' },
        attributes: {},
        bindings: [
          {
            kind: 'boundAttr',
            name: 'routerLink',
            value: '/nonexistent',
            origin: makeOrigin('/project/src/app/header/header.component.html', 3, 10),
          },
        ],
        visibilityPredicates: [],
        enablementPredicates: [],
      };
      const widgetsByComponentId = new Map([[HEADER_COMP_ID, [widget]]]);
      const g = buildGraph(makeRouteMap(), makeComponentRegistry(), [], widgetsByComponentId);

      const edge = g.edges.find(
        (e) => e.kind === 'WIDGET_NAVIGATES_ROUTE' && e.from === widgetId && e.to === null,
      );
      expect(edge).toBeDefined();
      expect(edge!.targetRouteId).toBeNull();
      expect(edge!.targetText).toBe('/nonexistent');
    });
  });

  describe('Route label "/" prefix', () => {
    it('Route node labels preserve leading "/"', () => {
      const g = buildGraph();
      const routeNodes = g.nodes.filter((n): n is RouteNode => n.kind === 'Route');
      expect(routeNodes.length).toBeGreaterThan(0);
      for (const rn of routeNodes) {
        expect(rn.label).toBe(rn.meta.fullPath);
        expect(rn.label.startsWith('/')).toBe(true);
      }
    });

    it('Route node labels include param segments (e.g., /owners/:id/edit)', () => {
      const rm = makeRouteMap();
      const paramRoute: ComponentRoute = {
        kind: 'ComponentRoute',
        id: `/owners/:id/edit@${MODULE_ID}`,
        moduleId: MODULE_ID,
        origin: makeOrigin(MODULE_ID, 20),
        path: ':id/edit',
        fullPath: '/owners/:id/edit',
        childrenIds: [],
        guards: [],
        resolvers: [],
        data: [],
        params: { routeParams: ['id'] },
        componentId: POSTS_COMP_ID,
        componentName: 'PostListComponent',
      };
      rm.routeMap.routes.push(paramRoute);
      rm.routeMap.byId[paramRoute.id] = paramRoute;
      const mod = makeModuleRegistry();
      mod.modules[0].routesOwned.push(paramRoute.id);
      const g = buildGraph(rm, makeComponentRegistry(), [], new Map(), mod);
      const rn = g.nodes.find(
        (n): n is RouteNode => n.kind === 'Route' && n.id === paramRoute.id,
      );
      expect(rn).toBeDefined();
      expect(rn!.label).toBe('/owners/:id/edit');
    });
  });

  describe('Interpolation navigation resolution', () => {
    it('resolves /owners/{{owner.id}} to /owners/:id', () => {
      const widgetId = `${HEADER_COMP_ID}|tmpl:5:0|Link|0`;
      const widget: WidgetInfo = {
        id: widgetId,
        componentId: HEADER_COMP_ID,
        kind: 'Link',
        origin: makeOrigin('/project/src/app/header/header.component.html', 5, 0),
        path: { componentId: HEADER_COMP_ID, path: 'HeaderComponent>Link' },
        attributes: {},
        bindings: [{
          kind: 'boundAttr',
          name: 'routerLink',
          value: '/owners/{{owner.id}}',
          origin: makeOrigin('/project/src/app/header/header.component.html', 5, 10),
        }],
        visibilityPredicates: [],
        enablementPredicates: [],
      };
      const widgetsByComponentId = new Map([[HEADER_COMP_ID, [widget]]]);
      const g = buildGraph(
        makeInterpolationRouteMap(),
        makeInterpolationComponentRegistry(),
        [],
        widgetsByComponentId,
        makeInterpolationModuleRegistry(),
      );
      const edge = g.edges.find(
        (e) => e.kind === 'WIDGET_NAVIGATES_ROUTE' && e.from === widgetId,
      );
      expect(edge).toBeDefined();
      expect(edge!.to).toBe(`/owners/:id@${MODULE_ID}`);
      expect(edge!.targetRouteId).toBe(`/owners/:id@${MODULE_ID}`);
    });

    it('resolves /pets/{{pet.id}}/edit to /pets/:id/edit', () => {
      const widgetId = `${HEADER_COMP_ID}|tmpl:6:0|Link|1`;
      const widget: WidgetInfo = {
        id: widgetId,
        componentId: HEADER_COMP_ID,
        kind: 'Link',
        origin: makeOrigin('/project/src/app/header/header.component.html', 6, 0),
        path: { componentId: HEADER_COMP_ID, path: 'HeaderComponent>Link[1]' },
        attributes: {},
        bindings: [{
          kind: 'boundAttr',
          name: 'routerLink',
          value: '/pets/{{pet.id}}/edit',
          origin: makeOrigin('/project/src/app/header/header.component.html', 6, 10),
        }],
        visibilityPredicates: [],
        enablementPredicates: [],
      };
      const widgetsByComponentId = new Map([[HEADER_COMP_ID, [widget]]]);
      const g = buildGraph(
        makeInterpolationRouteMap(),
        makeInterpolationComponentRegistry(),
        [],
        widgetsByComponentId,
        makeInterpolationModuleRegistry(),
      );
      const edge = g.edges.find(
        (e) => e.kind === 'WIDGET_NAVIGATES_ROUTE' && e.from === widgetId,
      );
      expect(edge).toBeDefined();
      expect(edge!.to).toBe(`/pets/:id/edit@${MODULE_ID}`);
    });

    it('ambiguous array navigation resolves deterministically (fewest params wins)', () => {
      // ['/owners/add'] should resolve to /owners/add (0 params) over /owners/:id (1 param)
      const widgetId = `${HEADER_COMP_ID}|tmpl:7:0|Link|2`;
      const widget: WidgetInfo = {
        id: widgetId,
        componentId: HEADER_COMP_ID,
        kind: 'Link',
        origin: makeOrigin('/project/src/app/header/header.component.html', 7, 0),
        path: { componentId: HEADER_COMP_ID, path: 'HeaderComponent>Link[2]' },
        attributes: {},
        bindings: [{
          kind: 'boundAttr',
          name: 'routerLink',
          value: "['/owners/add']",
          origin: makeOrigin('/project/src/app/header/header.component.html', 7, 10),
        }],
        visibilityPredicates: [],
        enablementPredicates: [],
      };
      const widgetsByComponentId = new Map([[HEADER_COMP_ID, [widget]]]);
      const g = buildGraph(
        makeInterpolationRouteMap(),
        makeInterpolationComponentRegistry(),
        [],
        widgetsByComponentId,
        makeInterpolationModuleRegistry(),
      );
      const edge = g.edges.find(
        (e) => e.kind === 'WIDGET_NAVIGATES_ROUTE' && e.from === widgetId,
      );
      expect(edge).toBeDefined();
      expect(edge!.to).toBe(`/owners/add@${MODULE_ID}`);
    });

    it('does not false-positive when literals differ', () => {
      // /unknown/{{id}} should NOT match any route
      const widgetId = `${HEADER_COMP_ID}|tmpl:8:0|Link|3`;
      const widget: WidgetInfo = {
        id: widgetId,
        componentId: HEADER_COMP_ID,
        kind: 'Link',
        origin: makeOrigin('/project/src/app/header/header.component.html', 8, 0),
        path: { componentId: HEADER_COMP_ID, path: 'HeaderComponent>Link[3]' },
        attributes: {},
        bindings: [{
          kind: 'boundAttr',
          name: 'routerLink',
          value: '/unknown/{{id}}',
          origin: makeOrigin('/project/src/app/header/header.component.html', 8, 10),
        }],
        visibilityPredicates: [],
        enablementPredicates: [],
      };
      const widgetsByComponentId = new Map([[HEADER_COMP_ID, [widget]]]);
      const g = buildGraph(
        makeInterpolationRouteMap(),
        makeInterpolationComponentRegistry(),
        [],
        widgetsByComponentId,
        makeInterpolationModuleRegistry(),
      );
      const edge = g.edges.find(
        (e) => e.kind === 'WIDGET_NAVIGATES_ROUTE' && e.from === widgetId,
      );
      expect(edge).toBeDefined();
      expect(edge!.to).toBeNull();
      expect(edge!.targetRouteId).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Regression: graph build must NOT mutate input RouteMap
  // -------------------------------------------------------------------------

  describe('Input non-mutation', () => {
    it('does not mutate RouteMap fullPath values during interpolation resolution', () => {
      // Snapshot all fullPaths before build
      const routeMap = makeInterpolationRouteMap();
      const snapshotBefore = routeMap.routeMap.routes.map((r) => ({
        id: r.id,
        fullPath: r.fullPath,
        path: r.path,
      }));

      // Build with an interpolation-triggering widget
      const widgetId = `${HEADER_COMP_ID}|tmpl:5:0|Link|0`;
      const widget: WidgetInfo = {
        id: widgetId,
        componentId: HEADER_COMP_ID,
        kind: 'Link',
        origin: makeOrigin('/project/src/app/header/header.component.html', 5, 0),
        path: { componentId: HEADER_COMP_ID, path: 'HeaderComponent>Link' },
        attributes: {},
        bindings: [{
          kind: 'boundAttr',
          name: 'routerLink',
          value: '/owners/{{owner.id}}',
          origin: makeOrigin('/project/src/app/header/header.component.html', 5, 10),
        }],
        visibilityPredicates: [],
        enablementPredicates: [],
      };
      const widgetsByComponentId = new Map([[HEADER_COMP_ID, [widget]]]);
      buildGraph(
        routeMap,
        makeInterpolationComponentRegistry(),
        [],
        widgetsByComponentId,
        makeInterpolationModuleRegistry(),
      );

      // Snapshot after build — must be identical
      const snapshotAfter = routeMap.routeMap.routes.map((r) => ({
        id: r.id,
        fullPath: r.fullPath,
        path: r.path,
      }));
      expect(snapshotAfter).toEqual(snapshotBefore);
    });

    it('petclinic-like fullPaths retain leading "/" after graph build', () => {
      const routeMap = makeInterpolationRouteMap();
      // Build graph (triggers interpolation + array resolution code paths)
      const widgetId = `${HEADER_COMP_ID}|tmpl:7:0|Link|2`;
      const widget: WidgetInfo = {
        id: widgetId,
        componentId: HEADER_COMP_ID,
        kind: 'Link',
        origin: makeOrigin('/project/src/app/header/header.component.html', 7, 0),
        path: { componentId: HEADER_COMP_ID, path: 'HeaderComponent>Link[2]' },
        attributes: {},
        bindings: [{
          kind: 'boundAttr',
          name: 'routerLink',
          value: "['/owners/add']",
          origin: makeOrigin('/project/src/app/header/header.component.html', 7, 10),
        }],
        visibilityPredicates: [],
        enablementPredicates: [],
      };
      const widgetsByComponentId = new Map([[HEADER_COMP_ID, [widget]]]);
      buildGraph(
        routeMap,
        makeInterpolationComponentRegistry(),
        [],
        widgetsByComponentId,
        makeInterpolationModuleRegistry(),
      );

      // Every route fullPath must still start with "/"
      for (const route of routeMap.routeMap.routes) {
        expect(route.fullPath).toMatch(/^\//);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Regression: VizData route labels preserve leading "/"
  // -------------------------------------------------------------------------

  describe('VizData route label correctness', () => {
    it('route node labels in VizData contain leading "/"', () => {
      const routeMap = makeInterpolationRouteMap();
      const g = buildGraph(
        routeMap,
        makeInterpolationComponentRegistry(),
        [],
        new Map(),
        makeInterpolationModuleRegistry(),
      );

      // Build a Phase1Bundle from the multigraph
      const structuralCount = g.edges.filter(
        (e) => STRUCTURAL_EDGE_KINDS.has(e.kind),
      ).length;
      const bundle: Phase1Bundle = {
        multigraph: g,
        stats: {
          nodeCount: g.nodes.length,
          edgeCount: g.edges.length,
          structuralEdgeCount: structuralCount,
          executableEdgeCount: g.edges.length - structuralCount,
        },
      };

      const vizData = extractVizData(bundle, []);
      const routeNodes = vizData.nodes.filter((n) => n.type === 'Route');
      expect(routeNodes.length).toBeGreaterThan(0);

      // Every route label that represents a path must start with "/"
      for (const rn of routeNodes) {
        expect(rn.label).toMatch(/^\//);
      }

      // Specific petclinic-like route labels
      const labels = routeNodes.map((n) => n.label);
      expect(labels).toContain('/owners');
      expect(labels).toContain('/owners/:id');
      expect(labels).toContain('/owners/add');
      expect(labels).toContain('/pets/:id/edit');
    });
  });
});
