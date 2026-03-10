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
A2 must consume exactly and only the serialized Phase1Bundle JSON artifact.
The Phase1Bundle.multigraph is the single source of truth.

Deliverables:
- `phaseA2-taskworkflows.final.json` (stable contract; classified TaskWorkflows + partitions/stats)
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

## Stage 4 — Phase B planning (BLOCKED until Stage 3 DONE)
Constraint:
- Phase B may only consume frozen Phase A artifacts.

Entry criteria:
- A1/A2 complete, deterministic, and validated across **all declared subjects**.
- No open “temporary” code paths or compatibility scaffolds remain from Phase A implementation.