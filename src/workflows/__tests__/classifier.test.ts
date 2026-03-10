/**
 * classifier.test.ts
 *
 * Tests for the shared constraint merge utility (mergeConstraints).
 *
 * Covers:
 *   - Constraint merge (set union, concat, evidence dedup)
 *
 * Isolation: uses only Phase1Bundle fixtures. No AST, parsers, or A1 internals.
 */

import type { Atom, ConstraintSurface, Edge, Node, Phase1Bundle, SourceRef, SpecWidgetKind } from '../../models/multigraph.js';
import { buildGraphIndex } from '../graph-index.js';
import { mergeConstraints } from '../classifier.js';

// ---------------------------------------------------------------------------
// Fixture helpers (same pattern as enumerator.test.ts)
// ---------------------------------------------------------------------------

const REF: SourceRef = { file: 'test.ts', start: 0, end: 10 };
const REF2: SourceRef = { file: 'test2.ts', start: 20, end: 30 };

const EMPTY_CS: ConstraintSurface = {
  requiredParams: [],
  guards: [],
  roles: [],
  uiAtoms: [],
  evidence: [],
};

function routeNode(id: string, fullPath: string, opts: { isEntry?: boolean } = {}): Node {
  return {
    id, kind: 'Route', label: fullPath, refs: [REF],
    meta: {
      fullPath, path: fullPath, isTopLevel: true,
      isEntry: opts.isEntry ?? false, isWildcard: false, params: [], guards: [], roles: [],
      routeType: 'ComponentRoute' as const,
    },
  };
}

function componentNode(id: string): Node {
  return { id, kind: 'Component', label: id, refs: [REF], meta: { name: id, file: 'test.ts' } };
}

function widgetNode(id: string, componentId: string, kind: SpecWidgetKind = 'Button'): Node {
  return {
    id, kind: 'Widget', label: `widget:${id}`, refs: [REF],
    meta: { componentId, widgetKind: kind, eventNames: ['click'], eventHandlerTextByName: {}, ui: { rawAttrsText: {} } },
  };
}

function edge(
  from: string,
  kind: Edge['kind'],
  to: string | null,
  opts: {
    isSystem?: boolean;
    handler?: Edge['handler'];
    targetRouteId?: string | null;
    targetText?: string;
    constraints?: ConstraintSurface;
  } = {},
): Edge {
  const toStr = to ?? '__null__';
  const id = `${from}::${kind}::${toStr}::0`;
  const result: Edge = {
    id, kind, from, to,
    constraints: opts.constraints ?? EMPTY_CS,
    refs: [REF],
  };
  if (opts.isSystem !== undefined) result.isSystem = opts.isSystem;
  if (opts.handler !== undefined) result.handler = opts.handler;
  if (opts.targetRouteId !== undefined) result.targetRouteId = opts.targetRouteId;
  if (opts.targetText !== undefined) result.targetText = opts.targetText;
  return result;
}

function makeBundle(nodes: Node[], edges: Edge[]): Phase1Bundle {
  return {
    multigraph: {
      nodes: [...nodes].sort((a, b) => a.id.localeCompare(b.id)),
      edges: [...edges].sort((a, b) => a.id.localeCompare(b.id)),
    },
    stats: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      structuralEdgeCount: 0,
      executableEdgeCount: edges.length,
    },
  };
}

// ---------------------------------------------------------------------------
// mergeConstraints tests
// ---------------------------------------------------------------------------

describe('mergeConstraints', () => {
  it('merges requiredParams as set union', () => {
    const e1 = edge('W1', 'WIDGET_NAVIGATES_ROUTE', 'R2', {
      constraints: { ...EMPTY_CS, requiredParams: ['id', 'name'] },
    });
    const e2 = edge('W2', 'WIDGET_NAVIGATES_ROUTE', 'R3', {
      constraints: { ...EMPTY_CS, requiredParams: ['name', 'type'] },
    });
    const bundle = makeBundle(
      [routeNode('R1', '/', { isEntry: true }), routeNode('R2', '/a'), routeNode('R3', '/b'),
       componentNode('C1'), widgetNode('W1', 'C1'), widgetNode('W2', 'C1')],
      [e1, e2],
    );
    const index = buildGraphIndex(bundle);
    const merged = mergeConstraints([e1.id, e2.id], index);
    expect(merged.requiredParams).toEqual(['id', 'name', 'type']);
  });

  it('merges guards as set union', () => {
    const e1 = edge('W1', 'WIDGET_NAVIGATES_ROUTE', 'R2', {
      constraints: { ...EMPTY_CS, guards: ['AuthGuard'] },
    });
    const e2 = edge('W2', 'WIDGET_NAVIGATES_ROUTE', 'R3', {
      constraints: { ...EMPTY_CS, guards: ['AuthGuard', 'AdminGuard'] },
    });
    const bundle = makeBundle(
      [routeNode('R1', '/', { isEntry: true }), routeNode('R2', '/a'), routeNode('R3', '/b'),
       componentNode('C1'), widgetNode('W1', 'C1'), widgetNode('W2', 'C1')],
      [e1, e2],
    );
    const index = buildGraphIndex(bundle);
    const merged = mergeConstraints([e1.id, e2.id], index);
    expect(merged.guards).toEqual(['AuthGuard', 'AdminGuard']);
  });

  it('merges uiAtoms by concatenation preserving order', () => {
    const atom1: Atom = { kind: 'WidgetVisible', args: ['W1', 'false'], source: REF };
    const atom2: Atom = { kind: 'FormValid', args: ['W2'], source: REF };
    const e1 = edge('W1', 'WIDGET_TRIGGERS_HANDLER', 'C1', {
      constraints: { ...EMPTY_CS, uiAtoms: [atom1] },
    });
    const e2 = edge('W2', 'WIDGET_SUBMITS_FORM', 'C1', {
      constraints: { ...EMPTY_CS, uiAtoms: [atom2] },
    });
    const bundle = makeBundle(
      [routeNode('R1', '/', { isEntry: true }), componentNode('C1'), widgetNode('W1', 'C1'), widgetNode('W2', 'C1')],
      [e1, e2],
    );
    const index = buildGraphIndex(bundle);
    const merged = mergeConstraints([e1.id, e2.id], index);
    expect(merged.uiAtoms).toHaveLength(2);
    expect(merged.uiAtoms[0]!.kind).toBe('WidgetVisible');
    expect(merged.uiAtoms[1]!.kind).toBe('FormValid');
  });

  it('deduplicates evidence by (file, start, end)', () => {
    const e1 = edge('W1', 'WIDGET_TRIGGERS_HANDLER', 'C1', {
      constraints: { ...EMPTY_CS, evidence: [REF, REF2] },
    });
    const e2 = edge('W2', 'WIDGET_TRIGGERS_HANDLER', 'C1', {
      constraints: { ...EMPTY_CS, evidence: [REF] }, // duplicate of e1's REF
    });
    const bundle = makeBundle(
      [routeNode('R1', '/', { isEntry: true }), componentNode('C1'), widgetNode('W1', 'C1'), widgetNode('W2', 'C1')],
      [e1, e2],
    );
    const index = buildGraphIndex(bundle);
    const merged = mergeConstraints([e1.id, e2.id], index);
    // REF should appear once, REF2 once, plus refs from edges themselves
    const uniqueKeys = new Set(merged.evidence.map(e => `${e.file}:${e.start}:${e.end}`));
    expect(uniqueKeys.size).toBe(merged.evidence.length);
  });
});

