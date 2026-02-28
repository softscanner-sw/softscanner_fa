/**
 * multigraph.ts
 * Spec-compliant types for the Phase A1 UI Interaction Multigraph.
 * These types mirror exactly the frozen schema in docs/paper/approach.md §9.
 *
 * Authority: docs/paper/approach.md §9 (normative, frozen).
 * Do not modify without spec amendment.
 */

// ---------------------------------------------------------------------------
// SourceRef — provenance pointer (char-offset based)
// ---------------------------------------------------------------------------

/** A stable reference into source code for auditability and determinism. */
export interface SourceRef {
  /** Project-relative file path (POSIX normalized). */
  file: string;
  /** Inclusive start offset (character index) within the file. */
  start: number;
  /** Exclusive end offset (character index) within the file. */
  end: number;
}

// ---------------------------------------------------------------------------
// Node kinds
// ---------------------------------------------------------------------------

/** All supported node categories. */
export type NodeKind =
  | 'Module'
  | 'Route'
  | 'Component'
  | 'Widget'
  | 'Service'
  | 'External';

/** Supported widget taxonomy. Keep small and stable. */
export type SpecWidgetKind =
  | 'Button'
  | 'Link'
  | 'Form'
  | 'Input'
  | 'Select'
  | 'Option'
  | 'RadioGroup'
  | 'Radio'
  | 'Checkbox'
  | 'TextArea'
  | 'OtherInteractive';

// ---------------------------------------------------------------------------
// Edge kinds
// ---------------------------------------------------------------------------

/** All supported edge kinds; structural vs executable is implied by kind. */
export type EdgeKind =
  // Structural
  | 'MODULE_IMPORTS_MODULE'
  | 'MODULE_EXPORTS_MODULE'
  | 'MODULE_DECLARES_COMPONENT'
  | 'MODULE_DECLARES_ROUTE'
  | 'ROUTE_HAS_CHILD'
  | 'ROUTE_ACTIVATES_COMPONENT'
  | 'COMPONENT_CONTAINS_WIDGET'
  | 'WIDGET_COMPOSES_WIDGET'
  | 'COMPONENT_COMPOSES_COMPONENT'
  | 'MODULE_PROVIDES_SERVICE'
  | 'COMPONENT_PROVIDES_SERVICE'
  // Executable
  | 'WIDGET_NAVIGATES_ROUTE'
  | 'WIDGET_NAVIGATES_EXTERNAL'
  | 'WIDGET_TRIGGERS_HANDLER'
  | 'WIDGET_SUBMITS_FORM'
  | 'COMPONENT_CALLS_SERVICE'
  | 'COMPONENT_NAVIGATES_ROUTE'
  | 'ROUTE_REDIRECTS_TO_ROUTE';

/** Structural edge kinds (for classification). */
export const STRUCTURAL_EDGE_KINDS: ReadonlySet<EdgeKind> = new Set<EdgeKind>([
  'MODULE_IMPORTS_MODULE',
  'MODULE_EXPORTS_MODULE',
  'MODULE_DECLARES_COMPONENT',
  'MODULE_DECLARES_ROUTE',
  'ROUTE_HAS_CHILD',
  'ROUTE_ACTIVATES_COMPONENT',
  'COMPONENT_CONTAINS_WIDGET',
  'WIDGET_COMPOSES_WIDGET',
  'COMPONENT_COMPOSES_COMPONENT',
  'MODULE_PROVIDES_SERVICE',
  'COMPONENT_PROVIDES_SERVICE',
]);

// ---------------------------------------------------------------------------
// Atom (SAT-ready predicate placeholder)
// ---------------------------------------------------------------------------

/** SAT-ready predicate placeholder. */
export interface Atom {
  /** Machine-checkable predicate identifier. */
  kind: 'FormValid' | 'HasSelection' | 'ParamBound' | 'GuardPasses' | 'Other';
  /** Predicate arguments (IDs, names, param keys). */
  args: string[];
  /** Evidence span that justifies this atom. */
  source: SourceRef;
}

// ---------------------------------------------------------------------------
// ConstraintSurface
// ---------------------------------------------------------------------------

/** Constraints attached to executable edges and merged across workflows later. */
export interface ConstraintSurface {
  /** Required route parameter keys implied by target route templates. */
  requiredParams: string[];
  /** Guard names extracted from route config. */
  guards: string[];
  /** Role strings extracted from route data if present. */
  roles: string[];
  /** Atomic predicates for later satisfiability/pruning. */
  uiAtoms: Atom[];
  /** Supporting evidence spans. */
  evidence: SourceRef[];
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

/** Common fields for all node types. */
export interface NodeBase {
  /** Deterministic unique identifier. */
  id: string;
  /** Node kind discriminator. */
  kind: NodeKind;
  /** Human-readable label for visualization. */
  label: string;
  /** Evidence spans backing this node. */
  refs: SourceRef[];
}

/** Module node. Structural scope entity. */
export type ModuleNode = NodeBase & {
  kind: 'Module';
  meta: {
    /** Module class name or standalone marker name. */
    name: string;
    /** Project-relative TS file where the module/root is defined. */
    file: string;
    /** True when derived from bootstrapApplication rather than NgModule. */
    isStandaloneRoot: boolean;
  };
};

/** Route node. Canonical route context template. */
export type RouteNode = NodeBase & {
  kind: 'Route';
  meta: {
    /** Canonical full path including params (e.g., /users/:id). */
    fullPath: string;
    /** Original 'path' field value from the route record. */
    path: string;
    /** True if this route has no parent route. */
    isTopLevel: boolean;
    /** True if this route is an entry context (A1-computed). */
    isEntry: boolean;
    /** True if this route is wildcard (**). */
    isWildcard: boolean;
    /** Parameter keys extracted from path (e.g., ['id']). */
    params: string[];
    /** Guard names present on the route record. */
    guards: string[];
    /** Role strings extracted from route data if present. */
    roles: string[];
    /** Redirect target (canonical full path) if redirect route, else undefined. */
    redirectTo?: string;
  };
};

/** Component node. */
export type ComponentNode = NodeBase & {
  kind: 'Component';
  meta: {
    /** Exported class name. */
    name: string;
    /** Project-relative TS file path declaring the component. */
    file: string;
    /** Component selector string (metadata only). */
    selector?: string;
    /** Template file path if templateUrl is used (if known). */
    templateFile?: string;
  };
};

/** Widget node: an interactive or grouping element instance in a component template. */
export type WidgetNode = NodeBase & {
  kind: 'Widget';
  meta: {
    /** Owning component node ID. */
    componentId: string;
    /** Widget kind classification. */
    widgetKind: SpecWidgetKind;
    /** DOM tag name if available (e.g., 'button', 'a', 'form'). */
    tagName?: string;
    /** All event names bound on this widget (including custom). */
    eventNames: string[];
    /** Map from event name to raw handler expression text (audit only). */
    eventHandlerTextByName: Record<string, string>;
    /** Raw routerLink expression text if present (audit only). */
    routerLinkText?: string;
    /** Static href if present and resolvable at extract time. */
    staticHref?: string;
    /** Relevant HTML attributes (type, id, name, etc.) when available. */
    attributes?: Record<string, string>;
  };
};

/** Service node: class-based service identity. */
export type ServiceNode = NodeBase & {
  kind: 'Service';
  meta: {
    /** Exported class name. */
    name: string;
    /** Project-relative TS file path declaring the service. */
    file: string;
  };
};

/** External node: static external URL target. */
export type ExternalNode = NodeBase & {
  kind: 'External';
  meta: {
    /** Absolute or protocol-relative URL if statically known. */
    url: string;
  };
};

/** Closed node union. */
export type Node =
  | ModuleNode
  | RouteNode
  | ComponentNode
  | WidgetNode
  | ServiceNode
  | ExternalNode;

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------

/** Trigger metadata for executable edges originating from template interaction sites. */
export interface TriggerRef {
  /** Event name from template binding (e.g., click, submit, custom). */
  event?: string;
  /** True if the trigger is a routerLink (no handler required). */
  viaRouterLink?: boolean;
}

/** Handler metadata for edges tied to a component method. */
export interface HandlerRef {
  /** Component node ID that owns the method. */
  componentId: string;
  /** Method name referenced from the template. */
  methodName: string;
}

/** Edge definition. Structural vs executable is implied by kind. */
export interface Edge {
  /** Deterministic unique edge ID. */
  id: string;
  /** Edge kind. */
  kind: EdgeKind;
  /** Source node ID. */
  from: string;
  /** Target node ID. Null only when unresolved navigation (targetRouteId=null). */
  to: string | null;

  /** True only for automatic system transitions (redirects). */
  isSystem?: boolean;

  /** Trigger metadata for widget-origin edges. */
  trigger?: TriggerRef;

  /** Handler metadata when an event binds to a component method. */
  handler?: HandlerRef;

  /** Constraints for executable edges; structural edges must use empty surface. */
  constraints: ConstraintSurface;

  /** Evidence spans backing this edge. */
  refs: SourceRef[];

  /** For navigation edges: resolved target route ID if known, else null. */
  targetRouteId?: string | null;

  /** For unresolved navigation: raw expression text (audit only). */
  targetText?: string;
}

// ---------------------------------------------------------------------------
// Multigraph
// ---------------------------------------------------------------------------

/** Multigraph container: single shared node universe + mixed edge set. */
export interface Multigraph {
  /** All nodes. Must be sorted deterministically by id in output. */
  nodes: Node[];
  /** All edges. Must be sorted deterministically in output. */
  edges: Edge[];
}

// ---------------------------------------------------------------------------
// Phase1Bundle — the sole A1 output artifact
// ---------------------------------------------------------------------------

/** Phase A1 output bundle. */
export interface Phase1Bundle {
  /** Primary artifact: the multigraph. */
  multigraph: Multigraph;

  /** Basic summary statistics for audit diffs across subjects. */
  stats: {
    nodeCount: number;
    edgeCount: number;
    structuralEdgeCount: number;
    executableEdgeCount: number;
  };
}

// ---------------------------------------------------------------------------
// Empty constraint surface factory
// ---------------------------------------------------------------------------

/** Create an empty ConstraintSurface (used for structural edges). */
export function emptyConstraintSurface(): ConstraintSurface {
  return {
    requiredParams: [],
    guards: [],
    roles: [],
    uiAtoms: [],
    evidence: [],
  };
}
