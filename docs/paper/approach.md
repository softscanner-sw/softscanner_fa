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

**Subscribe callback capture (normative):**
When analyzing a handler body (or a transitively-followed same-class callee), if a call expression matches `.subscribe(callback)` where `callback` is an arrow function or function expression, inspect the callback body for the same call-context kinds: Navigate, ServiceCall, DialogOpen, StateUpdate. This captures post-async effects that are otherwise invisible to static analysis.

Constraints:
* The subscribe call must be on a call chain rooted in `this.<expr>` (e.g., `this.service.doSomething().subscribe(...)`, `this.dialogRef.afterClosed().subscribe(...)`).
* Only the first argument to `.subscribe()` is inspected (the "next" callback). Error and complete callbacks are not followed.
* If the first argument is an object literal with a `next` property (e.g., `.subscribe({ next: fn })`), the `next` function is inspected.
* Maximum depth: the callback body is analyzed at `depth + 1`, sharing the same depth limit and cycle-safety as same-class following.
* Pipe operators (`.pipe(tap(...), switchMap(...))`) are NOT followed. Only the terminal `.subscribe()` callback is captured.
* The callback body may contain `this.<method>(...)` calls that trigger further same-class following under the existing depth rules.
* Determinism: callback extraction is syntactic (arrow function or function expression as first argument to `.subscribe()`); no type inference or runtime analysis.

This rule captures the common Angular pattern: `this.service.action().subscribe(result => { this.router.navigate(['/success']); })` and `this.dialogRef.afterClosed().subscribe(result => { if (result) this.refresh(); })`.

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
* Guards (`canActivate`, `canLoad`) declared on the mount-point route record that carries `loadChildren` must be propagated to every route within the lazy-loaded module. Angular's router applies mount-point guards transitively to all routes loaded by the lazy module, so these guards are semantically present on every route in that module. Guard propagation is deduplicated (union by guard name) and deterministically sorted.

Rationale: Angular merges lazy-loaded routes into the global router at their mount point, but these routes are independently navigable URL-level endpoints. Treating them as children of the lazy-load placeholder would incorrectly suppress their entry status. Guard propagation is separate from parent–child hierarchy: it ensures that constraint surfaces on edges targeting lazy-loaded routes correctly reflect the mount-point's access-control requirements without altering component ancestry.

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
export interface A1Multigraph {
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

A2 emits the final workflow space as `a2-workflows.json`, a single stable artifact.

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
`a2-workflows.json` contains:

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
export interface A2WorkflowSet {
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

---

# Phase B — Executable Test Derivation (Normative, Frozen)
Phase B consumes the frozen Phase A artifacts (`a1-multigraph.json`, `a2-workflows.json`) and produces executable Selenium test cases that maximize coverage over the fixed Phase A workflow space.

## B0–B4 Decomposition
| Stage | Purpose | Input | Output |
|-------|---------|-------|--------|
| **B0** | Subject manifest authoring | Manual per-subject | `manifest.json` |
| **B1** | RealizationIntent derivation + ActionPlan generation | A1 + A2 + manifest | `b1-intents.json`, `b1-plans.json` |
| **B2** | Selenium test code generation | B1 plans | `tests/<workflowId>.test.ts` |
| **B3** | Execution + bounded retry | B2 tests + running app | `b3-results.json` |
| **B4** | Coverage reporting | B3 results + A2 workflow set | `b4-coverage.json` |

**B0** is manual. **B1** is deterministic (except LLM-assisted form data for complex CONDITIONAL). **B2** targets Selenium WebDriver JS (TypeScript); the B1 artifact model is conceptually framework-agnostic. **B3** includes bounded retry with escalation. **B4** computes tiered coverage metrics.

---

## Subject Manifest (B0)
The subject manifest is the normative per-subject contract that supplies runtime-specific information not available from static analysis:

```ts
SubjectManifest {
  subjectName: string
  baseUrl: string                        // e.g., "http://localhost:4200"
  accounts: Array<{
    username: string
    password: string
    roles: string[]
    guardSatisfies: string[]             // Guard class names this account satisfies
  }>
  routeParamValues: Record<string, string>   // param name → concrete value (global fallback)
  routeParamOverrides?: Record<string, Record<string, string>> // fullPath → param → value (per-template)
  formDataOverrides?: Record<string, Record<string, string>>  // workflowId → field → value
  skipWorkflows?: string[]               // Workflow IDs to exclude from execution
  authSetup?: AuthSetup                  // How to authenticate (required if accounts present)
  executionConfig?: ExecutionConfig      // Execution-readiness settings (B3 only)
  seedRequirements?: SeedRequirements    // Wizard-generated seed summary (B0-validated)
}

AuthSetup {
  loginRoute: string                     // Path for login page (e.g., "/login")
  usernameField: string                  // CSS selector for username input
  passwordField: string                  // CSS selector for password input
  submitButton: string                   // CSS selector for submit button
  authSuccessSelector: string            // CSS selector for post-login element confirming auth success
}

ExecutionConfig {
  readinessEndpoint?: string             // URL to GET for readiness check (defaults to baseUrl)
  readinessTimeoutMs?: number            // Max wait for readiness in ms (default: 30000)
  seedCommand?: string                   // Idempotent shell command run ONCE before test suite (transitional mechanism)
  seedDataNotes?: string[]               // Human-readable notes about required seed data/fixtures
  preAttemptCommand?: string             // Shell command to run before each test attempt (e.g., DB reset)
  batchResetCommand?: string             // Shell command run at batch boundaries (e.g., Docker restart for rate-limit reset)
  timeoutProfile?: { implicitWait?: number; navigationWait?: number; authWait?: number }  // B2 emitter timeout overrides
  enableNetworkEvidence?: boolean        // Enable CDP network capture for I2 instrumentation (default: false)
}

/** Wizard-generated seed requirement summary. Validated by B0 against manifest declarations. */
SeedRequirements {
  authGuards: string[]                   // Auth guard names requiring accounts (excludes NoAuthGuard)
  negativeGuards: string[]               // Negative guards (e.g., NoAuthGuard — requires NOT being logged in)
  routeParams: string[]                  // Route param names inferred from A2 workflows
  hasFormWorkflows: boolean              // Whether any A2 workflow is WSF (implies backend data validation)
  seedStatus: 'pre-seeded' | 'needs-command' | 'none'  // User-declared seed data status
}
```

The manifest maps `guardNames` from RealizationIntent to concrete credentials via `guardSatisfies`. When guards are present, `authSetup` provides the login mechanism so B1 can fully populate `PreCondition.config` for `auth-setup` preconditions and B2 can generate correct Selenium authentication code. This separates WHAT credentials to use (accounts) from HOW to use them (authSetup).

`executionConfig` is consumed only by B3. B0 validates its schema if present but does not perform runtime checks. B1 and B2 ignore it. The `seedDataNotes` field is informational — it documents entity/fixture requirements for the user but is not validated or enforced.

### B0 — Manifest Wizard
B0 provides a normative manifest wizard (`b0:wizard`) that scaffolds a `SubjectManifest` skeleton from A2 artifacts. The wizard:

1. Reads `a2-workflows.json` for the subject.
2. Collects all `guardNames` referenced across all non-PRUNED workflows and determines which are auth guards vs. NoAuth guards.
3. Collects all `requiredParams` referenced across all non-PRUNED workflows.
4. Emits a `subject-manifest.json` skeleton with:
   - `subjectName` set to the directory name
   - `baseUrl` set to the provided URL (or `http://localhost:4200` by default)
   - One account entry per distinct guard set, with empty `username`/`password`/`roles` placeholders
   - One `routeParamValues` entry per discovered param, with empty-string placeholder; for multi-family params (same param name used by ≥2 entity families), `routeParamOverrides` entries are emitted per entity family
   - `authSetup` scaffolded if any auth guards were found; login form selectors are auto-derived from A1 widget data when available (confidence-labeled HIGH/MEDIUM/UNRESOLVED)
5. The emitted skeleton is **not** immediately valid — the user must fill in credentials and selectors, then run `b0:validate` to confirm correctness.

The wizard is a generation aid, not a replacement for `b0:validate`. B0 validation must pass before B1 planning is attempted.

---

## B1 — RealizationIntent (auditable intermediate)
B1 produces one `RealizationIntent` per TaskWorkflow by reading A1 + A2 bundles. This is a deterministic derivation — no manifest or LLM needed.

```ts
RealizationIntent {
  workflowId: string               // = TaskWorkflow.id
  verdict: WorkflowVerdict
  triggerKind: EdgeKind             // WTH, WSF, WNR, WNE
  triggerEvent?: string             // DOM event name
  startRoutes: Array<{
    routeId: string
    fullPath: string               // URL template
    requiredParams: string[]       // From route meta
  }>
  triggerWidget: {
    nodeId: string
    tagName?: string
    widgetKind: SpecWidgetKind
    attributes: Record<string, string>
    componentSelector?: string     // Owning component's selector
    formControlName?: string
    routerLinkText?: string
    containingFormId?: string      // If inside a form (via WIDGET_CONTAINS_WIDGET)
    text?: string                  // Visible text content of the trigger element
    insideNgFor?: boolean          // True if widget is inside an *ngFor repeater
    insideNgForOrdinal?: number    // Positional index within the repeater (0-based)
    ngForItemTag?: string          // Tag name of each repeater item (e.g., "tr", "li")
    compositionGates?: string[]    // Structural directives gating widget visibility (e.g., ["*ngIf=..."])
  }
  formSchema?: Array<{            // Only for WSF triggers
    fieldNodeId: string
    tagName: string
    widgetKind: SpecWidgetKind
    formControlName?: string
    nameAttr?: string
    idAttr?: string             // Fallback identifier from HTML id attribute
    inputType?: string
    required: boolean
    minLength?: number
    maxLength?: number
    min?: number
    max?: number
    pattern?: string
    dateFormat?: string          // Expected date format (e.g., "YYYY/MM/DD") when inputType is "date"
    firstOptionValue?: string    // First <option> value for <select> elements (used as default)
  }>
  effectSteps: TaskStep[]          // From TaskWorkflow.steps
  terminalNodeId: string
  terminalRoutePath?: string       // Resolved from A1 if terminal is a route
  constraints: ConstraintSurface   // = TaskWorkflow.cw
  explanation: WorkflowExplanation
  guardNames: string[]             // Guard class names from route meta
  requiresParams: boolean          // requiredParams.length > 0
  hasUnresolvedTargets: boolean
}
```

**Start route policy:** For workflows with multiple `startRouteIds`, B1 uses `startRouteIds[0]` deterministically. A2 produces deterministic ordering of `startRouteIds`.

---

## B1 — ActionPlan (assignment-bound)
The action plan binds a realization intent to concrete values from the subject manifest and produces an ordered sequence of browser actions.

```ts
ActionPlan {
  workflowId: string
  planVersion: number              // Incremented on re-planning (LLM repair)
  assignment: Assignment
  preConditions: PreCondition[]
  steps: ActionStep[]
  postConditions: PostCondition[]
  triggerContext?: TriggerContext   // B5.2: structural context for wait derivation
}

TriggerContext {
  insideNgFor?: boolean            // Widget is inside a repeater
  compositionGates?: string[]      // Structural directives gating visibility
  asyncPipe?: boolean              // Data source involves async pipe
}

Assignment {
  account?: { username: string, password: string, roles: string[] }
  routeParams: Record<string, string>
  formData: Record<string, string>       // formControlName → value
}

PreCondition {
  type: 'auth-setup' | 'navigate-to-route' | 'trigger-dialog-open'
  config: Record<string, string>
}

ActionStep {
  type: 'click' | 'type' | 'clear-and-type' | 'submit' | 'select-option' |
        'navigate' | 'wait-for-navigation' | 'wait-for-dialog' | 'wait-for-element'
  locator: ScopedLocator
  value?: string
  edgeId?: string                  // Traceability to A1/A2
  description: string
}

ScopedLocator {
  componentSelector?: string       // Scoping ancestor
  formSelector?: string            // Form scoping (if inside form)
  strategy: 'data-testid' | 'id' | 'name' | 'formcontrolname' | 'aria-label' |
            'routerlink' | 'href' | 'placeholder' | 'tag-position' | 'custom'
  value: string
  tagName?: string
  fallbacks?: ScopedLocator[]
}

PostCondition {
  type: 'assert-url-matches' | 'assert-no-crash'
  expected?: string
}
```

---

## B1 — Assignment Contract
**Assignments must satisfy C(w).** Every `ActionPlan.assignment` must be consistent with `TaskWorkflow.constraints` — no contradictions. The subject manifest maps guard names to credentials, route params to concrete values, and form fields to valid test data.

---

## B1 — Start Route Selection
When a workflow has multiple `startRoutes`, B1 must select exactly one as the navigation target. The selection is deterministic and optimizes for minimal test complexity:

1. **Exclude wildcard routes** — routes whose `fullPath` contains `**` are never selected (catch-all routes are not navigable targets).
2. **Auth-aware guard preference** — if the workflow's `guardNames` array contains any auth guard (i.e., the workflow's constraint surface requires authentication), prefer guarded routes so that `auth-setup` is emitted and auth-dependent trigger widgets are rendered. Otherwise, prefer unguarded routes to minimize test complexity. Guard names matching `/noauth/i` are excluded from both the workflow guard check and the route guard classification.
3. **Fewest required params** — among tied routes, prefer those with fewer `:param` placeholders.
4. **Shortest path** — among tied routes, prefer shorter `fullPath` strings.
5. **Alphabetical** — final tie-break by lexicographic order of `fullPath`.

If all routes are wildcards, the first wildcard is used as fallback.

---

## B1 — Route Param Scope
`Assignment.routeParams` includes all `:param` placeholders that appear in **either**:
- the selected start route's `fullPath`, **or**
- the workflow's `terminalRoutePath` (used in `assert-url-matches` postconditions).

Values are drawn from `manifest.routeParamOverrides` (per-template) with fallback to `manifest.routeParamValues` (global). Lookup order: `routeParamOverrides[terminalPath][param]` → `routeParamOverrides[startPath][param]` → `routeParamValues[param]` → placeholder `<paramName>`. The `routeParamOverrides` field allows subjects with multi-family params (e.g., `/owners/:id` vs `/pets/:id` in spring-petclinic) to specify distinct seed values per route template without ambiguity.

**Dynamic-ID postcondition rule:** For WSF (form submission) workflows where the terminal route contains params NOT present in any start route, those params are likely server-generated (e.g., creating a new user navigates to `/users/:newId`). B1 retains the `:param` template placeholder in the `assert-url-matches` expected URL instead of substituting the manifest value. B2 emits a regex-based URL assertion for such patterns (`:param` → `[^/]+`), allowing any valid server-generated ID to match.

**Login-route WSF postcondition rule:** When a WSF workflow's selected start route matches `manifest.authSetup.loginRoute` AND the A2 terminal route equals the start route (i.e., A2 could not resolve the post-login navigation destination), B1 emits `assert-no-crash` instead of `assert-url-matches`. This compensates for unresolvable handler indirection (e.g., `RouterService.routeToHomepage()`). *Caveat:* `assert-no-crash` is a weak oracle — it verifies only that the page did not crash, not that login succeeded. Login success is validated transitively by `auth-setup` preconditions in guarded workflows that use the same manifest credentials. A login-form WSF pass with `assert-no-crash` is only meaningful when at least one guarded workflow's auth-setup succeeds in the same B3 run.

---

## B1 — Form Field Scope
`Assignment.formData` includes form fields from `RealizationIntent.formSchema` — every direct `WIDGET_CONTAINS_WIDGET` child of the trigger's containing form, **with the following exclusions** applied at formSchema derivation time:

- **`Form`** — nested forms (excluded to avoid recursion).
- **`Button`** — not an interactive fill target.
- **`Option`** — children of `Select` widgets (not direct form children).

All other widget kinds are included, with widget-kind-aware step type mapping:

| Widget kind / input type | Step type | Default value |
|---|---|---|
| `Checkbox` | `click` | `"true"` |
| `RadioGroup` | `click` (first `mat-radio-button` child) | `"selected"` |
| `Radio` (standalone) | `click` | `"selected"` |
| `file` input type | `type` (sendKeys file path) | `/tmp/test-file.txt` |
| `Select` / `mat-select` | `select-option` | `option-1` (sentinel; B2 selects first option) |
| text-like inputs | `clear-and-type` | see default value table below |

**Form field key resolution order:** `formControlName` → `nameAttr` → `idAttr` (HTML `id` attribute) → `fieldNodeId`.

**Trigger widget locator resolution order:** `routerlink` (anchors only) → `href` → `data-testid` → `id` → `formcontrolname` → `name` → `aria-label` → `placeholder` → CSS `class` (compound selector) → `tag-position` (nth-of-type with stableIndex).

*CSS class fallback caveat:* The CSS class compound selector (e.g., `.material-icons.edit`) is a best-effort fallback applied only after all stronger semantic attributes fail. It is scoped within the component selector and deterministic, but may resolve to the first of multiple sibling elements with identical class sets within the same component subtree.

B1 does not filter fields by visibility, editability, or runtime behavior beyond the above structural exclusions.

**Default value policy for text-like `formData`** (deterministic, no LLM):

| Input type | Default value |
|---|---|
| `email` | `test@example.com` |
| `password` | `Test123!` |
| `number` | `min` value if present, else `1` |
| `tel` | `1234567890` |
| `url` | `https://example.com` |
| `color` | `#000000` |
| `date` | `2024-01-01` |
| `time` | `12:00` |
| `month` | `2024-01` |
| `week` | `2024-W01` |
| `datetime-local` | `2024-01-01T12:00` |
| `textarea` | `test-{fieldKey}` |
| text-like (`text`, `search`, `range`, etc.) | `test-{fieldKey}`, padded to `minLength` if set |

**Composite widget capture (A1):** `mat-radio-group` is captured as a `RadioGroup` widget node with its `formControlName`. Its `mat-radio-button` children are captured as `Radio` widgets connected via `WIDGET_CONTAINS_WIDGET`. Similarly, `mat-option` and `<option>` children of `Select` / `mat-select` widgets are captured as `Option` widget nodes with their `value` attributes. This enables B1 to emit a single click step for the first radio button in a group, and provides option value metadata for select fields.

**Select-option semantics:** B2 selects the first available option by position (CSS `option:nth-of-type(1)` for native selects, first `mat-option` for Angular Material). Subject operators who require a specific option value must use `formDataOverrides` in the manifest.

**Login-form credential materialization:** When a WSF workflow's selected start route matches `manifest.authSetup.loginRoute`, B1 populates the form's username and password fields from the first manifest account (`accounts[0]`) instead of using deterministic defaults. The field matching uses the `formControlName` extracted from the `authSetup.usernameField` and `authSetup.passwordField` CSS selectors. If no account is available, the default value policy applies as normal.

---

## B1 — Auth Materialization
If the **selected start route** (per the route selection rule above) carries auth guards (excluding NoAuth-style guard names) and the subject manifest contains an account whose `guardSatisfies` covers all such guards, B1 emits an `auth-setup` precondition with credentials from that account. If no guards are present on the selected route, no `auth-setup` is emitted regardless of whether other start routes are guarded.

---

## B1 — Dialog Precondition
When a trigger widget belongs to a dialog component (reachable via `COMPONENT_COMPOSES_COMPONENT` edge in A1), B1 derives the opener by graph traversal and injects a `trigger-dialog-open` precondition step in the ActionPlan. A component is identified as a dialog candidate if and only if: (1) it is a target of at least one `COMPONENT_COMPOSES_COMPONENT` edge, and (2) its selector matches the pattern `/dialog|modal/i`.

---

## B2 — Code Generation
B2 generates one Selenium WebDriver JS (TypeScript) test file per ActionPlan. The generated code:
- Navigates to the start route
- Executes preconditions (auth setup, dialog opening)
- Performs action steps (click, type, submit, wait)
- Asserts post-conditions (URL match, no crash)

B2 is deterministic: same ActionPlan → same generated code.

### B2 — Angular Material Widget Interaction
For form fields whose `tagName` is `mat-select` (Angular Material select), B2 generates a three-step overlay interaction instead of a native `<select>` interaction:

1. Click the `mat-select` element to open the options overlay.
2. Wait for `mat-option` to appear in the DOM (overlay rendered).
3. Click the first `mat-option`.

This is necessary because `mat-select` renders its options in a CDK overlay portal outside the component DOM tree — the native `<select>` / `<option>` interaction pattern does not apply.

---

## B3 — Execution and Bounded Retry
B3 executes generated tests against a running subject application. Bounded flat retry:

- Each test is attempted up to `maxRetries` times (default: 3). Each attempt executes the same generated test identically.
- If any attempt passes → done (PASS). If all attempts fail → the last attempt's failure is recorded.
- Certain failure modes (e.g., `FAIL_APP_NOT_READY`) terminate retry immediately.

**Future escalation (not yet implemented):** Level 2 (retry with increased timeouts) and Level 3 (LLM-assisted locator/plan repair) are designed but deferred. The current implementation uses flat retry only.

Each attempt produces an `ExecutionAttempt` entry; the final `ExecutionResult` aggregates all attempts.

### B3 — App Readiness
The framework assumes the target application is already running at `SubjectManifest.baseUrl`. Users are responsible for starting the application and provisioning any required seed data (entities referenced by `routeParamValues`).

Before executing tests for a subject, B3 must perform a readiness check: HTTP GET to `executionConfig.readinessEndpoint` (defaults to `baseUrl`). If the check fails after `executionConfig.readinessTimeoutMs` (default: 30000 ms), all workflows for that subject are marked `FAIL_APP_NOT_READY`.

### B3 — ExecutionResult Schema
```ts
type ExecutionOutcome =
  | 'PASS'                    // Test passed all assertions
  | 'FAIL_APP_NOT_READY'      // Readiness check failed (environment deficiency)
  | 'FAIL_AUTH'               // Authentication precondition failed
  | 'FAIL_ELEMENT_NOT_FOUND'  // Locator did not match any element
  | 'FAIL_ASSERTION'          // PostCondition assertion failed
  | 'FAIL_TIMEOUT'            // Operation timed out
  | 'FAIL_INTEGRITY'          // Per-test log missing, stale, or disagrees with exit code
  | 'FAIL_UNKNOWN';           // Unclassified error

interface ExecutionAttempt {
  attemptNumber: number;       // 1-based attempt index
  outcome: ExecutionOutcome;
  durationMs: number;
  error?: string;              // Error message if not PASS
  stderr?: string;             // Raw stderr (truncated to 2000 chars)
  screenshots: string[];       // Paths to screenshots captured during this attempt
}

interface ExecutionResult {
  workflowId: string;
  testFile: string;
  outcome: ExecutionOutcome;   // Final outcome (best attempt)
  attempts: number;            // 1–3 (bounded retry)
  durationMs: number;          // Total duration across all attempts
  error?: string;              // Error message if not PASS
  attemptDetails: ExecutionAttempt[];  // Per-attempt evidence
  screenshots: string[];       // Paths to captured screenshots
}
```

### B3 — Entity Data Responsibility
Route parameter values in `routeParamValues` (e.g., `id=1`, `projectId=test-project-id`) assume corresponding entities exist in the running application's data store. Entity provisioning is the user's responsibility. Missing-entity failures produce `FAIL_ELEMENT_NOT_FOUND` or `FAIL_ASSERTION`, not `FAIL_APP_NOT_READY`.

The optional `executionConfig.seedDataNotes` field documents what entities or fixtures the user must provision. These notes are informational and are not validated or enforced by B0 or B3.

---

### B3 — Operational Features
B3 supports the following execution modes via CLI flags:

- **`--resume`**: Continue an interrupted run from the last saved checkpoint (`b3-progress.json`). Already-completed tests are preserved; only remaining tests are re-executed.
- **`--failed-only`**: Rerun only tests that failed in a prior complete run (`b3-results.json`). Prior PASS results are merged into the new result set.
- **`--only <ids>`**: Run only specific workflow IDs (comma-separated). Useful for targeted debugging.
- **`--batch-size <N>`**: Process tests in batches of N, with Chrome cleanup between batches.

Progress is persisted to `b3-progress.json` after every test completion, enabling crash recovery without re-executing passed tests.

### B3 — Execution Environment
B3 executes each generated test file as an isolated subprocess. The normative execution model:

- **Runner:** Each test file is executed via `tsx` (TypeScript ESM runner). No compilation step. Test files are run from the project root.
- **Isolation:** Each test file creates and destroys its own `WebDriver` instance. No shared browser state between tests.
- **Sequencing:** Tests are executed sequentially per subject. Parallel execution within a subject is not permitted (avoids ChromeDriver port conflicts and session state interference).
- **Environment requirements:** Node.js (≥18), ChromeDriver on PATH, Chrome (≥112) installed. Generated tests import `selenium-webdriver` — this dependency must be available from the project root `node_modules/`.
- **Per-test session isolation:** Each test starts with a blank Chrome profile (no cookies, no session storage). This ensures NoAuthGuard-protected routes (login, signup) are accessible without an explicit "ensure-not-logged-in" precondition.

---

### B3 — Failure Classification
B3 classifies execution outcomes by examining the error thrown when a test subprocess exits with a non-zero code. Classification is performed by B3 (not by generated test code) using the following ordered rules:

1. If the readiness check failed before the subprocess was launched → `FAIL_APP_NOT_READY`
2. If the subprocess exit code is 0 → `PASS`
3. If the error message contains `NoSuchElementError`, `StaleElementReferenceError`, `InvalidArgumentError`, or `ElementNotInteractableError` → `FAIL_ELEMENT_NOT_FOUND`
4. If the error message contains `AssertionError` or `assert` with postcondition text → `FAIL_ASSERTION`
5. If the error message contains `TimeoutError` → `FAIL_TIMEOUT`
6. If the error occurs during an `auth-setup` precondition block (detectable from error context) → `FAIL_AUTH`
7. Otherwise → `FAIL_UNKNOWN`

B3 records the raw error message in `ExecutionResult.error` regardless of classification, enabling post-hoc re-classification and debugging.

---

## B4 — Coverage Reporting
Coverage is framed over the fixed workflow space W = A2WorkflowSet.workflows.

Tiered metrics:
- **C1 (Plan coverage):** fraction of W for which B1 produces a valid ActionPlan
- **C2 (Code coverage):** fraction of W for which B2 produces syntactically valid test code
- **C3 (Execution coverage):** fraction of W for which B3 produces a passing test. The C3 denominator excludes: (a) PRUNED workflows (provably infeasible), (b) workflows with outcome `FAIL_APP_NOT_READY` (environment deficiency, not test failure — B3 must record this outcome explicitly and must never reclassify it as a skip or treat it as equivalent to a user-declared skip), and (c) workflows explicitly listed in `manifest.skipWorkflows` (user-declared opt-out only; B3 must never autonomously add workflows to the skip set — it may only skip what the manifest declares). All other outcomes — including `FAIL_ELEMENT_NOT_FOUND`, `FAIL_ASSERTION`, `FAIL_TIMEOUT`, `FAIL_AUTH`, and `FAIL_UNKNOWN` — count against C3. If the readiness check fails, B3 marks all workflows for that subject `FAIL_APP_NOT_READY` without executing them, and exits the subject run.
- **C4 (Oracle strength):** deferred (assertion richness beyond URL-match)

PRUNED workflows are reported separately as "provably infeasible" and excluded from the coverage denominator.

### B4 — Output Artifact Schema
B4 emits `b4-coverage.json`:

```ts
B4CoverageReport {
  input: PhaseAInputRef                  // A2 bundle reference
  workflows: B4WorkflowEntry[]           // One entry per A2 workflow
  summary: B4Summary
}

B4WorkflowEntry {
  workflowId: string
  verdict: WorkflowVerdict               // FEASIBLE | CONDITIONAL | PRUNED
  hasPlan: boolean                       // B1 produced an ActionPlan
  hasCode: boolean                       // B2 produced a test file
  executionOutcome?: ExecutionOutcome    // Set by B3 (absent if not executed)
  attempts?: number                      // B3 attempt count (1–3)
  durationMs?: number                    // B3 total execution time
  error?: string                         // B3 error message if not PASS
}

B4Summary {
  subject: string
  totalWorkflows: number                 // |W| = all A2 workflows
  prunedCount: number                    // PRUNED verdict
  appNotReadyCount: number               // FAIL_APP_NOT_READY outcomes
  skippedCount: number                   // manifest.skipWorkflows (user-declared)
  c1: number                             // plan coverage: hasPlan / (total - pruned)
  c2: number                             // code coverage: hasCode / (total - pruned)
  c3: number                             // exec coverage: PASS / (total - pruned - appNotReady - skipped)
  c4: number                             // oracle strength: deferred
}
```

The C1/C2 denominator is `totalWorkflows - prunedCount`. The C3 denominator is `totalWorkflows - prunedCount - appNotReadyCount - skippedCount`.

---

## B1 Output Artifacts
`b1-intents.json` contains:

```ts
B1IntentSet {
  input: PhaseAInputRef
  intents: RealizationIntent[]
  stats: {
    totalCount: number
    feasibleCount: number
    conditionalCount: number
    prunedCount: number
  }
}
```

`b1-plans.json` contains:

```ts
B1PlanSet {
  input: PhaseAInputRef
  plans: ActionPlan[]
  stats: {
    totalPlanned: number
    skipped: number
  }
}
```

---

## Difficulty Classes (D1–D7)
| Class | Description |
|-------|------------|
| D1 | Simple FEASIBLE (click/nav, no constraints) |
| D2 | Form submission (FormValid gate) |
| D3 | Guard-protected navigation (route guard) |
| D4 | Parameterized route navigation (requiredParams) |
| D5 | Combined constraints (visibility gates, mixed) |
| D6 | Dialog/modal component interaction |
| D7 | External URL navigation |

---

## Phase A GT vs Phase B GT Policy
Phase A GT (Definition A) defines what the extractor *should* extract — the extraction recall benchmark. It covers 256 unique triggers and excludes UI-feedback events like `(hovered)`.

Phase B GT covers the full A2 workflow space (257 entries = all A2WorkflowSet.workflows), including any A2-surplus triggers that Phase A GT excluded. Phase B GT is the coverage benchmark for test generation.

---

## What Phase B Explicitly Does Not Do
* No modification of A1 or A2 artifacts.
* No re-extraction from source code.
* No interpretation of Angular expressions at runtime (visibility gates are handled via `wait-for-element` steps).
* No full semantic oracle (C4 deferred; initial scope is execution success).

---

## B5 — Execution Enhancements

B0–B4 constitute the core Phase B pipeline. B5 covers execution-layer enhancements beyond the core pipeline, organized into a rigorous substage structure with clearly defined vocabulary, evidence classes, and implementation status.

### B5 Canonical Vocabulary

| Term | Definition | Phase | Kind |
|---|---|---|---|
| **workflow** | A2 TaskWorkflow: single-trigger interaction path through the multigraph | A2 | structural |
| **test** | B2-generated Selenium WebDriver TypeScript file for one workflow | B2 | structural |
| **manifest** | B0 SubjectManifest: subject configuration (baseUrl, accounts, params, auth) | B0 | structural |
| **seed data** | Pre-existing application database state required for test execution | B0/B3 | environment |
| **interaction data** | Form field values, route parameter values from B1 assignment | B1 | structural |
| **environment** | Running application + backend + database at manifest.baseUrl | B3 | runtime |
| **precondition** | B1 PreCondition: setup action before the trigger step (auth, navigate, dialog-open) | B1 | structural |
| **postcondition** | B1 PostCondition: assertion after the trigger step (URL-match, no-crash) | B1 | structural |
| **oracle** | The postcondition assertion strategy — determines what "pass" means | B1/B4 | oracle |
| **coverage** | B4 tiered measurement: C1 (plan), C2 (code), C3 (execution), C4 (oracle strength) | B4 | oracle |
| **validity** | Whether the test exercises the intended user interaction correctly | B3/B5 | oracle |
| **debugging** | Root-cause analysis from execution evidence to structural origin | B5 | runtime |
| **observability** | Structured evidence capture during test execution (B5.0 logs) | B5 | runtime |
| **instrumentation agent** | Code injected or activated to capture runtime evidence beyond Selenium | B5 | runtime |
| **UI** | The rendered browser DOM at a point in time | B3 | runtime |
| **DOM** | Document Object Model — the browser's representation of the page | B3 | runtime |
| **screenshot** | PNG capture of the browser viewport at a specific step/milestone | B5 | runtime |
| **backend status** | HTTP response codes, API availability, database state | B3 | environment |

### B5 Evidence Classes

| Class | What it captures | Source | Available now |
|---|---|---|---|
| **Structural evidence** | A1 multigraph nodes/edges, A2 workflows, B1 plans, B2 test code | A1–B2 artifacts | Yes |
| **Execution evidence** | Per-step success/failure, timing, locator resolution, route context | B5.0 logs | Yes |
| **UI evidence** | Screenshots, DOM snippets (outerHTML), element tag names | B5.0 logs | Yes (partial) |
| **Environment evidence** | App readiness, auth success, backend response timing | B3 readiness check, B5.0 auth step | Yes (partial) |
| **Oracle evidence** | Postcondition assertion result, URL match, crash detection | B5.0 postcondition steps | Yes (C3 only) |
| **Network evidence** | HTTP request/response pairs, timing, status codes | CDP (deferred) | No |
| **Framework evidence** | Per-step Angular change detection status, component lifecycle | testability API (deferred) | No |

### B5 Observability Model

| Need | Required data | Currently available | Gap |
|---|---|---|---|
| **Coverage** | Test count, pass/fail, per-workflow verdict | B4 coverage report | None (C3 complete) |
| **Validity** | Whether the correct element was interacted with | domEvidence, elementTagName | Partial (no post-action DOM) |
| **Debugging** | Step-level causality, route context, failure classification | B5.0 logs | Sufficient for classification; network/framework evidence deferred |
| **Timing analysis** | Per-step timestamps, auth duration, postcondition wait duration | B5.0 timestamps | Sufficient; CDP would add network-level timing |

### B5 Canonical Layer Model (I / L / O)

Three orthogonal layer systems structure the B5 observability and correctness model.

#### I — Instrumentation Layers (where evidence is captured)

| Tier | Scope | Mechanism | Status |
|---|---|---|---|
| **I1: Test instrumentation** | Generated test code | B2 emits logStep()/captureScreenshot() calls | Implemented (B5.0) |
| **I2: Browser instrumentation** | Selenium WebDriver | CDP network/performance domains (optional `enableNetworkEvidence`) | Partially implemented (B5.1) |
| **I3: Application instrumentation** | Target Angular app | Zone.js/testability API hooks | Deferred |

I1 is generic (works with any subject). I2 requires Chrome/Chromium. I3 requires Angular-specific runtime hooks and may be subject-specific.

#### L — Correctness Layers (where a failure belongs semantically)

| Layer | Precondition | Postcondition | Evidence source |
|---|---|---|---|
| **L1: Execution** | App reachable; test process completes | No crash, no unhandled exception | I1: exit code, step outcomes |
| **L2: Navigation** | Route exists; params valid; auth satisfied | URL matches expected route/pattern after action | I1: `driver.getCurrentUrl()` |
| **L3: DOM/materialization** | Target widget exists in DOM and is interactable | Expected DOM mutation occurred after action | I1: `findElement` success/failure, implicit wait |
| **L4: Backend state** | Seed data exists; constraints satisfied | Backend accepted/rejected mutation | I2: CDP `networkEvidence` HTTP status |

L-layers are diagnostic: they classify WHERE a failure originates, guiding remediation to the correct subsystem.

#### O — Oracle Tiers (what success is asserted to mean)

| Tier | What it asserts | PostConditionType | Status |
|---|---|---|---|
| **O1: Execution oracle** | Test runs without crash or timeout | `assert-no-crash` | Implemented |
| **O2: Navigation oracle** | URL matches expected route after interaction | `assert-url-matches` | Implemented |
| **O3: UI state oracle** | Expected DOM elements/text appear after interaction | Not implemented | Deferred |
| **O4: Semantic state oracle** | Backend state changed as expected (entity CRUD) | Not implemented | Deferred |

**Mapping:** O1 operates at L1. O2 operates at L2. O3 would operate at L3. O4 would operate at L4.
C3 coverage uses O1+O2. C4 coverage (deferred) requires O3+O4.

#### Separation of concerns

- **I** answers: "where do we get evidence?" (technical plumbing)
- **L** answers: "where does the failure belong?" (diagnostic classification)
- **O** answers: "what does the test assert?" (oracle contract)

Waits are L3 precondition-support mechanisms, not oracles.
URL assertions are L2/O2 postconditions, not waits.
CDP network evidence is I2 evidence used to diagnose L4, not an oracle by itself.

### B5 Logging Architecture

Two distinct logging contracts coexist:

**A. Framework/system logs** — Describe the behavior of the pipeline itself.
- Written by CLI entry points (a1-cli, b2-cli, b3-cli, viz-cli)
- Format: JSONL (one JSON object per line) with PipelineLogEvent schema
- Location: `logs/<phase>-pipeline.jsonl`
- Fields: timestamp, phase, operation, subject, severity, event, message, duration, outcome, error, context

**B. Per-test observability logs** — Describe runtime evidence of individual test execution.
- Written by B2-generated test code at B3 runtime
- Format: JSON (one file per test)
- Location: `output/<subject>/logs/<testFile>.log.json`
- Fields: workflowId, testFile, outcome, failedStepId, failureKind, duration, screenshots, steps[]

These must never be collapsed. Framework logs trace pipeline progress across subjects. Test logs trace step-level execution evidence within a single test.

---

### B5.0 — Observability Contract (Implemented)

B2-generated tests emit a structured JSON execution log per test run.

**Screenshot contract:** Unified via `captureScreenshot()`. Milestone screenshots (after-preconditions, after-steps, final, error) and step-level failure screenshots use the same mechanism. All paths traceable from the structured log via `screenshots[]` and per-step `screenshotPath`.

**Per-step log entry (field presence varies by step kind):**
| Field | Type | Present for | Source |
|---|---|---|---|
| `stepId` | string | all | Deterministic: `pre-N`, `step-N`, `post-N` |
| `edgeId` | string? | action steps | From ActionStep |
| `stepType` | string | all | `precondition:<type>`, `click`, `submit`, `postcondition:<type>` |
| `locator` | `{strategy, value}`? | action steps, preconditions | From ScopedLocator |
| `timestampStart` | ISO 8601 | all | Captured before step execution |
| `timestampEnd` | ISO 8601 | all | Captured in finally block |
| `success` | boolean | all | From try/catch result |
| `elementFound` | boolean? | action steps only | True iff findElement resolved. Omitted for preconditions/postconditions. |
| `elementTagName` | string? | action steps only | Lowercase tag name of the resolved element |
| `domEvidence` | string? | action steps only | outerHTML snippet (≤200 chars) |
| `failureKind` | enum? | failed steps | `locator-not-found`, `interaction-failed`, `timeout`, `assertion-failed`, `navigation-failed`, `unknown` |
| `error` | string? | failed steps | Raw error message |
| `routeBefore` | string? | all | URL before step |
| `routeAfter` | string? | all | URL after step |
| `screenshotPath` | string? | failed steps | Step-level failure screenshot path |

**Test-level summary:** workflowId, testFile, outcome, failedStepId, failureKind, duration, screenshots[], steps[].

**Output:** `output/<subject>/logs/<testFileName>.log.json`

**Wait/action invariant:** wait-for-element uses same scoped locator as subsequent action step.

**Visualization:** `npm run viz -- output/<subject>` generates `vis/b3-execution.html` consuming B1/B2/B3/B4/B5.0/manifest artifacts. Enumerates from B2 canonical test set. Pure consumer.

### B5.1 — Network-Aware Wait Strategies (Partially Implemented)

**Problem:** B3's current wait model uses fixed timeouts (IMPLICIT_WAIT 10s, NAVIGATION_WAIT 15s). For applications with backend API round-trips (HTTP POST → server processing → redirect), the fixed window is insufficient when the server response exceeds the timeout.

**Evidence:** spring-petclinic-angular (10 tests), airbus-inventory (2 tests) exhibit postcondition timeouts where the test action is correct but the backend response + Angular routing pipeline exceeds 15s. ever-traduora (8 tests) exhibit auth transition timeouts exceeding 45s.

**Implemented:**
- Configurable per-subject timeout profiles via `manifest.executionConfig.timeoutProfile`
- Fields: `implicitWait` (default 5s), `navigationWait` (default 10s), `authWait` (default 15s)
- B2 emits `IMPLICIT_WAIT`, `NAVIGATION_WAIT`, `AUTH_WAIT` constants from manifest profile

**Outcome:** Auth transition timeouts (8 traduora tests) fully eliminated by AUTH_WAIT=60s. However, those tests fail at subsequent structural steps (B5.6 inline components), producing zero net C3 improvement. Petclinic postcondition timeouts (9 tests) proved to be **not timing issues** — the backend does not produce the expected redirect regardless of wait duration. These are reclassified as B5.4 (oracle/postcondition).

**Deferred within B5.1:**
1. Wait-for-network-idle via Chrome DevTools Protocol (CDP)
2. Per-step retry with exponential backoff

**Dependencies:** B5.0 (for timing evidence from step logs).

### B5.2 — Component-Ready and Data-Ready Waits (Partially Implemented)

**Problem:** Angular components that fetch data from APIs render their interactive elements (buttons, links inside `*ngFor` loops) only after the HTTP response arrives and change detection completes. B3's implicit wait finds the element only if it renders within the timeout window. Permission-gated widgets (behind `| async` and `| can:` pipes) have similar materialization delays.

**Evidence:** spring-petclinic-angular (7 tests) exhibit element-timeout failures for buttons inside `*ngFor` list items. ever-traduora (57 tests) fail because widgets behind async/permission composition gates do not materialize within the 10s implicit wait. CDP evidence confirms all backend responses are 200/204/304 — no rejection.

**Implemented strategies:**
1. **Async/permission gate waits:** B2 emits an explicit `wait-for-element` step before the first interaction step when the trigger widget has `compositionGates` containing `async` or `can:` expressions. Wait timeout = IMPLICIT_WAIT (10s default). The wait targets the trigger widget's own locator via zero-implicit-wait polling.
2. **Repeater data-readiness waits:** B2 emits an explicit `wait-for-element` step before the first interaction step when the trigger widget has `insideNgFor` set. The wait targets the trigger widget's locator. Wait timeout = IMPLICIT_WAIT (10s default). This is additive: the subsequent `findElement` in the action step adds another IMPLICIT_WAIT of implicit waiting.

**Structural derivation:** Both wait families use metadata already extracted by A1 and propagated through B1 intents: `compositionGates` (from transitive CCC insideNgIf propagation) and `insideNgFor` (from WidgetProcessor repeater tracking). No new A1 extraction is required.

**Expected impact:** ~20-40 recoveries across traduora (async/permission) and petclinic (repeater lists).

**Dependencies:** B5.0 (step timing evidence). A1 structural metadata (compositionGates, insideNgFor).

### B5.3 — Repeater-Aware Locator Semantics (Deferred)

**Problem:** A1 assigns `stableIndex` to template-level widgets. In `*ngFor` repeaters, a single template widget produces N runtime instances. The `tag:nth-of-type(N)` locator using stableIndex targets the N-th element in the DOM, which may not correspond to the intended template-level widget when multiple `*ngFor` items are rendered.

**Evidence:** spring-petclinic-angular list components (PettypeList, SpecialtyList, VetList) have template buttons at stableIndex 2–3 (Home, Add) that map to DOM positions 13–14 when 6 list items are rendered, each with 2 buttons.

**Strategies:**
1. Distinguish template-level from instance-level widgets in A1
2. Emit list-item-scoped locators (e.g., `tr:nth-of-type(1) button:nth-of-type(1)`)
3. Use text-content or data-attribute matching for disambiguation

**Expected impact:** ~14 locator failures in petclinic list components.

**Dependencies:** May require A1 extraction changes. Spec amendment needed.

### B5.4 — Stronger Oracle Design / C4 (Deferred)

**Problem:** B4's C3 metric measures execution success (test runs without crash/timeout). C4 (oracle strength) is deferred — current postconditions are limited to URL-match and no-crash assertions.

**Strategies:**
1. DOM content assertions (verify expected text/elements appear)
2. State-change verification (entity created/updated/deleted)
3. API response validation
4. Visual regression comparison

**Expected impact:** Enables C4 coverage measurement. ~3 oracle failures (heroes external URL redirect).

**Dependencies:** B5.0 (evidence model). Spec amendment needed for C4 definition.

### B5.5 — Data-Aware Test Preconditions (Deferred)

**Problem:** Some workflows depend on application data state that may not exist in the seed database. Tests targeting list-item actions fail when the list is empty.

**Evidence:** spring-petclinic-angular VisitList (2 tests) — visit table is empty for the seeded pet, so action buttons don't exist.

**Strategies:**
1. API-driven data seeding as a test precondition
2. Data-dependency analysis from A1 service call chains
3. Per-workflow data fixture generation

**Expected impact:** ~4 seed/data failures across subjects.

**Dependencies:** May require B1 plan structure changes. Spec amendment needed.

### B5.6 — Inline Composed-Component Materialization (Deferred)

**Problem:** Some Angular components are conditionally rendered inline by a parent (e.g., add forms toggled by a button click). Without a defensible opener derivation, the test navigates to the parent route but the child component is not yet rendered.

**Evidence:** spring-petclinic-angular SpecialtyAdd (2 tests) — the add form component has no route and is toggled by a local handler that A1 cannot trace via CCS chains. ever-traduora (15 tests) — inline components composed via CCC with zero-widget parents or multiple CCC parents.

**Strategies:**
1. Template-level `*ngIf` visibility analysis for composed components
2. Handler-name heuristics for toggle detection
3. Wait-for-component-selector with increased timeout

**Expected impact:** ~17 inline-component locator failures across petclinic + traduora.

**Dependencies:** A1 compositionContext (already extracted). May require B1 plan changes.
