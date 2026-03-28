# Roadmap
Execution plan for implementing the paper in gated phases.
Normative semantics, schemas, and invariants live only in `docs/paper/approach.md`.
This file defines work sequencing, deliverables, and acceptance gates (including visualization).

Global engineering rules (apply to all stages):
- Prefer refactoring existing code paths over introducing parallel abstractions.
- Any new module/type must justify existence by eliminating complexity elsewhere.
- Delete superseded code, dead scripts, unused types, and obsolete docs.
- No “compat layers” that preserve legacy semantics unless explicitly required for a migration window (documented and time-bounded).

---

## Stage 0 — Paper + spec binding (DONE)
Artifacts:
- `docs/paper/main.pdf`
- `docs/paper/approach.md` (authoritative Phase A contract)

Exit criteria:
- Paper and approach are mutually consistent.
- Implementation work treats `docs/paper/approach.md` as the sole normative source.

---

## Stage 1 — A1 finalize: implementation + tests + visualization (DONE)
Goal:
Finalize Phase A1 so it is:
- spec-aligned,
- deterministic,
- test-covered,
- debuggable via visualization outputs.

Deliverables:
- A1 artifact(s) emitted by CLI (bundle + debug outputs as implemented)
- Determinism harness and regression fixtures
- Visualization CLI that consumes A1 outputs and produces:
  - A1 graph view
  - A2 task workflow explorer (renders real A2 output once Stage 3 is complete).

Blocking acceptance gates:
- `npm run typecheck`
- `npm run typecheck:tests`
- `npm test`
- `npm run lint`
- `npm run verify:determinism`

Blocking validation protocol (non-negotiable):
- Run **all declared subjects** in `docs/validation/subjects.md`.
- For each subject:
  - run the analyzer twice with identical inputs and config
  - confirm **byte-identical** outputs for the required artifacts (as defined by determinism policy)
- Any change that modifies counts/shape for a subject must:
  - update `docs/validation/subjects.md` with the new expected deltas
  - include a short, concrete explanation of the semantic reason (spec alignment or bug fix)

Work items (A1):
1. **Spec alignment audit**
   - Identify all divergences between current A1 model and `docs/paper/approach.md`.
   - Implement the minimum changes required to converge (do not weaken the spec).
2. **Correctness hardening**
   - Cross-file route ownership and route record dedup stability.
   - Template binding extraction correctness (events vs attrs/bound attrs).
   - Handler analysis: navigation/service call detection stability.
   - Ensure unresolved targets are emitted (never dropped) if required by the spec.
3. **Determinism hardening**
   - Centralize sorting/canonical serialization.
   - Eliminate nondeterministic iteration sources (maps/sets, file traversal order).
   - Add regression tests for known determinism failure modes.
4. **Testing expansion**
   - Add fixtures that cover:
     - inline route children arrays
     - redirects
     - mixed template binding forms (attr / boundAttr / event)
     - service call + navigation micro-sequences
     - unresolved navigation targets
   - Ensure fixtures test *invariants*, not incidental formatting.
5. **Visualization (A1)**
   - Keep `npm run viz` as a supported tool for debugging A1 extraction outputs.
   - Viz must be a pure consumer of A1 outputs (no alternate semantics).
   - Viz determinism:
     - same input bundle → identical `data.js` bytes
     - HTML pages may vary only if they contain nondeterministic formatting; otherwise they must be stable too
     - exceptions must be documented explicitly in README (preferred: no exceptions)
   - Ensure A2 visualization pages render from real A2 output (not mock data).

Exit criteria:
- All acceptance gates pass.
- A1 outputs are deterministic across repeated runs.
- **All validation subjects** produce stable outputs and do not regress without explanation.
- Visualization pages render correctly for fixtures and **all validation subjects**.

---

## Stage 2 — Repo/CI/release stabilization (DONE)
State:
- Repository exists, CI is active, and `v0.1-a1` tag exists.

Ongoing constraint:
- No changes that expand Phase A scope beyond `docs/paper/approach.md`.

---

## Stage 3 — A2 implement: TaskWorkflow enumeration + classification (DONE)
Branch:
- `feat/a2-bounded-workflows`

Goal:
Implement Phase A2 TaskWorkflow mode exactly as `docs/paper/approach.md` defines, consuming only the serialized A1 bundle artifact; A2 must not access AST, source files, or extraction logic.

Isolation constraint (hard requirement):
A2 must consume exactly and only the serialized A1Multigraph JSON artifact.
The A1Multigraph.multigraph is the single source of truth.

Deliverables:
- `a2-workflows.json` (stable contract; classified TaskWorkflows + partitions/stats)
- Determinism verification for A2 outputs
- Tests covering enabledness, redirect-closure behavior, classification rules, handler-scoped effects
- Visualization for A1 graph and A2 task workflows

Exit criteria:
- All 5 acceptance gates pass.
- A2 outputs are deterministic across repeated runs.
- **All 6 validation subjects** produce stable A2 outputs.
- Visualization renders real A2 task workflows from A2 outputs for all subjects.

---

## Stage 3b — A1 gap fixes (DONE)
Branch:
- `feat/a2-bounded-workflows`

Goal:
Close remaining A1 extraction gaps identified in the TaskWorkflow canonical report, improving ground-truth alignment. A1 spec sections in approach.md are amended as needed. The A2 TaskWorkflow contract remains frozen.

Work items:
1. GAP B: Add `valuechange` to FRAMEWORK_INTERNAL_EVENTS (S-MAT-SEL)
2. GAP C: Filter diagnostic-only handlers (S-LOG, console.* only)
3. GAP A: Relative routerLink resolution (S6, ever-traduora)
4. GAP D: Modal/dialog detection (S2, MatDialog/NgbModal.open)

Exit criteria:
- All 5 acceptance gates pass after each gap fix.
- GT alignment improves for affected subjects.
- No regressions on other subjects.

---

## Stage 4 — Phase B implementation (DONE)
Constraint:
- Phase B may only consume frozen Phase A artifacts (`a1-multigraph.json`, `a2-workflows.json`).

Entry criteria (MET):
- A1/A2 complete, deterministic, and validated across **all declared subjects**.
- No open “temporary” code paths or compatibility scaffolds remain from Phase A implementation.
- Naming migration complete: `A1Multigraph`, `A2WorkflowSet`, `a1-multigraph.json`, `a2-workflows.json`.
- Phase B normative spec frozen in `docs/paper/approach.md`.

### Stage 4a — B0 SubjectManifest validation (DONE)
- Schema: `src/phase-b/b0/manifest-schema.ts`
- Validator: `src/phase-b/b0/manifest-validator.ts`
- CLI: `npm run b0:validate` — 6/6 subjects VALID
- Determinism: `npm run verify:b0-determinism` — byte-identical

### Stage 4b — B1.1 RealizationIntent derivation (DONE)
- Deriver: `src/phase-b/b1/intent-deriver.ts`
- Types: `src/phase-b/b1/intent-types.ts`
- CLI: `npm run b1:intents` — 257 intents derived
- GT validation: 257/257 matched, 0 mismatches
- Determinism: `npm run verify:b1-determinism` — byte-identical

### Stage 4c — B1.2 ActionPlan generation (DONE)
- Deriver: `src/phase-b/b1/plan-deriver.ts`
- Types: `src/phase-b/b1/plan-types.ts`
- CLI: `npm run b1:plans` — 257 plans generated
- GT validation: 257/257 matched, 0 mismatches
- Determinism: `npm run verify:b1-plan-determinism` — byte-identical
- Tests: 41 unit tests in `src/phase-b/b1/__tests__/plan-deriver.test.ts`
- Spec amendments: Start Route Selection, Route Param Scope, Form Field Scope, Auth Materialization, Dialog Precondition (all in `approach.md`)

### Stage 4d — B2 Code Generation (DONE)
- Emitter: `src/phase-b/b2/test-emitter.ts`
- Types: `src/phase-b/b2/codegen-types.ts`
- Runner: `src/phase-b/b2/b2-runner.ts`
- CLI: `npm run b2:codegen` — 257 tests generated across 6 subjects
- Generation coverage: 257/257 = 100% (all plans → test files)
- Determinism: `npm run verify:b2-determinism` — byte-identical
- Tests: 40 unit tests (49 after correction pass) in `src/phase-b/b2/__tests__/test-emitter.test.ts`
- Output: `output/<subject>/tests/<hash>_<class>_<kind>.test.ts` + `output/<subject>/json/b2-tests.json`
- **B5.0 Observability:** Each generated test emits a structured execution log (`output/<subject>/logs/<testFile>.log.json`) with per-step timing, locator metadata, elementFound, domEvidence (outerHTML snippet), failureKind classification, route context, and failure screenshots. See Stage 6.

### Stage 4d (addendum) — Executability Contract Correction (DONE)
Pre-B3 execution-readiness audit and correction pass. All executability contract gaps closed:
- **E-02:** C3 denominator tightened — FAIL_APP_NOT_READY never reclassified as skip; B3 must not autonomously add to skipWorkflows.
- **E-03:** Auth wait fixed — waits for redirect away from loginRoute (`!url.includes(loginRoute)`) instead of trivially-true `urlContains('/')`.
- **E-04:** Form submit fixed — generates `.submit()` instead of `.click()` for submit ActionSteps.
- **E-05:** mat-select fixed — B1 generates `select-option` step; B2 generates CDK overlay interaction (click mat-select → wait for mat-option → click first mat-option).
- **E-09:** B0 subjectName cross-check — manifest.subjectName validated against directory name.
- **B0 wizard:** `npm run b0:wizard` scaffolds SubjectManifest skeleton from A2 artifacts.
- **B4 schema frozen:** `B4CoverageReport` / `B4WorkflowEntry` / `B4Summary` added to approach.md.
- **approach.md restructured:** Subject Manifest (B0) section moved before B1; B4 schema and B2 Material widget note added.
- Closure report: `docs/analysis/phase-b/executability-readiness-report.md`

### Stage 4e — B3 Test Execution (DONE)
- B3 runner: readiness check → subprocess execution → bounded retry (max 3) → failure classification.
- Subprocess: `node tsx/dist/cli.mjs <testFile>` with cleaned PATH (npm `node_modules` stripped).
- Failure classifier: 7 ordered rules per spec §B3.
- Screenshot capture: B2 emits `driver.takeScreenshot()` checkpoints; screenshots at `output/<subject>/screenshots/`.
- File provisioning: `/tmp/test-file.txt` created at B3 runtime for file-input workflows.
- Report generation: markdown + PDF (pandoc → Chrome headless print).
- CLI: `npm run b3 -- <subjectName>`.

### Stage 4f — B4 Coverage Reporting (DONE)
- B4 aggregates B3 results with A2/B1/B2 artifacts into tiered coverage (C1/C2/C3/C4).
- Denominator rules: PRUNED, FAIL_APP_NOT_READY, skipWorkflows excluded from C3.
- Output: `output/<subject>/json/b4-coverage.json`.

### Stage 4g — B1/B2 Hardening (DONE)
- Auth-aware start route selection (S1)
- Extended failure classifier (S2)
- CSS class locator fallback (S3)
- Login credential materialization (S4)
- Login WSF oracle (S5)
- Dynamic-ID postcondition for WSF create workflows
- Chrome viewport `--window-size=1920,1080`; JS click for all click steps
- routerLink locator fix (non-anchor elements); tag-position stableIndex

### Stage 4h — Documentation Consolidation (DONE)
- Analysis docs collapsed: 15 files → 5 files (foundations/decisions/runtime) + 6 GT JSONs.
- Validation docs: subject runbooks, runtime conventions, README added.
- Documentation alignment audit completed; spec amendments S1–S5 applied to approach.md.

### Stage 5 — Multi-Subject B3/B4 Rollout (IN PROGRESS)
Sequential single-subject rollout with per-subject runbooks, hardening, and residual adjudication.

| Subject | C3 | Pass/Total | Status |
|---|---|---|---|
| posts-users-ui-ng | 94.4% | 17/18 | CLOSED — 1 residual (CONDITIONAL *ngIf precondition) |
| airbus-inventory | 90.5% | 19/21 | CLOSED — 2 residuals (dialog componentSelector gap) |
| heroes-angular | 89.5% | 17/19 | CLOSED — 2 residuals (AboutComponent external URL assertion) |
| spring-petclinic-angular | 73.0% | 54/74 | CLOSED — 20 residuals (all B5: timing, *ngFor, data-dependent) |
| ever-traduora | 44.0% | 48/109 | CLOSED — 61 residuals (30 limitation, 27 B5, 2 unresolved, 1 env, 1 seed) |
| softscanner-cqa-frontend | — | — | NEXT |

B5 deferred work formalized in `docs/paper/approach.md` §B5.

### Stage 6 — B5 Execution Enhancements (B5.0 DONE, B5.1–B5.6 NOT STARTED)

**B5.0 — Observability Contract (DONE)**
- Per-test structured JSON logs (`output/<subject>/logs/*.log.json`)
- Unified screenshot contract via `captureScreenshot()`
- Framework/system pipeline logs (`logs/<phase>-pipeline.jsonl`) — structured JSONL with PipelineLogEvent schema
- Visualization: `npm run viz` generates `vis/b3-execution.html` consuming B1/B2/B3/B4/B5.0/manifest
- Two distinct logging contracts: framework logs (pipeline behavior) vs per-test logs (execution evidence)
- See `docs/paper/approach.md` §B5 for vocabulary, evidence classes, oracle tiers, and instrumentation layers

**B5.1 — Network-Aware Wait Strategies (NOT STARTED)** — CDP network-idle, configurable timeouts, per-step retry. ~12 timing failures.
**B5.2 — Component-Ready / Data-Ready Waits (NOT STARTED)** — targeted waits, Angular stability, auth timing. ~14 timing failures.
**B5.3 — Repeater-Aware Locator Semantics (NOT STARTED)** — *ngFor instance disambiguation. ~14 locator failures.
**B5.4 — Stronger Oracle / C4 (NOT STARTED)** — DOM/state assertions, C4 coverage. ~3 oracle failures.
**B5.5 — Data-Aware Preconditions (NOT STARTED)** — API seeding, data-dependency analysis. ~4 seed/data failures.
**B5.6 — Inline Component Materialization (NOT STARTED)** — *ngIf visibility, toggle detection. ~17 inline-component failures.