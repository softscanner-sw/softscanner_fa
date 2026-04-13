/**
 * task-enumerator.test.ts
 *
 * Tests for the task-mode A2 enumerator covering:
 *   1. WNR trigger → [WNR] steps, no effects
 *   2. WNE trigger → [WNE] steps, External terminal
 *   3. WTH with no effects → [WTH] steps
 *   4. WTH with CCS → [WTH, CCS] (handler-scoped only)
 *   5. WTH with CCS+CNR → [WTH, CCS, CNR]
 *   6. Handler scoping: 2 handlers → only matching CCS collected
 *   7. CCS ordered by callsiteOrdinal
 *   8. Redirect closure on WNR target
 *   9. Redirect loop detection
 *  10. Entry route aggregation
 *  11. Classification integration
 *  12. Determinism
 *
 * Isolation: uses only A1Multigraph fixtures. No AST, parsers, or A1 internals.
 */

import type { Edge, Node, A1Multigraph, SourceRef, ConstraintSurface, SpecWidgetKind } from '../../models/multigraph.js';
import { enumerateTaskWorkflows } from '../task-enumerator.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const REF: SourceRef = { file: 'test.ts', start: 0, end: 10 };
const EMPTY_CS: ConstraintSurface = {
  requiredParams: [],
  guards: [],
  roles: [],
  uiAtoms: [],
  evidence: [],
};

function routeNode(id: string, fullPath: string, opts: { isEntry?: boolean; redirectTo?: string; isWildcard?: boolean } = {}): Node {
  return {
    id,
    kind: 'Route',
    label: fullPath,
    refs: [REF],
    meta: {
      fullPath,
      path: fullPath,
      isTopLevel: true,
      isEntry: opts.isEntry ?? false,
      isWildcard: opts.isWildcard ?? false,
      params: [],
      guards: [],
      roles: [],
      routeType: (opts.redirectTo !== undefined ? 'RedirectRoute' : 'ComponentRoute') as 'ComponentRoute' | 'RedirectRoute' | 'WildcardRoute',
      ...(opts.redirectTo !== undefined ? { redirectTo: opts.redirectTo } : {}),
    },
  };
}

function componentNode(id: string, name: string): Node {
  return {
    id,
    kind: 'Component',
    label: name,
    refs: [REF],
    meta: { name, file: 'test.ts' },
  };
}

function widgetNode(id: string, componentId: string, kind: SpecWidgetKind = 'Button'): Node {
  return {
    id,
    kind: 'Widget',
    label: `widget:${id}`,
    refs: [REF],
    meta: {
      componentId,
      widgetKind: kind,
      eventNames: ['click'],
      eventHandlerTextByName: {},
      ui: { rawAttrsText: {} },
    },
  };
}

function serviceNode(id: string, name: string): Node {
  return {
    id,
    kind: 'Service',
    label: name,
    refs: [REF],
    meta: { name, file: 'test.ts' },
  };
}

function externalNode(id: string, url: string): Node {
  return {
    id,
    kind: 'External',
    label: url,
    refs: [REF],
    meta: { url },
  };
}

function edge(
  id: string,
  from: string,
  kind: Edge['kind'],
  to: string | null,
  opts: {
    isSystem?: boolean;
    handler?: Edge['handler'];
    trigger?: Edge['trigger'];
    targetRouteId?: string | null;
    targetText?: string;
    constraints?: ConstraintSurface;
    effectGroupId?: string;
    callsiteOrdinal?: number;
  } = {},
): Edge {
  const result: Edge = {
    id,
    kind,
    from,
    to,
    constraints: opts.constraints ?? EMPTY_CS,
    refs: [REF],
  };
  if (opts.isSystem !== undefined) result.isSystem = opts.isSystem;
  if (opts.handler !== undefined) result.handler = opts.handler;
  if (opts.trigger !== undefined) result.trigger = opts.trigger;
  if (opts.targetRouteId !== undefined) result.targetRouteId = opts.targetRouteId;
  if (opts.targetText !== undefined) result.targetText = opts.targetText;
  if (opts.effectGroupId !== undefined) result.effectGroupId = opts.effectGroupId;
  if (opts.callsiteOrdinal !== undefined) result.callsiteOrdinal = opts.callsiteOrdinal;
  return result;
}

function bundle(nodes: Node[], edges: Edge[]): A1Multigraph {
  const sorted = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
  const sortedEdges = [...edges].sort((a, b) => {
    if (a.from !== b.from) return a.from.localeCompare(b.from);
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    const aTo = a.to ?? '';
    const bTo = b.to ?? '';
    if (aTo !== bTo) return aTo.localeCompare(bTo);
    return a.id.localeCompare(b.id);
  });
  const structural = sortedEdges.filter(e =>
    ['MODULE_IMPORTS_MODULE', 'MODULE_EXPORTS_MODULE', 'MODULE_DECLARES_COMPONENT',
     'MODULE_DECLARES_ROUTE', 'ROUTE_HAS_CHILD', 'ROUTE_ACTIVATES_COMPONENT',
     'COMPONENT_CONTAINS_WIDGET', 'WIDGET_CONTAINS_WIDGET', 'COMPONENT_COMPOSES_COMPONENT',
     'MODULE_PROVIDES_SERVICE', 'COMPONENT_PROVIDES_SERVICE'].includes(e.kind),
  );
  return {
    multigraph: { nodes: sorted, edges: sortedEdges },
    stats: {
      nodeCount: sorted.length,
      edgeCount: sortedEdges.length,
      structuralEdgeCount: structural.length,
      executableEdgeCount: sortedEdges.length - structural.length,
    },
  };
}

// ---------------------------------------------------------------------------
// 1. WNR trigger
// ---------------------------------------------------------------------------

describe('TaskEnumerator — WNR trigger', () => {
  it('produces one task with [WNR] step and route terminal', () => {
    const b = bundle(
      [
        routeNode('R1', '/', { isEntry: true }),
        routeNode('R2', '/about'),
        componentNode('C1', 'Home'),
        widgetNode('W1', 'C1'),
      ],
      [
        edge('rac-1', 'R1', 'ROUTE_ACTIVATES_COMPONENT', 'C1'),
        edge('ccw-1', 'C1', 'COMPONENT_CONTAINS_WIDGET', 'W1'),
        edge('wnr-1', 'W1', 'WIDGET_NAVIGATES_ROUTE', 'R2', { targetRouteId: 'R2' }),
      ],
    );

    const result = enumerateTaskWorkflows(b);
    expect(result.workflows.length).toBe(1);
    const w = result.workflows[0]!;
    expect(w.id).toBe('wnr-1');
    expect(w.triggerEdgeId).toBe('wnr-1');
    expect(w.steps.length).toBe(1);
    expect(w.steps[0]!.edgeId).toBe('wnr-1');
    expect(w.steps[0]!.kind).toBe('WIDGET_NAVIGATES_ROUTE');
    expect(w.terminalNodeId).toBe('R2');
    expect(w.startRouteIds).toEqual(['R1']);
  });
});

// ---------------------------------------------------------------------------
// 2. WNE trigger
// ---------------------------------------------------------------------------

describe('TaskEnumerator — WNE trigger', () => {
  it('produces task with External terminal', () => {
    const b = bundle(
      [
        routeNode('R1', '/', { isEntry: true }),
        componentNode('C1', 'Home'),
        widgetNode('W1', 'C1'),
        externalNode('EXT1', 'https://example.com'),
      ],
      [
        edge('rac-1', 'R1', 'ROUTE_ACTIVATES_COMPONENT', 'C1'),
        edge('ccw-1', 'C1', 'COMPONENT_CONTAINS_WIDGET', 'W1'),
        edge('wne-1', 'W1', 'WIDGET_NAVIGATES_EXTERNAL', 'EXT1'),
      ],
    );

    const result = enumerateTaskWorkflows(b);
    expect(result.workflows.length).toBe(1);
    const w = result.workflows[0]!;
    expect(w.terminalNodeId).toBe('EXT1');
    expect(w.steps[0]!.kind).toBe('WIDGET_NAVIGATES_EXTERNAL');
  });
});

// ---------------------------------------------------------------------------
// 3. WTH with no effects
// ---------------------------------------------------------------------------

describe('TaskEnumerator — WTH without effects', () => {
  it('produces task with just the trigger step', () => {
    const b = bundle(
      [
        routeNode('R1', '/', { isEntry: true }),
        componentNode('C1', 'Home'),
        widgetNode('W1', 'C1'),
      ],
      [
        edge('rac-1', 'R1', 'ROUTE_ACTIVATES_COMPONENT', 'C1'),
        edge('ccw-1', 'C1', 'COMPONENT_CONTAINS_WIDGET', 'W1'),
        edge('wth-1', 'W1', 'WIDGET_TRIGGERS_HANDLER', 'C1', {
          handler: { componentId: 'C1', methodName: 'onClick' },
          effectGroupId: 'C1::onClick',
        }),
      ],
    );

    const result = enumerateTaskWorkflows(b);
    expect(result.workflows.length).toBe(1);
    const w = result.workflows[0]!;
    expect(w.steps.length).toBe(1);
    expect(w.steps[0]!.edgeId).toBe('wth-1');
    expect(w.effectGroupId).toBe('C1::onClick');
    expect(w.terminalNodeId).toBe('R1');
  });
});

// ---------------------------------------------------------------------------
// 4. WTH with CCS (handler-scoped)
// ---------------------------------------------------------------------------

describe('TaskEnumerator — WTH with CCS', () => {
  it('includes handler-scoped CCS in steps', () => {
    const b = bundle(
      [
        routeNode('R1', '/', { isEntry: true }),
        componentNode('C1', 'Home'),
        widgetNode('W1', 'C1'),
        serviceNode('S1', 'ApiService'),
      ],
      [
        edge('rac-1', 'R1', 'ROUTE_ACTIVATES_COMPONENT', 'C1'),
        edge('ccw-1', 'C1', 'COMPONENT_CONTAINS_WIDGET', 'W1'),
        edge('wth-1', 'W1', 'WIDGET_TRIGGERS_HANDLER', 'C1', {
          handler: { componentId: 'C1', methodName: 'onSave' },
          effectGroupId: 'C1::onSave',
        }),
        edge('ccs-1', 'C1', 'COMPONENT_CALLS_SERVICE', 'S1', {
          effectGroupId: 'C1::onSave', callsiteOrdinal: 0,
        }),
      ],
    );

    const result = enumerateTaskWorkflows(b);
    expect(result.workflows.length).toBe(1);
    const w = result.workflows[0]!;
    expect(w.steps.length).toBe(2);
    expect(w.steps[0]!.edgeId).toBe('wth-1');
    expect(w.steps[1]!.edgeId).toBe('ccs-1');
    expect(w.steps[1]!.kind).toBe('COMPONENT_CALLS_SERVICE');
  });
});

// ---------------------------------------------------------------------------
// 5. WTH with CCS + CNR
// ---------------------------------------------------------------------------

describe('TaskEnumerator — WTH with CCS + CNR', () => {
  it('includes CCS then CNR in steps', () => {
    const b = bundle(
      [
        routeNode('R1', '/', { isEntry: true }),
        routeNode('R2', '/details'),
        componentNode('C1', 'Home'),
        widgetNode('W1', 'C1'),
        serviceNode('S1', 'ApiService'),
      ],
      [
        edge('rac-1', 'R1', 'ROUTE_ACTIVATES_COMPONENT', 'C1'),
        edge('ccw-1', 'C1', 'COMPONENT_CONTAINS_WIDGET', 'W1'),
        edge('wth-1', 'W1', 'WIDGET_TRIGGERS_HANDLER', 'C1', {
          handler: { componentId: 'C1', methodName: 'onSave' },
          effectGroupId: 'C1::onSave',
        }),
        edge('ccs-1', 'C1', 'COMPONENT_CALLS_SERVICE', 'S1', {
          effectGroupId: 'C1::onSave', callsiteOrdinal: 0,
        }),
        edge('cnr-1', 'C1', 'COMPONENT_NAVIGATES_ROUTE', 'R2', {
          targetRouteId: 'R2', effectGroupId: 'C1::onSave',
        }),
      ],
    );

    const result = enumerateTaskWorkflows(b);
    expect(result.workflows.length).toBe(1);
    const w = result.workflows[0]!;
    expect(w.steps.length).toBe(3);
    expect(w.steps[0]!.edgeId).toBe('wth-1');
    expect(w.steps[1]!.edgeId).toBe('ccs-1');
    expect(w.steps[2]!.edgeId).toBe('cnr-1');
    expect(w.terminalNodeId).toBe('R2');
  });
});

// ---------------------------------------------------------------------------
// 6. Handler scoping: 2 handlers → only matching CCS
// ---------------------------------------------------------------------------

describe('TaskEnumerator — handler scoping', () => {
  it('each trigger collects only its own handler CCS edges', () => {
    const b = bundle(
      [
        routeNode('R1', '/', { isEntry: true }),
        componentNode('C1', 'Home'),
        widgetNode('W1', 'C1'),
        widgetNode('W2', 'C1'),
        serviceNode('S1', 'ServiceA'),
        serviceNode('S2', 'ServiceB'),
      ],
      [
        edge('rac-1', 'R1', 'ROUTE_ACTIVATES_COMPONENT', 'C1'),
        edge('ccw-1', 'C1', 'COMPONENT_CONTAINS_WIDGET', 'W1'),
        edge('ccw-2', 'C1', 'COMPONENT_CONTAINS_WIDGET', 'W2'),
        // W1 triggers onClick → calls S1
        edge('wth-1', 'W1', 'WIDGET_TRIGGERS_HANDLER', 'C1', {
          handler: { componentId: 'C1', methodName: 'onClick' },
          effectGroupId: 'C1::onClick',
        }),
        edge('ccs-1', 'C1', 'COMPONENT_CALLS_SERVICE', 'S1', {
          effectGroupId: 'C1::onClick', callsiteOrdinal: 0,
        }),
        // W2 triggers onSave → calls S2
        edge('wth-2', 'W2', 'WIDGET_TRIGGERS_HANDLER', 'C1', {
          handler: { componentId: 'C1', methodName: 'onSave' },
          effectGroupId: 'C1::onSave',
        }),
        edge('ccs-2', 'C1', 'COMPONENT_CALLS_SERVICE', 'S2', {
          effectGroupId: 'C1::onSave', callsiteOrdinal: 0,
        }),
      ],
    );

    const result = enumerateTaskWorkflows(b);
    expect(result.workflows.length).toBe(2);

    const w1 = result.workflows.find(w => w.triggerEdgeId === 'wth-1')!;
    expect(w1.steps.map(s => s.edgeId)).toEqual(['wth-1', 'ccs-1']);

    const w2 = result.workflows.find(w => w.triggerEdgeId === 'wth-2')!;
    expect(w2.steps.map(s => s.edgeId)).toEqual(['wth-2', 'ccs-2']);
  });
});

// ---------------------------------------------------------------------------
// 7. CCS ordered by callsiteOrdinal
// ---------------------------------------------------------------------------

describe('TaskEnumerator — CCS ordering', () => {
  it('orders CCS edges by callsiteOrdinal', () => {
    const b = bundle(
      [
        routeNode('R1', '/', { isEntry: true }),
        componentNode('C1', 'Home'),
        widgetNode('W1', 'C1'),
        serviceNode('S1', 'ServiceA'),
        serviceNode('S2', 'ServiceB'),
      ],
      [
        edge('rac-1', 'R1', 'ROUTE_ACTIVATES_COMPONENT', 'C1'),
        edge('ccw-1', 'C1', 'COMPONENT_CONTAINS_WIDGET', 'W1'),
        edge('wth-1', 'W1', 'WIDGET_TRIGGERS_HANDLER', 'C1', {
          handler: { componentId: 'C1', methodName: 'onSave' },
          effectGroupId: 'C1::onSave',
        }),
        // CCS edges in reverse order in the bundle
        edge('ccs-b', 'C1', 'COMPONENT_CALLS_SERVICE', 'S2', {
          effectGroupId: 'C1::onSave', callsiteOrdinal: 1,
        }),
        edge('ccs-a', 'C1', 'COMPONENT_CALLS_SERVICE', 'S1', {
          effectGroupId: 'C1::onSave', callsiteOrdinal: 0,
        }),
      ],
    );

    const result = enumerateTaskWorkflows(b);
    const w = result.workflows[0]!;
    expect(w.steps.map(s => s.edgeId)).toEqual(['wth-1', 'ccs-a', 'ccs-b']);
  });
});

// ---------------------------------------------------------------------------
// 8. Redirect closure on WNR target
// ---------------------------------------------------------------------------

describe('TaskEnumerator — redirect closure', () => {
  it('follows redirects at WNR target and includes redirect steps', () => {
    const b = bundle(
      [
        routeNode('R1', '/', { isEntry: true }),
        routeNode('R2', '/old'),
        routeNode('R3', '/new'),
        componentNode('C1', 'Home'),
        widgetNode('W1', 'C1'),
        componentNode('C3', 'New'),
      ],
      [
        edge('rac-1', 'R1', 'ROUTE_ACTIVATES_COMPONENT', 'C1'),
        edge('ccw-1', 'C1', 'COMPONENT_CONTAINS_WIDGET', 'W1'),
        edge('wnr-1', 'W1', 'WIDGET_NAVIGATES_ROUTE', 'R2', { targetRouteId: 'R2' }),
        edge('redir-1', 'R2', 'ROUTE_REDIRECTS_TO_ROUTE', 'R3', {
          isSystem: true, targetRouteId: 'R3',
        }),
        edge('rac-3', 'R3', 'ROUTE_ACTIVATES_COMPONENT', 'C3'),
      ],
    );

    const result = enumerateTaskWorkflows(b);
    const w = result.workflows[0]!;
    expect(w.steps.map(s => s.edgeId)).toEqual(['wnr-1', 'redir-1']);
    expect(w.terminalNodeId).toBe('R3');
    expect(w.meta.redirectClosureStabilized).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 9. Redirect loop detection
// ---------------------------------------------------------------------------

describe('TaskEnumerator — redirect loop', () => {
  it('detects redirect loop at entry and skips trigger enumeration', () => {
    const b = bundle(
      [
        routeNode('R1', '/', { isEntry: true }),
        routeNode('R2', '/bounce'),
      ],
      [
        edge('redir-1', 'R1', 'ROUTE_REDIRECTS_TO_ROUTE', 'R2', {
          isSystem: true, targetRouteId: 'R2',
        }),
        edge('redir-2', 'R2', 'ROUTE_REDIRECTS_TO_ROUTE', 'R1', {
          isSystem: true, targetRouteId: 'R1',
        }),
      ],
    );

    const result = enumerateTaskWorkflows(b);
    // Entry redirect loop → no active widgets → no task workflows
    expect(result.workflows.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 10. Entry route aggregation
// ---------------------------------------------------------------------------

describe('TaskEnumerator — entry route aggregation', () => {
  it('aggregates startRouteIds when same trigger is active on multiple entries', () => {
    // R1 and R2 both activate C1. Shared widget W1 appears in both contexts.
    const b = bundle(
      [
        routeNode('R1', '/', { isEntry: true }),
        routeNode('R2', '/about', { isEntry: true }),
        componentNode('C1', 'Shared'),
        widgetNode('W1', 'C1'),
      ],
      [
        edge('rac-1', 'R1', 'ROUTE_ACTIVATES_COMPONENT', 'C1'),
        edge('rac-2', 'R2', 'ROUTE_ACTIVATES_COMPONENT', 'C1'),
        edge('ccw-1', 'C1', 'COMPONENT_CONTAINS_WIDGET', 'W1'),
        edge('wth-1', 'W1', 'WIDGET_TRIGGERS_HANDLER', 'C1', {
          handler: { componentId: 'C1', methodName: 'onClick' },
          effectGroupId: 'C1::onClick',
        }),
      ],
    );

    const result = enumerateTaskWorkflows(b);
    // Single task workflow (deduplicated by triggerEdgeId)
    expect(result.workflows.length).toBe(1);
    const w = result.workflows[0]!;
    expect(w.startRouteIds).toEqual(['R1', 'R2']);
  });
});

// ---------------------------------------------------------------------------
// 11. Classification integration
// ---------------------------------------------------------------------------

describe('TaskEnumerator — classification', () => {
  it('classifies FEASIBLE task with no constraints', () => {
    const b = bundle(
      [
        routeNode('R1', '/', { isEntry: true }),
        componentNode('C1', 'Home'),
        widgetNode('W1', 'C1'),
      ],
      [
        edge('rac-1', 'R1', 'ROUTE_ACTIVATES_COMPONENT', 'C1'),
        edge('ccw-1', 'C1', 'COMPONENT_CONTAINS_WIDGET', 'W1'),
        edge('wth-1', 'W1', 'WIDGET_TRIGGERS_HANDLER', 'C1', {
          handler: { componentId: 'C1', methodName: 'onClick' },
          effectGroupId: 'C1::onClick',
        }),
      ],
    );

    const result = enumerateTaskWorkflows(b);
    expect(result.workflows[0]!.verdict).toBe('FEASIBLE');
    expect(result.partitions.feasibleIds).toContain('wth-1');
  });

  it('classifies CONDITIONAL for unresolved navigation', () => {
    const b = bundle(
      [
        routeNode('R1', '/', { isEntry: true }),
        componentNode('C1', 'Home'),
        widgetNode('W1', 'C1'),
      ],
      [
        edge('rac-1', 'R1', 'ROUTE_ACTIVATES_COMPONENT', 'C1'),
        edge('ccw-1', 'C1', 'COMPONENT_CONTAINS_WIDGET', 'W1'),
        edge('wnr-1', 'W1', 'WIDGET_NAVIGATES_ROUTE', null, {
          targetRouteId: null, targetText: 'this.dynamicUrl',
        }),
      ],
    );

    const result = enumerateTaskWorkflows(b);
    expect(result.workflows[0]!.verdict).toBe('CONDITIONAL');
    expect(result.partitions.conditionalIds).toContain('wnr-1');
  });

  it('classifies CONDITIONAL for routes with required params', () => {
    const paramCS: ConstraintSurface = {
      requiredParams: ['id'],
      guards: [],
      roles: [],
      uiAtoms: [],
      evidence: [],
    };
    const b = bundle(
      [
        routeNode('R1', '/', { isEntry: true }),
        routeNode('R2', '/users/:id'),
        componentNode('C1', 'Home'),
        widgetNode('W1', 'C1'),
      ],
      [
        edge('rac-1', 'R1', 'ROUTE_ACTIVATES_COMPONENT', 'C1'),
        edge('ccw-1', 'C1', 'COMPONENT_CONTAINS_WIDGET', 'W1'),
        edge('wnr-1', 'W1', 'WIDGET_NAVIGATES_ROUTE', 'R2', {
          targetRouteId: 'R2', constraints: paramCS,
        }),
      ],
    );

    const result = enumerateTaskWorkflows(b);
    expect(result.workflows[0]!.verdict).toBe('CONDITIONAL');
    expect(result.workflows[0]!.explanation.missingParams).toEqual(['id']);
  });
});

// ---------------------------------------------------------------------------
// 12. Determinism
// ---------------------------------------------------------------------------

describe('TaskEnumerator — determinism', () => {
  it('produces identical output across two runs', () => {
    const b = bundle(
      [
        routeNode('R1', '/', { isEntry: true }),
        routeNode('R2', '/about', { isEntry: true }),
        componentNode('C1', 'Home'),
        componentNode('C2', 'About'),
        widgetNode('W1', 'C1'),
        widgetNode('W2', 'C2'),
        serviceNode('S1', 'ApiService'),
      ],
      [
        edge('rac-1', 'R1', 'ROUTE_ACTIVATES_COMPONENT', 'C1'),
        edge('rac-2', 'R2', 'ROUTE_ACTIVATES_COMPONENT', 'C2'),
        edge('ccw-1', 'C1', 'COMPONENT_CONTAINS_WIDGET', 'W1'),
        edge('ccw-2', 'C2', 'COMPONENT_CONTAINS_WIDGET', 'W2'),
        edge('wth-1', 'W1', 'WIDGET_TRIGGERS_HANDLER', 'C1', {
          handler: { componentId: 'C1', methodName: 'onClick' },
          effectGroupId: 'C1::onClick',
        }),
        edge('ccs-1', 'C1', 'COMPONENT_CALLS_SERVICE', 'S1', {
          effectGroupId: 'C1::onClick', callsiteOrdinal: 0,
        }),
        edge('wnr-1', 'W2', 'WIDGET_NAVIGATES_ROUTE', 'R1', { targetRouteId: 'R1' }),
      ],
    );

    const result1 = enumerateTaskWorkflows(b);
    const result2 = enumerateTaskWorkflows(b);

    expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
  });
});

// ---------------------------------------------------------------------------
// 13. Stats correctness
// ---------------------------------------------------------------------------

describe('TaskEnumerator — stats', () => {
  it('reports correct counts in stats and partitions', () => {
    const b = bundle(
      [
        routeNode('R1', '/', { isEntry: true }),
        componentNode('C1', 'Home'),
        widgetNode('W1', 'C1'),
        widgetNode('W2', 'C1'),
      ],
      [
        edge('rac-1', 'R1', 'ROUTE_ACTIVATES_COMPONENT', 'C1'),
        edge('ccw-1', 'C1', 'COMPONENT_CONTAINS_WIDGET', 'W1'),
        edge('ccw-2', 'C1', 'COMPONENT_CONTAINS_WIDGET', 'W2'),
        edge('wth-1', 'W1', 'WIDGET_TRIGGERS_HANDLER', 'C1', {
          handler: { componentId: 'C1', methodName: 'onClick' },
          effectGroupId: 'C1::onClick',
        }),
        edge('wnr-1', 'W2', 'WIDGET_NAVIGATES_ROUTE', null, {
          targetRouteId: null, targetText: 'dynamic',
        }),
      ],
    );

    const result = enumerateTaskWorkflows(b);
    expect(result.stats.workflowCount).toBe(2);
    expect(result.stats.triggerEdgeCount).toBe(2);
    expect(result.stats.enumeratedRouteCount).toBe(1);
    expect(result.stats.feasibleCount + result.stats.conditionalCount + result.stats.prunedCount).toBe(2);
    expect(result.partitions.feasibleIds.length + result.partitions.conditionalIds.length + result.partitions.prunedIds.length).toBe(2);
  });

  it('produces empty output for graph with no entry routes', () => {
    const b = bundle(
      [routeNode('R1', '/')],
      [],
    );
    const result = enumerateTaskWorkflows(b);
    expect(result.workflows.length).toBe(0);
    expect(result.stats.workflowCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 14. WSF trigger with effects
// ---------------------------------------------------------------------------

describe('TaskEnumerator — WSF with effects', () => {
  it('WSF trigger collects handler-scoped CCS', () => {
    const b = bundle(
      [
        routeNode('R1', '/', { isEntry: true }),
        componentNode('C1', 'Home'),
        widgetNode('W1', 'C1', 'Form'),
        serviceNode('S1', 'ApiService'),
      ],
      [
        edge('rac-1', 'R1', 'ROUTE_ACTIVATES_COMPONENT', 'C1'),
        edge('ccw-1', 'C1', 'COMPONENT_CONTAINS_WIDGET', 'W1'),
        edge('wsf-1', 'W1', 'WIDGET_SUBMITS_FORM', 'C1', {
          handler: { componentId: 'C1', methodName: 'onSubmit' },
          effectGroupId: 'C1::onSubmit',
        }),
        edge('ccs-1', 'C1', 'COMPONENT_CALLS_SERVICE', 'S1', {
          effectGroupId: 'C1::onSubmit', callsiteOrdinal: 0,
        }),
      ],
    );

    const result = enumerateTaskWorkflows(b);
    expect(result.workflows.length).toBe(1);
    const w = result.workflows[0]!;
    expect(w.steps.map(s => s.edgeId)).toEqual(['wsf-1', 'ccs-1']);
    expect(w.steps[0]!.kind).toBe('WIDGET_SUBMITS_FORM');
  });
});

// ---------------------------------------------------------------------------
// 15. Shared component non-explosion
// ---------------------------------------------------------------------------

describe('TaskEnumerator — shared component', () => {
  it('shared component triggers are deduplicated across entry routes', () => {
    // MainNav is shared across all 3 entry routes. Should produce 1 task, not 3.
    const b = bundle(
      [
        routeNode('R1', '/', { isEntry: true }),
        routeNode('R2', '/about', { isEntry: true }),
        routeNode('R3', '/contact', { isEntry: true }),
        componentNode('Nav', 'MainNav'),
        widgetNode('W1', 'Nav'),
      ],
      [
        edge('rac-1', 'R1', 'ROUTE_ACTIVATES_COMPONENT', 'Nav'),
        edge('rac-2', 'R2', 'ROUTE_ACTIVATES_COMPONENT', 'Nav'),
        edge('rac-3', 'R3', 'ROUTE_ACTIVATES_COMPONENT', 'Nav'),
        edge('ccw-1', 'Nav', 'COMPONENT_CONTAINS_WIDGET', 'W1'),
        edge('wth-1', 'W1', 'WIDGET_TRIGGERS_HANDLER', 'Nav', {
          handler: { componentId: 'Nav', methodName: 'onClick' },
          effectGroupId: 'Nav::onClick',
        }),
      ],
    );

    const result = enumerateTaskWorkflows(b);
    expect(result.workflows.length).toBe(1);
    expect(result.workflows[0]!.startRouteIds).toEqual(['R1', 'R2', 'R3']);
  });
});
