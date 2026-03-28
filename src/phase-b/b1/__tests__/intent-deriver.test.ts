/**
 * intent-deriver.test.ts
 * Unit tests for B1.1 RealizationIntent derivation.
 */

import { deriveIntents, resolveTerminalExternalUrl } from '../intent-deriver.js';
import type { A1Multigraph, Edge, Node, RouteNode, ComponentNode, WidgetNode, ExternalNode } from '../../../models/multigraph.js';
import type { A2WorkflowSet, TaskWorkflow } from '../../../models/workflow.js';

// ---------------------------------------------------------------------------
// Test helpers — build minimal A1 + A2 fixtures
// ---------------------------------------------------------------------------

const REF = { file: 'test.ts', start: 0, end: 10 };

function makeRoute(id: string, fullPath: string, opts?: {
  isEntry?: boolean;
  guards?: string[];
  params?: string[];
}): RouteNode {
  return {
    id,
    kind: 'Route',
    label: id,
    refs: [REF],
    meta: {
      fullPath,
      path: fullPath,
      isTopLevel: true,
      isEntry: opts?.isEntry ?? false,
      isWildcard: fullPath === '/**',
      params: opts?.params ?? [],
      guards: opts?.guards ?? [],
      roles: [],
      routeType: 'ComponentRoute',
    },
  };
}

function makeComponent(id: string, selector: string): ComponentNode {
  return {
    id,
    kind: 'Component',
    label: id,
    refs: [REF],
    meta: { name: id, file: 'test.ts', selector },
  };
}

function makeWidget(id: string, compId: string, opts?: {
  tagName?: string;
  widgetKind?: string;
  attributes?: Record<string, string>;
  formControlName?: string;
  routerLinkText?: string;
  inputType?: string;
  requiredLiteral?: boolean;
}): WidgetNode {
  return {
    id,
    kind: 'Widget',
    label: id,
    refs: [REF],
    meta: {
      componentId: compId,
      tagName: opts?.tagName ?? 'button',
      widgetKind: (opts?.widgetKind ?? 'Button') as WidgetNode['meta']['widgetKind'],
      eventNames: [],
      eventHandlerTextByName: {},
      attributes: opts?.attributes ?? {},
      ui: {
        requiredLiteral: opts?.requiredLiteral ?? false,
        rawAttrsText: {},
        ...(opts?.formControlName !== undefined ? { formControlName: opts.formControlName } : {}),
        ...(opts?.inputType !== undefined ? { inputType: opts.inputType } : {}),
      },
      ...(opts?.routerLinkText !== undefined ? { routerLinkText: opts.routerLinkText } : {}),
    },
  };
}

function makeExternal(id: string, url: string): ExternalNode {
  return {
    id,
    kind: 'External',
    label: url,
    refs: [REF],
    meta: { url },
  };
}

function makeEdge(id: string, from: string, to: string | null, kind: Edge['kind'], opts?: {
  trigger?: Edge['trigger'];
  effectGroupId?: string;
}): Edge {
  return {
    id,
    from,
    to,
    kind,
    refs: [REF],
    constraints: { requiredParams: [], guards: [], roles: [], uiAtoms: [], evidence: [] },
    ...(opts?.trigger !== undefined ? { trigger: opts.trigger } : {}),
    ...(opts?.effectGroupId !== undefined ? { effectGroupId: opts.effectGroupId } : {}),
  };
}

function makeA1(nodes: Node[], edges: Edge[]): A1Multigraph {
  return {
    multigraph: { nodes, edges },
    stats: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      structuralEdgeCount: 0,
      executableEdgeCount: edges.length,
    },
  };
}

function makeWorkflow(id: string, opts: {
  triggerEdgeId: string;
  startRouteIds: string[];
  steps: Array<{ edgeId: string; kind: Edge['kind'] }>;
  terminalNodeId: string;
  verdict?: 'FEASIBLE' | 'CONDITIONAL' | 'PRUNED';
  guards?: string[];
  requiredParams?: string[];
}): TaskWorkflow {
  return {
    id,
    triggerEdgeId: opts.triggerEdgeId,
    startRouteIds: opts.startRouteIds,
    steps: opts.steps,
    terminalNodeId: opts.terminalNodeId,
    verdict: opts.verdict ?? 'FEASIBLE',
    cw: {
      requiredParams: opts.requiredParams ?? [],
      guards: opts.guards ?? [],
      roles: [],
      uiAtoms: [],
      evidence: [],
    },
    explanation: {},
    meta: {},
  };
}

function makeA2(workflows: TaskWorkflow[]): A2WorkflowSet {
  const feasible = workflows.filter(w => w.verdict === 'FEASIBLE');
  const conditional = workflows.filter(w => w.verdict === 'CONDITIONAL');
  const pruned = workflows.filter(w => w.verdict === 'PRUNED');
  return {
    input: { projectId: 'test', multigraphHash: 'abc123' },
    config: { mode: 'task' },
    workflows,
    partitions: {
      feasibleIds: feasible.map(w => w.id),
      conditionalIds: conditional.map(w => w.id),
      prunedIds: pruned.map(w => w.id),
    },
    stats: {
      workflowCount: workflows.length,
      feasibleCount: feasible.length,
      conditionalCount: conditional.length,
      prunedCount: pruned.length,
      triggerEdgeCount: workflows.length,
      enumeratedRouteCount: 1,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('deriveIntents', () => {
  it('derives a WNR intent with correct fields', () => {
    const route1 = makeRoute('r1', '/home', { isEntry: true });
    const route2 = makeRoute('r2', '/about');
    const comp = makeComponent('c1', 'app-home');
    const widget = makeWidget('w1', 'c1', { tagName: 'a', widgetKind: 'Link', routerLinkText: 'About' });
    const wnrEdge = makeEdge('e1', 'w1', 'r2', 'WIDGET_NAVIGATES_ROUTE');
    const structEdge1 = makeEdge('s1', 'r1', 'c1', 'ROUTE_ACTIVATES_COMPONENT');
    const structEdge2 = makeEdge('s2', 'c1', 'w1', 'COMPONENT_CONTAINS_WIDGET');

    const a1 = makeA1(
      [route1, route2, comp, widget],
      [wnrEdge, structEdge1, structEdge2],
    );

    const wf = makeWorkflow('wf1', {
      triggerEdgeId: 'e1',
      startRouteIds: ['r1'],
      steps: [{ edgeId: 'e1', kind: 'WIDGET_NAVIGATES_ROUTE' }],
      terminalNodeId: 'r2',
    });

    const a2 = makeA2([wf]);
    const result = deriveIntents(a1, a2);

    expect(result.intents).toHaveLength(1);
    expect(result.stats.feasibleCount).toBe(1);
    expect(result.stats.prunedCount).toBe(0);

    const intent = result.intents[0]!;
    expect(intent.workflowId).toBe('wf1');
    expect(intent.verdict).toBe('FEASIBLE');
    expect(intent.triggerKind).toBe('WIDGET_NAVIGATES_ROUTE');
    expect(intent.triggerEvent).toBe('click');
    expect(intent.terminalRoutePath).toBe('/about');
    expect(intent.requiresParams).toBe(false);
    expect(intent.hasUnresolvedTargets).toBe(false);

    // Trigger widget
    expect(intent.triggerWidget.nodeId).toBe('w1');
    expect(intent.triggerWidget.tagName).toBe('a');
    expect(intent.triggerWidget.widgetKind).toBe('Link');
    expect(intent.triggerWidget.componentSelector).toBe('app-home');
    expect(intent.triggerWidget.routerLinkText).toBe('About');

    // Start routes
    expect(intent.startRoutes).toHaveLength(1);
    expect(intent.startRoutes[0]!.fullPath).toBe('/home');
    expect(intent.startRoutes[0]!.requiredParams).toEqual([]);

    // No form schema for WNR
    expect(intent.formSchema).toBeUndefined();
  });

  it('derives a WNE intent with external terminal', () => {
    const route = makeRoute('r1', '/home', { isEntry: true });
    const comp = makeComponent('c1', 'app-home');
    const widget = makeWidget('w1', 'c1', { tagName: 'a', widgetKind: 'Link' });
    const ext = makeExternal('ext1', 'https://example.com');
    const wneEdge = makeEdge('e1', 'w1', 'ext1', 'WIDGET_NAVIGATES_EXTERNAL');
    const structEdge1 = makeEdge('s1', 'r1', 'c1', 'ROUTE_ACTIVATES_COMPONENT');
    const structEdge2 = makeEdge('s2', 'c1', 'w1', 'COMPONENT_CONTAINS_WIDGET');

    const a1 = makeA1(
      [route, comp, widget, ext],
      [wneEdge, structEdge1, structEdge2],
    );

    const wf = makeWorkflow('wf1', {
      triggerEdgeId: 'e1',
      startRouteIds: ['r1'],
      steps: [{ edgeId: 'e1', kind: 'WIDGET_NAVIGATES_EXTERNAL' }],
      terminalNodeId: 'ext1',
    });

    const a2 = makeA2([wf]);
    const result = deriveIntents(a1, a2);

    expect(result.intents).toHaveLength(1);
    const intent = result.intents[0]!;
    expect(intent.triggerKind).toBe('WIDGET_NAVIGATES_EXTERNAL');
    expect(intent.triggerEvent).toBe('click');
    expect(intent.terminalRoutePath).toBeUndefined();
    expect(intent.terminalNodeId).toBe('ext1');
  });

  it('derives a WTH intent with custom event', () => {
    const route = makeRoute('r1', '/home', { isEntry: true });
    const comp = makeComponent('c1', 'app-home');
    const widget = makeWidget('w1', 'c1', { tagName: 'div', widgetKind: 'OtherInteractive' });
    const wthEdge = makeEdge('e1', 'w1', 'c1', 'WIDGET_TRIGGERS_HANDLER', {
      trigger: { event: 'dblclick' },
    });
    const structEdge1 = makeEdge('s1', 'r1', 'c1', 'ROUTE_ACTIVATES_COMPONENT');
    const structEdge2 = makeEdge('s2', 'c1', 'w1', 'COMPONENT_CONTAINS_WIDGET');

    const a1 = makeA1(
      [route, comp, widget],
      [wthEdge, structEdge1, structEdge2],
    );

    const wf = makeWorkflow('wf1', {
      triggerEdgeId: 'e1',
      startRouteIds: ['r1'],
      steps: [{ edgeId: 'e1', kind: 'WIDGET_TRIGGERS_HANDLER' }],
      terminalNodeId: 'c1',
    });

    const a2 = makeA2([wf]);
    const result = deriveIntents(a1, a2);

    const intent = result.intents[0]!;
    expect(intent.triggerKind).toBe('WIDGET_TRIGGERS_HANDLER');
    expect(intent.triggerEvent).toBe('dblclick');
  });

  it('derives a WSF intent with form schema', () => {
    const route = makeRoute('r1', '/login', { isEntry: true });
    const comp = makeComponent('c1', 'app-login');
    const form = makeWidget('w-form', 'c1', { tagName: 'form', widgetKind: 'Form' });
    const input1 = makeWidget('w-input1', 'c1', {
      tagName: 'input', widgetKind: 'Input',
      formControlName: 'username', inputType: 'text', requiredLiteral: true,
    });
    const input2 = makeWidget('w-input2', 'c1', {
      tagName: 'input', widgetKind: 'Input',
      formControlName: 'password', inputType: 'password',
    });
    const submitBtn = makeWidget('w-btn', 'c1', { tagName: 'button', widgetKind: 'Button' });

    const wsfEdge = makeEdge('e1', 'w-form', 'c1', 'WIDGET_SUBMITS_FORM', {
      trigger: { event: 'submit' },
    });
    const structEdges = [
      makeEdge('s1', 'r1', 'c1', 'ROUTE_ACTIVATES_COMPONENT'),
      makeEdge('s2', 'c1', 'w-form', 'COMPONENT_CONTAINS_WIDGET'),
      // WIDGET_CONTAINS_WIDGET: form → children
      makeEdge('s3', 'w-form', 'w-input1', 'WIDGET_CONTAINS_WIDGET'),
      makeEdge('s4', 'w-form', 'w-input2', 'WIDGET_CONTAINS_WIDGET'),
      makeEdge('s5', 'w-form', 'w-btn', 'WIDGET_CONTAINS_WIDGET'),
    ];

    const a1 = makeA1(
      [route, comp, form, input1, input2, submitBtn],
      [wsfEdge, ...structEdges],
    );

    const wf = makeWorkflow('wf1', {
      triggerEdgeId: 'e1',
      startRouteIds: ['r1'],
      steps: [{ edgeId: 'e1', kind: 'WIDGET_SUBMITS_FORM' }],
      terminalNodeId: 'c1',
    });

    const a2 = makeA2([wf]);
    const result = deriveIntents(a1, a2);

    const intent = result.intents[0]!;
    expect(intent.triggerKind).toBe('WIDGET_SUBMITS_FORM');
    expect(intent.triggerEvent).toBe('submit');

    // Form schema should include inputs but NOT the button
    expect(intent.formSchema).toBeDefined();
    expect(intent.formSchema).toHaveLength(2);
    expect(intent.formSchema![0]!.formControlName).toBe('username');
    expect(intent.formSchema![0]!.required).toBe(true);
    expect(intent.formSchema![0]!.inputType).toBe('text');
    expect(intent.formSchema![1]!.formControlName).toBe('password');
    expect(intent.formSchema![1]!.required).toBe(false);
    expect(intent.formSchema![1]!.inputType).toBe('password');
  });

  it('preserves raw A1 triggerEvent for WSF (e.g. ngSubmit)', () => {
    const route = makeRoute('r1', '/login', { isEntry: true });
    const comp = makeComponent('c1', 'app-login');
    const form = makeWidget('w-form', 'c1', { tagName: 'form', widgetKind: 'Form' });
    const wsfEdge = makeEdge('e1', 'w-form', 'c1', 'WIDGET_SUBMITS_FORM', {
      trigger: { event: 'ngSubmit' },
    });

    const a1 = makeA1(
      [route, comp, form],
      [wsfEdge, makeEdge('s1', 'r1', 'c1', 'ROUTE_ACTIVATES_COMPONENT'), makeEdge('s2', 'c1', 'w-form', 'COMPONENT_CONTAINS_WIDGET')],
    );

    const wf = makeWorkflow('wf1', {
      triggerEdgeId: 'e1',
      startRouteIds: ['r1'],
      steps: [{ edgeId: 'e1', kind: 'WIDGET_SUBMITS_FORM' }],
      terminalNodeId: 'c1',
    });

    const a2 = makeA2([wf]);
    const result = deriveIntents(a1, a2);
    expect(result.intents[0]!.triggerEvent).toBe('ngSubmit');
  });

  it('requiresParams uses startRouteIds[0] per start route policy', () => {
    // Multi-route workflow: first route has no params, later routes do
    const route1 = makeRoute('r-wildcard', '/**', { isEntry: true });
    const route2 = makeRoute('r-param', '/users/:id', { isEntry: true, params: ['id'] });
    const comp = makeComponent('c1', 'app-nav');
    const widget = makeWidget('w1', 'c1');
    const edge = makeEdge('e1', 'w1', 'c1', 'WIDGET_TRIGGERS_HANDLER');

    const a1 = makeA1(
      [route1, route2, comp, widget],
      [edge, makeEdge('s1', 'r-wildcard', 'c1', 'ROUTE_ACTIVATES_COMPONENT'), makeEdge('s2', 'r-param', 'c1', 'ROUTE_ACTIVATES_COMPONENT'), makeEdge('s3', 'c1', 'w1', 'COMPONENT_CONTAINS_WIDGET')],
    );

    const wf = makeWorkflow('wf1', {
      triggerEdgeId: 'e1',
      startRouteIds: ['r-wildcard', 'r-param'], // sorted: r-param, r-wildcard? No — sorted by ID
      steps: [{ edgeId: 'e1', kind: 'WIDGET_TRIGGERS_HANDLER' }],
      terminalNodeId: 'c1',
    });

    const a2 = makeA2([wf]);
    const result = deriveIntents(a1, a2);

    // startRouteIds[0] = 'r-param' (sorted alphabetically), which has params
    // But startRoutes are derived in startRouteIds order, so [0] maps to 'r-wildcard'
    // Actually startRouteIds order is preserved from A2 which is ['r-wildcard', 'r-param']
    // So startRoutes[0] = r-wildcard with no params → requiresParams = false
    expect(result.intents[0]!.requiresParams).toBe(false);
  });

  it('skips PRUNED workflows', () => {
    const route = makeRoute('r1', '/home', { isEntry: true });
    const comp = makeComponent('c1', 'app-home');
    const widget = makeWidget('w1', 'c1');
    const edge = makeEdge('e1', 'w1', 'c1', 'WIDGET_TRIGGERS_HANDLER');

    const a1 = makeA1(
      [route, comp, widget],
      [edge, makeEdge('s1', 'r1', 'c1', 'ROUTE_ACTIVATES_COMPONENT'), makeEdge('s2', 'c1', 'w1', 'COMPONENT_CONTAINS_WIDGET')],
    );

    const wf = makeWorkflow('wf1', {
      triggerEdgeId: 'e1',
      startRouteIds: ['r1'],
      steps: [{ edgeId: 'e1', kind: 'WIDGET_TRIGGERS_HANDLER' }],
      terminalNodeId: 'c1',
      verdict: 'PRUNED',
    });

    const a2 = makeA2([wf]);
    const result = deriveIntents(a1, a2);

    expect(result.intents).toHaveLength(0);
    expect(result.stats.prunedCount).toBe(1);
    expect(result.stats.feasibleCount).toBe(0);
  });

  it('counts CONDITIONAL verdicts correctly', () => {
    const route = makeRoute('r1', '/home', { isEntry: true });
    const comp = makeComponent('c1', 'app-home');
    const widget = makeWidget('w1', 'c1');
    const edge = makeEdge('e1', 'w1', 'c1', 'WIDGET_TRIGGERS_HANDLER');

    const a1 = makeA1(
      [route, comp, widget],
      [edge, makeEdge('s1', 'r1', 'c1', 'ROUTE_ACTIVATES_COMPONENT'), makeEdge('s2', 'c1', 'w1', 'COMPONENT_CONTAINS_WIDGET')],
    );

    const wf = makeWorkflow('wf1', {
      triggerEdgeId: 'e1',
      startRouteIds: ['r1'],
      steps: [{ edgeId: 'e1', kind: 'WIDGET_TRIGGERS_HANDLER' }],
      terminalNodeId: 'c1',
      verdict: 'CONDITIONAL',
      guards: ['AuthGuard'],
    });

    const a2 = makeA2([wf]);
    const result = deriveIntents(a1, a2);

    expect(result.intents).toHaveLength(1);
    expect(result.stats.conditionalCount).toBe(1);
    expect(result.intents[0]!.verdict).toBe('CONDITIONAL');
  });

  it('derives requiresParams from start route params', () => {
    const route = makeRoute('r1', '/users/:id', { isEntry: true, params: ['id'] });
    const comp = makeComponent('c1', 'app-user');
    const widget = makeWidget('w1', 'c1');
    const edge = makeEdge('e1', 'w1', 'c1', 'WIDGET_TRIGGERS_HANDLER');

    const a1 = makeA1(
      [route, comp, widget],
      [edge, makeEdge('s1', 'r1', 'c1', 'ROUTE_ACTIVATES_COMPONENT'), makeEdge('s2', 'c1', 'w1', 'COMPONENT_CONTAINS_WIDGET')],
    );

    const wf = makeWorkflow('wf1', {
      triggerEdgeId: 'e1',
      startRouteIds: ['r1'],
      steps: [{ edgeId: 'e1', kind: 'WIDGET_TRIGGERS_HANDLER' }],
      terminalNodeId: 'c1',
    });

    const a2 = makeA2([wf]);
    const result = deriveIntents(a1, a2);

    const intent = result.intents[0]!;
    expect(intent.requiresParams).toBe(true);
    expect(intent.startRoutes[0]!.requiredParams).toEqual(['id']);
  });

  it('derives guardNames from route guards including ancestors', () => {
    const parentRoute = makeRoute('r-parent', '/admin', { guards: ['AuthGuard'] });
    const childRoute = makeRoute('r1', '/admin/users', { isEntry: true });
    const comp = makeComponent('c1', 'app-users');
    const widget = makeWidget('w1', 'c1');
    const edge = makeEdge('e1', 'w1', 'c1', 'WIDGET_TRIGGERS_HANDLER');
    const parentEdge = makeEdge('rp1', 'r-parent', 'r1', 'ROUTE_HAS_CHILD');

    const a1 = makeA1(
      [parentRoute, childRoute, comp, widget],
      [
        edge,
        parentEdge,
        makeEdge('s1', 'r1', 'c1', 'ROUTE_ACTIVATES_COMPONENT'),
        makeEdge('s2', 'c1', 'w1', 'COMPONENT_CONTAINS_WIDGET'),
      ],
    );

    const wf = makeWorkflow('wf1', {
      triggerEdgeId: 'e1',
      startRouteIds: ['r1'],
      steps: [{ edgeId: 'e1', kind: 'WIDGET_TRIGGERS_HANDLER' }],
      terminalNodeId: 'c1',
    });

    const a2 = makeA2([wf]);
    const result = deriveIntents(a1, a2);

    const intent = result.intents[0]!;
    expect(intent.guardNames).toContain('AuthGuard');
  });

  it('derives containingFormId for widgets inside forms', () => {
    const route = makeRoute('r1', '/form', { isEntry: true });
    const comp = makeComponent('c1', 'app-form');
    const form = makeWidget('w-form', 'c1', { tagName: 'form', widgetKind: 'Form' });
    const btn = makeWidget('w-btn', 'c1', { tagName: 'button', widgetKind: 'Button' });

    const wthEdge = makeEdge('e1', 'w-btn', 'c1', 'WIDGET_TRIGGERS_HANDLER', {
      trigger: { event: 'click' },
    });

    const a1 = makeA1(
      [route, comp, form, btn],
      [
        wthEdge,
        makeEdge('s1', 'r1', 'c1', 'ROUTE_ACTIVATES_COMPONENT'),
        makeEdge('s2', 'c1', 'w-form', 'COMPONENT_CONTAINS_WIDGET'),
        makeEdge('s3', 'c1', 'w-btn', 'COMPONENT_CONTAINS_WIDGET'),
        makeEdge('s4', 'w-form', 'w-btn', 'WIDGET_CONTAINS_WIDGET'),
      ],
    );

    const wf = makeWorkflow('wf1', {
      triggerEdgeId: 'e1',
      startRouteIds: ['r1'],
      steps: [{ edgeId: 'e1', kind: 'WIDGET_TRIGGERS_HANDLER' }],
      terminalNodeId: 'c1',
    });

    const a2 = makeA2([wf]);
    const result = deriveIntents(a1, a2);

    const intent = result.intents[0]!;
    expect(intent.triggerWidget.containingFormId).toBe('w-form');
  });

  it('derives hasUnresolvedTargets from explanation', () => {
    const route = makeRoute('r1', '/home', { isEntry: true });
    const comp = makeComponent('c1', 'app-home');
    const widget = makeWidget('w1', 'c1');
    const edge = makeEdge('e1', 'w1', null, 'WIDGET_NAVIGATES_ROUTE');

    const a1 = makeA1(
      [route, comp, widget],
      [edge, makeEdge('s1', 'r1', 'c1', 'ROUTE_ACTIVATES_COMPONENT'), makeEdge('s2', 'c1', 'w1', 'COMPONENT_CONTAINS_WIDGET')],
    );

    const wf: TaskWorkflow = {
      ...makeWorkflow('wf1', {
        triggerEdgeId: 'e1',
        startRouteIds: ['r1'],
        steps: [{ edgeId: 'e1', kind: 'WIDGET_NAVIGATES_ROUTE' }],
        terminalNodeId: 'r1',
      }),
      explanation: {
        unresolvedTargets: [{ edgeId: 'e1', targetText: 'dynamic' }],
      },
    };

    const a2 = makeA2([wf]);
    const result = deriveIntents(a1, a2);

    expect(result.intents[0]!.hasUnresolvedTargets).toBe(true);
  });

  it('populates input ref from A2', () => {
    const a1 = makeA1([], []);
    const a2 = makeA2([]);

    const result = deriveIntents(a1, a2);
    expect(result.input.projectId).toBe('test');
    expect(result.input.multigraphHash).toBeDefined();
  });
});

describe('resolveTerminalExternalUrl', () => {
  it('resolves external node URL', () => {
    const ext = makeExternal('ext1', 'https://example.com');
    const nodeMap = new Map<string, Node>([['ext1', ext]]);
    expect(resolveTerminalExternalUrl('ext1', nodeMap)).toBe('https://example.com');
  });

  it('returns undefined for non-external nodes', () => {
    const route = makeRoute('r1', '/home');
    const nodeMap = new Map<string, Node>([['r1', route]]);
    expect(resolveTerminalExternalUrl('r1', nodeMap)).toBeUndefined();
  });

  it('returns undefined for missing nodes', () => {
    const nodeMap = new Map<string, Node>();
    expect(resolveTerminalExternalUrl('missing', nodeMap)).toBeUndefined();
  });
});
