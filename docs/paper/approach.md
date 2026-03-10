# Approach — Operational Specification (Normative, Frozen)
## Strategy
Freeze a single **UI Interaction Multigraph** with one shared node universe representing what exists in the codebase: **Modules, Routes, Components, Widgets, Services, External targets**. Distinguish “structural” vs “executable” semantics strictly by **edge kinds and edge metadata**, not by introducing separate node sets.

Then:

1. Freeze the schema (types + invariants).
2. Refactor A1 extraction to populate exactly this schema deterministically.
3. Re-run extraction across all validation subjects until artifacts are structurally faithful and auditable.
4. Only then finalize A2 against this frozen A1 contract.

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

Additionally, extract a deterministic UI-properties surface `ui` for later feasibility/pruning:

**UI properties (normative, A1):**
A1 must capture UI-relevant attributes without evaluation. For each property:
- if the value is a literal → store as the typed literal
- if the value is expression-bound → store the raw expression text in the `*ExprText` field
- never evaluate expressions

Minimum required UI properties:

* visibility:
  * `visibleLiteral?: boolean` derived only from literal `hidden` / `[hidden]` / `*ngIf`
  * `visibleExprText?: string` for expression-based `hidden`/`*ngIf`/`[hidden]`
* enabled/disabled:
  * `enabledLiteral?: boolean` derived only from literal `disabled` / `[disabled]`
  * `enabledExprText?: string` for expression-based `[disabled]`
* required:
  * `requiredLiteral?: boolean` from literal `required` / `[required]`
  * `requiredExprText?: string` for expression-based `[required]`
* identity/binding keys (used to connect constraints across steps later):
  * `nameAttr?: string` (literal only)
  * `formControlName?: string` (literal only)
  * `ngModelText?: string` (raw expression text for `[(ngModel)]`)
* input shape constraints (literal only where present):
  * `inputType?: string` (e.g., `type="email"`)
  * `minLength?: number`, `maxLength?: number`
  * `min?: number`, `max?: number`
  * `pattern?: string`

**Extensibility (normative):**
Also capture `rawAttrsText: Record<string,string>` consisting of any other statically observed attributes/directives that may later matter (e.g., `autocomplete`, `readonly`, `aria-*`, class tokens), stored only as raw text (no evaluation).

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

**Diagnostic-only handler filtering (normative):**
Handlers whose body contains exclusively diagnostic calls (`console.log`, `console.warn`, `console.error`, `console.debug`, `console.info`) and no assignments to external state (`this.<prop> = ...`) produce no call contexts and emit no executable edges.

Detect router navigation calls:

* `router.navigate(...)`
* `router.navigateByUrl(...)`

Detect service calls:

* `this.<serviceMember>.<method>(...)`
* constructor-injected service members used in calls
* minimal support for `inject(Service)` to identify the service instance

Detect dialog/modal open calls:

* `this.<dialogService>.open(ComponentClass)` where the first argument is a PascalCase identifier resolving to a known component class
* Emit `COMPONENT_COMPOSES_COMPONENT(handler.component → dialogComponent)` edge with evidence from the call site
* This makes the dialog component's widgets reachable in the active-widget computation

**Bounded same-class transitive call following (normative):**
When analyzing a handler body, if a call expression matches `this.<methodName>(…)` where `<methodName>` resolves to a method declared in the **same component class**, recursively inspect that callee method's body for additional service calls, router navigation calls, and dialog/modal open calls. Constraints:

* Maximum transitive depth: **1** (handler → helper → effect; no deeper chaining).
* Same-class only: do not follow calls to methods on injected services, superclass methods not overridden in the current class, or free functions.
* Cycle-safe: if recursion would revisit a method already seen in the current call chain, stop.
* Deterministic: callee methods are resolved by name lookup within the same `ClassDeclaration`; iteration order follows the existing `getDescendantsOfKind(CallExpression)` traversal.
* A single-dot `this.<name>(…)` expression (no second dot before the method parens) is the trigger for transitive following. Multi-dot expressions like `this.service.method(…)` continue to be classified as ServiceCall, Navigate, or DialogOpen directly.

This bounded rule applies to service call extraction, router navigation extraction, and dialog/modal open detection. It does **not** apply to StateUpdate detection.

**Service name resolution (normative):**
When resolving a `ServiceCall` context's member name to a known `ServiceNode`, the implementation must attempt resolution using both the constructor parameter field name and the **TypeScript type** of the constructor parameter. Specifically: if `capitalize(fieldName)` does not match any `ServiceNode.meta.name`, inspect the constructor parameter's declared type annotation and match that type name against `ServiceNode.meta.name`. This handles cases where developers abbreviate field names (e.g., `authenticateService: AuthenticationServiceService`).

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
8. `WIDGET_CONTAINS_WIDGET` : `Widget → Widget`
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

### Lazy-loaded module routes
When A1 recursively extracts routes from a lazy-loaded module (via `loadChildren`), the resulting routes must be treated as top-level within their own feature module scope. Specifically:

* Routes registered via `RouterModule.forChild([...])` inside a lazy-loaded module must NOT inherit a `parentId` from the lazy-load discovery call site.
* The parent–child relationship in the Angular route tree is established by `children: [...]` arrays, not by the `loadChildren` discovery mechanism.
* A lazy-loaded route with `parentId === undefined` (no `children` parent) is top-level and therefore an entry candidate.

Rationale: Angular merges lazy-loaded routes into the global router at their mount point, but these routes are independently navigable URL-level endpoints. Treating them as children of the lazy-load placeholder would incorrectly suppress their entry status.

No ENTRY node.

### Route deduplication and redirect preservation
When A1 encounters multiple route records sharing the same canonical `fullPath` (e.g., a lazy-load placeholder from the root module and the actual component route from the feature module), it must deduplicate them into a single Route node. During deduplication:

* If any member of the group is a `RedirectRoute`, the redirect target (`redirectTo`) must be preserved on the canonical route, even if the canonical is a `ComponentRoute`.
* The canonical route carries the most specific component binding (preferring resolved component over `__unknown__`).
* Guards and children are merged from all group members.

Rationale: without redirect preservation, an entry route `/` that redirects to `/projects` loses its redirect edge when a lazy-loaded `ComponentRoute` at `/` wins deduplication. This breaks redirect chain closure and suppresses workflows downstream.

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
     - For array navigation, do not resolve relative navigation (relativeTo not modeled in Phase A).
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

* **relative routerLink resolution (normative):**
  Relative `routerLink` values (not prefixed with `/`) are resolved against the `fullPath` of the nearest ancestor route that activates the component owning the widget. Resolution steps:
  1. For each parent route fullPath that activates the owning component, join `parentFullPath + "/" + relativeValue`.
  2. Match the joined path against the route table using the same template-matching rules as static string navigation (including `:param` segments).
  3. If exactly one route matches → resolve. If zero or more than one → unresolved.

---

# 7) Constraint model (edge payload, frozen semantics)
Constraints are attached to executable edges (structural edges use empty surfaces).
A guard implies **CONDITIONAL** later, not PRUNED.
PRUNED is reserved for contradictions discovered later by SAT/pruning logic (A2), not for missing credentials/seed data.
Redirect edges can carry constraints but remain system edges (`isSystem=true`).

## UI precondition atoms (A1 emission rules; frozen)
A1 must materialize UI feasibility as SAT-ready atoms attached to executable edges.
These atoms are purely declarative and never evaluated in A1.

### 7.1 Widget-origin action-site atoms (required)
For each executable edge `e` whose origin is a Widget node:

* `WIDGET_TRIGGERS_HANDLER`
* `WIDGET_SUBMITS_FORM`
* `WIDGET_NAVIGATES_ROUTE`
* `WIDGET_NAVIGATES_EXTERNAL`

A1 must append UI atoms derived from the source widget `w = e.from`:

**Visibility**
* If `w.meta.ui.visibleLiteral === false`, emit:
  * `Atom(kind="WidgetVisible", args=[w.id, "false"], source=<evidence span of hidden/ngIf>)`
* Else if `w.meta.ui.visibleExprText` is present, emit:
  * `Atom(kind="WidgetVisibleExpr", args=[w.id, w.meta.ui.visibleExprText], source=<evidence span>)`

**Enabledness**
* If `w.meta.ui.enabledLiteral === false`, emit:
  * `Atom(kind="WidgetEnabled", args=[w.id, "false"], source=<evidence span of disabled>)`
* Else if `w.meta.ui.enabledExprText` is present, emit:
  * `Atom(kind="WidgetEnabledExpr", args=[w.id, w.meta.ui.enabledExprText], source=<evidence span>)`

**Requiredness (action-site relevant only)**
* If `w.meta.ui.requiredLiteral === true`, emit:
  * `Atom(kind="WidgetRequired", args=[w.id, "true"], source=<evidence span>)`
* Else if `w.meta.ui.requiredExprText` is present, emit:
  * `Atom(kind="WidgetRequiredExpr", args=[w.id, w.meta.ui.requiredExprText], source=<evidence span>)`

### 7.2 Form submission validity atom (required)
For each `WIDGET_SUBMITS_FORM` edge with source widget `w`:

* Always emit:
  * `Atom(kind="FormValid", args=[w.id], source=<submit binding span>)`

No attempt is made in Phase A to prove validity; this atom only signals that validity is a runtime gate.

### 7.3 Input shape atoms (optional but deterministic when present)
If the source widget of an executable edge has any literal input constraints in `w.meta.ui` (`minLength`, `maxLength`, `min`, `max`, `pattern`, `inputType`), A1 may emit:

* `Atom(kind="InputConstraint", args=[w.id, "<key>", "<value>"], source=<attribute span>)`

Expression-bound shape constraints are not typed; if present only as expression text in `rawAttrsText`, A1 may emit:

* `Atom(kind="InputConstraintExpr", args=[w.id, "<attrName>", "<exprText>"], source=<attribute span>)`

## RequiredParams provenance (frozen)
`ConstraintSurface.requiredParams` is **edge-local** and must be populated by A1 extraction only. A2 never derives or infers required params from route templates.
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

A2 can be defined purely as graph algorithms on top of this structure.

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

/** UI-relevant widget properties used later for feasibility/pruning (A1 extraction only). */
export interface WidgetUIProps {
  /** Literal visibility when determinable without evaluation. True = visible, False = hidden. */
  visibleLiteral?: boolean;
  /** Raw expression text when visibility is not literal (e.g., *ngIf="expr", [hidden]="expr"). */
  visibleExprText?: string;

  /** Literal enabledness when determinable without evaluation. True = enabled, False = disabled. */
  enabledLiteral?: boolean;
  /** Raw expression text when enabledness is not literal (e.g., [disabled]="expr"). */
  enabledExprText?: string;

  /** Literal requiredness when determinable without evaluation. */
  requiredLiteral?: boolean;
  /** Raw expression text when requiredness is not literal (e.g., [required]="expr"). */
  requiredExprText?: string;

  /** Stable binding keys (literal only when applicable). */
  nameAttr?: string;
  formControlName?: string;

  /** Raw expression text for [(ngModel)] when present. */
  ngModelText?: string;

  /** Literal-only input shape constraints when present. */
  inputType?: string;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;

  /** Catch-all for any other possibly-relevant attributes/directives as raw text. */
  rawAttrsText: Record<string, string>;
}

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
  | "WIDGET_CONTAINS_WIDGET"
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
  /** Machine-checkable predicate identifier (A1 emits; A2 consumes with frozen rules). */
  kind:
  | "FormValid"
  | "HasSelection"
  | "ParamBound"
  | "GuardPasses"
  | "WidgetVisible"
  | "WidgetVisibleExpr"
  | "WidgetEnabled"
  | "WidgetEnabledExpr"
  | "WidgetRequired"
  | "WidgetRequiredExpr"
  | "InputConstraint"
  | "InputConstraintExpr"
  | "Other";
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
    /** Route kind classification from the source route record. */
    routeType: "ComponentRoute" | "RedirectRoute" | "WildcardRoute";
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

    /** UI-relevant widget properties for feasibility/pruning (A1 extraction only). */
    ui: WidgetUIProps;
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

  /** Shared group ID linking a trigger edge to its handler-scoped effect edges (CCS, CNR). */
  effectGroupId?: string;

  /** Ordinal position of a CCS edge within its effect group (for deterministic ordering). */
  callsiteOrdinal?: number;
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

## Widget UI invariants
* Every Widget node must include `meta.ui` with `rawAttrsText` present (may be empty object).
* A1 must never evaluate UI expressions; expression-bound values must be stored only in `*ExprText`/`ngModelText` as raw strings.
* Typed literal fields (`minLength`, `maxLength`, `min`, `max`) must be populated only when the extracted value is a numeric literal.

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

## Phase A2 — TaskWorkflow Enumeration + Classification (Final)
### Strategy
Treat A2 as graph algorithms over the frozen A1 multigraph.
Preserve auditability by representing workflows as ordered lists of original A1 Edge IDs.
A2 has two internal stages:

* A2.1 TaskWorkflow enumeration (trigger-centric, deterministic effect closure)
* A2.2 Constraint merge + classification (deterministic, rule-based)

A2 emits the final workflow space as `phaseA2-taskworkflows.final.json`, a single stable artifact.

---

# A2.1 — TaskWorkflow Enumeration
A2.1 produces exactly one TaskWorkflow per enabled trigger edge, by collecting handler-scoped effects and applying deterministic redirect closure. No combinatorial enumeration occurs.

## 1) Edge Classification

### A. Trigger edges (widget-origin executable edges)
The following edge kinds serve as trigger sites for TaskWorkflow creation:

* `WIDGET_TRIGGERS_HANDLER` (WTH)
* `WIDGET_SUBMITS_FORM` (WSF)
* `WIDGET_NAVIGATES_ROUTE` (WNR)
* `WIDGET_NAVIGATES_EXTERNAL` (WNE)

### B. Effect edges (handler-scoped)
When a trigger edge has an `effectGroupId`, the following edges are collected as handler-scoped effects:

* `COMPONENT_CALLS_SERVICE` (CCS) — zero or more per handler, sorted by `callsiteOrdinal`
* `COMPONENT_NAVIGATES_ROUTE` (CNR) — at most one per handler

Effect edges share the same `effectGroupId` as their trigger edge in the A1 multigraph.

### C. System edges (redirect closure)
* `ROUTE_REDIRECTS_TO_ROUTE` where `edge.isSystem === true`

System edges are applied during redirect closure only. They do not count as trigger or effect edges.

Structural edges are never traversed as workflow steps; they are used only to compute enabledness (active components and widgets).

---

## 2) Route-Context Discipline (Enabledness Semantics)
A2 evaluates trigger edge enabledness relative to a route context.

For each route `r`, compute:

* `activeComponentIds(r): Set<string>` derived from `r`
* `activeWidgetIds(r): Set<string>` derived from `activeComponentIds(r)`

### 2.1 Active component closure
* `seed := { c | ROUTE_ACTIVATES_COMPONENT(r -> c) }` ∪ `{ c | ROUTE_ACTIVATES_COMPONENT(a -> c) for each ancestor a of r via ROUTE_HAS_CHILD }` ∪ `bootstrapComponents`
* `activeComponentIds(r) := transitiveClosure(seed, COMPONENT_COMPOSES_COMPONENT)` (include seed; follow `COMPONENT_COMPOSES_COMPONENT (c -> c2)` zero or more times)

Parent-route ancestry: when route `p` has a `ROUTE_HAS_CHILD` edge to route `c`, `p` is an ancestor of `c`. Components activated by ancestor routes are included because Angular co-renders parent and child route components via `<router-outlet>`.

### 2.2 Active widget definition
A widget `w` is **active** iff:

* its owning component is active, and
* the graph contains an edge `COMPONENT_CONTAINS_WIDGET (c -> w)` for that active component.

So:

* `activeWidgetIds(r) = { w | ∃c∈activeComponentIds(r) such that edge.kind = COMPONENT_CONTAINS_WIDGET and edge.from=c and edge.to=w }`

### 2.3 Trigger edge enabledness
A trigger edge `e` with `e.from = widgetId` is enabled at route `r` iff **all** hold:

1. **Route activation gate:** `widgetId ∈ activeWidgetIds(r)`.
2. **Not statically hidden:** let `w = Node(widgetId)` (must be `Widget`). Then:

   * if `w.meta.ui.visibleLiteral === false` → **not enabled**
   * otherwise → pass (including `visibleLiteral === true` or `visibleExprText` present or unset)
3. **Not statically disabled:** let `w = Node(widgetId)` (must be `Widget`). Then:

   * if `w.meta.ui.enabledLiteral === false` → **not enabled**
   * otherwise → pass (including `enabledLiteral === true` or `enabledExprText` present or unset)

**Expression-based visibility/enabledness (CONDITIONAL-enabled semantics; frozen)**
If `w.meta.ui.visibleExprText` and/or `w.meta.ui.enabledExprText` is present, the edge remains enabled under the rules above (unless blocked by a literal `false`). A1 already attaches the corresponding `WidgetVisibleExpr` / `WidgetEnabledExpr` atoms to the executable edge constraints, and A2.2 classification consumes those atoms.

Literal hidden/disabled detection is defined exclusively by A1 extraction into `WidgetUIProps.visibleLiteral` and `WidgetUIProps.enabledLiteral` (including literal `*ngIf="false"` / `[hidden]="true"` → `visibleLiteral=false`, and literal `disabled` / `[disabled]="true"` → `enabledLiteral=false`).

---

## 3) Enumerable Routes
A2 enumerates TaskWorkflows for all **component-bearing routes**: routes that activate at least one component (i.e., routes with at least one `ROUTE_ACTIVATES_COMPONENT` edge in the A1 multigraph). This includes both entry routes (`r.meta.isEntry === true`) and non-entry child routes that activate components.

A2 iterates over component-bearing routes sorted by id. For each route, it computes the active widget set (including parent route components via ROUTE_HAS_CHILD ancestry) and collects enabled trigger edges.

---

## 4) TaskWorkflow Enumeration Algorithm

For each component-bearing route `r` (sorted by id):

1. **Redirect closure at entry:** Apply redirect closure (A2.1 §6) from `r` to get resolved route `r'`.
   - If redirect closure fails with an unresolved target, skip this route.

2. **Compute enabledness:** Compute `activeComponentIds(r')` and `activeWidgetIds(r')`.
   Active components include those from parent routes (via ROUTE_HAS_CHILD ancestry), since Angular co-renders parent and child route components via `<router-outlet>`.

3. **Collect trigger edges:** For each active widget (sorted by id), collect all enabled trigger edges (kinds in §1.A). Sort trigger edges by edge id.

4. **For each trigger edge `t`:**

   a. **Initialize steps:** Start with redirect edges from step 1 (if any), then the trigger step.

   b. **Resolve by trigger kind:**
      - **WNE** (`WIDGET_NAVIGATES_EXTERNAL`): Terminal node = `t.to` (External node). No further steps.
      - **WNR** (`WIDGET_NAVIGATES_ROUTE`):
        - If `t.targetRouteId` is null (unresolved): record unresolved target evidence. Terminal = current route `r'`.
        - Otherwise: apply redirect closure at `t.targetRouteId`. Terminal = resolved route. Append redirect steps.
      - **WTH / WSF** (`WIDGET_TRIGGERS_HANDLER` / `WIDGET_SUBMITS_FORM`):
        - Collect handler-scoped effect edges (A2.1 §5).
        - Append CCS steps (sorted by callsiteOrdinal).
        - If CNR exists: append CNR step.
          - If CNR `targetRouteId` is null: record unresolved target. Terminal = current route `r'`.
          - Otherwise: apply redirect closure at CNR target. Terminal = resolved route. Append redirect steps.
        - If no CNR: terminal = current route `r'`.

   c. **Record meta:** `unresolvedTargets`, `redirectLoop`, `redirectClosureStabilized`.

5. **Route aggregation:** If the same trigger edge `t.id` is active from multiple routes, aggregate into a single TaskWorkflow with `startRouteIds` containing all route IDs (sorted). Steps, terminal, and meta are computed from the first encounter (they are deterministic given the same trigger edge and graph index).

---

## 5) Effect Closure (Handler-Scoped)

When a trigger edge `t` has `t.effectGroupId` defined:

1. Collect all edges in the A1 multigraph with matching `effectGroupId`.
2. Partition by kind:
   - **CCS** (`COMPONENT_CALLS_SERVICE`): zero or more. Sort by `callsiteOrdinal` ascending, then by `edge.id` ascending for determinism.
   - **CNR** (`COMPONENT_NAVIGATES_ROUTE`): at most one. If multiple exist, select the one with lexicographically smallest `edge.id`.
3. Step order within a task: `[trigger, ...CCS(sorted), CNR?]`.

When `t.effectGroupId` is undefined, no effect edges are collected. Steps = `[trigger]` only.

The effectGroupId index lookup produces identical handler-scoped effect sequences deterministically.

---

## 6) Redirect Closure

Whenever a route context needs resolution (entry route initialization, WNR target, CNR target), A2 applies redirect closure:

* A redirect-closure invocation begins for a given route `startRouteId`.
* Maintain, for the current invocation:
  * `redirectClosureSeenRoutes: Set<RouteId>`, initialized with `startRouteId`.
  * `redirectClosureEdgeIds: string[]`, initialized as empty.
  * `visitCount: Map<RouteId, number>`, initialized with `{ [startRouteId]: 1 }`.

* While there exists an enabled redirect edge (`ROUTE_REDIRECTS_TO_ROUTE` with `isSystem=true`) from `currentRouteId`:
  * Select one redirect edge `e` by deterministic selection (A2.1 §8.2).
  * Let `nextRouteId := e.targetRouteId`.
  * If `nextRouteId` is null (unresolved redirect): record unresolved target, terminate closure, `stabilized := false`.
  * **Route-visit cap check (required):**
    * Compute `nextCount := (visitCount[nextRouteId] ?? 0) + 1`.
    * If `nextCount > routeVisitCap` (default 2):
      * **do not apply** the redirect (keep `currentRouteId` unchanged),
      * record `redirectLoop` evidence with `routeId: currentRouteId, edgeIds: [e.id]`.
      * `stabilized := false`. Stop closure.
    * Else:
      * Apply: set `currentRouteId := nextRouteId`, append `e.id` to `redirectClosureEdgeIds`, set `visitCount[nextRouteId] := nextCount`.
  * **Cycle detection (required, closure-local):**
    * After applying a redirect, if `currentRouteId ∈ redirectClosureSeenRoutes`:
      * record `redirectLoop` with `routeId: currentRouteId, edgeIds: redirectClosureEdgeIds`.
      * `stabilized := false`. Stop closure.
    * Otherwise add `currentRouteId` to `redirectClosureSeenRoutes`.

* Return `{ finalRouteId, redirectEdgeIds, redirectLoop?, stabilized }`.

`redirectClosureStabilized` on the TaskWorkflow is initialized to `true` and set to `false` permanently if any redirect closure invocation (entry, WNR target, CNR target) fails to stabilize.

---

## 7) Terminal Node Resolution

The terminal node of a TaskWorkflow is determined by the trigger kind and effect closure:

| Trigger Kind | Has CNR? | Terminal Rule |
|---|---|---|
| WNE | — | `t.to` (External node) |
| WNR (resolved) | — | Redirect-closure-resolved route at `t.targetRouteId` |
| WNR (unresolved) | — | Current route context `r'` |
| WTH / WSF | Yes (resolved) | Redirect-closure-resolved route at CNR target |
| WTH / WSF | Yes (unresolved) | Current route context `r'` |
| WTH / WSF | No | Current route context `r'` |

---

## 8) Deterministic Ordering

### 8.1 Trigger edge enumeration order
Entry routes: sorted by id ascending.
Active widgets within a route: sorted by id ascending.
Trigger edges from a widget: sorted by edge.id ascending.

### 8.2 Redirect closure selection
If multiple redirect edges are enabled from the same route, select by:

* `(edge.to asc, edge.id asc)` — deterministic tie-breaking.

---

## 9) TaskWorkflow Shape
A TaskWorkflow represents a single user interaction task:

* `id`: trigger edge ID (unique per trigger site)
* `triggerEdgeId`: same as `id`
* `startRouteIds: string[]`: sorted entry route IDs where this trigger is enabled
* `steps: TaskStep[]`: ordered steps, each `{ edgeId: string, kind: EdgeKind }`
  * Order: `[redirect-at-entry*, trigger, CCS*, CNR?, redirect-at-target*]`
* `terminalNodeId: string`: terminal node (Route or External)
* `effectGroupId?: string`: links trigger to handler-scoped effects
* `cw: ConstraintSurface`: merged constraint surface (computed by A2.2)
* `verdict: WorkflowVerdict`: feasibility verdict (computed by A2.2)
* `explanation: WorkflowExplanation`: machine-readable explanation
* `meta`: workflow-level evidence:
  * `unresolvedTargets?: [{ edgeId, targetText? }]`
  * `redirectLoop?: { routeId, edgeIds }`
  * `redirectClosureStabilized?: boolean`

No node sequences are stored; node reconstruction is done by edge endpoints.

---

# A2.2 — Constraint Solving + Classification (deterministic)
## 1) Constraint Merge Operator (Mechanical)
Given a workflow `w` with steps `e1..en`, define:

`C(w) = merge( constraints(e1), constraints(e2), ..., constraints(en) )`

Where merge is:

* `requiredParams`: set union (dedup)
* `guards`: set union (dedup)
* `roles`: set union (dedup)
* `uiAtoms`: concatenation preserving order.
* `evidence`: concatenation of all `constraints.evidence` plus all `edge.refs` (dedup by `(file,start,end)`)

A2.2 treats `requiredParams` as edge-local input from A1 and performs only set-union; it does not infer params from visited routes.
No boolean simplification is performed in A2.2. Meaning comes only from classification rules.

---

## 2) Deterministic Feasibility Rules (No Full SAT)
A2.2 uses a rule-based classifier. Only explicit contradictions yield `PRUNED`.

### 2.1 Base verdicts
Start with:

* `verdict = FEASIBLE`

Then apply upgrades/downgrades in this strict order:

1. `PRUNED` checks
2. otherwise `CONDITIONAL` checks
3. otherwise remain `FEASIBLE`

---

## 3) PRUNED Rules (Provable Literal Contradictions Only)
A workflow is `PRUNED` **only if a literal, non-expression contradiction is provable from aggregated atoms.**
No inference beyond explicit atom comparison is allowed.
PRUNED rules are applied in this strict order.

---

### 3.1 Explicit Mutex Contradictions
If `C(w).uiAtoms` contains:

```
Atom(kind="Other", args=["Mutex", key, valueA])
Atom(kind="Other", args=["Mutex", key, valueB])
```

with `valueA !== valueB` → PRUNED.

No semantic meaning is assumed beyond literal equality comparison.

---

### 3.2 Exclusive Role Group Contradiction
If `C(w).uiAtoms` contains:

```
Atom(kind="Other", args=["ExclusiveRoleGroup", groupId, roleA])
Atom(kind="Other", args=["ExclusiveRoleGroup", groupId, roleB])
```

with `roleA !== roleB` → PRUNED.

Default role accumulation is conjunctive and never contradictory unless this atom form exists.

---

### 3.3 Literal UI Impossibility
If `C(w).uiAtoms` contains:

```
Atom(kind="WidgetVisible", args=[widgetId, "false"])
```

OR

```
Atom(kind="WidgetEnabled", args=[widgetId, "false"])
```

→ PRUNED.

These represent statically impossible interaction sites.
Expression-based atoms (`WidgetVisibleExpr`, `WidgetEnabledExpr`) are never grounds for PRUNED.

---

### 3.4 Literal Form Constraint Contradictions
Only literal numeric contradictions are considered.
If both atoms exist:

```
Atom(kind="InputConstraint", args=[k, "minLength", a])
Atom(kind="InputConstraint", args=[k, "maxLength", b])
```

and `Number(a) > Number(b)` → PRUNED.

If both atoms exist:

```
Atom(kind="InputConstraint", args=[k, "min", a])
Atom(kind="InputConstraint", args=[k, "max", b])
```

and `Number(a) > Number(b)` → PRUNED.

No other input constraint combinations are interpreted.
Pattern-based contradictions are never evaluated.

---

### 3.5 Redirect Closure Deadlock
If:

```
meta.redirectClosureStabilized === false
AND
userStepCount === 0
```

→ PRUNED.

`userStepCount` is the count of non-redirect steps (all steps except `ROUTE_REDIRECTS_TO_ROUTE`).
Otherwise redirect instability yields CONDITIONAL (handled later).

---

### 3.6 No Other PRUNED Conditions Exist
If none of the above hold, the workflow cannot be PRUNED.
Missing params, guards, roles, expression gates, unresolved targets → never PRUNED.

---

## 4) CONDITIONAL Rules (Unresolved or Requires Runtime Assignment)
A workflow is `CONDITIONAL` if any holds:

### 4.1 Unresolved navigation target encountered
If workflow `meta.unresolvedTargets` is non-empty, mark `CONDITIONAL`.

Attach to explanation:

* `unresolvedTargets: [{ edgeId, targetText }]`

### 4.2 Required params exist (assignment needed)
If `C(w).requiredParams.length > 0`, mark `CONDITIONAL` unless there is explicit evidence of binding (future Atom kind `ParamBound`).

For now:

* required params imply CONDITIONAL.

Attach:

* `missingParams: requiredParams`

### 4.3 Guards exist (assignment needed)
If `C(w).guards.length > 0`, mark `CONDITIONAL`.

Attach:

* `requiredGuards: guards`

### 4.4 Role policy R1 (non-exclusive requirements)
Roles accumulate conjunctively but are **not contradictory** by default.
So:

* if roles exist → `CONDITIONAL` (needs an account satisfying them)
* never `PRUNED` due to multiple roles unless exclusivity atoms exist.

Attach:

* `requiredRoles: roles`

### 4.5 Expression-bound UI gating
A workflow is CONDITIONAL if `C(w).uiAtoms` contains any of:

* `WidgetVisibleExpr`
* `WidgetEnabledExpr`
* `WidgetRequiredExpr`
* `InputConstraintExpr`

Attach to explanation:

* `uiGates: uiAtomsFilteredToExprKinds` (machine-readable list)

### 4.6 Form validity gate
A workflow is CONDITIONAL if `C(w).uiAtoms` contains:

* `Atom(kind="FormValid", ...)`

Attach:

* `requiresFormValid: true`

### 4.7 Redirect instability (non-deadlock)
If `meta.redirectClosureStabilized === false` and the workflow was not already PRUNED by §3.5:

Attach:

* `redirectClosureStabilized: false`
* `redirectLoop` evidence if present

---

## 5) FEASIBLE (Strong) Condition
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

# A2 Output Artifact (single stable contract)
`phaseA2-taskworkflows.final.json` contains:

* reference to the A1 multigraph hash/metadata
* config `{ mode: "task" }`
* TaskWorkflows (classified)
* partitions and stats

---

# Determinism + Invariants (A2 must enforce)
## A2.1 invariants
* Every `steps[i].edgeId` is an existing `Edge.id` in the A1 multigraph.
* Every step is of a traversable executable kind (§1).
* Each trigger edge must be enabled at the route context where it was collected (§2.3).
* Effect edges must match the trigger's `effectGroupId` (§5).
* CCS edges are sorted by `callsiteOrdinal` ascending (§5).
* At most one CNR edge per handler (§5).
* Entry route aggregation produces sorted `startRouteIds` (§4 step 5).
* `meta.unresolvedTargets` is present iff any unresolved navigation edge was encountered.
* `meta.redirectLoop` is present iff redirect closure loop was detected.
* `meta.redirectClosureStabilized` is `false` iff any redirect closure failed to stabilize.
* Workflows are sorted by `id` ascending.

## A2.2 invariants
* `cw` is exactly the merge of step constraints (§1).
* `verdict` is produced by the ordered rule application (§2–§5).
* `explanation` fields are present iff relevant.

---

# Typed Schemas for A2 Artifacts (Complete, Commented)

```ts
/** A reference to an A1 bundle used to produce workflows (for audit reproducibility). */
export interface PhaseAInputRef {
  /** Stable identifier for the analyzed project/version (e.g., git sha or provided build id). */
  projectId: string;
  /** Hash of the multigraph JSON or canonical serialization (to detect drift). */
  multigraphHash: string;
}

/** Feasibility verdict computed in A2.2. */
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
  /** UI-gate atoms. */
  uiGates?: Atom[];
  /** Requires a form to be valid. */
  requiresFormValid?: boolean;
  /** Redirect loop evidence if detected. */
  redirectLoop?: {
    /** Route id where redirect closure failed to stabilize. */
    routeId: string;
    /** Edge ids participating in the loop (captured during redirect closure). */
    edgeIds: string[];
  };
  /** True iff redirect closure stabilized (terminated without cycle/cap-block failure) at every point it was applied. */
  redirectClosureStabilized?: boolean;
}

/** A step within a TaskWorkflow, carrying the edge ID and its kind for audit. */
export interface TaskStep {
  edgeId: string;
  kind: EdgeKind;
}

/** A task workflow: one trigger edge + deterministic effect closure. */
export interface TaskWorkflow {
  /** ID = trigger edge ID (unique per trigger site). */
  id: string;
  /** The trigger edge ID that initiates this task. */
  triggerEdgeId: string;
  /** Entry route IDs where this trigger is active (sorted, aggregated across entries). */
  startRouteIds: string[];
  /** Ordered steps: [redirect-at-entry*, trigger, CCS*, CNR?, redirect-at-target*]. */
  steps: TaskStep[];
  /** Terminal node ID (route or external). */
  terminalNodeId: string;
  /** effectGroupId linking trigger to its CCS/CNR effects. */
  effectGroupId?: string;
  /** Merged constraint surface across all step edges. */
  cw: ConstraintSurface;
  /** Feasibility verdict. */
  verdict: WorkflowVerdict;
  /** Machine-readable explanation for verdict. */
  explanation: WorkflowExplanation;
  /** Workflow-level metadata. */
  meta: {
    unresolvedTargets?: Array<{ edgeId: string; targetText?: string }>;
    redirectLoop?: { routeId: string; edgeIds: string[] };
    redirectClosureStabilized?: boolean;
  };
}

/** Output artifact for A2. */
export interface TaskWorkflowBundle {
  /** Reference to the A1 input used. */
  input: PhaseAInputRef;
  /** Configuration. */
  config: { mode: "task" };
  /** All task workflows, sorted by id. */
  workflows: TaskWorkflow[];
  /** Convenience partitions. */
  partitions: {
    feasibleIds: string[];
    conditionalIds: string[];
    prunedIds: string[];
  };
  /** Summary stats. */
  stats: {
    workflowCount: number;
    feasibleCount: number;
    conditionalCount: number;
    prunedCount: number;
    triggerEdgeCount: number;
    enumeratedRouteCount: number;
  };
}
```

---

# What A2 Explicitly Do Not Do
* No new nodes or edges beyond those already in the A1 multigraph.
* No full SAT solving.
* No semantic interpretation of guards/roles beyond the fixed deterministic rules above.
* No attempt to bind params, authenticate, or select accounts (Phase B).
