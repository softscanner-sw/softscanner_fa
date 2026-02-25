/**
 * navigation-graph-builder.ts
 * Builds the AppNavigation multigraph from all Phase 1 extraction results.
 *
 * Node types emitted:
 *   Virtual   — one entry node ("__entry__")
 *   Route     — one per Route in RouteMap
 *   Component — one per ComponentInfo in ComponentRegistry
 *   External  — one per unique external URL (deterministic hashed id)
 *
 * Edge model: one GraphEdge per transition (multigraph semantics).
 * Edge IDs follow spec §3.4.1: ${from}::${transition.signature}::${to}::${stableIndex}
 * Transition signature follows spec §3.4.2 (12-field pipe-delimited string).
 * Transition ordering follows spec §3.4.3 (7-field sort key).
 *
 * Edge types:
 *   NAVIGATE_ROUTE   — __entry__→route, routerLink bindings, navigate() call-contexts
 *   NAVIGATE_EXTERNAL — href bindings + external-URL call-contexts
 *   REDIRECT         — RedirectRoute declarations
 *   UI_EFFECT        — Route→Component structural binding (ComponentRoute only)
 *
 * Prohibited:
 *   - Workflow enumeration
 *   - Coverage computation
 *   - Execution artifacts
 */

import type { AnalyzerConfig } from '../models/analyzer-config.js';
import type { ComponentRouteMap } from '../models/routes.js';
import type { ComponentRegistry } from '../models/components.js';
import type { ModuleRegistry } from '../models/module.js';
import type { WidgetInfo } from '../models/widgets.js';
import type { WidgetEventMap } from '../models/events.js';
import type {
  AppNavigation,
  GraphNode,
  GraphEdge,
  GraphTransition,
  TransitionKind,
} from '../models/navigation-graph.js';
import type { Predicate } from '../models/constraints.js';
import { SilentLogger } from '../services/logger.js';
import type { Logger } from '../services/logger.js';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface TransitionEntry {
  transition: GraphTransition;
  /**
   * Canonical target string for signature computation (spec §3.4.2):
   *   NAVIGATE_ROUTE / REDIRECT → Route.id
   *   NAVIGATE_EXTERNAL         → raw URL string
   *   UI_EFFECT / other         → target GraphNode.id
   */
  normalizedTarget: string;
}

interface EdgeAccumulator {
  from: string;
  to: string;
  entries: TransitionEntry[];
}

// ---------------------------------------------------------------------------
// Module-level helpers (pure functions — no side effects)
// ---------------------------------------------------------------------------

/**
 * FNV-1a 32-bit hash — deterministic, dependency-free.
 * Used for stable External node IDs (spec §1.2).
 */
function _fnv1a32(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Stable External node id per spec §1.2. */
export function externalNodeId(url: string): string {
  return `__ext__${_fnv1a32(url)}`;
}

/**
 * Transition signature per spec §3.4.2.
 * 12 pipe-delimited fields in canonical order.
 * Missing/undefined fields → "" (string) or 0 (numeric).
 */
export function computeTransitionSignature(
  t: GraphTransition,
  normalizedTarget: string,
): string {
  const kind = t.kind;
  const navType = t.trigger?.navType ?? '';
  const eventType = t.trigger?.eventType ?? '';
  const widgetId = t.trigger?.widgetId ?? '';
  const handlerName = t.handler?.name ?? '';
  const handlerFile = t.handler?.origin?.file ?? '';
  const handlerLine = t.handler?.origin?.startLine ?? 0;
  const handlerCol = t.handler?.origin?.startCol ?? 0;
  const originFile = t.origin.file;
  const originLine = t.origin.startLine;
  const originCol = t.origin.startCol;
  // normalizedTarget must be non-empty (fallback to to-node id handled by caller)
  const nt = normalizedTarget.trim() || originFile;
  return (
    `${kind}|${navType}|${eventType}|${widgetId}|${handlerName}|` +
    `${handlerFile}|${handlerLine}|${handlerCol}|` +
    `${originFile}|${originLine}|${originCol}|${nt}`
  );
}

/**
 * 7-field transition comparator per spec §3.4.3.
 * Used to establish stable ordering before stableIndex assignment.
 */
export function compareTransitions(a: GraphTransition, b: GraphTransition): number {
  // 1. kind
  const kindCmp = a.kind.localeCompare(b.kind);
  if (kindCmp !== 0) return kindCmp;

  // 2. trigger.eventType (fallback "")
  const aEvt = a.trigger?.eventType ?? '';
  const bEvt = b.trigger?.eventType ?? '';
  const evtCmp = aEvt.localeCompare(bEvt);
  if (evtCmp !== 0) return evtCmp;

  // 3. origin.file
  const fileCmp = a.origin.file.localeCompare(b.origin.file);
  if (fileCmp !== 0) return fileCmp;

  // 4. origin.startLine
  const lineCmp = (a.origin.startLine ?? 0) - (b.origin.startLine ?? 0);
  if (lineCmp !== 0) return lineCmp;

  // 5. origin.startCol
  const colCmp = (a.origin.startCol ?? 0) - (b.origin.startCol ?? 0);
  if (colCmp !== 0) return colCmp;

  // 6. trigger.widgetId (fallback "")
  const aWid = a.trigger?.widgetId ?? '';
  const bWid = b.trigger?.widgetId ?? '';
  const widCmp = aWid.localeCompare(bWid);
  if (widCmp !== 0) return widCmp;

  // 7. handler.name (fallback "")
  const aHandler = a.handler?.name ?? '';
  const bHandler = b.handler?.name ?? '';
  return aHandler.localeCompare(bHandler);
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export class NavigationGraphBuilder {
  private readonly _log: Logger;

  constructor(_cfg: AnalyzerConfig, logger?: Logger) {
    this._log = logger ?? new SilentLogger();
  }

  build(
    componentRouteMap: ComponentRouteMap,
    componentRegistry: ComponentRegistry,
    widgetEventMaps: WidgetEventMap[],
    moduleRegistry?: ModuleRegistry,
    widgetsByComponentId?: Map<string, WidgetInfo[]>,
  ): AppNavigation {
    void moduleRegistry; // reserved for future module-level graph enrichment

    const { routeMap } = componentRouteMap;

    // ── 1. Build nodes ───────────────────────────────────────────────────────

    const nodes: GraphNode[] = [];
    const nodeIds = new Set<string>();

    // (A) Virtual entry node
    const entryNode: GraphNode = { id: '__entry__', type: 'Virtual', label: 'Entry' };
    nodes.push(entryNode);
    nodeIds.add(entryNode.id);

    // (B) Route nodes — one per Route in RouteMap (routeMap.routes already sorted by fullPath)
    for (const route of routeMap.routes) {
      const node: GraphNode = {
        id: route.id,
        type: 'Route',
        label: route.fullPath,
        origin: route.origin,
        routeId: route.id,
      };
      if (route.kind === 'ComponentRoute') {
        node.componentId = route.componentId;
      }
      nodes.push(node);
      nodeIds.add(route.id);
    }

    // (C) Component nodes — one per ComponentInfo in ComponentRegistry (sorted by id)
    const sortedComponents = [...componentRegistry.components].sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    for (const comp of sortedComponents) {
      const node: GraphNode = {
        id: comp.id,
        type: 'Component',
        label: comp.symbol.className,
        origin: comp.origin,
        componentId: comp.id,
      };
      nodes.push(node);
      nodeIds.add(comp.id);
    }

    // External nodes added on demand; collected here for deferred node-list insertion
    const externalNodes = new Map<string, GraphNode>();
    const getOrCreateExternalNode = (url: string): string => {
      const id = externalNodeId(url);
      if (!externalNodes.has(id)) {
        const node: GraphNode = { id, type: 'External', label: url, url };
        externalNodes.set(id, node);
        nodeIds.add(id);
      }
      return id;
    };

    // ── 2. Accumulate transitions ─────────────────────────────────────────────

    const edgeMap = new Map<string, EdgeAccumulator>();

    const addTransition = (
      from: string,
      to: string,
      transition: GraphTransition,
      normalizedTarget: string,
    ): void => {
      if (!nodeIds.has(from) || !nodeIds.has(to)) return;
      const key = `${from}::${to}`;
      let acc = edgeMap.get(key);
      if (acc === undefined) {
        acc = { from, to, entries: [] };
        edgeMap.set(key, acc);
      }
      acc.entries.push({ transition, normalizedTarget });
    };

    // Path → routeId lookup for resolving routerLink and navigate() targets
    const pathToRouteId = new Map<string, string>();
    for (const route of routeMap.routes) {
      pathToRouteId.set(route.fullPath, route.id);
    }

    // (A) Entry → root-level routes (spec §3.3-A)
    for (const route of routeMap.routes) {
      if (route.parentId === undefined && route.fullPath !== '/**') {
        addTransition(
          '__entry__',
          route.id,
          { kind: 'NAVIGATE_ROUTE', origin: route.origin, uiPreconditions: [] },
          route.id,
        );
      }
    }

    // (B) Route → Component structural binding — UI_EFFECT (spec §3.3-B)
    for (const route of routeMap.routes) {
      if (route.kind !== 'ComponentRoute') continue;
      const compId = route.componentId;
      if (
        compId === '__unknown__' ||
        compId.startsWith('__unresolved__') ||
        !nodeIds.has(compId)
      ) {
        continue;
      }
      addTransition(
        route.id,
        compId,
        { kind: 'UI_EFFECT', origin: route.origin, uiPreconditions: [] },
        compId,
      );
    }

    // (C) Redirect transitions (spec §3.3-C)
    for (const route of routeMap.routes) {
      if (route.kind !== 'RedirectRoute') continue;
      const targetId = pathToRouteId.get(route.redirectToFullPath);
      if (targetId !== undefined) {
        addTransition(
          route.id,
          targetId,
          { kind: 'REDIRECT', origin: route.origin, uiPreconditions: [] },
          targetId,
        );
      }
    }

    // (D) Widget binding transitions — source = Component node (spec §3.3-D)
    if (widgetsByComponentId !== undefined) {
      for (const [componentId, widgets] of widgetsByComponentId) {
        if (!nodeIds.has(componentId)) continue;

        for (const widget of widgets) {
          const allPredicates: Predicate[] = [
            ...widget.visibilityPredicates,
            ...widget.enablementPredicates,
          ];

          for (const binding of widget.bindings) {
            const name = binding.name.toLowerCase();

            if (name === 'routerlink') {
              const targetPath = this._normalizeRouterLinkValue(binding.value ?? '');
              const targetId = targetPath !== null ? pathToRouteId.get(targetPath) : undefined;
              if (targetId !== undefined) {
                addTransition(
                  componentId,
                  targetId,
                  {
                    kind: 'NAVIGATE_ROUTE',
                    trigger: { widgetId: widget.id, eventType: 'click', navType: 'routerLink' },
                    origin: binding.origin,
                    uiPreconditions: allPredicates,
                  },
                  targetId,
                );
              }
            }

            if (name === 'href' && this._isExternal(binding.value ?? '')) {
              const url = binding.value ?? '';
              const extId = getOrCreateExternalNode(url);
              addTransition(
                componentId,
                extId,
                {
                  kind: 'NAVIGATE_EXTERNAL',
                  trigger: { widgetId: widget.id, eventType: 'click', navType: 'href' },
                  origin: binding.origin,
                  uiPreconditions: allPredicates,
                },
                url,
              );
            }
          }
        }
      }
    }

    // (E) Handler call-context transitions — source = Component node (spec §3.3-E)
    for (const wem of widgetEventMaps) {
      const sourceComponentId = wem.componentId;
      if (!nodeIds.has(sourceComponentId)) continue;

      const widgetInfos = widgetsByComponentId?.get(sourceComponentId) ?? [];
      const widgetInfoMap = new Map(widgetInfos.map((w) => [w.id, w]));

      for (const event of wem.events) {
        const widget = widgetInfoMap.get(event.widgetId);
        const uiPreconditions: Predicate[] = widget
          ? [...widget.visibilityPredicates, ...widget.enablementPredicates]
          : [];

        for (const ctx of event.callContexts) {
          let kind: TransitionKind = 'UNKNOWN';
          let targetNodeId: string | undefined;
          let normalizedTarget: string | undefined;

          if (ctx.kind === 'Navigate' && ctx.target?.route !== undefined) {
            kind = 'NAVIGATE_ROUTE';
            const resolved = this._resolveNavigatePath(ctx.target.route, pathToRouteId);
            targetNodeId = resolved;
            normalizedTarget = resolved;
          } else if (ctx.kind === 'Navigate' && ctx.target?.url !== undefined) {
            kind = 'NAVIGATE_EXTERNAL';
            targetNodeId = getOrCreateExternalNode(ctx.target.url);
            normalizedTarget = ctx.target.url;
          } else if (ctx.kind === 'ServiceCall') {
            kind = 'SERVICE_CALL';
          }

          if (targetNodeId === undefined || normalizedTarget === undefined) continue;

          const trigger: NonNullable<GraphTransition['trigger']> = {};
          if (event.widgetId !== undefined) trigger.widgetId = event.widgetId;
          if (event.eventType !== undefined) trigger.eventType = event.eventType;
          if (ctx.kind === 'Navigate') trigger.navType = 'programmaticNavigate';

          const transition: GraphTransition = {
            kind,
            trigger,
            origin: ctx.origin,
            uiPreconditions,
          };
          if (event.handlerName !== undefined) {
            const h: NonNullable<GraphTransition['handler']> = { name: event.handlerName };
            if (event.handlerOrigin !== undefined) h.origin = event.handlerOrigin;
            transition.handler = h;
          }

          addTransition(sourceComponentId, targetNodeId, transition, normalizedTarget);
        }
      }
    }

    // ── 3. Add external nodes ─────────────────────────────────────────────────

    nodes.push(...externalNodes.values());

    // ── 4. Sort nodes by id (spec §3.4.3) ────────────────────────────────────

    nodes.sort((a, b) => a.id.localeCompare(b.id));

    // ── 5. Build edges — one GraphEdge per transition (spec §3.4.1) ──────────

    const edges: GraphEdge[] = [];

    for (const acc of edgeMap.values()) {
      // Sort entries by 7-field transition sort key (spec §3.4.3)
      const sorted = [...acc.entries].sort((a, b) =>
        compareTransitions(a.transition, b.transition),
      );

      // Assign stableIndex and build one edge per transition
      for (let stableIndex = 0; stableIndex < sorted.length; stableIndex++) {
        const entry = sorted[stableIndex];
        if (entry === undefined) continue;
        const { transition, normalizedTarget } = entry;
        const sig = computeTransitionSignature(transition, normalizedTarget);
        const id = `${acc.from}::${sig}::${acc.to}::${stableIndex}`;
        edges.push({ id, from: acc.from, to: acc.to, transitions: [transition] });
      }
    }

    // Sort edges by id lexicographically (spec §3.4.3)
    edges.sort((a, b) => a.id.localeCompare(b.id));

    // ── 6. Entry node IDs ─────────────────────────────────────────────────────

    const entryNodeIds = [
      '__entry__',
      ...routeMap.routes
        .filter((r) => r.parentId === undefined && r.fullPath !== '/**')
        .map((r) => r.id)
        .sort(),
    ];

    this._log.debug('Navigation graph built', { nodes: nodes.length, edges: edges.length });

    return {
      nodes,
      edges,
      entryNodeIds: [...new Set(entryNodeIds)].sort(),
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private _normalizeRouterLinkValue(value: string): string | null {
    // Strip array syntax: ['/admin', 'users'] → '/admin/users'
    if (value.startsWith('[')) {
      const parts = value
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter((s) => s.length > 0);
      return '/' + parts.join('/').replace(/^\//, '');
    }
    const stripped = value.replace(/^['"]|['"]$/g, '');
    if (stripped.startsWith('/')) return stripped;
    if (stripped.startsWith('./') || stripped.startsWith('../')) return null; // relative — skip
    return `/${stripped}`;
  }

  private _isExternal(url: string): boolean {
    return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//');
  }

  private _resolveNavigatePath(
    rawPath: string,
    pathToRouteId: Map<string, string>,
  ): string | undefined {
    const clean = rawPath.replace(/^['"\[]|['"]\]?$/g, '').trim();
    return pathToRouteId.get(clean) ?? pathToRouteId.get(`/${clean}`);
  }
}
