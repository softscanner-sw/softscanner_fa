# CLAUDE.md
Repository goal: implement Phase A exactly as defined in
`docs/paper/approach.md`, following sequencing and gates defined in `docs/ROADMAP.md`.

Claude is an implementation agent.
Claude does not define semantics.
Claude does not reinterpret the spec.

---

# 1. Authority Hierarchy (Non-Negotiable)
1. `docs/paper/approach.md` — **Normative semantics and schemas (frozen)**
2. `docs/ROADMAP.md` — Work sequencing, deliverables, acceptance gates
3. `CLAUDE.md` — Implementation discipline and architectural rules

If implementation conflicts with `approach.md`:

→ Fix implementation.
→ Never weaken or reinterpret the spec.

If ambiguity or insufficiency is discovered in `approach.md`:

→ **STOP implementation immediately.**
→ Notify maintainers clearly and precisely which rule is ambiguous or insufficient.
→ Do not improvise semantics.
→ Do not create speculative scaffolding.
→ Wait for spec clarification before continuing.

No unilateral semantic decisions.

---

# 2. Phase Isolation Rules (Strict)
## A1 — Extraction Phase
Allowed to access:

* Angular AST
* `ts-morph`
* `@angular/compiler`
* Source files
* Template parsing
* Business logic analyzers

Must emit exactly:

* `Phase1Bundle` as defined in `approach.md`
* Deterministic multigraph only

Must enforce:

* Identity invariants
* Graph integrity invariants
* Ordering invariants

A1 is the only phase allowed to touch the AST or filesystem.

---

## A2 — Enumeration Phase
Must consume:

* Serialized A1 bundle only

Must NOT access:

* AST
* Source files
* Parsers
* Analyzers
* Builders
* Angular compiler

Must treat A1 multigraph as immutable input.
Must not modify A1 schema.

---

## A3 — Classification Phase
Must consume:

* Serialized A2 artifact only

Must NOT:

* Recompute enabledness
* Re-run redirect logic
* Recompute route activation
* Access AST
* Access A1 internals
* Infer new constraints beyond frozen rules

A3 operates strictly on A2 output.
Violation of phase isolation = architectural failure.

---

# 3. Determinism Protocol (Hard Gate)
Every change must pass:

```bash
npm run typecheck # uses tsconfig.src.json
npm run typecheck:tests # uses tsconfig.test.json
npm test
npm run lint
npm run verify:determinism
```

Determinism means:

* A1 bundle byte-identical across runs
* A2 bundle byte-identical across runs
* A3 bundle byte-identical across runs
* Stable ID generation
* Stable node ordering
* Stable edge ordering
* No nondeterministic Map/Set iteration
* Stable file traversal order

If determinism fails:

* Stop feature work.
* Fix determinism first.
* No exceptions.

---

# 4. Validation Subjects (Mandatory, All of Them)
All declared subjects in `docs/validation/subjects.md` must be run for every Phase A stage.
No stage is complete unless:

* All subjects run successfully
* Outputs are byte-identical across repeated runs
* Any delta is documented with concrete semantic reason

Partial validation is forbidden.
Fixtures are not sufficient.
Real subjects are mandatory.

---

# 5. Architecture Discipline (Refactor-In-Place Model)
The current architecture must evolve, not fork.
Current structure (simplified):

```
src/
├── analyzers/
├── builders/
├── parsers/
├── models/
├── orchestrator/
├── services/
├── visualization/
├── cli.ts
├── viz-cli.ts
```

### Architectural Principles
1. **Refactor existing layers — do not duplicate them.**
2. No parallel graph representations.
3. No second “navigation model”.
4. No shadow workflow representations.
5. Delete obsolete code immediately when superseded.
6. No compatibility scaffolds.
7. No speculative abstractions.

---

## 5.1 Phase A Mapping Onto Existing Structure
### A1 responsibilities must live in:

* `src/parsers/`
* `src/analyzers/`
* `src/builders/`
* `src/orchestrator/phase1-orchestrator.ts`

The existing `navigation-graph-builder.ts` must either:

* Be refactored to emit the frozen multigraph schema, OR
* Be removed and replaced cleanly.

It must not coexist with a second graph builder.

---

### A2 must be implemented as:
* A new isolated module under `src/` (e.g., `src/a2/` or `src/workflows/`)
* Must depend only on serialized A1 bundle types
* Must not import analyzers/parsers/builders

---

### A3 must be implemented as:
* A separate isolated module under `src/`
* Must depend only on A2 output types
* Must not import A1 internals
* Must not access redirect/enabledness logic

---

## 5.2 Models Directory Rules
`src/models/` must:

* Mirror exactly the schemas in `approach.md`
* Contain no legacy navigation-graph types once migration is complete
* Contain no duplicate representations of:
  * Routes
  * Widgets
  * Edges
  * Workflows

When schema changes in spec:

* Update models
* Update all usages
* Remove outdated types

Never accumulate type fossils.

---

## 5.3 Visualization Rules
`src/visualization/` must:

* Be a pure consumer of artifacts
* Never recompute semantics
* Never reconstruct redirect logic
* Never infer constraints

Visualization must reflect artifacts exactly.
If semantics appear wrong → fix Phase A, not viz.

---

# 6. Code Deletion Policy (Mandatory)
Whenever:

* A builder becomes obsolete
* A model becomes obsolete
* A script becomes obsolete
* A test references removed semantics

It must be deleted in the same PR that replaces it.
No dead code.
No transitional layers.
No commented legacy blocks.
The repository must converge toward simplicity, not grow sideways.

---

# 7. A1 Enforcement Requirements
A1 must fail-fast if:

* Any node lacks `refs`
* Any edge lacks `refs`
* Any `Edge.from` does not exist
* Any `Edge.to !== null` does not exist
* Any unresolved navigation lacks:
  * `targetRouteId === null`
  * `to === null`
  * `targetText` non-empty
* Node ordering not stable
* Edge ordering not stable

Identity must follow `approach.md` exactly.
No selector-based component IDs.
No ad-hoc route IDs.

---

# 8. A2 Enforcement Requirements
A2 must:

* Traverse executable edges only
* Enforce route-context discipline
* Enforce effect-burst gating
* Enforce routeVisitCap
* Apply deterministic redirect closure
* Record:
  * unresolvedTargets
  * redirectLoop
  * redirectClosureStabilized
* Count only progress edges toward `k`

A2 must not:

* Create synthetic nodes
* Create synthetic edges
* Modify A1 graph
* Recompute structure

Workflows are lists of A1 `Edge.id` only.

---

# 9. A3 Enforcement Requirements
A3 must:

* Merge constraints mechanically
* Apply verdict rules in strict order
* Only prune on explicit contradiction rules
* Never SAT-solve beyond frozen rule set
* Never infer params from route templates
* Never reinterpret guards

Redirect failure rule must follow spec exactly.

---

# 10. Work Protocol for Claude
For any non-trivial change, Claude must output:

### 1. PLAN
* Files to modify
* Why required under spec
* Why no duplication introduced
* Which obsolete code will be deleted

### 2. IMPLEMENT
* Minimal diff
* Refactor-in-place preferred
* No speculative refactors

### 3. VERIFY
* Run all 5 gates
* Run all validation subjects
* Confirm determinism

### 4. SUMMARY
* Files changed
* Files deleted
* Schema changed (yes/no)
* Determinism preserved (yes/no)
* All subjects validated (yes/no)

No hidden architectural drift.

---

# 11. Git Discipline
* `main` = stable Phase A
* Feature branches:
  * `feat/a1-*`
  * `feat/a2-*`
  * `feat/a3-*`
* No direct pushes to `main`
* CI must pass
* No merging with failing determinism
* No merging without multi-subject validation

---

# 12. What Claude Must Never Do
* Weaken `approach.md`
* Continue implementation when spec ambiguity exists
* Introduce parallel graph representations
* Preserve legacy navigation models after migration
* Skip validation subjects
* Ignore determinism failure
* Add architecture that duplicates analyzers/builders logic
* Add compatibility layers to avoid deletion

---

# 13. Separation of Responsibilities

| File          | Responsibility                                      |
| ------------- | --------------------------------------------------- |
| `approach.md` | Defines semantics and schemas                       |
| `ROADMAP.md`  | Defines sequencing and gates                        |
| `CLAUDE.md`   | Defines architectural and implementation discipline |

If these blur, Phase A becomes unstable.