# Approach — Operational Specification (Normative, Frozen)
### Strategy
Freeze a single **UI Interaction Multigraph** with one shared node universe representing what exists in the codebase: **Modules, Routes, Components, Widgets, Services, External targets**. Distinguish “structural” vs “executable” semantics strictly by **edge kinds and edge metadata**, not by introducing separate node sets.

Then:

1. Freeze the schema (types + invariants).
2. Refactor A1 extraction to populate exactly this schema deterministically.
3. Re-run extraction across all validation subjects until artifacts are structurally faithful and auditable.
4. Only then finalize A2 (candidate workflow construction) and A3 (constraint satisfiability pruning) against this frozen A1 contract.

A1 is the semantic substrate. Any ambiguity here multiplies downstream churn.

---

# 1) What must be extracted from an Angular AST to build the multigraph
A1 has one job: produce a graph that is (a) complete relative to the chosen model, (b) deterministic, and (c) auditable back to code.

## A. Module layer (structural, required)
Modules are required as structural entities because they define:

* namespace boundaries for declarations/imports/exports
* bootstrap roots
* route array ownership (evidence provenance)
* provider scopes for services (at a minimal viable level)

* **Extract from:**
  * `@NgModule({ declarations, imports, exports, providers, bootstrap })`
  * standalone bootstrapping: `bootstrapApplication(AppComponent, { providers: [...] })`
  * `@Injectable({ providedIn: 'root' })`
  * route array ownership call sites:
    * `RouterModule.forRoot(...)`
    * `RouterModule.forChild(...)`
    * `provideRouter(...)`
* **Capture (minimum):**
  * module identity (file + class name OR standalone root marker)
  * declared components
  * bootstrap component(s)
  * providers (class-based services only)
  * route array ownership (which module a route array belongs to)
  * module-to-module relationships:
    * for each NgModule `imports` entry that resolves to a project Module class, emit `MODULE_IMPORTS_MODULE(Module → Module)`
    * for each NgModule `exports` entry that resolves to a project Module class, emit `MODULE_EXPORTS_MODULE(Module → Module)`
  * root-provided services:
    * for each `@Injectable({ providedIn: 'root' })` service, emit `MODULE_PROVIDES_SERVICE(rootModuleId → serviceId)` using the rootModuleId rule


**Root module resolution (normative):**
* `rootModuleId` is determined as:
  * If exactly one `Module` node has `meta.name === "AppModule"` and `meta.isStandaloneRoot === false`, use that.
  * Else if exactly one `Module` node has `meta.isStandaloneRoot === true`, use that.
  * Else do not emit `MODULE_PROVIDES_SERVICE` for providedIn:'root' services.
* **Module import/export resolution (normative):**
  * Emit edges only for entries that resolve to a Module class symbol in the analyzed project.
  * Ignore library modules and any non-resolvable/non-class expressions.
  * Dedup: at most one edge per `(from, kind, to)`; merge refs deterministically.
* **Edge refs (normative):**
  * For module import/export edges, `refs` must point to the span of the specific import/export element.

No DI token/class mapping tables. No provider resolution graph.

---

## B. Routing layer (structure + redirect + guard metadata)
Extract route arrays wherever they occur:

* `RouterModule.forRoot(...)`
* `RouterModule.forChild(...)`
* `provideRouter(...)`
* exported route arrays (e.g., `export const routes = [...]`)

From each route record extract at least:

* `path`
* `component`
* `children` (must be recursive; inline children arrays must be parsed)
* `redirectTo`
* `pathMatch`
* `canActivate`, `canActivateChild`, `canLoad` (stored as constraint metadata)
* `data` (roles/flags stored as metadata)

Also extract:

* param names from `path` (e.g., `/users/:id` → `["id"]`)
* wildcard marker (`path: "**"`)

Do not model router outlets.

---

## C. Component + template layer (structure + interaction surface)
From each `@Component(...)`:

* component class identity (file + exported class name)
* selector (metadata only; never identity)
* template source (`templateUrl` or inline template)

From template AST extract:

### 1) Widgets
A **Widget node** is created for every template element that is either:

* interactive (has any `(eventName)=...`)
* navigational (`routerLink` / `[routerLink]`)
* external link (`<a href="...">` static)
* a grouping/widget-container relevant to interaction structure (Form/Select/RadioGroup/etc.)

For each widget, extract:

* widget kind (small stable enum)
* DOM tag name if available
* all event names bound on the widget (including custom)
* handler expression text for each bound event (for audit)
* routerLink expression text if present
* static href if present

### 2) Widget composition (required)
Widgets can contain widgets. This is required structurally.
Extract parent-child widget containment edges:

* form → controls
* select → options
* radiogroup → radios
* any nested widget structure as encountered

This is not “all HTML nodes.” It is the widget subtree rooted at extracted widgets.

### 3) Component composition (required)
Components can compose components via selectors inside templates.
Extract `Component → Component` composition edges when the selector resolution is deterministic within the analyzed project:

* known selector tags resolve to a known component class
* unknown/custom elements are ignored (no edges)

Identity remains file+class; selectors only support composition mapping.
No Inputs/Outputs extraction.

---

## D. Handler body analysis (executable effects)
For each handler referenced from templates:
Detect router navigation calls:

* `router.navigate(...)`
* `router.navigateByUrl(...)`

Detect service calls:

* `this.<serviceMember>.<method>(...)`
* constructor-injected service members used in calls
* minimal support for `inject(Service)` to identify the service instance

No window/document navigation.
No UI-effects modeling unless it is already a stable detector in your codebase; otherwise omit.

---

## E. Evidence + determinism metadata (non-negotiable)
Every extracted node/edge must carry:
* `SourceRef { file, start, end }`
* stable origin keys sufficient to deduplicate cross-file resolution
* deterministic ordering in output

A1 is only useful if you can audit mismatches against the codebase precisely.

---

# 2) What constitutes nodes and edges and why
Use one shared node universe because these are all entities that exist in the codebase.
Edges encode two distinct semantics:

* **Structural edges**: existence, ownership, containment, activation, composition
* **Executable edges**: what can occur at runtime due to user/system steps and handler/service effects

Workflows later will be paths through executable edges, but they must remain explainable in terms of the structure. That requires both edge families to coexist over the same node set.

---

# 3) Final node kinds (unified, minimal, sufficient)
Nodes:

1. **Module**
2. **Route**
3. **Component**
4. **Widget**
5. **Service**
6. **External**

Guards are not nodes. They are constraint metadata.
No synthetic ENTRY/EXIT/ERROR nodes.

---

# 4) Final edge kinds (unified)
## A. Structural edges (describe the UI/routing structure)
These edges exist to support:

* mapping interaction sites → handlers → services → navigation
* deriving executable workflow paths that show concrete steps
* auditability and structural reachability

Required structural edges:

1. `MODULE_IMPORTS_MODULE` : `Module → Module`
2. `MODULE_EXPORTS_MODULE` : `Module → Module`
3. `MODULE_DECLARES_COMPONENT` : `Module → Component`
4. `MODULE_DECLARES_ROUTE` : `Module → Route`
5. `ROUTE_HAS_CHILD` : `Route → Route`
6. `ROUTE_ACTIVATES_COMPONENT` : `Route → Component`
7. `COMPONENT_CONTAINS_WIDGET` : `Component → Widget`
8. `WIDGET_COMPOSES_WIDGET` : `Widget → Widget`
9. `COMPONENT_COMPOSES_COMPONENT` : `Component → Component`
10. `MODULE_PROVIDES_SERVICE` : `Module → Service`
11. `COMPONENT_PROVIDES_SERVICE` : `Component → Service`

No router-outlet edges.
No lazy-load edges (lazy can be metadata only if desired; not required here).

---

## B. Executable edges (describe what can happen)
These are traversed by workflows.

1. `WIDGET_NAVIGATES_ROUTE` : `Widget → Route`
2. `WIDGET_NAVIGATES_EXTERNAL` : `Widget → External`
3. `WIDGET_TRIGGERS_HANDLER` : `Widget → Component` (handler metadata identifies method)
4. `WIDGET_SUBMITS_FORM` : `Widget(Form) → Component` (handler metadata identifies submit handler)
5. `COMPONENT_CALLS_SERVICE` : `Component → Service`
6. `COMPONENT_NAVIGATES_ROUTE` : `Component → Route`
7. `ROUTE_REDIRECTS_TO_ROUTE` : `Route → Route` (system edge; `isSystem=true`)

### Composite events (frozen micro-sequence rule)
Represent composite behavior as multiple edges in deterministic order.
For a typical click that calls a service and then navigates:

* `WIDGET_TRIGGERS_HANDLER`
* `COMPONENT_CALLS_SERVICE` (one per service call site you recognize; ordering preserved)
* `COMPONENT_NAVIGATES_ROUTE` (if present)

For form submission:

* `WIDGET_SUBMITS_FORM`
* `COMPONENT_CALLS_SERVICE`
* `COMPONENT_NAVIGATES_ROUTE` (if present)

Redirects are automatic transitions and must be marked `isSystem=true`.

---

# 5) Entry and terminal contexts without synthetic nodes
## Entry context (start)
Entry contexts are Route nodes where `meta.isEntry === true`.

* A1 must set `RouteNode.meta.isEntry` to true iff any holds:
  * top-level route (no parent)
  * root `path: ""`
  * reachable via redirect chain from root (follow `ROUTE_REDIRECTS_TO_ROUTE`)

No ENTRY node.

## Terminal context
Terminal contexts are:

* **External** nodes (explicit exit)
* **Route** nodes that have no outgoing executable edges under the chosen exploration policy (later in A2), but A1 still just encodes edges

No EXIT node.

## Error
Only model error if it exists as a real route:

* wildcard `path: "**"` is a normal Route node
* guard denial is not an “error route” unless the app defines one explicitly (that would appear as a normal route)

---

# 6) Dynamic navigation targets (mandatory behavior)
A1 must never drop navigation edges due to unresolved targets.

Resolution policy:

* static string navigation: match exact normalized `fullPath`
* array navigation (`navigate(['/users', id])`); resolution algorithm (deterministic, total, no backtracking):
  1. Normalize the navigation array into path segments:
     - Drop leading empty segment produced by absolute navigation (`'/'`).
     - Treat each string literal element as a literal segment.
     - Treat each non-literal (identifier, expression, interpolation) as a dynamic segment.
     - Do not evaluate expressions.
     - Do not resolve relative navigation (relativeTo not modeled in Phase A).
  2. Normalize candidate route templates:
     - Split `RouteNode.meta.fullPath` by `/`.
     - Remove leading empty segment.
     - Preserve param markers (`:id`).
     - Ignore trailing slash differences.
     - Wildcard routes (`**`) are excluded from array inference matching.
  3. A route template matches the navigation array iff:
     - Both have equal segment length.
     - For each index i:
       - If route segment is literal → navigation segment must be identical literal.
       - If route segment is param (`:x`) → navigation segment must be dynamic OR literal.
       - If navigation segment is dynamic and route segment is literal → no match.
     - All literal positions must match exactly (string equality after normalization).
  4. Collect all matching route templates.
  5. Deterministic resolution rule:
     - If exactly one route matches → resolve to that route.
     - If zero routes match → unresolved.
     - If more than one route matches → unresolved.
       (Phase A never breaks ties heuristically.)
  6. If unresolved:
     - Emit navigation edge.
     - Set `targetRouteId = null`.
     - Set `to = null`.
     - Populate `targetText` with raw expression.

---

# 7) Constraint model (edge payload, frozen semantics)
Constraints are attached to executable edges (structural edges use empty surfaces).
A guard implies **CONDITIONAL** later, not PRUNED.
PRUNED is reserved for contradictions discovered later by SAT/pruning logic (A3), not for missing credentials/seed data.
Redirect edges can carry constraints but remain system edges (`isSystem=true`).

## RequiredParams provenance (frozen)
`ConstraintSurface.requiredParams` is **edge-local** and must be populated by A1 extraction only. A3 never derives or infers required params from route templates.
A1 population rule for executable navigation edges:

* For `WIDGET_NAVIGATES_ROUTE`, `COMPONENT_NAVIGATES_ROUTE`, and `ROUTE_REDIRECTS_TO_ROUTE`:
  * If `edge.targetRouteId` resolves to a Route node `r`, then set `edge.constraints.requiredParams := r.meta.params` (copy of the target route’s parameter keys).
  * If `edge.targetRouteId === null` (unresolved), then set `edge.constraints.requiredParams := []` (do not infer).
* For all other executable edge kinds: `requiredParams := []`.

---

# 8) Workflow relevance (why this A1 model is sufficient)
This multigraph is sufficient to derive workflows later because:

* it encodes the full chain required for execution traces:
  * `Route → Component → Widget → Component → Service → Component → Route`
* it exposes the concrete interactive surfaces (widgets + events) so workflows do not collapse into “route-only” traces
* it attaches audit evidence to every step and preserves unresolved ambiguity explicitly

A2 and A3 can be defined purely as graph algorithms on top of this structure.

---

# 9) Typed schema (complete, commented, ambiguity-minimizing)

```ts
/** A stable reference into source code for auditability and determinism. */
export interface SourceRef {
  /** Project-relative file path (POSIX normalized). */
  file: string;
  /** Inclusive start offset (character index) within the file. */
  start: number;
  /** Exclusive end offset (character index) within the file. */
  end: number;
}

/** All supported node categories. */
export type NodeKind =
  | "Module"
  | "Route"
  | "Component"
  | "Widget"
  | "Service"
  | "External";

/** Supported widget taxonomy. Keep small and stable. */
export type WidgetKind =
  | "Button"
  | "Link"
  | "Form"
  | "Input"
  | "Select"
  | "Option"
  | "RadioGroup"
  | "Radio"
  | "Checkbox"
  | "TextArea"
  | "OtherInteractive";

/** All supported edge kinds; structural vs executable is implied by kind. */
export type EdgeKind =
  // Structural
  | "MODULE_IMPORTS_MODULE"
  | "MODULE_EXPORTS_MODULE"
  | "MODULE_DECLARES_COMPONENT"
  | "MODULE_DECLARES_ROUTE"
  | "ROUTE_HAS_CHILD"
  | "ROUTE_ACTIVATES_COMPONENT"
  | "COMPONENT_CONTAINS_WIDGET"
  | "WIDGET_COMPOSES_WIDGET"
  | "COMPONENT_COMPOSES_COMPONENT"
  | "MODULE_PROVIDES_SERVICE"
  | "COMPONENT_PROVIDES_SERVICE"
  // Executable
  | "WIDGET_NAVIGATES_ROUTE"
  | "WIDGET_NAVIGATES_EXTERNAL"
  | "WIDGET_TRIGGERS_HANDLER"
  | "WIDGET_SUBMITS_FORM"
  | "COMPONENT_CALLS_SERVICE"
  | "COMPONENT_NAVIGATES_ROUTE"
  | "ROUTE_REDIRECTS_TO_ROUTE";

/** SAT-ready predicate placeholder. No prose. */
export interface Atom {
  /** Machine-checkable predicate identifier. */
  kind: "FormValid" | "HasSelection" | "ParamBound" | "GuardPasses" | "Other";
  /** Predicate arguments (IDs, names, param keys). */
  args: string[];
  /** Evidence span that justifies this atom. */
  source: SourceRef;
}

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
  /** Supporting evidence spans (may mirror refs but kept explicit). */
  evidence: SourceRef[];
}

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
  kind: "Module";
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
  kind: "Route";
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
    /** Roles extracted from route data if present. */
    roles: string[];
    /** Redirect target (canonical full path) if redirect route, else undefined. */
    redirectTo?: string;
  };
};

/** Component node. */
export type ComponentNode = NodeBase & {
  kind: "Component";
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
  kind: "Widget";
  meta: {
    /** Owning component node ID. */
    componentId: string;
    /** Widget kind classification. */
    widgetKind: WidgetKind;
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
  };
};

/** Service node: class-based service identity. */
export type ServiceNode = NodeBase & {
  kind: "Service";
  meta: {
    /** Exported class name. */
    name: string;
    /** Project-relative TS file path declaring the service. */
    file: string;
  };
};

/** External node: static external URL target. */
export type ExternalNode = NodeBase & {
  kind: "External";
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

/** Multigraph container: single shared node universe + mixed edge set. */
export interface Multigraph {
  /** All nodes. Must be sorted deterministically by id in output. */
  nodes: Node[];
  /** All edges. Must be sorted deterministically in output. */
  edges: Edge[];
}

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
```

---

# 10) Determinism + invariants (A1 must enforce)
A1 must enforce these invariants at build time (fail-fast):

## Identity invariants
* `Component.id` is file+class based; never selector-based.
* `Service.id` is file+class based.
* `Widget.id` is derived from:
  * owning `componentId`
  * template span start (and optionally end)
  * `widgetKind`
* `Route.id` is canonical:
  * based on normalized `fullPath` plus stable origin key if needed to dedup cross-file resolution

## Graph integrity invariants
* every `Edge.from` must reference an existing node id.
* `Edge.to` must reference an existing node id unless `Edge.to === null` (unresolved navigation)
* `refs` must be non-empty for every node and edge
* no silent drops:
  * unresolved navigation yields an edge with:
    * `targetRouteId === null`
    * `to === null`
    * `targetText` set (non-empty string)
* navigation target coupling (hard invariant):
  * if `edge.targetRouteId === null` then `edge.to === null`
  * if `edge.targetRouteId` is a concrete id then `edge.to === edge.targetRouteId`
* If a module decorator lists an imported module `M2`, emit exactly one `MODULE_IMPORTS_MODULE(M1 → M2)` edge (dedup by IDs), only when `M2` resolves to a `Module` node in the same analyzed project.
* If a module decorator lists an exported module `M2`, emit exactly one `MODULE_EXPORTS_MODULE(M1 → M2)` edge.
* These edges must have non-empty `refs` pointing to the decorator span.

## Ordering invariants
* `nodes` sorted by `id`
* `edges` sorted by a deterministic composite key (example):
  * `(from, kind, to, id)` where `to === null` sorts **before** any non-null `to` (treat null as empty string for ordering)

---

# 11) What A1 explicitly does not do
* No transitive closure computation in A1 (imports/exports are direct edges only)
* No provider resolution beyond:
  * `NgModule.providers` class identifiers
  * `@Injectable({ providedIn: 'root' })` mapped to root module only
* No router-outlet modeling
* No window/document location navigation
* No Inputs/Outputs state coupling modeling
* No SAT solving or pruning
* No workflow enumeration (A2)
* No test generation (Phase B)

---

This is the elaborate version aligned with the earlier drafts, while incorporating the decisions you locked:

* modules restored as nodes + minimal edges
* widget-to-widget composition required
* component-to-component composition required
* services are first-class nodes; service calls are `Component → Service`, not self-loops
* all template events captured (including custom)
* entry/terminal contexts are properties of real nodes
* redirect is system edge, never a user step
* unresolved navigation is explicit, never dropped
* schema is closed, typed, commented, and designed to remove ambiguity

## Phase A2/A3 Spec — Closed Workflow Space Construction (Rigorous, Frozen)
### Strategy
Treat A2 and A3 as graph algorithms over the **frozen A1 multigraph**. Preserve perfect auditability by representing workflows as **ordered lists of Edge IDs from the original multigraph** (no synthetic nodes/edges in outputs). Enforce correctness with an explicit **route-context discipline** that determines which executable edges are enabled at each step.

Phase A2 enumerates a **finite candidate workflow space** `W_raw` under structural bounds.
Phase A3 performs **deterministic feasibility classification** by aggregating constraints and pruning only provable contradictions, producing the final space `W`.

---

# A2 — Bounded Candidate Workflow Enumeration
## 1) Objective
Given `Phase1Bundle.multigraph` from A1, enumerate a finite set of **candidate workflows** that are:

* **context-valid** (all user actions occur in an active route context),
* **bounded** (finite by construction),
* **auditable** (each step is an original A1 edge with evidence).

A2 produces `W_raw` (candidate workflows), with **no pruning** beyond boundedness and context-validity.

---

## 2) Traversable Edge Set (Executable Only)
A2 traverses only executable edges from A1:

### A. Progress edges (count toward length bound `k`)

* `WIDGET_TRIGGERS_HANDLER`
* `WIDGET_SUBMITS_FORM`
* `WIDGET_NAVIGATES_ROUTE`
* `WIDGET_NAVIGATES_EXTERNAL`
* `COMPONENT_CALLS_SERVICE`
* `COMPONENT_NAVIGATES_ROUTE`

**Micro-sequence gating rule (required):**
`COMPONENT_CALLS_SERVICE` and `COMPONENT_NAVIGATES_ROUTE` are traversable only while `pendingEffect` is defined (effect-burst active), as specified in §3.3 (S1).

### B. System edges (do not count toward `k`)
* `ROUTE_REDIRECTS_TO_ROUTE` where `edge.isSystem === true`

Structural edges are never traversed as workflow steps; they are used only to compute enabledness.

---

## 3) Route-Context Discipline (Enabledness Semantics)
A2 enumerates workflows while maintaining a mutable state:

* `currentRouteId: string` (must always be defined after initialization)
* `activeComponentIds: Set<string>` derived from `currentRouteId`
* `activeWidgetIds: Set<string>` derived from `activeComponentIds`

Additionally, to respect A1 composite-event semantics, maintain an **internal effect cursor**:

* `pendingEffect?: { componentId: string; methodName?: string; kind: "Handler" | "Submit" }`

This internal state is not emitted as a node/edge; it only controls enabledness.

### 3.1 Active component closure
* `seed := { c | ROUTE_ACTIVATES_COMPONENT(r -> c) }`
* `activeComponentIds(r) := transitiveClosure(seed, COMPONENT_COMPOSES_COMPONENT)` (include seed; follow `COMPONENT_COMPOSES_COMPONENT (c -> c2)` zero or more times)

### 3.2 Active widget definition
A widget `w` is **active** iff:

* its owning component is active, and
* the graph contains an edge `COMPONENT_CONTAINS_WIDGET (c -> w)` for that active component.

So:

* `activeWidgetIds(r) = { w | ∃c∈activeComponentIds(r) such that edge.kind = COMPONENT_CONTAINS_WIDGET and edge.from=c and edge.to=w }`

### 3.3 Enabled edge predicate
At any enumeration state `(currentRouteId=r)`:

**Enabled widget-origin edges**
* An edge `e` with `e.from = widgetId` is enabled iff `widgetId ∈ activeWidgetIds(r)`.

This covers:

* `WIDGET_TRIGGERS_HANDLER`
* `WIDGET_SUBMITS_FORM`
* `WIDGET_NAVIGATES_ROUTE`
* `WIDGET_NAVIGATES_EXTERNAL`

When a widget-origin trigger/submit edge is taken:

* If `e.kind === WIDGET_TRIGGERS_HANDLER` and `e.handler` is present, set
  `pendingEffect := { kind: "Handler", componentId: e.handler.componentId, methodName: e.handler.methodName }`.
* If `e.kind === WIDGET_SUBMITS_FORM` and `e.handler` is present, set
  `pendingEffect := { kind: "Submit", componentId: e.handler.componentId, methodName: e.handler.methodName }`.
* Otherwise, set `pendingEffect := undefined`.

**Enabled component-origin edges (gated; not free-floating)**
A component-origin edge is enabled iff **both**:

1. `pendingEffect` is defined and `pendingEffect.componentId ∈ activeComponentIds(r)`, and
2. the edge’s origin matches the pending component: `e.from === pendingEffect.componentId`

Component-origin edges are enabled only while an effect-burst is active; once the burst ends (`pendingEffect := undefined`) no component-origin edges are enabled until a new widget trigger/submit sets `pendingEffect` again.

This covers:

* `COMPONENT_CALLS_SERVICE`
* `COMPONENT_NAVIGATES_ROUTE`

* **Effect-burst semantics (S1, required):** once `pendingEffect` is set by a widget trigger/submit, the enumerator may traverse a bounded “burst” of component-origin effects from `pendingEffect.componentId`:
  1. **Zero or more** `COMPONENT_CALLS_SERVICE` edges whose `from === pendingEffect.componentId`, followed by
  2. **At most one** `COMPONENT_NAVIGATES_ROUTE` edge whose `from === pendingEffect.componentId`, after which
  3. `pendingEffect := undefined` (burst ends).
* **Immediate clearing:** if a widget-origin step is taken that does **not** set `pendingEffect` (e.g., `WIDGET_NAVIGATES_ROUTE`, `WIDGET_NAVIGATES_EXTERNAL`, trigger with no handler), then `pendingEffect := undefined`.
* **No cross-trigger carryover:** starting a new widget trigger/submit overwrites any existing `pendingEffect` (begins a new burst).

**Enabled route-origin system edges**
* `ROUTE_REDIRECTS_TO_ROUTE` is enabled iff `e.from === currentRouteId`.

### 3.4 Route updates (state transitions)

When traversing a step edge `e`:

* If `e.kind ∈ { WIDGET_NAVIGATES_ROUTE, COMPONENT_NAVIGATES_ROUTE, ROUTE_REDIRECTS_TO_ROUTE }`:
  * If `e.targetRouteId` is a concrete route id, set `currentRouteId := e.targetRouteId` and set `pendingEffect := undefined`.
  * Else (unresolved targetRouteId):
    * record `unresolvedTargets` for this workflow (see §7)
    * terminate the workflow at the **current Route** context (terminalNodeId remains `currentRouteId`)
    * set `pendingEffect := undefined`
    * `e.to` is null for this step by A1 invariant.
* If `e.kind === WIDGET_NAVIGATES_EXTERNAL`:
  * terminate workflow at the `External` node `e.to`
  * set `pendingEffect := undefined`
* Otherwise (`WIDGET_TRIGGERS_HANDLER`, `WIDGET_SUBMITS_FORM`, `COMPONENT_CALLS_SERVICE`):
  * `currentRouteId` is unchanged

---

## 4) Start Set (Entry Routes)
Entry routes are exactly those with `r.meta.isEntry === true` (computed by A1).

A2 uses entry routes as initial contexts for enumeration.
Initialization per entry route:

* `currentRouteId := entryRouteId`
* `pendingEffect := undefined`
* `visitCountByRouteId := { [entryRouteId]: 1 }`
* apply **zero or more enabled redirect edges** greedily before user edges (see §6.2)

---

## 5) Terminal Set (Terminal Contexts)
Terminal contexts are real nodes; no synthetic exit nodes.
A workflow is terminal if either:

### 5.1 External terminal
The last step is `WIDGET_NAVIGATES_EXTERNAL` (reaches an `External` node).

### 5.2 Route terminal (no enabled progress edges)
**Terminality is evaluated only after redirect closure completes** (stabilized or loop-detected) per §6.2.

At a stabilized state with `currentRouteId=r`, define enabled progress edges `EnabledProgress(r)` as all enabled edges whose kind is in §2.A.

`r` is terminal iff:

* `EnabledProgress(r)` is empty

System redirect edges do not prevent terminality (they are handled separately as system closure).

#### 5.3 Unresolved-target terminal
A workflow is terminal if it terminates due to an unresolved navigation target as defined in §3.4:

* When an unresolved navigation edge is taken, the workflow terminates immediately.
* `terminalNodeId` remains the current route context (`terminalNodeId === currentRouteId`).

---

## 6) Enumeration Bounds (Finiteness Guarantees)
A2 must be finite on any finite multigraph.
Enumeration uses **DFS** with a stack (LIFO). When expanding a state, push successor states onto the stack in **reverse** of §10.1 order so that the next pop follows §10.1 order. Deduplicate workflows only by `CandidateWorkflow.id` at emission-time, not during expansion.
Enumeration state is defined as the tuple `(currentRouteId, pendingEffect, visitCountByRouteId, steps, userStepCount, meta)`.

### 6.1 Maximum workflow length `k`
`k` counts **progress edges only** (edge kinds in §2.A).
System edges (`ROUTE_REDIRECTS_TO_ROUTE`) do not count toward `k`.

Default:

* `k = 12` (configurable)

### 6.2 System-closure rule for redirects
Whenever `currentRouteId` is set or updated (including initialization), A2 applies enabled redirects **deterministically**:

* A redirect-closure invocation begins each time §6.2 is entered (i.e., after any update to `currentRouteId`, including initialization and navigation).
* Maintain, for the current invocation:
  * `redirectClosureSeenRoutes: Set<RouteId>`, initialized with the route id at which closure started.
  * `redirectClosureEdgeIds: string[]`, initialized as empty, capturing applied redirect edge ids in order.

* While there exists an enabled redirect edge from `currentRouteId`:
  * take exactly one redirect edge `e` according to a deterministic selection rule (§10.2)
  * Let `nextRouteId := e.targetRouteId` (the redirect’s resolved target; redirects in A1 should always be resolvable; if not, treat as unresolved target per §3.4 termination rule).
  * **Route-visit cap check (required):**
    * Compute `nextCount := (visitCountByRouteId[nextRouteId] ?? 0) + 1`.
    * If `nextCount > routeVisitCap`:
      * **do not apply** the redirect (keep `currentRouteId` unchanged),
      * **terminate redirect closure immediately**, and
      * record `meta.redirectLoop` evidence for this workflow with:
        * `routeId: currentRouteId` (the route whose redirect could not be applied under the cap), and
        * `edgeIds: [e.id]` (the blocking redirect edge id).
      * set `meta.redirectClosureStabilized := false`
      * stop redirect closure (no further redirects attempted).
    * Else:
      * apply the redirect:
        * set `currentRouteId := nextRouteId`,
        * append redirect edge `e.id` to `steps`,
        * append `e.id` to `redirectClosureEdgeIds`,
        * do not increment progress length,
        * set `visitCountByRouteId[nextRouteId] := nextCount`.
  * **Cycle detection (required, closure-local):**
    * After applying a redirect, if `currentRouteId ∈ redirectClosureSeenRoutes`:
      * terminate redirect closure and record `meta.redirectLoop` with:
        * `routeId: currentRouteId`,
        * `edgeIds: redirectClosureEdgeIds` (must include the last-applied redirect edge id),
      * set `meta.redirectClosureStabilized := false`,
      * stop redirect closure (no further redirects attempted).
    * Otherwise add `currentRouteId` to `redirectClosureSeenRoutes` and continue the while-loop.

Redirect closure does not itself classify workflows; it only records evidence consumed by A3.
`meta.redirectClosureStabilized` is initialized to `true` when the workflow starts and remains `false` permanently once any redirect closure terminates due to a detected cycle or a routeVisitCap block.


### 6.3 Route revisit cap (cycle control)
Maintain `visitCountByRouteId: Map<RouteId, number>` for route contexts visited during enumeration (including via redirects).

Bound rule (Option C3):

* A workflow may visit the same `RouteId` at most `routeVisitCap` times.

Default:

* `routeVisitCap = 2` (configurable)

This bound applies to route visits created by:

* `WIDGET_NAVIGATES_ROUTE`
* `COMPONENT_NAVIGATES_ROUTE`
* `ROUTE_REDIRECTS_TO_ROUTE`

---

## 7) Candidate Workflow Shape (Edge-ID Trace)
A candidate workflow is represented as:

* `startRouteId`
* `terminalNodeId` (Route or External)
* `steps: string[]` where each element is an A1 `Edge.id`
* `userStepCount` counts progress edges only (excludes system redirects)
* `meta` (workflow-local evidence needed by A3; no synthetic nodes/edges):
  * `unresolvedTargets?: [{ edgeId, targetText? }]`
  * `redirectLoop?: { routeId, edgeIds }`
  * `redirectClosureStabilized: boolean`

No node sequences are stored; node reconstruction is done by edge endpoints.

---

## 8) A2 Output Artifact
`phaseA2-workflows.raw.json` contains:

* the A1 multigraph reference hash/metadata
* `W_raw`: candidate workflows
* enumeration configuration used (`k`, `routeVisitCap`)
* stats

---

# A3 — Constraint Aggregation + Deterministic Pruning/Classification
## 1) Objective
Transform `W_raw` into a final workflow space `W` by:

1. Aggregating constraints mechanically across steps into `C(w)`
2. Classifying each workflow as:
   * `FEASIBLE`
   * `CONDITIONAL`
   * `PRUNED`
3. Pruning only on **provable contradictions** under a deterministic rule set (no full SAT solver).

A3 never invents constraints beyond what exists in A1 edge payloads; it may only *interpret* them using fixed rules.

---

## 2) Constraint Merge Operator (Mechanical)
Given a workflow `w` with steps `e1..en`, define:

`C(w) = merge( constraints(e1), constraints(e2), ..., constraints(en) )`

Where merge is:

* `requiredParams`: set union (dedup)
* `guards`: set union (dedup)
* `roles`: set union (dedup)
* `uiAtoms`: concatenation preserving order.
* `evidence`: concatenation of all `constraints.evidence` plus all `edge.refs` (dedup by `(file,start,end)`)

A3 treats `requiredParams` as edge-local input from A1 and performs only set-union; it does not infer params from visited routes.
No boolean simplification is performed in A3. Meaning comes only from classification rules.

---

## 3) Deterministic Feasibility Rules (No Full SAT)
A3 uses a rule-based classifier. Only explicit contradictions yield `PRUNED`.

### 3.1 Base verdicts
Start with:

* `verdict = FEASIBLE`

Then apply upgrades/downgrades in this strict order:

1. `PRUNED` checks
2. otherwise `CONDITIONAL` checks
3. otherwise remain `FEASIBLE`

---

## 4) PRUNED Rules (Provable Contradictions Only)
### 4.1 Explicit exclusivity atoms (future-proof now)
A workflow is `PRUNED` if its aggregated `uiAtoms` contain a contradictory pair under any of the following **explicit** patterns:

* `Atom(kind="Other", args=["ExclusiveRoleGroup", groupId, roleA])`
  and
  `Atom(kind="Other", args=["ExclusiveRoleGroup", groupId, roleB])`
  with `roleA != roleB`

* `Atom(kind="Other", args=["MutuallyExclusive", key, valueA])`
  and
  `Atom(kind="Other", args=["MutuallyExclusive", key, valueB])`
  with `valueA != valueB`

No other atom semantics are assumed.

### 4.2 Redirect-closure failure contradiction
If workflow `meta.redirectClosureStabilized === false`, then:

* classify `PRUNED` **only if** the workflow contains **zero** progress edges (i.e., `userStepCount === 0`), making no user action reachable.
* otherwise classify `CONDITIONAL`.

This rule is grounded in A2-recorded `meta.redirectClosureStabilized` and the existing `userStepCount` evidence.

---

## 5) CONDITIONAL Rules (Unresolved or Requires Runtime Assignment)
A workflow is `CONDITIONAL` if any holds:

### 5.1 Unresolved navigation target encountered
If workflow `meta.unresolvedTargets` is non-empty, mark `CONDITIONAL`.

Attach to explanation:

* `unresolvedTargets: [{ edgeId, targetText }]`

### 5.2 Required params exist (assignment needed)
If `C(w).requiredParams.length > 0`, mark `CONDITIONAL` unless there is explicit evidence of binding (future Atom kind `ParamBound`).

For now:

* required params imply CONDITIONAL.

Attach:

* `missingParams: requiredParams`

### 5.3 Guards exist (assignment needed)
If `C(w).guards.length > 0`, mark `CONDITIONAL`.

Attach:

* `requiredGuards: guards`

### 5.4 Role policy R1 (non-exclusive requirements)
Roles accumulate conjunctively but are **not contradictory** by default.
So:

* if roles exist → `CONDITIONAL` (needs an account satisfying them)
* never `PRUNED` due to multiple roles unless exclusivity atoms exist.

Attach:

* `requiredRoles: roles`

---

## 6) FEASIBLE (Strong) Condition
A workflow is `FEASIBLE` only if:

* no PRUNED rule triggered
* no CONDITIONAL rule triggered

Operationally this means:

* no unresolved targets
* no required params
* no guards
* no roles
* no contradiction atoms

This is intentionally strict and conservative.

---

## 7) A3 Output Artifact
`phaseA3-workflows.final.json` contains:

* `W`: workflows with:
  * `cw: ConstraintSurface` (merged)
  * `verdict`
  * `explanation` (typed, machine-readable)
* `prunedWorkflows`: optionally separated list for debugging (same schema, just filtered)
* stats broken down by verdict counts

---

# Determinism + Invariants (A2/A3 Must Enforce)
## A2 invariants
* Every `steps[i]` is an existing `Edge.id` in the A1 multigraph.
* Every step is of a traversable executable kind (§2).
* Each step must satisfy the enabledness predicate given the current route context (§3), including micro-sequence gating for component-origin edges (§3.3).
* `userStepCount` equals the number of progress edges (§2.A) in `steps`.
* Enumeration ordering is deterministic (§10).
* `meta.unresolvedTargets` is present iff any unresolved navigation edge was taken.
* `meta.redirectLoop` is present iff redirect closure loop was detected.
* `meta.redirectClosureStabilized` is always present and is set to `false` iff any redirect closure failed to stabilize due to cycle detection or routeVisitCap block.

## A3 invariants
* `cw` is exactly the merge of step constraints (§2).
* `verdict` is produced by the ordered rule application (§3).
* `explanation` fields are present iff relevant.

---

# Ordering and Selection Rules (Deterministic Enumeration)
## 10.1 Enabled edge enumeration order
When expanding a state, enumerate enabled edges in this stable order:

1. By `edge.kind` in a fixed kind priority list:
   1. `WIDGET_NAVIGATES_EXTERNAL`
   2. `WIDGET_NAVIGATES_ROUTE`
   3. `WIDGET_SUBMITS_FORM`
   4. `WIDGET_TRIGGERS_HANDLER`
   5. `COMPONENT_CALLS_SERVICE` (only if enabled under pendingEffect gating)
   6. `COMPONENT_NAVIGATES_ROUTE` (only if enabled under pendingEffect gating)
   7. `ROUTE_REDIRECTS_TO_ROUTE` (only during redirect closure, not in normal expansion)
2. Within same kind, sort by:
   * `edge.from` (string asc)
   * `edge.to` (string asc)
   * `edge.id` (string asc)

## 10.2 Redirect closure selection
If multiple redirects are enabled from the same route, choose the first by:

* `(edge.to asc, edge.id asc)` under the same deterministic ordering.

This prevents nondeterministic redirect outcomes.

---

# Typed Schemas for A2/A3 Artifacts (Complete, Commented)

```ts
/** A reference to an A1 bundle used to produce workflows (for audit reproducibility). */
export interface PhaseAInputRef {
  /** Stable identifier for the analyzed project/version (e.g., git sha or provided build id). */
  projectId: string;
  /** Hash of the multigraph JSON or canonical serialization (to detect drift). */
  multigraphHash: string;
}

/** Enumeration configuration for A2. */
export interface A2Config {
  /** Max number of progress edges per workflow. System redirect edges do not count. */
  maxProgressEdges: number; // k
  /** Maximum number of visits to the same Route context within a workflow. */
  routeVisitCap: number; // default 2
}

/** Workflow-local evidence recorded in A2 for A3 classification and audit. */
export interface CandidateWorkflowMeta {
  /** Unresolved navigation targets encountered during traversal. */
  unresolvedTargets?: Array<{
    edgeId: string;
    targetText?: string;
  }>;
  /** Redirect loop evidence if detected during redirect closure. */
  redirectLoop?: {
    /** Route id where redirect closure failed to stabilize. */
    routeId: string;
    /** Edge ids participating in the loop (if captured). */
    edgeIds: string[];
  };
  /** True iff redirect closure stabilized (terminated without cycle/cap-block failure) at every point it was applied. */
  redirectClosureStabilized: boolean;
}

/** A candidate workflow produced by A2 as an edge-id trace over the A1 multigraph. */
export interface CandidateWorkflow {
  /** Deterministic ID for the workflow (e.g., hash of step edge IDs). */
  id: string;
  /** Entry route context for the workflow. Must be a Route node id from A1. */
  startRouteId: string;
  /** Terminal node id. Either a Route node id or an External node id from A1. */
  terminalNodeId: string;
  /** Ordered list of A1 edge IDs representing the workflow trace. */
  steps: string[];
  /** Number of user progress steps (excludes redirects with isSystem=true). */
  userStepCount: number;
  /** Workflow-local evidence recorded by A2. */
  meta: CandidateWorkflowMeta;
}

/** Output artifact of A2: bounded candidate workflows. */
export interface PhaseA2Bundle {
  /** Reference to the A1 input used. */
  input: PhaseAInputRef;
  /** Enumeration configuration used for reproducibility. */
  config: A2Config;
  /** Candidate workflow set prior to any feasibility classification. */
  workflows: CandidateWorkflow[];
  /** Summary stats for audit and regression checks. */
  stats: {
    workflowCount: number;
    minUserStepCount: number;
    maxUserStepCount: number;
    avgUserStepCount: number;
    /** Count of states expanded during enumeration. */
    statesExpanded: number;
  };
}

/** Feasibility verdict computed in A3. */
export type WorkflowVerdict = "FEASIBLE" | "CONDITIONAL" | "PRUNED";

/** Explanation payload for non-trivial verdicts. */
export interface WorkflowExplanation {
  /** Missing route params required by aggregated cw.requiredParams (edge-local from A1 navigation edges). */
  missingParams?: string[];
  /** Guards required by any visited route contexts. */
  requiredGuards?: string[];
  /** Roles required by any visited route contexts. Non-exclusive by default. */
  requiredRoles?: string[];
  /** Unresolved navigation targets encountered during traversal. */
  unresolvedTargets?: Array<{
    edgeId: string;
    targetText?: string;
  }>;
  /** Contradictory atoms that caused pruning (only when provable). */
  contradictions?: Atom[];
  /** Redirect loop evidence if detected. */
  redirectLoop?: {
    /** Route id where redirect closure failed to stabilize. */
    routeId: string;
    /** Edge ids participating in the loop (captured during redirect closure). */
    edgeIds: string[];
  };
}

/** Final workflow record after A3 classification. */
export interface ClassifiedWorkflow extends CandidateWorkflow {
  /** Merged constraints accumulated over all step edges. */
  cw: ConstraintSurface;
  /** Feasibility verdict. */
  verdict: WorkflowVerdict;
  /** Machine-readable explanation for CONDITIONAL/PRUNED or notable FEASIBLE. */
  explanation: WorkflowExplanation;
}

/** Output artifact of A3: classified and pruned workflow space. */
export interface PhaseA3Bundle {
  /** Reference to the A1 input used. */
  input: PhaseAInputRef;
  /** The same enumeration config used in A2 (copied for single-file consumption). */
  config: A2Config;
  /** The final workflow space (including CONDITIONAL unless explicitly filtered). */
  workflows: ClassifiedWorkflow[];
  /** Convenience subsets for debugging/visualization. */
  partitions: {
    feasibleIds: string[];
    conditionalIds: string[];
    prunedIds: string[];
  };
  /** Summary stats for audit and regression checks. */
  stats: {
    workflowCount: number;
    feasibleCount: number;
    conditionalCount: number;
    prunedCount: number;
  };
}
```

---

# What A2/A3 Explicitly Do Not Do
* No new nodes or edges beyond those already in the A1 multigraph.
* No full SAT solving.
* No semantic interpretation of guards/roles beyond the fixed deterministic rules above.
* No attempt to bind params, authenticate, or select accounts (Phase B).