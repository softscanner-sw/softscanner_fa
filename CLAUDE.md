# CLAUDE.md
Repository goal: implement the paper’s Approach pipeline, one gate at a time.

**Stage 2 is DONE. Next task: create A2 scaffold branch (`feat/a2-bounded-paths`).**

A1 is published and tagged (`v0.1-a1`). CI is green. Branch protection is active.
A2 implementation is still blocked; only scaffold (branch + placeholder docs) is allowed now.

---

## Paper Binding

The authoritative specification is under `docs/`:

* `docs/paper/main.pdf` (paper)
* `docs/paper/approach.md` (normative operational spec)

Claude must consult these files when implementing or modifying Phase A1 behavior.

If implementation diverges from them, fix implementation (do not weaken the spec).

---

## Commands (acceptance gates)

```bash
npm install
npm run typecheck
npm test
npm run lint
npm run build
npm run phase1                # tsx src/cli.ts <projectRoot> <tsConfigPath> [outputDir] [--debug]
npm run verify:determinism    # output must be byte-identical across runs
```

Mandatory acceptance protocol (every change):

1. `npm run typecheck`
2. `npm test`
3. `npm run lint`
4. `npm run verify:determinism`

If determinism fails: stop feature work; fix determinism first.

---

## Current Allowed Work

Allowed:

* Create branch `feat/a2-bounded-paths` and add A2 placeholder docs/stubs
* A1 bugfixes strictly required to maintain determinism/correctness

Blocked:

* Any A2 extraction code
* Any A3 implementation
* Any Phase B implementation
* Any change that expands A1 extraction scope beyond the current spec

---

## Phase A1 status

Phase A1 implementation is considered complete locally when:

* Acceptance gates pass (typecheck, test, lint, determinism)
* CLI emits deterministic outputs (8 JSON artifacts) with explicit or default outputDir
* `docs/validation/subjects.md` manual checks match expected invariants

**A2 implementation still blocked; A2 scaffold (branch + placeholder docs) allowed.**

---

## Architecture (authoritative)

```
src/
├── models/       # Pure types — stable public contract for A1 outputs
├── parsers/      # Thin AST adapters (ts-morph + @angular/compiler)
├── analyzers/    # Domain logic consuming parsers, emitting model objects
├── builders/     # Aggregate analyzer outputs into registries
├── orchestrator/ # End-to-end pipeline (Phase1Orchestrator)
├── services/     # Cross-cutting utilities (I/O, validation, export)
└── cli.ts        # CLI entry
```

Phase A1 pipeline order (fixed):

1. TsProjectBuilder
2. ComponentRegistryBuilder
3. ModuleRegistryBuilder
4. RouteMapBuilder (+ GuardConstraintSummarizer)
5. WidgetEventMapBuilder (+ LogicAnalyzer)
6. NavigationGraphBuilder
7. Assemble Phase1AnalysisBundle + stats
8. AnalysisValidator.validatePhase1(bundle)
9. Export (AnalysisExporter)

---

## A1 Completion Gate (frozen)

A1 is complete only if:

* Graph nodes include: Virtual `"__entry__"`, all Route nodes, all Component nodes, all External nodes.
* For every ComponentRoute: Route → Component transition exists (kind=UI_EFFECT).
* `navigation.nodes` contains GraphNodeType=Component for every ComponentInfo.
* Navigation edges:

  * Template routerLink/href → Component → Route/External transitions
  * Handler navigate/navigateByUrl → Component → Route transitions (when resolvable)
* uiPreconditions copied from widget predicates on UI-triggered transitions.
* All transitions have Origin (Virtual nodes exempt).
* AnalysisValidator passes.
* Determinism passes (byte-identical).
* Tests cover representative Angular patterns.

A1 is tagged and published (`v0.1-a1`). A2 scaffold branch may be created; A2 code is still blocked.

---

## IDs and determinism (frozen; enforced)

ID formats (frozen by model):

* Route: `"<normalizedFullPath>@<moduleId>"`
* ComponentInfo: `"<file>#<ClassName>"`
* WidgetInfo: `"<componentId>|<file>:<line>:<col>|<kind>|<stableIndex>"`

GraphNode IDs:

* Route node id = Route.id
* Component node id = ComponentInfo.id
* External node id = stable hash(url)
* Virtual entry node id = `"__entry__"`

GraphEdge id:

* MUST follow `docs/paper/approach.md` §3.4.1:
  `edge.id = "${from}::${transition.signature}::${to}::${stableIndex}"`

transition.signature:

* MUST follow `docs/paper/approach.md` §3.4.2 (do not redefine elsewhere)

GraphEdge.transitions sorting:

* MUST follow `docs/paper/approach.md` §3.4.3
* sort key: `kind + (trigger.eventType||"") + origin.file + origin.startLine + origin.startCol + (trigger.widgetId||"") + (handler.name||"")`

---

## Validation invariants (minimum)

A valid Phase1AnalysisBundle must satisfy:

1. Every ComponentRoute.componentId references an existing ComponentInfo.id
2. Every WidgetEvent.widgetId exists in the owning component.widgets list
3. Every GraphEdge.from/to exists in navigation.nodes
4. UI-triggered transitions must have trigger.widgetId + template origin

---

## Work protocol (how Claude operates)

For any non-trivial change, Claude must output:

1. PLAN: files to change + acceptance commands
2. IMPLEMENT: minimal diff
3. VERIFY: run the 4 acceptance commands + report pass/fail
4. SUMMARY: files changed + invariants preserved + schema changed (yes/no)

No refactors during feature work unless needed to make acceptance gates green.

---

## Git discipline (post-Stage 2)

* `main` is the A1 stabilization branch. CI required; direct push blocked.
* Tag `v0.1-a1` exists. A2 scaffold may be started on `feat/a2-bounded-paths`.
* A2 code merges to `main` only after A2 is formally complete and gated.

---

## Commit style

Conventional Commits: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`
Scopes: `models`, `parsers`, `analyzers`, `builders`, `orchestrator`, `services`, `cli`, `docs`
Branches: `feat/*`, `fix/*`, `refactor/*`, `docs/*`, `chore/*`