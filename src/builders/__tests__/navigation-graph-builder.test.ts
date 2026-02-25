/**
 * navigation-graph-builder.test.ts
 *
 * Tests for NavigationGraphBuilder covering representative Angular patterns:
 *   1. Component nodes are added for every ComponentInfo
 *   2. Route → Component UI_EFFECT transitions for ComponentRoutes
 *   3. routerLink widget transitions from Component nodes
 *   4. Handler navigate() transitions from Component nodes
 *   5. External node stable hash IDs (FNV-1a, deterministic)
 *   6. Edge ID format: ${from}::${signature}::${to}::${stableIndex}
 *   7. Transition sort key determinism (7-field order)
 *   8. Nodes sorted by id lexicographically
 *   9. Edges sorted by id lexicographically
 */

import {
  NavigationGraphBuilder,
  externalNodeId,
  computeTransitionSignature,
  compareTransitions,
} from '../navigation-graph-builder.js';
import type { ComponentRouteMap, ComponentRoute, RedirectRoute } from '../../models/routes.js';
import type { ComponentRegistry, ComponentInfo } from '../../models/components.js';
import type { WidgetEventMap } from '../../models/events.js';
import type { WidgetInfo } from '../../models/widgets.js';
import type { AnalyzerConfig } from '../../models/analyzer-config.js';
import type { GraphTransition } from '../../models/navigation-graph.js';

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
  return { file, startLine, startCol, endLine: startLine };
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

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function buildGraph(
  routeMap = makeRouteMap(),
  componentRegistry = makeComponentRegistry(),
  widgetEventMaps: WidgetEventMap[] = [],
  widgetsByComponentId?: Map<string, WidgetInfo[]>,
) {
  const builder = new NavigationGraphBuilder(makeConfig());
  return builder.build(
    routeMap,
    componentRegistry,
    widgetEventMaps,
    undefined,
    widgetsByComponentId,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NavigationGraphBuilder', () => {
  describe('Node construction', () => {
    it('includes a Virtual __entry__ node', () => {
      const g = buildGraph();
      const entry = g.nodes.find((n) => n.id === '__entry__');
      expect(entry).toBeDefined();
      expect(entry!.type).toBe('Virtual');
    });

    it('includes Route nodes for all routes', () => {
      const g = buildGraph();
      const routeIds = g.nodes.filter((n) => n.type === 'Route').map((n) => n.id);
      expect(routeIds).toContain(`/posts@${MODULE_ID}`);
      expect(routeIds).toContain(`/users@${MODULE_ID}`);
    });

    it('includes Component nodes for ALL components in registry', () => {
      const g = buildGraph();
      const compIds = g.nodes.filter((n) => n.type === 'Component').map((n) => n.id);
      expect(compIds).toContain(POSTS_COMP_ID);
      expect(compIds).toContain(USERS_COMP_ID);
      expect(compIds).toContain(HEADER_COMP_ID);
    });

    it('Component nodes have correct type and componentId', () => {
      const g = buildGraph();
      const headerNode = g.nodes.find((n) => n.id === HEADER_COMP_ID);
      expect(headerNode).toBeDefined();
      expect(headerNode!.type).toBe('Component');
      expect(headerNode!.componentId).toBe(HEADER_COMP_ID);
      expect(headerNode!.label).toBe('HeaderComponent');
    });

    it('nodes are sorted by id lexicographically', () => {
      const g = buildGraph();
      const ids = g.nodes.map((n) => n.id);
      const sorted = [...ids].sort((a, b) => a.localeCompare(b));
      expect(ids).toEqual(sorted);
    });
  });

  describe('Transition: Route → Component (UI_EFFECT)', () => {
    it('creates UI_EFFECT transition for each ComponentRoute', () => {
      const g = buildGraph();
      const uiEffectEdges = g.edges.filter((e) =>
        e.transitions.some((t) => t.kind === 'UI_EFFECT'),
      );
      expect(uiEffectEdges).toHaveLength(2);
    });

    it('UI_EFFECT from Route node to Component node', () => {
      const g = buildGraph();
      const edge = g.edges.find(
        (e) => e.from === `/posts@${MODULE_ID}` && e.to === POSTS_COMP_ID,
      );
      expect(edge).toBeDefined();
      expect(edge!.transitions[0].kind).toBe('UI_EFFECT');
    });
  });

  describe('Transition: Entry → Route (NAVIGATE_ROUTE)', () => {
    it('creates __entry__ → route transitions for root routes', () => {
      const g = buildGraph();
      const entryEdges = g.edges.filter((e) => e.from === '__entry__');
      expect(entryEdges.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Transition: Redirect (REDIRECT)', () => {
    it('creates REDIRECT transition for redirect routes', () => {
      const g = buildGraph();
      const redirectEdges = g.edges.filter((e) =>
        e.transitions.some((t) => t.kind === 'REDIRECT'),
      );
      expect(redirectEdges).toHaveLength(1);
      expect(redirectEdges[0].from).toBe(`/@${MODULE_ID}`);
      expect(redirectEdges[0].to).toBe(`/posts@${MODULE_ID}`);
    });
  });

  describe('Transition: routerLink widget (NAVIGATE_ROUTE from Component)', () => {
    it('creates NAVIGATE_ROUTE from Component node for routerLink binding', () => {
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
        (e) => e.from === HEADER_COMP_ID && e.to === `/posts@${MODULE_ID}`,
      );
      expect(edge).toBeDefined();
      expect(edge!.transitions[0].kind).toBe('NAVIGATE_ROUTE');
      expect(edge!.transitions[0].trigger?.navType).toBe('routerLink');
      expect(edge!.transitions[0].trigger?.widgetId).toBe(widgetId);
    });

    it('does NOT create Route → Route transitions for routerLink (uses Component as source)', () => {
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

      // No Route → Route navigate edges should exist (only Component → Route)
      const routeToRouteNavEdges = g.edges.filter(
        (e) =>
          g.nodes.find((n) => n.id === e.from)?.type === 'Route' &&
          g.nodes.find((n) => n.id === e.to)?.type === 'Route' &&
          e.transitions.some((t) => t.kind === 'NAVIGATE_ROUTE'),
      );
      expect(routeToRouteNavEdges).toHaveLength(0);
    });
  });

  describe('Transition: handler navigate() (NAVIGATE_ROUTE from Component)', () => {
    it('creates NAVIGATE_ROUTE from Component node for programmatic navigation', () => {
      const widgetId =
        `${HEADER_COMP_ID}|/project/src/app/header/header.component.html:3:0|Link|0`;

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

      const g = buildGraph(makeRouteMap(), makeComponentRegistry(), widgetEventMaps);

      const edge = g.edges.find(
        (e) => e.from === HEADER_COMP_ID && e.to === `/users@${MODULE_ID}`,
      );
      expect(edge).toBeDefined();
      expect(edge!.transitions[0].kind).toBe('NAVIGATE_ROUTE');
      expect(edge!.transitions[0].trigger?.navType).toBe('programmaticNavigate');
      expect(edge!.transitions[0].handler?.name).toBe('goToUsers');
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

    it('creates External node for href binding', () => {
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
      expect(extNode!.type).toBe('External');
      expect(extNode!.url).toBe(extUrl);

      const edge = g.edges.find((e) => e.from === HEADER_COMP_ID && e.to === extId);
      expect(edge).toBeDefined();
      expect(edge!.transitions[0].kind).toBe('NAVIGATE_EXTERNAL');
    });
  });

  describe('Edge model', () => {
    it('edge IDs start with from node ID', () => {
      const g = buildGraph();
      for (const edge of g.edges) {
        expect(edge.id.startsWith(edge.from + '::')).toBe(true);
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

    it('edge IDs are sorted lexicographically', () => {
      const g = buildGraph();
      const ids = g.edges.map((e) => e.id);
      const sorted = [...ids].sort((a, b) => a.localeCompare(b));
      expect(ids).toEqual(sorted);
    });

    it('each edge has exactly one transition', () => {
      const g = buildGraph();
      for (const edge of g.edges) {
        expect(edge.transitions).toHaveLength(1);
      }
    });
  });

  describe('Transition signature (spec §3.4.2)', () => {
    it('produces a 12-field pipe-delimited signature', () => {
      const t: GraphTransition = {
        kind: 'NAVIGATE_ROUTE',
        trigger: { widgetId: 'w1', eventType: 'click', navType: 'routerLink' },
        origin: { file: '/app/header.html', startLine: 3, startCol: 10, endLine: 3 },
        uiPreconditions: [],
      };
      const sig = computeTransitionSignature(t, '/posts@module.ts');
      const parts = sig.split('|');
      expect(parts).toHaveLength(12);
      expect(parts[0]).toBe('NAVIGATE_ROUTE');
      expect(parts[1]).toBe('routerLink');
      expect(parts[2]).toBe('click');
      expect(parts[3]).toBe('w1');
      expect(parts[11]).toBe('/posts@module.ts');
    });

    it('missing fields default to empty string / 0', () => {
      const t: GraphTransition = {
        kind: 'UI_EFFECT',
        origin: { file: '/app/module.ts', startLine: 10, startCol: 0, endLine: 10 },
        uiPreconditions: [],
      };
      const sig = computeTransitionSignature(t, '/comp#Comp');
      const parts = sig.split('|');
      expect(parts[1]).toBe(''); // navType
      expect(parts[2]).toBe(''); // eventType
      expect(parts[3]).toBe(''); // widgetId
      expect(parts[4]).toBe(''); // handlerName
      expect(parts[6]).toBe('0'); // handlerLine fallback
      expect(parts[7]).toBe('0'); // handlerCol fallback
    });
  });

  describe('Transition sort key (spec §3.4.3)', () => {
    it('sorts by kind first', () => {
      const a: GraphTransition = {
        kind: 'NAVIGATE_ROUTE',
        origin: { file: 'a.ts', startLine: 1, startCol: 0, endLine: 1 },
        uiPreconditions: [],
      };
      const b: GraphTransition = {
        kind: 'UI_EFFECT',
        origin: { file: 'a.ts', startLine: 1, startCol: 0, endLine: 1 },
        uiPreconditions: [],
      };
      expect(compareTransitions(a, b)).toBeLessThan(0);
    });

    it('sorts by origin.file when kind equal', () => {
      const a: GraphTransition = {
        kind: 'NAVIGATE_ROUTE',
        origin: { file: 'a.ts', startLine: 1, startCol: 0, endLine: 1 },
        uiPreconditions: [],
      };
      const b: GraphTransition = {
        kind: 'NAVIGATE_ROUTE',
        origin: { file: 'b.ts', startLine: 1, startCol: 0, endLine: 1 },
        uiPreconditions: [],
      };
      expect(compareTransitions(a, b)).toBeLessThan(0);
    });

    it('sorts by origin.startLine when kind and file equal', () => {
      const a: GraphTransition = {
        kind: 'NAVIGATE_ROUTE',
        origin: { file: 'a.ts', startLine: 5, startCol: 0, endLine: 5 },
        uiPreconditions: [],
      };
      const b: GraphTransition = {
        kind: 'NAVIGATE_ROUTE',
        origin: { file: 'a.ts', startLine: 10, startCol: 0, endLine: 10 },
        uiPreconditions: [],
      };
      expect(compareTransitions(a, b)).toBeLessThan(0);
    });
  });

  describe('uiPreconditions propagation', () => {
    it('copies widget predicates to routerLink transitions', () => {
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
            name: 'routerLink',
            value: '/posts',
            origin: makeOrigin('/project/src/app/header/header.component.html', 3, 10),
          },
        ],
        visibilityPredicates: [{ expression: 'isLoggedIn', kind: 'visibility' }],
        enablementPredicates: [{ expression: '!isLoading', kind: 'enablement' }],
      };

      const widgetsByComponentId = new Map([[HEADER_COMP_ID, [widget]]]);
      const g = buildGraph(makeRouteMap(), makeComponentRegistry(), [], widgetsByComponentId);

      const edge = g.edges.find(
        (e) => e.from === HEADER_COMP_ID && e.to === `/posts@${MODULE_ID}`,
      );
      expect(edge).toBeDefined();
      const preconditions = edge!.transitions[0].uiPreconditions;
      expect(preconditions).toHaveLength(2);
      expect(preconditions[0].expression).toBe('isLoggedIn');
      expect(preconditions[1].expression).toBe('!isLoading');
    });
  });
});
