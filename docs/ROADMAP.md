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

## Stage 1 — A1 finalize: implementation + tests + visualization (ACTIVE)
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
  - (optional) A2/A3 “mock” pages clearly labeled as non-deliverables (until real A2/A3 exist)

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
   - Ensure A2/A3 pages are labeled “mock / visualization only” until real A2/A3 exist.

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

## Stage 3 — A2 implement: enumeration + tests + visualization (BLOCKED until Stage 1 DONE)
Branch:
- `feat/a2-bounded-workflows`

Goal:
Implement Phase A2 exactly as `docs/paper/approach.md` defines, consuming only the serialized A1 bundle artifact; A2 must not access AST, source files, or extraction logic.
No semantic modification to A1 is permitted in this stage. If A2/A3 implementation reveals ambiguity or insufficiency in A1, work must stop and `docs/paper/approach.md` must be reviewed and updated first before pursuing implementation.

Deliverables:
- A2 output artifact(s) as specified
- Determinism verification for A2 outputs
- Tests covering enabledness, bounds, redirect-closure behavior
- Visualization updates to render real A2 workflows (replace “mock” where applicable)

Blocking acceptance gates:
- `npm run typecheck`
- `npm run typecheck:tests`
- `npm test`
- `npm run lint`
- `npm run verify:determinism`

Blocking validation protocol (non-negotiable):
- Run **all declared subjects** in `docs/validation/subjects.md` end-to-end:
  - A1 → A2
- For each subject:
  - run A2 twice with identical frozen A1 input
  - confirm **byte-identical** A2 outputs
- Any output deltas must be reflected in `docs/validation/subjects.md` with reasons.

Work items:
1. Implement A2 enumerator (DFS with bounds and deterministic expansion).
2. Implement redirect closure semantics and loop/cap recording.
3. Add fixture tests for:
   - pendingEffect gating and effect-burst semantics
   - route revisit cap behavior
   - unresolved-target terminal behavior
4. Visualization:
   - Replace exemplar-path “mock” workflows with real A2 workflow rendering.
   - Keep deterministic ordering and stable IDs in the view layer.

Exit criteria:
- Gates pass and outputs are deterministic.
- Fixture-based tests cover each A2 rule family.
- **All validation subjects** produce stable A2 outputs across repeated runs.
- Visualization renders real A2 workflows from A2 outputs for **all validation subjects**.

---

## Stage 4 — A3 implement: aggregation + classification + tests + visualization (BLOCKED until Stage 3 DONE)
Branch:
- `feat/a3-classify-workflows`

Goal:
Implement Phase A3 exactly as `docs/paper/approach.md` defines.
No semantic modification to A1 or A2 is permitted in this stage. 
A3 must operate strictly on the serialized A2 artifact; no recomputation of enabledness or redirect semantics is permitted.
If classification logic reveals ambiguity or insufficiency in prior phases, work must stop and `docs/paper/approach.md` must be reviewed and updated first before pursuing implementation.

Deliverables:
- A3 output artifact(s) as specified
- Determinism verification for A3 outputs
- Tests for verdict ordering and each rule path
- Visualization updates to render real A3 classifications (replace “mock” pruning)

Blocking acceptance gates:
- `npm run typecheck`
- `npm run typecheck:tests`
- `npm test`
- `npm run lint`
- `npm run verify:determinism`

Blocking validation protocol (non-negotiable):
- Run **all declared subjects** in `docs/validation/subjects.md` end-to-end:
  - A1 → A2 → A3
- For each subject:
  - run A3 twice with identical frozen A1+A2 inputs
  - confirm **byte-identical** A3 outputs
- Any output deltas must be reflected in `docs/validation/subjects.md` with reasons.

Work items:
1. Implement constraint merge operator (union/concat + evidence dedup).
2. Implement verdict classifier with strict rule order.
3. Add fixture tests for:
   - unresolved target → CONDITIONAL
   - requiredParams/guards/roles → CONDITIONAL
   - exclusivity atoms → PRUNED
   - redirectClosureStabilized false with zero progress → PRUNED; otherwise CONDITIONAL
4. Visualization:
   - Replace demo pruning policy with real A3 verdict rendering + explanations.
   - Ensure the UI is a pure view over A3 outputs (no re-derivation of semantics).

Exit criteria:
- Gates pass and outputs are deterministic.
- Tests cover all A3 verdict paths.
- **All validation subjects** produce stable A3 outputs across repeated runs.
- Visualization renders real A3 verdicts and explanations for **all validation subjects**.

---

## Stage 5 — Phase B planning (BLOCKED until Stage 4 DONE)
Constraint:
- Phase B may only consume frozen Phase A artifacts.

Entry criteria:
- A1/A2/A3 complete, deterministic, and validated across **all declared subjects**.
- No open “temporary” code paths or compatibility scaffolds remain from Phase A implementation.