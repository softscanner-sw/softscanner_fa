/**
 * navigation-graph-builder.ts
 * Builds the spec-compliant Multigraph (approach.md §9) from Phase 1 extractions.
 *
 * Node kinds emitted: Module, Route, Component, Widget, Service, External
 * Edge kinds emitted: all 9 structural + all 7 executable per spec §4.
 *
 * Ordering:
 *   - nodes sorted by id lexicographically
 *   - edges sorted by (from, kind, to ?? '', id)
 *
 * Invariants enforced:
 *   - Every edge.from references an existing node id
 *   - edge.to references an existing node id OR is null (unresolved navigation)
 *   - refs non-empty on every node and edge
 *   - No synthetic ENTRY/EXIT/ERROR nodes
 *   - isEntry computed on RouteNodes per spec §5
 */

import * as path from 'node:path';
import type { AnalyzerConfig } from '../models/analyzer-config.js';
import type { ComponentRouteMap, Route, ComponentRoute, RedirectRoute, WildcardRoute } from '../models/routes.js';
import type { ComponentRegistry, ComponentInfo } from '../models/components.js';
import type { ModuleRegistry } from '../models/module.js';
import type { WidgetInfo } from '../models/widgets.js';
import type { WidgetEventMap, EventHandlerCallContext } from '../models/events.js';
import type { Origin } from '../models/origin.js';
import type {
  SourceRef,
  Node,
  Edge,
  EdgeKind,
  Multigraph,
  ModuleNode,
  RouteNode,
  ComponentNode,
  WidgetNode,
  ServiceNode,
  ExternalNode,
  ConstraintSurface,
  SpecWidgetKind,
  TriggerRef,
  HandlerRef,
  WidgetUIProps,
  Atom,
} from '../models/multigraph.js';
import { emptyConstraintSurface, STRUCTURAL_EDGE_KINDS } from '../models/multigraph.js';
import { SilentLogger } from '../services/logger.js';
import type { Logger } from '../services/logger.js';

// ---------------------------------------------------------------------------
// Service info — passed in by orchestrator
// ---------------------------------------------------------------------------

export interface ServiceInfo {
  id: string;
  name: string;
  file: string;
  origin?: Origin;
  providedIn?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** FNV-1a 32-bit hash — deterministic, dependency-free. */
function _fnv1a32(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Stable External node id. */
export function externalNodeId(url: string): string {
  return `__ext__${_fnv1a32(url)}`;
}

/** Convert Origin to SourceRef. */
function toRef(origin: Origin, projectRoot?: string): SourceRef {
  let file = origin.file;
  if (projectRoot !== undefined) {
    file = path.relative(projectRoot, file).replace(/\\/g, '/');
  }
  return { file, start: origin.start ?? 0, end: origin.end ?? 0 };
}

/** Map internal WidgetKind to spec SpecWidgetKind. */
function mapWidgetKind(kind: string): SpecWidgetKind {
  switch (kind) {
    case 'Button': return 'Button';
    case 'Link': return 'Link';
    case 'Form': return 'Form';
    case 'Input': return 'Input';
    case 'Select': return 'Select';
    case 'Option': return 'Option';
    case 'Textarea': return 'TextArea';
    case 'Checkbox': return 'Checkbox';
    case 'RadioGroup': return 'RadioGroup';
    case 'Radio': return 'Radio';
    default: return 'OtherInteractive';
  }
}

// ---------------------------------------------------------------------------
// WidgetUIProps bridge (WidgetInfo → WidgetUIProps per spec §9 lines 464-497)
// ---------------------------------------------------------------------------

/** Return 'true', 'false', or null if not a literal boolean expression. */
function _isLiteralBoolean(expr: string): 'true' | 'false' | null {
  const trimmed = expr.trim();
  if (trimmed === 'true') return 'true';
  if (trimmed === 'false') return 'false';
  return null;
}

/** Attribute/binding names already captured by dedicated WidgetUIProps fields. */
const _UI_CAPTURED_NAMES = new Set([
  'disabled', 'hidden', 'required', 'name', 'formcontrolname',
  'ngmodel', 'type', 'min', 'max', 'minlength', 'maxlength', 'pattern',
  'routerlink', 'href',
]);

/**
 * Build WidgetUIProps from intermediate WidgetInfo data.
 * Bridges existing extraction (predicates, validators, attributes, bindings)
 * to spec-compliant WidgetUIProps (approach.md §9).
 */
function buildWidgetUIProps(widget: WidgetInfo): WidgetUIProps {
  const ui: WidgetUIProps = { rawAttrsText: {} };

  // ── Visibility (from visibilityPredicates) ──
  // Priority: any literal hidden wins; else first non-empty expression
  let visExprCaptured = false;
  for (const pred of widget.visibilityPredicates) {
    if (pred.kind === 'ngIf') {
      const lit = _isLiteralBoolean(pred.expr);
      if (lit === 'false') {
        ui.visibleLiteral = false;
      } else if (lit === null && !visExprCaptured && pred.expr.trim() !== '') {
        ui.visibleExprText = pred.expr;
        visExprCaptured = true;
      }
    } else if (pred.kind === 'hidden') {
      const lit = _isLiteralBoolean(pred.expr);
      if (lit === 'true') {
        // hidden=true → not visible
        ui.visibleLiteral = false;
      } else if (lit === null && !visExprCaptured && pred.expr.trim() !== '') {
        ui.visibleExprText = pred.expr;
        visExprCaptured = true;
      }
    } else if (!visExprCaptured && pred.expr.trim() !== '') {
      // ngSwitchCase, customDirective, permissionDirective
      ui.visibleExprText = pred.expr;
      visExprCaptured = true;
    }
  }

  // ── Enabledness (from enablementPredicates + bare disabled attr) ──
  if ('disabled' in widget.attributes) {
    ui.enabledLiteral = false;
  }
  let enabExprCaptured = false;
  for (const pred of widget.enablementPredicates) {
    if (pred.kind === 'disabled') {
      const lit = _isLiteralBoolean(pred.expr);
      if (lit === 'true') {
        ui.enabledLiteral = false;
      } else if (lit === null && !enabExprCaptured && pred.expr.trim() !== '') {
        ui.enabledExprText = pred.expr;
        enabExprCaptured = true;
      }
    } else if (!enabExprCaptured && pred.expr.trim() !== '') {
      // permissionDirective, customDirective
      ui.enabledExprText = pred.expr;
      enabExprCaptured = true;
    }
  }

  // ── Requiredness ──
  if (widget.validators?.required === true) {
    ui.requiredLiteral = true;
  }
  // Check for [required]="expr" binding
  const requiredBinding = widget.bindings.find(
    (b) => b.kind === 'boundAttr' && b.name.toLowerCase() === 'required',
  );
  if (requiredBinding?.value !== undefined) {
    const lit = _isLiteralBoolean(requiredBinding.value);
    if (lit === 'true') {
      ui.requiredLiteral = true;
    } else if (lit !== 'false' && requiredBinding.value.trim() !== '') {
      ui.requiredExprText = requiredBinding.value;
    }
  }

  // ── Binding captures ──
  if (widget.attributes['name'] !== undefined) {
    ui.nameAttr = widget.attributes['name'];
  }

  // formControlName: attr or boundAttr
  const fcnBinding = widget.bindings.find(
    (b) => b.name.toLowerCase() === 'formcontrolname',
  );
  if (fcnBinding?.value !== undefined) {
    ui.formControlName = fcnBinding.value.replace(/^['"]|['"]$/g, '');
  } else if (widget.attributes['formcontrolname'] !== undefined) {
    ui.formControlName = widget.attributes['formcontrolname'];
  }

  // ngModel
  const ngModelBinding = widget.bindings.find(
    (b) => b.name.toLowerCase() === 'ngmodel' && b.kind === 'boundAttr',
  );
  if (ngModelBinding?.value !== undefined) {
    ui.ngModelText = ngModelBinding.value;
  }

  // ── Input shape constraints ──
  if (widget.attributes['type'] !== undefined) {
    ui.inputType = widget.attributes['type'];
  }
  if (widget.validators?.minLength !== undefined) {
    ui.minLength = widget.validators.minLength;
  }
  if (widget.validators?.maxLength !== undefined) {
    ui.maxLength = widget.validators.maxLength;
  }
  if (widget.validators?.pattern !== undefined) {
    ui.pattern = widget.validators.pattern;
  }
  // min/max from attributes (numeric input constraints)
  const minAttr = widget.attributes['min'];
  if (minAttr !== undefined) {
    const n = Number(minAttr);
    if (!isNaN(n)) ui.min = n;
  }
  const maxAttr = widget.attributes['max'];
  if (maxAttr !== undefined) {
    const n = Number(maxAttr);
    if (!isNaN(n)) ui.max = n;
  }

  // ── rawAttrsText: remaining non-event bindings as catch-all ──
  const rawEntries: Array<[string, string]> = [];
  for (const b of widget.bindings) {
    if (b.kind === 'event') continue;
    if (_UI_CAPTURED_NAMES.has(b.name.toLowerCase())) continue;
    if (b.value !== undefined) {
      rawEntries.push([b.name, b.value]);
    }
  }
  // Deterministic key ordering
  rawEntries.sort((a, b) => a[0].localeCompare(b[0]));
  for (const [k, v] of rawEntries) {
    ui.rawAttrsText[k] = v;
  }

  // Static HTML hidden attribute: <input hidden="true"> or <div hidden>
  const hiddenAttr = widget.attributes['hidden'];
  if (hiddenAttr !== undefined) {
    // hidden="" or hidden="true" or hidden="hidden" — all mean hidden
    if (hiddenAttr === '' || hiddenAttr === 'true' || hiddenAttr === 'hidden') {
      ui.visibleLiteral = false;
    }
  }

  // F3: Heuristic CSS visibility hint from class tokens.
  // Known CSS hiding patterns: hide, hidden, d-none, visually-hidden, sr-only.
  const classAttr = widget.attributes['class'];
  if (classAttr !== undefined) {
    const CSS_HIDDEN_PATTERNS = /\b(hide|hidden|d-none|visually-hidden|sr-only)\b/i;
    if (CSS_HIDDEN_PATTERNS.test(classAttr)) {
      ui.cssVisibilityHint = false;
    }
  }

  return ui;
}

// ---------------------------------------------------------------------------
// Atom emission (spec §7 — UI atom rules on executable edges)
// ---------------------------------------------------------------------------

/**
 * Build UI atoms for a widget-origin executable edge.
 * Emits visibility, enabledness, and requiredness atoms from WidgetUIProps.
 */
export function buildWidgetAtoms(widgetId: string, ui: WidgetUIProps, source: SourceRef): Atom[] {
  const atoms: Atom[] = [];

  // §7.1 — Visibility
  if (ui.visibleLiteral === false) {
    atoms.push({ kind: 'WidgetVisible', args: [widgetId, 'false'], source });
  } else if (ui.visibleExprText !== undefined) {
    atoms.push({ kind: 'WidgetVisibleExpr', args: [widgetId, ui.visibleExprText], source });
  }

  // §7.1 — Enabledness
  if (ui.enabledLiteral === false) {
    atoms.push({ kind: 'WidgetEnabled', args: [widgetId, 'false'], source });
  } else if (ui.enabledExprText !== undefined) {
    atoms.push({ kind: 'WidgetEnabledExpr', args: [widgetId, ui.enabledExprText], source });
  }

  // §7.1 — Requiredness
  if (ui.requiredLiteral === true) {
    atoms.push({ kind: 'WidgetRequired', args: [widgetId, 'true'], source });
  } else if (ui.requiredExprText !== undefined) {
    atoms.push({ kind: 'WidgetRequiredExpr', args: [widgetId, ui.requiredExprText], source });
  }

  return atoms;
}

/**
 * Build FormValid atom for WIDGET_SUBMITS_FORM edges (spec §7.2).
 */
export function buildFormAtom(widgetId: string, source: SourceRef): Atom {
  return { kind: 'FormValid', args: [widgetId], source };
}

/**
 * Build InputConstraint atoms for literal input shape constraints (spec §7.3).
 * Emits one atom per constraint key (minLength, maxLength, min, max, pattern).
 */
export function buildInputConstraintAtoms(widgetId: string, ui: WidgetUIProps, source: SourceRef): Atom[] {
  const atoms: Atom[] = [];

  if (ui.minLength !== undefined) {
    atoms.push({ kind: 'InputConstraint', args: [widgetId, 'minLength', String(ui.minLength)], source });
  }
  if (ui.maxLength !== undefined) {
    atoms.push({ kind: 'InputConstraint', args: [widgetId, 'maxLength', String(ui.maxLength)], source });
  }
  if (ui.min !== undefined) {
    atoms.push({ kind: 'InputConstraint', args: [widgetId, 'min', String(ui.min)], source });
  }
  if (ui.max !== undefined) {
    atoms.push({ kind: 'InputConstraint', args: [widgetId, 'max', String(ui.max)], source });
  }
  if (ui.pattern !== undefined) {
    atoms.push({ kind: 'InputConstraint', args: [widgetId, 'pattern', ui.pattern], source });
  }

  return atoms;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export class NavigationGraphBuilder {
  private readonly _cfg: AnalyzerConfig;
  private readonly _log: Logger;

  constructor(cfg: AnalyzerConfig, logger?: Logger) {
    this._cfg = cfg;
    this._log = logger ?? new SilentLogger();
  }

  build(
    componentRouteMap: ComponentRouteMap,
    componentRegistry: ComponentRegistry,
    widgetEventMaps: WidgetEventMap[],
    moduleRegistry: ModuleRegistry,
    widgetsByComponentId: Map<string, WidgetInfo[]>,
    serviceInfos?: ServiceInfo[],
  ): Multigraph {
    const projectRoot = this._cfg.projectRoot;
    const { routeMap } = componentRouteMap;

    const nodes: Node[] = [];
    const nodeIds = new Set<string>();

    // Path → routeId lookup for resolving navigation targets
    const pathToRouteId = new Map<string, string>();
    for (const route of routeMap.routes) {
      pathToRouteId.set(route.fullPath, route.id);
    }

    // Route lookup
    const routeById = new Map<string, Route>();
    for (const route of routeMap.routes) {
      routeById.set(route.id, route);
    }

    // Component → activating route fullPaths (for relative routerLink resolution)
    const componentToRouteFullPaths = new Map<string, string[]>();
    for (const route of routeMap.routes) {
      let compId: string | undefined;
      if (route.kind === 'ComponentRoute') {
        compId = (route as ComponentRoute).componentId;
      } else if (route.kind === 'WildcardRoute') {
        compId = (route as WildcardRoute).componentId;
      }
      if (compId === undefined) continue;
      const paths = componentToRouteFullPaths.get(compId) ?? [];
      paths.push(route.fullPath);
      componentToRouteFullPaths.set(compId, paths);
    }

    // Component lookup (className → ComponentInfo)
    const compByClassName = new Map<string, ComponentInfo>();
    const compBySelectorLower = new Map<string, ComponentInfo>();
    for (const comp of componentRegistry.components) {
      compByClassName.set(comp.symbol.className, comp);
      if (comp.selector !== undefined) {
        compBySelectorLower.set(comp.selector.toLowerCase(), comp);
      }
    }

    // Compute entry route IDs per spec §5
    const entryRouteIds = this._computeEntryRouteIds(routeMap.routes, pathToRouteId);

    // ── 1. Module nodes ─────────────────────────────────────────────────────

    for (const mod of moduleRegistry.modules) {
      const node: ModuleNode = {
        id: mod.id,
        kind: 'Module',
        label: mod.name,
        refs: [toRef(mod.origin, projectRoot)],
        meta: {
          name: mod.name,
          file: path.relative(projectRoot, mod.origin.file).replace(/\\/g, '/'),
          isStandaloneRoot: false,
        },
      };
      nodes.push(node);
      nodeIds.add(node.id);
    }

    // ── 2. Route nodes ──────────────────────────────────────────────────────

    for (const route of routeMap.routes) {
      const isRedirect = route.kind === 'RedirectRoute';
      const node: RouteNode = {
        id: route.id,
        kind: 'Route',
        label: route.fullPath,
        refs: [toRef(route.origin, projectRoot)],
        meta: {
          fullPath: route.fullPath,
          path: route.path,
          isTopLevel: route.parentId === undefined,
          isEntry: entryRouteIds.has(route.id),
          isWildcard: route.kind === 'WildcardRoute',
          params: [...route.params.routeParams],
          guards: route.guards.map((g) => g.guardName).sort(),
          roles: this._extractRoles(route),
          routeType: route.kind,
          ...(isRedirect
            ? { redirectTo: (route as RedirectRoute).redirectToFullPath }
            : (route as unknown as { redirectToFullPath?: string }).redirectToFullPath !== undefined
              ? { redirectTo: (route as unknown as { redirectToFullPath: string }).redirectToFullPath }
              : {}),
        },
      };
      nodes.push(node);
      nodeIds.add(node.id);
    }

    // ── 3. Component nodes ──────────────────────────────────────────────────

    const sortedComponents = [...componentRegistry.components].sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    for (const comp of sortedComponents) {
      const node: ComponentNode = {
        id: comp.id,
        kind: 'Component',
        label: comp.symbol.className,
        refs: [toRef(comp.origin, projectRoot)],
        meta: {
          name: comp.symbol.className,
          file: path.relative(projectRoot, comp.symbol.file).replace(/\\/g, '/'),
          ...(comp.selector !== undefined ? { selector: comp.selector } : {}),
          ...(comp.templateUrl !== undefined && comp.templateUrl !== '__inline__'
            ? { templateFile: comp.templateUrl }
            : {}),
        },
      };
      nodes.push(node);
      nodeIds.add(node.id);
    }

    // ── 4. Widget nodes ─────────────────────────────────────────────────────

    const allWidgets: WidgetInfo[] = [];
    for (const [, widgets] of [...widgetsByComponentId.entries()].sort((a, b) =>
      a[0].localeCompare(b[0]),
    )) {
      for (const w of widgets) allWidgets.push(w);
    }
    allWidgets.sort((a, b) => a.id.localeCompare(b.id));

    const widgetById = new Map<string, WidgetInfo>();
    const widgetUIById = new Map<string, WidgetUIProps>();
    for (const widget of allWidgets) {
      widgetById.set(widget.id, widget);

      const eventBindings = widget.bindings.filter((b) => b.kind === 'event');
      const eventNames = eventBindings.map((b) => b.name).sort();
      const eventHandlerTextByName: Record<string, string> = {};
      for (const b of eventBindings) {
        eventHandlerTextByName[b.name] = b.value ?? '';
      }

      const routerLinkBinding = widget.bindings.find(
        (b) => b.name.toLowerCase() === 'routerlink',
      );
      const hrefBinding = widget.bindings.find(
        (b) => b.name === 'href' && b.kind === 'attr',
      );

      const widgetUI = buildWidgetUIProps(widget);
      widgetUIById.set(widget.id, widgetUI);

      const node: WidgetNode = {
        id: widget.id,
        kind: 'Widget',
        label: `${widget.kind}(${widget.path.path})`,
        refs: [toRef(widget.origin, projectRoot)],
        meta: {
          componentId: widget.componentId,
          widgetKind: mapWidgetKind(widget.kind),
          ...(widget.tagName !== undefined ? { tagName: widget.tagName } : {}),
          eventNames,
          eventHandlerTextByName,
          ...(routerLinkBinding?.value !== undefined
            ? { routerLinkText: routerLinkBinding.value }
            : {}),
          ...(hrefBinding?.value !== undefined ? { staticHref: hrefBinding.value } : {}),
          ...(Object.keys(widget.attributes).length > 0 ? { attributes: widget.attributes } : {}),
          ...(widget.text !== undefined ? { text: widget.text } : {}),
          ui: widgetUI,
          ...(widget.isTemplateContent === true ? { isTemplateContent: true } : {}),
          ...(widget.templateRegionId !== undefined ? { templateRegionId: widget.templateRegionId } : {}),
          ...(widget.insideNgFor !== undefined ? { insideNgFor: widget.insideNgFor } : {}),
          ...(widget.insideNgForOrdinal !== undefined ? { insideNgForOrdinal: widget.insideNgForOrdinal } : {}),
          ...(widget.ngForItemTag !== undefined ? { ngForItemTag: widget.ngForItemTag } : {}),
        },
      };
      nodes.push(node);
      nodeIds.add(node.id);
    }

    // ── 5. Service nodes ────────────────────────────────────────────────────

    const serviceById = new Map<string, ServiceNode>();
    if (serviceInfos !== undefined) {
      for (const svc of serviceInfos) {
        if (serviceById.has(svc.id)) continue;
        const node: ServiceNode = {
          id: svc.id,
          kind: 'Service',
          label: svc.name,
          refs: svc.origin !== undefined
            ? [toRef(svc.origin, projectRoot)]
            : [{ file: path.relative(projectRoot, svc.file).replace(/\\/g, '/'), start: 0, end: 0 }],
          meta: {
            name: svc.name,
            file: path.relative(projectRoot, svc.file).replace(/\\/g, '/'),
          },
        };
        serviceById.set(svc.id, node);
        nodes.push(node);
        nodeIds.add(node.id);
      }
    }

    // ── 6. External nodes (built on demand during edge creation) ────────────

    const externalNodes = new Map<string, ExternalNode>();
    const getOrCreateExternal = (url: string, refOrigin: Origin): string => {
      const id = externalNodeId(url);
      if (!externalNodes.has(id)) {
        const node: ExternalNode = {
          id,
          kind: 'External',
          label: url,
          refs: [toRef(refOrigin, projectRoot)],
          meta: { url },
        };
        externalNodes.set(id, node);
      }
      return id;
    };

    // ── 7. Build edges ──────────────────────────────────────────────────────

    const edges: Edge[] = [];
    const edgeGroupCounters = new Map<string, number>();

    const addEdge = (
      kind: EdgeKind,
      from: string,
      to: string | null,
      refs: SourceRef[],
      extras?: Partial<Edge>,
    ): Edge | undefined => {
      // Validate from exists
      if (!nodeIds.has(from)) return undefined;
      // Validate to exists (if non-null)
      if (to !== null && !nodeIds.has(to) && !externalNodes.has(to)) return undefined;

      const toKey = to ?? '__null__';
      const groupKey = `${from}::${kind}::${toKey}`;
      const idx = edgeGroupCounters.get(groupKey) ?? 0;
      edgeGroupCounters.set(groupKey, idx + 1);

      const id = `${from}::${kind}::${toKey}::${idx}`;
      const constraints = extras?.constraints ?? emptyConstraintSurface();

      const edge: Edge = {
        id,
        kind,
        from,
        to,
        constraints,
        refs,
        ...extras,
      };
      // Ensure constraints is always present (override any spread)
      edge.constraints = constraints;
      edges.push(edge);
      return edge;
    };

    // ─── 7a. STRUCTURAL EDGES ─────────────────────────────────────────────

    // MODULE_DECLARES_COMPONENT
    for (const mod of moduleRegistry.modules) {
      for (const declClassName of mod.declarations) {
        const comp = compByClassName.get(declClassName);
        if (comp !== undefined && nodeIds.has(comp.id)) {
          addEdge('MODULE_DECLARES_COMPONENT', mod.id, comp.id, [toRef(mod.origin, projectRoot)]);
        }
      }
    }

    // MODULE_DECLARES_ROUTE
    for (const mod of moduleRegistry.modules) {
      for (const routeId of mod.routesOwned) {
        if (nodeIds.has(routeId)) {
          addEdge('MODULE_DECLARES_ROUTE', mod.id, routeId, [toRef(mod.origin, projectRoot)]);
        }
      }
    }

    // ROUTE_HAS_CHILD
    for (const route of routeMap.routes) {
      for (const childId of route.childrenIds) {
        if (nodeIds.has(childId)) {
          addEdge('ROUTE_HAS_CHILD', route.id, childId, [toRef(route.origin, projectRoot)]);
        }
      }
    }

    // ROUTE_ACTIVATES_COMPONENT
    for (const route of routeMap.routes) {
      let compId: string | undefined;
      if (route.kind === 'ComponentRoute') {
        compId = (route as ComponentRoute).componentId;
      } else if (route.kind === 'WildcardRoute') {
        compId = (route as WildcardRoute).componentId;
      }
      if (compId === undefined || compId === '__unknown__' || compId.startsWith('__unresolved__')) continue;
      if (!nodeIds.has(compId)) continue;
      addEdge('ROUTE_ACTIVATES_COMPONENT', route.id, compId, [toRef(route.origin, projectRoot)]);
    }

    // COMPONENT_CONTAINS_WIDGET
    for (const widget of allWidgets) {
      if (nodeIds.has(widget.componentId)) {
        addEdge('COMPONENT_CONTAINS_WIDGET', widget.componentId, widget.id, [
          toRef(widget.origin, projectRoot),
        ]);
      }
    }

    // WIDGET_CONTAINS_WIDGET — parent-child widget containment (form→controls, select→options)
    for (const widget of allWidgets) {
      if (widget.parentWidgetId !== undefined && nodeIds.has(widget.parentWidgetId) && nodeIds.has(widget.id)) {
        addEdge('WIDGET_CONTAINS_WIDGET', widget.parentWidgetId, widget.id, [
          toRef(widget.origin, projectRoot),
        ]);
      }
    }

    // COMPONENT_COMPOSES_COMPONENT — resolve selectors (or class names from
    // createComponent() detection) to component IDs.
    const compByClassNameLower = new Map<string, ComponentInfo>();
    for (const c of sortedComponents) compByClassNameLower.set(c.symbol.className.toLowerCase(), c);

    for (const comp of sortedComponents) {
      for (const usedRef of comp.usesComponentIds) {
        // Try selector-based lookup first, then class-name fallback
        // (createComponent(ClassName) adds class names, not selectors)
        const usedComp =
          compBySelectorLower.get(usedRef.toLowerCase()) ??
          compByClassNameLower.get(usedRef.toLowerCase());
        if (usedComp !== undefined && nodeIds.has(usedComp.id) && usedComp.id !== comp.id) {
          const edge = addEdge('COMPONENT_COMPOSES_COMPONENT', comp.id, usedComp.id, [
            toRef(comp.origin, projectRoot),
          ]);
          // Attach composition-site structural context if available
          const ctx = comp.compositionContexts?.[usedRef.toLowerCase()];
          if (ctx !== undefined && edge !== undefined) {
            edge.compositionContext = ctx;
          }
        }
      }
    }

    // MODULE_PROVIDES_SERVICE
    for (const mod of moduleRegistry.modules) {
      for (const providerName of mod.providers) {
        // Match provider class name to a known service node
        for (const [svcId, svcNode] of serviceById) {
          if (svcNode.meta.name === providerName) {
            addEdge('MODULE_PROVIDES_SERVICE', mod.id, svcId, [toRef(mod.origin, projectRoot)]);
            break;
          }
        }
      }
    }

    // MODULE_PROVIDES_SERVICE for providedIn:'root' services
    if (serviceInfos !== undefined) {
      let rootModuleId = this._resolveRootModuleId(moduleRegistry);

      // Standalone apps (Angular v15+): no NgModule exists, so create a synthetic
      // __standalone_root__ Module node as the anchor for providedIn:'root' services.
      // Without this, all services in standalone apps are orphan nodes.
      if (rootModuleId === undefined && moduleRegistry.modules.length === 0 &&
          serviceInfos.some((s) => s.providedIn === 'root')) {
        const syntheticId = '__standalone_root__';
        const syntheticRef = { file: 'main.ts', start: 0, end: 0 };
        nodes.push({
          kind: 'Module',
          id: syntheticId,
          label: '__standalone_root__',
          refs: [syntheticRef],
          meta: { name: '__standalone_root__', file: 'main.ts', isStandaloneRoot: true },
        } as unknown as Node);
        nodeIds.add(syntheticId);
        rootModuleId = syntheticId;
        this._log.debug('Created synthetic __standalone_root__ Module for standalone app');
      }

      if (rootModuleId !== undefined && nodeIds.has(rootModuleId)) {
        // Collect services that already have MODULE_PROVIDES_SERVICE edges
        const alreadyProvided = new Set<string>();
        for (const edge of edges) {
          if (edge.kind === 'MODULE_PROVIDES_SERVICE' && edge.to !== null) {
            alreadyProvided.add(edge.to);
          }
        }
        for (const svc of serviceInfos) {
          if (svc.providedIn !== 'root') continue;
          if (alreadyProvided.has(svc.id)) continue;
          if (!nodeIds.has(svc.id)) continue;
          const ref = svc.origin !== undefined
            ? toRef(svc.origin, projectRoot)
            : { file: path.relative(projectRoot, svc.file).replace(/\\/g, '/'), start: 0, end: 0 };
          addEdge('MODULE_PROVIDES_SERVICE', rootModuleId, svc.id, [ref]);
        }
      } else if (serviceInfos.some((s) => s.providedIn === 'root')) {
        this._log.debug('No root module found — skipping providedIn:root service edges');
      }
    }

    // MODULE_IMPORTS_MODULE
    const moduleNameToId = new Map<string, string>();
    for (const mod of moduleRegistry.modules) moduleNameToId.set(mod.name, mod.id);

    const moduleEdgeDedup = new Set<string>();
    for (const mod of moduleRegistry.modules) {
      for (const importedName of mod.imports) {
        const targetModId = moduleNameToId.get(importedName);
        if (targetModId === undefined || !nodeIds.has(targetModId)) continue;
        const dedupeKey = `${mod.id}::MODULE_IMPORTS_MODULE::${targetModId}`;
        if (moduleEdgeDedup.has(dedupeKey)) continue;
        moduleEdgeDedup.add(dedupeKey);
        const ref = mod.importOrigins?.[importedName] !== undefined
          ? toRef(mod.importOrigins[importedName], projectRoot)
          : toRef(mod.origin, projectRoot);
        addEdge('MODULE_IMPORTS_MODULE', mod.id, targetModId, [ref]);
      }
    }

    // MODULE_EXPORTS_MODULE
    for (const mod of moduleRegistry.modules) {
      for (const exportedName of (mod.exports ?? [])) {
        const targetModId = moduleNameToId.get(exportedName);
        if (targetModId === undefined || !nodeIds.has(targetModId)) continue;
        const dedupeKey = `${mod.id}::MODULE_EXPORTS_MODULE::${targetModId}`;
        if (moduleEdgeDedup.has(dedupeKey)) continue;
        moduleEdgeDedup.add(dedupeKey);
        const ref = mod.exportOrigins?.[exportedName] !== undefined
          ? toRef(mod.exportOrigins[exportedName], projectRoot)
          : toRef(mod.origin, projectRoot);
        addEdge('MODULE_EXPORTS_MODULE', mod.id, targetModId, [ref]);
      }
    }

    // COMPONENT_PROVIDES_SERVICE — not yet extracted from @Component decorators

    // ─── 7b. EXECUTABLE EDGES ─────────────────────────────────────────────

    // ROUTE_REDIRECTS_TO_ROUTE
    // Emit for RedirectRoute and for non-RedirectRoute with preserved redirect
    // info from dedup (§5 redirect preservation).
    for (const route of routeMap.routes) {
      const redirectToFullPath: string | undefined =
        route.kind === 'RedirectRoute'
          ? (route as RedirectRoute).redirectToFullPath
          : (route as unknown as { redirectToFullPath?: string }).redirectToFullPath;

      if (redirectToFullPath === undefined) continue;

      const targetId = pathToRouteId.get(redirectToFullPath);
      const targetRoute = targetId !== undefined ? routeById.get(targetId) : undefined;
      const routeRef = toRef(route.origin, projectRoot);
      const redirectCS = this._buildNavConstraints(targetRoute);
      redirectCS.evidence = [routeRef];

      addEdge('ROUTE_REDIRECTS_TO_ROUTE', route.id, targetId ?? null, [
        routeRef,
      ], {
        isSystem: true,
        targetRouteId: targetId ?? null,
        ...(targetId === undefined ? { targetText: redirectToFullPath } : {}),
        constraints: redirectCS,
      });
    }

    // Widget-origin edges: WIDGET_NAVIGATES_ROUTE, WIDGET_NAVIGATES_EXTERNAL
    for (const widget of allWidgets) {
      if (!nodeIds.has(widget.componentId)) continue;
      const wUI = widgetUIById.get(widget.id);
      const widgetRef = toRef(widget.origin, projectRoot);

      for (const binding of widget.bindings) {
        const name = binding.name.toLowerCase();

        // routerLink → WIDGET_NAVIGATES_ROUTE
        if (name === 'routerlink') {
          const targetPath = this._normalizeRouterLinkValue(binding.value ?? '');
          let targetId = targetPath !== null ? pathToRouteId.get(targetPath) : undefined;
          // Fallback 1: relative path resolution against parent route
          if (targetId === undefined) {
            targetId = this._resolveRelativeNavigation(
              binding.value ?? '', widget.componentId, componentToRouteFullPaths, pathToRouteId,
            );
          }
          // Fallback 2: array navigation with dynamic segments
          if (targetId === undefined && (binding.value ?? '').startsWith('[')) {
            targetId = this._resolveArrayNavigation(binding.value ?? '', pathToRouteId);
          }
          // Fallback 3: interpolation resolution (e.g., /owners/{{owner.id}})
          if (targetId === undefined) {
            targetId = this._resolveInterpolationNavigation(binding.value ?? '', pathToRouteId);
          }
          const targetRoute = targetId !== undefined ? routeById.get(targetId) : undefined;
          const navCS = this._buildNavConstraints(targetRoute);
          // Attach widget UI atoms + input constraint atoms
          if (wUI !== undefined) {
            navCS.uiAtoms = [
              ...buildWidgetAtoms(widget.id, wUI, widgetRef),
              ...buildInputConstraintAtoms(widget.id, wUI, widgetRef),
            ];
          }
          const bindingRef = toRef(binding.origin, projectRoot);
          navCS.evidence = [bindingRef];

          addEdge('WIDGET_NAVIGATES_ROUTE', widget.id, targetId ?? null, [
            bindingRef,
          ], {
            trigger: { viaRouterLink: true },
            targetRouteId: targetId ?? null,
            ...(targetId === undefined ? { targetText: binding.value ?? '' } : {}),
            constraints: navCS,
          });
        }

        // href (external) → WIDGET_NAVIGATES_EXTERNAL
        if (name === 'href' && this._isExternal(binding.value ?? '')) {
          const url = binding.value ?? '';
          const extId = getOrCreateExternal(url, binding.origin);
          const bindingRef = toRef(binding.origin, projectRoot);
          const uiAtoms = wUI !== undefined
            ? [...buildWidgetAtoms(widget.id, wUI, widgetRef), ...buildInputConstraintAtoms(widget.id, wUI, widgetRef)]
            : [];
          addEdge('WIDGET_NAVIGATES_EXTERNAL', widget.id, extId, [
            bindingRef,
          ], {
            trigger: { event: 'click' },
            constraints: {
              requiredParams: [],
              guards: [],
              roles: [],
              uiAtoms,
              evidence: [bindingRef],
            },
          });
        }
      }
    }

    // Handler-driven edges: WIDGET_TRIGGERS_HANDLER, WIDGET_SUBMITS_FORM,
    //                       COMPONENT_CALLS_SERVICE, COMPONENT_NAVIGATES_ROUTE
    for (const wem of widgetEventMaps) {
      const compId = wem.componentId;
      if (!nodeIds.has(compId)) continue;

      for (const event of wem.events) {
        const widget = widgetById.get(event.widgetId);
        if (widget === undefined || !nodeIds.has(widget.id)) continue;

        // Determine if this is a submit or a handler trigger
        const isSubmit =
          event.eventType === 'submit' && widget.kind === 'Form';

        // Create WIDGET_TRIGGERS_HANDLER or WIDGET_SUBMITS_FORM
        const triggerKind: EdgeKind = isSubmit
          ? 'WIDGET_SUBMITS_FORM'
          : 'WIDGET_TRIGGERS_HANDLER';

        const handlerRef: HandlerRef | undefined =
          event.handlerName !== undefined
            ? { componentId: compId, methodName: event.handlerName }
            : undefined;

        // effectGroupId links trigger edges to their effect edges (CCS/CNR)
        const effectGroupId: string | undefined =
          event.handlerName !== undefined
            ? `${compId}::${event.handlerName}`
            : undefined;

        const triggerRef: TriggerRef = { event: event.rawEventName ?? event.eventType };

        const edgeRefs: SourceRef[] = event.handlerOrigin !== undefined
          ? [toRef(event.handlerOrigin, projectRoot)]
          : widget.origin !== undefined
            ? [toRef(widget.origin, projectRoot)]
            : [];

        if (edgeRefs.length > 0) {
          // Build widget UI atoms for the constraint surface
          const wUI = widgetUIById.get(widget.id);
          const widgetRef = toRef(widget.origin, projectRoot);
          const uiAtoms: Atom[] = wUI !== undefined
            ? [...buildWidgetAtoms(widget.id, wUI, widgetRef)]
            : [];
          // §7.2: FormValid atom for form submission edges
          if (isSubmit) {
            uiAtoms.push(buildFormAtom(widget.id, widgetRef));
          }
          // §7.3: InputConstraint atoms
          if (wUI !== undefined) {
            uiAtoms.push(...buildInputConstraintAtoms(widget.id, wUI, widgetRef));
          }

          addEdge(triggerKind, widget.id, compId, edgeRefs, {
            trigger: triggerRef,
            ...(handlerRef !== undefined ? { handler: handlerRef } : {}),
            ...(effectGroupId !== undefined ? { effectGroupId } : {}),
            constraints: {
              requiredParams: [],
              guards: [],
              roles: [],
              uiAtoms,
              evidence: [...edgeRefs],
            },
          });
        }

        // Process call contexts from the handler, passing effectGroupId
        let callsiteOrdinal = 0;
        for (const ctx of event.callContexts) {
          this._processCallContext(
            ctx,
            compId,
            projectRoot,
            pathToRouteId,
            routeById,
            serviceById,
            getOrCreateExternal,
            nodeIds,
            addEdge,
            compByClassName,
            effectGroupId,
            ctx.kind === 'ServiceCall' ? callsiteOrdinal++ : undefined,
          );
        }
      }
    }

    // ── 8. Add deferred external nodes ──────────────────────────────────────

    for (const node of externalNodes.values()) {
      nodes.push(node);
      nodeIds.add(node.id);
    }

    // ── 9. Sort ─────────────────────────────────────────────────────────────

    nodes.sort((a, b) => a.id.localeCompare(b.id));

    // Sort edges by (from, kind, to ?? '', id) per spec §10
    edges.sort((a, b) => {
      const fromCmp = a.from.localeCompare(b.from);
      if (fromCmp !== 0) return fromCmp;
      const kindCmp = a.kind.localeCompare(b.kind);
      if (kindCmp !== 0) return kindCmp;
      const aTo = a.to ?? '';
      const bTo = b.to ?? '';
      const toCmp = aTo.localeCompare(bTo);
      if (toCmp !== 0) return toCmp;
      return a.id.localeCompare(b.id);
    });

    // Fail-fast invariants: effectGroupId/callsiteOrdinal consistency
    for (const e of edges) {
      if (e.kind === 'COMPONENT_CALLS_SERVICE') {
        if (e.effectGroupId === undefined) {
          throw new Error(`Invariant: CCS edge ${e.id} missing effectGroupId`);
        }
        if (e.callsiteOrdinal === undefined) {
          throw new Error(`Invariant: CCS edge ${e.id} missing callsiteOrdinal`);
        }
      }
      if (e.kind === 'COMPONENT_NAVIGATES_ROUTE' && e.effectGroupId === undefined) {
        throw new Error(`Invariant: CNR edge ${e.id} missing effectGroupId`);
      }
      if ((e.kind === 'WIDGET_TRIGGERS_HANDLER' || e.kind === 'WIDGET_SUBMITS_FORM')
          && e.handler !== undefined && e.effectGroupId === undefined) {
        throw new Error(`Invariant: ${e.kind} edge ${e.id} with handler missing effectGroupId`);
      }
    }

    this._log.debug('Multigraph built', {
      nodes: nodes.length,
      edges: edges.length,
      structural: edges.filter((e) => STRUCTURAL_EDGE_KINDS.has(e.kind)).length,
      executable: edges.filter((e) => !STRUCTURAL_EDGE_KINDS.has(e.kind)).length,
    });

    // Log WidgetUIProps and atom emission stats
    const widgetNodes = nodes.filter((n) => n.kind === 'Widget');
    const widgetsWithUI = widgetNodes.filter((n) => {
      const meta = n.meta as WidgetNode['meta'];
      return meta.ui.visibleLiteral !== undefined
        || meta.ui.visibleExprText !== undefined
        || meta.ui.enabledLiteral !== undefined
        || meta.ui.enabledExprText !== undefined
        || meta.ui.requiredLiteral !== undefined
        || meta.ui.requiredExprText !== undefined;
    });
    const edgesWithAtoms = edges.filter((e) => e.constraints.uiAtoms.length > 0);
    const totalAtoms = edges.reduce((sum, e) => sum + e.constraints.uiAtoms.length, 0);
    const edgesWithEvidence = edges.filter((e) => e.constraints.evidence.length > 0);

    this._log.debug('WidgetUIProps stats', {
      totalWidgets: widgetNodes.length,
      widgetsWithUIConstraints: widgetsWithUI.length,
    });
    this._log.debug('Atom emission stats', {
      edgesWithAtoms: edgesWithAtoms.length,
      totalAtoms,
      edgesWithEvidence: edgesWithEvidence.length,
    });

    // Log individual widget UI details at debug level
    for (const wn of widgetsWithUI) {
      const meta = wn.meta as WidgetNode['meta'];
      const uiFields: Record<string, unknown> = {};
      if (meta.ui.visibleLiteral !== undefined) uiFields['visibleLiteral'] = meta.ui.visibleLiteral;
      if (meta.ui.visibleExprText !== undefined) uiFields['visibleExprText'] = meta.ui.visibleExprText;
      if (meta.ui.enabledLiteral !== undefined) uiFields['enabledLiteral'] = meta.ui.enabledLiteral;
      if (meta.ui.enabledExprText !== undefined) uiFields['enabledExprText'] = meta.ui.enabledExprText;
      if (meta.ui.requiredLiteral !== undefined) uiFields['requiredLiteral'] = meta.ui.requiredLiteral;
      if (meta.ui.requiredExprText !== undefined) uiFields['requiredExprText'] = meta.ui.requiredExprText;
      this._log.debug(`  widget UI: ${wn.id}`, uiFields);
    }

    // ── 10. Transitive composition-gate propagation ──────────────────────
    // Collect insideNgIf expressions from CCC edges and propagate them to
    // all widgets owned by the target component (and transitively deeper).
    // This enables downstream classification of MATERIALIZATION_UNKNOWN failures.
    {
      // Build component → gates map from CCC edges
      const compGates = new Map<string, string[]>();
      for (const e of edges) {
        if (e.kind !== 'COMPONENT_COMPOSES_COMPONENT') continue;
        const ngIf = e.compositionContext?.insideNgIf;
        if (ngIf === undefined || e.to === undefined || e.to === null) continue;
        const existing = compGates.get(e.to) ?? [];
        existing.push(ngIf);
        compGates.set(e.to, existing);
      }
      // Propagate transitively: if comp C is gated and C composes D, D inherits C's gates
      let changed = true;
      while (changed) {
        changed = false;
        for (const e of edges) {
          if (e.kind !== 'COMPONENT_COMPOSES_COMPONENT') continue;
          if (e.to === undefined || e.to === null) continue;
          const parentGates = compGates.get(e.from);
          if (parentGates === undefined || parentGates.length === 0) continue;
          const childGates = compGates.get(e.to) ?? [];
          for (const g of parentGates) {
            if (!childGates.includes(g)) {
              childGates.push(g);
              changed = true;
            }
          }
          compGates.set(e.to, childGates);
        }
      }
      // Assign gates to widget nodes
      for (const n of nodes) {
        if (n.kind !== 'Widget') continue;
        const wn = n as WidgetNode;
        const gates = compGates.get(wn.meta.componentId);
        if (gates !== undefined && gates.length > 0) {
          wn.meta.compositionGates = [...gates].sort();
        }
      }
    }

    return { nodes, edges };
  }

  // ---------------------------------------------------------------------------
  // Entry context computation (spec §5)
  // ---------------------------------------------------------------------------

  private _computeEntryRouteIds(
    routes: Route[],
    pathToRouteId: Map<string, string>,
  ): Set<string> {
    const entryIds = new Set<string>();

    // Top-level non-wildcard routes are entry candidates
    for (const route of routes) {
      if (route.parentId === undefined && route.kind !== 'WildcardRoute') {
        entryIds.add(route.id);
      }
    }

    // Root path "" routes
    for (const route of routes) {
      if (route.fullPath === '/' || route.fullPath === '') {
        entryIds.add(route.id);
      }
    }

    // Follow redirect chains from entry routes.
    // Check both RedirectRoute routes and non-RedirectRoute routes with preserved
    // redirect info from dedup (§5 redirect preservation).
    let changed = true;
    while (changed) {
      changed = false;
      for (const route of routes) {
        if (!entryIds.has(route.id)) continue;
        const redirectToFullPath: string | undefined =
          route.kind === 'RedirectRoute'
            ? (route as RedirectRoute).redirectToFullPath
            : (route as unknown as { redirectToFullPath?: string }).redirectToFullPath;
        if (redirectToFullPath === undefined) continue;
        const targetId = pathToRouteId.get(redirectToFullPath);
        if (targetId !== undefined && !entryIds.has(targetId)) {
          entryIds.add(targetId);
          changed = true;
        }
      }
    }

    return entryIds;
  }

  // ---------------------------------------------------------------------------
  // Call context → edge processing
  // ---------------------------------------------------------------------------

  private _processCallContext(
    ctx: EventHandlerCallContext,
    compId: string,
    projectRoot: string,
    pathToRouteId: Map<string, string>,
    routeById: Map<string, Route>,
    serviceById: Map<string, ServiceNode>,
    getOrCreateExternal: (url: string, origin: Origin) => string,
    nodeIds: Set<string>,
    addEdge: (kind: EdgeKind, from: string, to: string | null, refs: SourceRef[], extras?: Partial<Edge>) => void,
    compByClassName: Map<string, ComponentInfo>,
    effectGroupId?: string,
    callsiteOrdinal?: number,
  ): void {
    if (ctx.kind === 'Navigate' && ctx.target?.route !== undefined) {
      // COMPONENT_NAVIGATES_ROUTE
      const resolved = this._resolveNavigatePath(ctx.target.route, pathToRouteId);
      const targetRoute = resolved !== undefined ? routeById.get(resolved) : undefined;
      const ctxRef = toRef(ctx.origin, projectRoot);
      const compNavCS = this._buildNavConstraints(targetRoute);
      compNavCS.evidence = [ctxRef];

      addEdge('COMPONENT_NAVIGATES_ROUTE', compId, resolved ?? null, [
        ctxRef,
      ], {
        targetRouteId: resolved ?? null,
        ...(resolved === undefined ? { targetText: ctx.target.route } : {}),
        constraints: compNavCS,
        ...(effectGroupId !== undefined ? { effectGroupId } : {}),
      });
    } else if (ctx.kind === 'ServiceCall' && ctx.target?.serviceMethod !== undefined) {
      // COMPONENT_CALLS_SERVICE
      const [memberName] = ctx.target.serviceMethod.split('.');
      // Try to find a matching service node
      let serviceId: string | undefined;
      for (const [id, svc] of serviceById) {
        if (svc.meta.name === memberName || svc.meta.name === capitalize(memberName ?? '')) {
          serviceId = id;
          break;
        }
      }

      if (serviceId !== undefined && nodeIds.has(serviceId)) {
        addEdge('COMPONENT_CALLS_SERVICE', compId, serviceId, [
          toRef(ctx.origin, projectRoot),
        ], {
          ...(effectGroupId !== undefined ? { effectGroupId } : {}),
          ...(callsiteOrdinal !== undefined ? { callsiteOrdinal } : {}),
        });
      }
      // When service node cannot be resolved, the call is an internal method
      // call (e.g. this.someHelper.doWork()) — not a service call. Drop it.
    } else if (ctx.kind === 'DialogOpen' && ctx.target?.componentClassName !== undefined) {
      // COMPONENT_COMPOSES_COMPONENT (dynamic composition via dialog)
      // Resolve component class name to a ComponentNode
      const dialogCompId = this._resolveDialogComponent(
        ctx.target.componentClassName, compByClassName, nodeIds,
      );
      if (dialogCompId !== undefined && dialogCompId !== compId) {
        addEdge('COMPONENT_COMPOSES_COMPONENT', compId, dialogCompId, [
          toRef(ctx.origin, projectRoot),
        ]);
      }
    }
    // Skip window/document navigation (spec §1.D: "No window/document navigation")
  }

  // ---------------------------------------------------------------------------
  // Constraint surface helpers
  // ---------------------------------------------------------------------------

  private _buildNavConstraints(targetRoute: Route | undefined): ConstraintSurface {
    if (targetRoute === undefined) return emptyConstraintSurface();
    return {
      requiredParams: [...targetRoute.params.routeParams],
      guards: targetRoute.guards.map((g) => g.guardName).sort(),
      roles: this._extractRoles(targetRoute),
      uiAtoms: [],
      evidence: [],
    };
  }

  private _extractRoles(route: Route): string[] {
    const roles: string[] = [];
    for (const d of route.data) {
      if (d.key === 'roles' || d.key === 'role') {
        roles.push(d.value);
      }
    }
    return roles.sort();
  }

  // ---------------------------------------------------------------------------
  // Root module resolution (spec normative)
  // ---------------------------------------------------------------------------

  private _resolveRootModuleId(moduleRegistry: ModuleRegistry): string | undefined {
    // Rule 1: exactly one Module with name === 'AppModule' and !isStandaloneRoot
    const appModules = moduleRegistry.modules.filter((m) => m.name === 'AppModule');
    if (appModules.length === 1 && appModules[0] !== undefined) return appModules[0].id;

    // Rule 2: exactly one standalone root
    // (Currently all modules have isStandaloneRoot=false, but ready for future)
    // Not applicable yet — skip

    return undefined;
  }

  // ---------------------------------------------------------------------------
  // Navigation resolution helpers
  // ---------------------------------------------------------------------------

  private _normalizeRouterLinkValue(value: string): string | null {
    if (value.startsWith('[')) {
      const parts = value
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter((s) => s.length > 0);
      // If all parts are string literals (no variable names remaining), join directly
      const allStatic = value
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .every((s) => s.startsWith("'") || s.startsWith('"'));
      if (allStatic) {
        return '/' + parts.join('/').replace(/^\//, '');
      }
      // Array contains dynamic segments — return null (handled by array resolver)
      return null;
    }
    const stripped = value.replace(/^['"]|['"]$/g, '');
    if (stripped.startsWith('/')) return stripped;
    if (stripped.startsWith('./') || stripped.startsWith('../')) return null;
    return `/${stripped}`;
  }

  /**
   * Resolve relative routerLink values against the parent route's fullPath.
   * A relative path is one that doesn't start with '/' after stripping quotes.
   * Resolution: parentFullPath + '/' + relativePath, then match against route table.
   * Deterministic tie-breaking: fewest path segments, then lex smallest fullPath.
   */
  private _resolveRelativeNavigation(
    rawValue: string,
    componentId: string,
    componentToRouteFullPaths: Map<string, string[]>,
    pathToRouteId: Map<string, string>,
  ): string | undefined {
    // Strip quotes and array brackets
    let stripped = rawValue.replace(/^['"]|['"]$/g, '').trim();
    if (stripped.startsWith('[')) {
      stripped = stripped.replace(/^\[|\]$/g, '').split(',')[0]?.trim().replace(/^['"]|['"]$/g, '') ?? '';
    }
    // Only resolve truly relative paths (not starting with /)
    if (stripped.startsWith('/') || stripped === '' || stripped.includes('{{')) return undefined;
    // Strip ./ prefix if present
    if (stripped.startsWith('./')) stripped = stripped.slice(2);
    // Skip ../ paths (complex resolution not supported)
    if (stripped.startsWith('../')) return undefined;

    const parentPaths = componentToRouteFullPaths.get(componentId);
    if (parentPaths === undefined || parentPaths.length === 0) return undefined;

    // Try resolving against each parent route
    const candidates: Array<{ routeId: string; fullPath: string }> = [];
    for (const parentPath of parentPaths) {
      const resolved = parentPath === '/'
        ? `/${stripped}`
        : `${parentPath}/${stripped}`;

      // Direct match
      const routeId = pathToRouteId.get(resolved);
      if (routeId !== undefined) {
        candidates.push({ routeId, fullPath: resolved });
        continue;
      }

      // Try matching with :param segments in the resolved path
      for (const [routeFullPath, rId] of pathToRouteId) {
        if (this._pathMatchesTemplate(resolved, routeFullPath)) {
          candidates.push({ routeId: rId, fullPath: routeFullPath });
        }
      }
    }

    if (candidates.length === 0) return undefined;
    if (candidates.length === 1) return candidates[0]!.routeId;

    // Deterministic tie-breaking: fewest segments, then lex smallest fullPath
    candidates.sort((a, b) => {
      const segA = a.fullPath.split('/').length;
      const segB = b.fullPath.split('/').length;
      if (segA !== segB) return segA - segB;
      return a.fullPath.localeCompare(b.fullPath);
    });
    return candidates[0]!.routeId;
  }

  /** Resolve a component class name to a node ID for dialog composition. */
  private _resolveDialogComponent(
    className: string,
    compByClassName: Map<string, ComponentInfo>,
    nodeIds: Set<string>,
  ): string | undefined {
    const comp = compByClassName.get(className);
    if (comp !== undefined && nodeIds.has(comp.id)) return comp.id;
    return undefined;
  }

  /** Check if a resolved path matches a route template (e.g., /projects/123 matches /projects/:id). */
  private _pathMatchesTemplate(resolvedPath: string, routeTemplate: string): boolean {
    const resolvedSegs = resolvedPath.split('/').filter(s => s.length > 0);
    const templateSegs = routeTemplate.split('/').filter(s => s.length > 0);
    if (resolvedSegs.length !== templateSegs.length) return false;
    return templateSegs.every((tSeg, i) =>
      tSeg.startsWith(':') || tSeg === resolvedSegs[i],
    );
  }

  /**
   * Resolve array-style navigation (e.g., ['/users', userId]) against route templates.
   * Dynamic segments match :param route segments. Static segments must match exactly.
   * Returns the matched routeId if exactly one route matches, else undefined.
   */
  private _resolveArrayNavigation(
    rawPath: string,
    pathToRouteId: Map<string, string>,
  ): string | undefined {
    const segments = this._parseNavigationSegments(rawPath);
    if (segments === null || segments.length === 0) return undefined;
    return this._matchSegmentsToRoute(segments, pathToRouteId);
  }

  /**
   * Match typed navigation segments against route fullPaths.
   * Tie-breaking when multiple routes match:
   *   1. fewest param segments
   *   2. lexicographically smallest fullPath
   */
  private _matchSegmentsToRoute(
    segments: Array<{ value: string; isDynamic: boolean }>,
    pathToRouteId: Map<string, string>,
  ): string | undefined {
    const matches: Array<{ routeId: string; fullPath: string; paramCount: number }> = [];
    for (const [fullPath, routeId] of pathToRouteId) {
      if (fullPath === '/' || fullPath.endsWith('/**')) continue;
      const routeSegments = fullPath.split('/').filter((s) => s.length > 0);
      if (routeSegments.length !== segments.length) continue;

      let matched = true;
      let paramCount = 0;
      for (let i = 0; i < segments.length; i++) {
        const routeSeg = routeSegments[i]!;
        const navSeg = segments[i]!;
        if (routeSeg.startsWith(':')) {
          paramCount++;
          continue; // param segment matches any nav segment
        }
        if (navSeg.isDynamic) { matched = false; break; } // dynamic nav vs static route → no match
        if (routeSeg !== navSeg.value) { matched = false; break; }
      }

      if (matched) matches.push({ routeId, fullPath, paramCount });
    }

    if (matches.length === 0) return undefined;
    if (matches.length === 1) return matches[0]!.routeId;

    // Deterministic tie-breaking: fewest param segments, then lex smallest fullPath
    matches.sort((a, b) => {
      const paramDiff = a.paramCount - b.paramCount;
      if (paramDiff !== 0) return paramDiff;
      return a.fullPath.localeCompare(b.fullPath);
    });
    return matches[0]!.routeId;
  }

  /** Parse array navigation expression into typed segments. */
  private _parseNavigationSegments(
    rawPath: string,
  ): Array<{ value: string; isDynamic: boolean }> | null {
    if (!rawPath.startsWith('[')) return null;
    const inner = rawPath.replace(/^\[|\]$/g, '');
    const parts = inner.split(',').map((s) => s.trim()).filter((s) => s.length > 0);

    const segments: Array<{ value: string; isDynamic: boolean }> = [];
    for (const part of parts) {
      const isStringLiteral = part.startsWith("'") || part.startsWith('"');
      const stripped = part.replace(/^['"]|['"]$/g, '');
      if (stripped === '/' || stripped === '') continue; // leading slash
      if (isStringLiteral) {
        // Split multi-segment string literals (e.g., '/users/add' → ['users', 'add'])
        for (const seg of stripped.split('/').filter((s) => s.length > 0)) {
          segments.push({ value: seg, isDynamic: false });
        }
      } else {
        segments.push({ value: stripped, isDynamic: true });
      }
    }

    return segments.length > 0 ? segments : null;
  }

  /**
   * Resolve interpolation-style navigation targets (e.g., "/owners/{{owner.id}}").
   * Segments containing {{...}} are treated as dynamic (match route :param segments).
   * Only attempts resolution when the target starts with "/" and contains "{{".
   * Query strings and fragments are stripped before matching.
   */
  private _resolveInterpolationNavigation(
    rawTarget: string,
    pathToRouteId: Map<string, string>,
  ): string | undefined {
    const cleaned = rawTarget.replace(/^['"]|['"]$/g, '').trim();
    if (!cleaned.startsWith('/')) return undefined;
    if (!cleaned.includes('{{')) return undefined;

    // Strip query string and fragment before matching
    const pathOnly = cleaned.replace(/[?#].*$/, '');

    const rawSegments = pathOnly.split('/').filter((s) => s.length > 0);
    if (rawSegments.length === 0) return undefined;

    const segments: Array<{ value: string; isDynamic: boolean }> = rawSegments.map((seg) => ({
      value: seg,
      isDynamic: seg.includes('{{'),
    }));

    return this._matchSegmentsToRoute(segments, pathToRouteId);
  }

  private _isExternal(url: string): boolean {
    return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//');
  }

  private _resolveNavigatePath(
    rawPath: string,
    pathToRouteId: Map<string, string>,
  ): string | undefined {
    const clean = rawPath.replace(/^['"\[]|['"]\]?$/g, '').trim();
    const direct = pathToRouteId.get(clean) ?? pathToRouteId.get(`/${clean}`);
    if (direct !== undefined) return direct;

    // Fallback 1: try array navigation resolution
    const arrayResult = this._resolveArrayNavigation(rawPath, pathToRouteId);
    if (arrayResult !== undefined) return arrayResult;

    // Fallback 2: try interpolation resolution
    return this._resolveInterpolationNavigation(rawPath, pathToRouteId);
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function capitalize(s: string): string {
  if (s.length === 0) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
