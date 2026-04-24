/**
 * intent-deriver.ts
 * Derives one RealizationIntent per non-PRUNED TaskWorkflow from A1 + A2 artifacts.
 *
 * Pure derivation — no manifest, no LLM, no side effects.
 *
 * Phase isolation: imports only from src/models/ and src/workflows/graph-index.ts (types + index).
 */

import type {
  A1Multigraph,
  ComponentNode,
  Edge,
  ExternalNode,
  Node,
  RouteNode,
  WidgetNode,
} from '../../models/multigraph.js';
import type { A2WorkflowSet, TaskWorkflow } from '../../models/workflow.js';
import { buildGraphIndex, computeInputRef } from '../../workflows/graph-index.js';
import type { GraphIndex } from '../../workflows/graph-index.js';
import type {
  B1IntentSet,
  IntentFormField,
  IntentStartRoute,
  IntentTriggerWidget,
  RealizationIntent,
} from './intent-types.js';

// ---------------------------------------------------------------------------
// Trigger event derivation
// ---------------------------------------------------------------------------

function deriveTriggerEvent(triggerEdge: Edge): string | undefined {
  switch (triggerEdge.kind) {
    case 'WIDGET_NAVIGATES_ROUTE':
    case 'WIDGET_NAVIGATES_EXTERNAL':
      return 'click';
    case 'WIDGET_SUBMITS_FORM':
      return triggerEdge.trigger?.event ?? 'submit';
    case 'WIDGET_TRIGGERS_HANDLER':
      return triggerEdge.trigger?.event ?? undefined;
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Guard names derivation
// ---------------------------------------------------------------------------

function deriveGuardNames(
  wf: TaskWorkflow,
  index: GraphIndex,
): string[] {
  const guards = new Set<string>();

  // From cw.guards (edge constraint surfaces merged by A2)
  for (const g of wf.cw.guards) guards.add(g);

  // From explanation.requiredGuards (route contexts visited during traversal)
  if (wf.explanation.requiredGuards) {
    for (const g of wf.explanation.requiredGuards) guards.add(g);
  }

  // From start route meta.guards (including ancestor routes)
  for (const routeId of wf.startRouteIds) {
    const node = index.nodeMap.get(routeId);
    if (node?.kind === 'Route') {
      const route = node as RouteNode;
      for (const g of route.meta.guards) guards.add(g);

      // Walk up parent routes (Angular applies parent guards too)
      let parent = index.routeParentOf.get(routeId);
      const seen = new Set<string>();
      while (parent !== undefined && !seen.has(parent)) {
        seen.add(parent);
        const parentNode = index.nodeMap.get(parent);
        if (parentNode?.kind === 'Route') {
          for (const g of (parentNode as RouteNode).meta.guards) guards.add(g);
        }
        parent = index.routeParentOf.get(parent);
      }
    }
  }

  return [...guards].sort();
}

// ---------------------------------------------------------------------------
// Start routes derivation
// ---------------------------------------------------------------------------

function deriveStartRoutes(
  wf: TaskWorkflow,
  index: GraphIndex,
): IntentStartRoute[] {
  return wf.startRouteIds.map((routeId) => {
    const node = index.nodeMap.get(routeId);
    if (node?.kind === 'Route') {
      const route = node as RouteNode;
      return {
        routeId,
        fullPath: route.meta.fullPath,
        requiredParams: [...route.meta.params].sort(),
      };
    }
    return {
      routeId,
      fullPath: '(unknown)',
      requiredParams: [],
    };
  });
}

// ---------------------------------------------------------------------------
// Trigger widget derivation
// ---------------------------------------------------------------------------

function deriveTriggerWidget(
  triggerEdge: Edge,
  index: GraphIndex,
  widgetParentOf: ReadonlyMap<string, string>,
): IntentTriggerWidget {
  const widgetNode = index.nodeMap.get(triggerEdge.from);

  if (widgetNode?.kind !== 'Widget') {
    // Fallback for unexpected cases
    return {
      nodeId: triggerEdge.from,
      widgetKind: 'OtherInteractive',
      attributes: {},
    };
  }

  const widget = widgetNode as WidgetNode;

  // Resolve owning component's selector
  const compNode = index.nodeMap.get(widget.meta.componentId);
  const componentSelector = compNode?.kind === 'Component'
    ? (compNode as ComponentNode).meta.selector
    : undefined;

  // Resolve containing form (if widget is inside a form via WIDGET_CONTAINS_WIDGET)
  let containingFormId: string | undefined;
  const parentId = widgetParentOf.get(widget.id);
  if (parentId !== undefined) {
    const parentNode = index.nodeMap.get(parentId);
    if (parentNode?.kind === 'Widget' && (parentNode as WidgetNode).meta.widgetKind === 'Form') {
      containingFormId = parentId;
    }
  }

  return {
    nodeId: widget.id,
    ...(widget.meta.tagName !== undefined ? { tagName: widget.meta.tagName } : {}),
    widgetKind: widget.meta.widgetKind,
    attributes: widget.meta.attributes ?? {},
    ...(componentSelector !== undefined ? { componentSelector } : {}),
    ...(widget.meta.ui.formControlName !== undefined ? { formControlName: widget.meta.ui.formControlName } : {}),
    ...(widget.meta.routerLinkText !== undefined ? { routerLinkText: widget.meta.routerLinkText } : {}),
    ...(containingFormId !== undefined ? { containingFormId } : {}),
    ...(widget.meta.insideNgFor !== undefined ? { insideNgFor: widget.meta.insideNgFor } : {}),
    ...(widget.meta.insideNgForOrdinal !== undefined ? { insideNgForOrdinal: widget.meta.insideNgForOrdinal } : {}),
    ...(widget.meta.ngForItemTag !== undefined ? { ngForItemTag: widget.meta.ngForItemTag } : {}),
    ...(widget.meta.text !== undefined ? { text: widget.meta.text } : {}),
    ...((() => {
      // Merge widget-level visibility gates with CCC-level composition gates.
      // Widget-own *ngIf/@if predicates (visibleExprText) act as activation gates
      // just like CCC-level insideNgIf wrappers — the widget won't render until
      // the predicate is satisfied. Including both enables B5.2 pre-wait emission
      // for ALL visibility-gated widgets, not just CCC-wrapped ones.
      const gates = [...(widget.meta.compositionGates ?? [])];
      const widgetVis = widget.meta.ui.visibleExprText;
      if (widgetVis && !gates.includes(widgetVis)) {
        gates.push(widgetVis);
      }
      return gates.length > 0 ? { compositionGates: gates } : {};
    })()),
  };
}

// ---------------------------------------------------------------------------
// Form schema derivation (WSF only)
// ---------------------------------------------------------------------------

function deriveFormSchema(
  formWidgetId: string,
  index: GraphIndex,
): IntentFormField[] {
  const fields: IntentFormField[] = [];

  // Find WIDGET_CONTAINS_WIDGET edges from the form widget
  const edgesFromForm = index.edgesByFrom.get(formWidgetId) ?? [];
  for (const edge of edgesFromForm) {
    if (edge.kind !== 'WIDGET_CONTAINS_WIDGET') continue;
    if (edge.to === null) continue;

    const childNode = index.nodeMap.get(edge.to);
    if (childNode?.kind !== 'Widget') continue;
    const child = childNode as WidgetNode;

    // Exclude: nested forms, buttons (not interactive fill targets),
    // options (children of Select — not direct fill targets),
    // hidden elements (visibleLiteral false or cssVisibilityHint false).
    if (child.meta.widgetKind === 'Form') continue;
    if (child.meta.widgetKind === 'Button') continue;
    if (child.meta.widgetKind === 'Option') continue;
    if (child.meta.ui.visibleLiteral === false) continue;
    if (child.meta.ui.cssVisibilityHint === false) continue;
    if (child.meta.ui.inputType === 'hidden') continue;
    // Exclude statically readonly inputs (readonly, readonly="", readonly="true", readonly="readonly")
    // but NOT dynamic [readonly]="expression" bindings (which have non-literal values).
    const readonlyVal = child.meta.attributes?.['readonly'];
    if (readonlyVal !== undefined && (readonlyVal === '' || readonlyVal === 'true' || readonlyVal === 'readonly')) continue;

    // Use id attribute as fallback identifier when no formControlName/nameAttr
    const idAttr = child.meta.attributes?.['id'];

    // Detect date format from Angular date pipe in ngModelText (e.g. "pet.birthDate | date:'yyyy-MM-dd'")
    let dateFormat: string | undefined;
    if (child.meta.ui.ngModelText !== undefined) {
      const datePipeMatch = child.meta.ui.ngModelText.match(/\|\s*date\s*:\s*'([^']+)'/);
      if (datePipeMatch !== null) {
        dateFormat = datePipeMatch[1];
      }
    }

    // Extract first option value for select/radio when child options exist
    let firstOptionValue: string | undefined;
    if (child.meta.widgetKind === 'Select' || child.meta.tagName === 'select' || child.meta.tagName === 'mat-select') {
      const childEdges = index.edgesByFrom.get(child.id) ?? [];
      for (const ce of childEdges) {
        if (ce.kind !== 'WIDGET_CONTAINS_WIDGET' || ce.to === null) continue;
        const optNode = index.nodeMap.get(ce.to);
        if (optNode?.kind === 'Widget' && (optNode as WidgetNode).meta.widgetKind === 'Option') {
          const optAttrs = (optNode as WidgetNode).meta.attributes;
          if (optAttrs?.['value'] !== undefined && optAttrs['value'] !== '') {
            firstOptionValue = optAttrs['value'];
            break;
          }
        }
      }
    }

    fields.push({
      fieldNodeId: child.id,
      tagName: child.meta.tagName ?? 'input',
      widgetKind: child.meta.widgetKind,
      ...(child.meta.ui.formControlName !== undefined ? { formControlName: child.meta.ui.formControlName } : {}),
      ...(child.meta.ui.nameAttr !== undefined ? { nameAttr: child.meta.ui.nameAttr } : {}),
      ...(idAttr !== undefined && child.meta.ui.formControlName === undefined && child.meta.ui.nameAttr === undefined
        ? { idAttr } : {}),
      ...(child.meta.ui.inputType !== undefined ? { inputType: child.meta.ui.inputType } : {}),
      required: child.meta.ui.requiredLiteral ?? false,
      ...(child.meta.ui.minLength !== undefined ? { minLength: child.meta.ui.minLength } : {}),
      ...(child.meta.ui.maxLength !== undefined ? { maxLength: child.meta.ui.maxLength } : {}),
      ...(child.meta.ui.min !== undefined ? { min: child.meta.ui.min } : {}),
      ...(child.meta.ui.max !== undefined ? { max: child.meta.ui.max } : {}),
      ...(child.meta.ui.pattern !== undefined ? { pattern: child.meta.ui.pattern } : {}),
      ...(dateFormat !== undefined ? { dateFormat } : {}),
      ...(firstOptionValue !== undefined ? { firstOptionValue } : {}),
    });
  }

  return fields;
}

// ---------------------------------------------------------------------------
// Terminal route path derivation
// ---------------------------------------------------------------------------

function deriveTerminalRoutePath(
  terminalNodeId: string,
  index: GraphIndex,
): string | undefined {
  const node = index.nodeMap.get(terminalNodeId);
  if (node?.kind === 'Route') {
    return (node as RouteNode).meta.fullPath;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Derive one RealizationIntent per non-PRUNED TaskWorkflow.
 * Pure function of A1 + A2 — deterministic, no side effects.
 */
export function deriveIntents(
  a1: A1Multigraph,
  a2: A2WorkflowSet,
): B1IntentSet {
  const index = buildGraphIndex(a1);
  const inputRef = computeInputRef(a1);
  inputRef.projectId = a2.input.projectId;

  // Build reverse WIDGET_CONTAINS_WIDGET index: child → parent
  const widgetParentOf = new Map<string, string>();
  for (const node of a1.multigraph.nodes) {
    if (node.kind !== 'Widget') continue;
    const edges = index.edgesByFrom.get(node.id) ?? [];
    for (const edge of edges) {
      if (edge.kind === 'WIDGET_CONTAINS_WIDGET' && edge.to !== null) {
        widgetParentOf.set(edge.to, node.id);
      }
    }
  }

  const intents: RealizationIntent[] = [];
  let feasibleCount = 0;
  let conditionalCount = 0;
  let prunedCount = 0;

  for (const wf of a2.workflows) {
    if (wf.verdict === 'PRUNED') {
      prunedCount++;
      continue;
    }

    if (wf.verdict === 'FEASIBLE') feasibleCount++;
    else conditionalCount++;

    const triggerEdge = index.edgeById.get(wf.triggerEdgeId);
    if (triggerEdge === undefined) {
      // Should never happen — A2 references valid A1 edges
      continue;
    }

    const triggerKind = wf.steps[0]!.kind;
    const triggerEvent = deriveTriggerEvent(triggerEdge);
    const startRoutes = deriveStartRoutes(wf, index);
    const triggerWidget = deriveTriggerWidget(triggerEdge, index, widgetParentOf);
    const guardNames = deriveGuardNames(wf, index);
    const terminalRoutePath = deriveTerminalRoutePath(wf.terminalNodeId, index);

    // Form schema: only for WSF triggers
    let formSchema: IntentFormField[] | undefined;
    if (triggerKind === 'WIDGET_SUBMITS_FORM') {
      formSchema = deriveFormSchema(triggerEdge.from, index);
    }

    const intent: RealizationIntent = {
      workflowId: wf.id,
      verdict: wf.verdict,
      triggerKind,
      ...(triggerEvent !== undefined ? { triggerEvent } : {}),
      startRoutes,
      triggerWidget,
      ...(formSchema !== undefined ? { formSchema } : {}),
      effectSteps: wf.steps,
      terminalNodeId: wf.terminalNodeId,
      ...(terminalRoutePath !== undefined ? { terminalRoutePath } : {}),
      constraints: wf.cw,
      explanation: wf.explanation,
      guardNames,
      requiresParams: wf.cw.requiredParams.length > 0 ||
        (startRoutes[0]?.requiredParams.length ?? 0) > 0,
      hasUnresolvedTargets: (wf.explanation.unresolvedTargets?.length ?? 0) > 0,
    };

    intents.push(intent);
  }

  return {
    input: inputRef,
    intents,
    stats: {
      totalCount: a2.workflows.length,
      feasibleCount,
      conditionalCount,
      prunedCount,
    },
  };
}

/**
 * Resolve the external URL for a terminal node (WNE workflows).
 * Utility for GT validation — not part of RealizationIntent itself.
 */
export function resolveTerminalExternalUrl(
  terminalNodeId: string,
  nodeMap: ReadonlyMap<string, Node>,
): string | undefined {
  const node = nodeMap.get(terminalNodeId);
  if (node?.kind === 'External') {
    return (node as ExternalNode).meta.url;
  }
  return undefined;
}
