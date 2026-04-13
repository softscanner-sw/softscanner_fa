# SEAA 2026 Manuscript Basis (Frozen)

**Created:** 2026-04-06
**Authority:** This file is the frozen manuscript basis for the SEAA 2026 full paper.
It consolidates claims, numbers, and decisions from the authoritative repo documents.
Any conflict between this file and the tex source must be resolved in favor of this file.

---

## A. Frozen Paper Claim (1-2 sentences)

We present a source-driven, multi-phase pipeline that statically extracts a deterministic,
constraint-aware workflow space from Angular frontend source code and realizes every workflow
in that space into an executable Selenium test, achieving 100% generation coverage across six
subjects and 64.7% execution coverage on five integrity-verified subjects, with a principled
failure taxonomy that delimits the current boundary of fully automated E2E test generation.

---

## B. Frozen Research Objective

Maximize the coverage of automatically generated, executable E2E functional tests for Angular
frontend web applications through a source-driven, constraint-aware, multi-phase pipeline, and
characterize the structural and runtime limits of that coverage through empirical evaluation.

---

## C. Frozen Research Questions (RQs)

**RQ1.** How can executable frontend interaction behavior be represented and deterministically
constructed from Angular source code as a finite, implementation-grounded workflow space?

**RQ2.** How can workflows in that reference space be realized into executable Selenium tests
with full generation coverage (i.e., a generated test for every workflow)?

**RQ3.** How effective is the approach empirically, relative to a dynamic crawling baseline,
and what residual failure families delimit its current boundary?

---

## D. Frozen Evaluation Questions (EQs)

**EQ1.** Does A1/A2 produce a deterministic, auditable, bounded workflow denominator?
*(Answered by: determinism verification, GT validation, multigraph statistics)*

**EQ2.** Does B1/B2 achieve full generation coverage over that denominator?
*(Answered by: C1 = C2 = 100% across all 6 subjects, 257/257 tests generated)*

**EQ3.** What execution coverage is achieved, how does it compare to AutoE2E, and what failure
taxonomy emerges?
*(Answered by: C3 = 64.7% on 5 subjects, AutoE2E comparison, 85-failure residual taxonomy)*

---

## E. Frozen Contribution List

1. **UI Interaction Multigraph formalism.** A graph representation with 6 node kinds and 18
   edge kinds (11 structural, 7 executable) that captures Angular navigation structure, widget
   interaction behavior, guard/constraint surfaces, and UI property gates as a single
   deterministic artifact extracted from source code alone.

2. **Trigger-centric workflow enumeration with constraint classification.** A workflow space
   construction algorithm that enumerates exactly one workflow per enabled trigger edge in the
   multigraph, computes deterministic effect closures, merges constraint surfaces, and classifies
   each workflow as FEASIBLE, CONDITIONAL, or PRUNED, yielding a fixed, bounded denominator
   for coverage measurement.

3. **Full-pipeline realization from plan to evidence-producing execution.** A five-stage
   realization pipeline (B0 manifest authoring, B1 plan derivation, B2 code generation,
   B3 evidence-producing execution, B4 coverage computation) that transforms every workflow
   into an executable Selenium WebDriver test, executes it with structured per-test observability
   (step-level logs, failure classification, integrity verification), and computes tiered coverage
   over the fixed workflow denominator, achieving 100% generation coverage (C1 = C2 = 100%)
   across all six subjects.

4. **Empirical evaluation on six Angular subjects with failure taxonomy.** A benchmark evaluation
   across six open-source Angular applications spanning multiple framework versions, showing
   64.7% execution coverage (C3) on five integrity-verified subjects, with a systematic failure
   taxonomy classifying 85 residual failures into 7 families derived from multi-layer diagnostic
   evidence, and a head-to-head comparison against AutoE2E.

---

## E.1 Frozen Terminology: Augmented Workflow

An **augmented workflow** is a trigger-rooted, constraint-aware, executable interaction unit
extracted from frontend source code. It represents a single user-initiated interaction
(a click, form submission, or navigation) together with its deterministic effect closure
(the ordered sequence of service calls, navigations, and state changes that the trigger
causes) and its aggregated constraint surface (the guards, route parameters, form validity
requirements, and UI visibility/enablement gates that must be satisfied for the workflow
to execute).

The paper uses **augmented workflow** as the conceptual term throughout. The implementation
artifact is named `TaskWorkflow` in the codebase (`src/models/workflow.ts`). The two are
synonymous: every augmented workflow in the paper corresponds to exactly one TaskWorkflow
in the A2 output.

**Consistency rule:** Use "augmented workflow" (or just "workflow" when unambiguous) in all
paper sections. Use "TaskWorkflow" only when referring to the implementation artifact in the
approach section. Do not mix terms within the same paragraph. The enumeration algorithm
produces "augmented workflows"; the B1/B2 pipeline consumes them.

---

## E.2 Formal Coverage Denominators: W and W_exec

### Definitions

- **W** (workflow reference space): The complete set of augmented workflows produced by Phase A2
  across all evaluation subjects. |W| = 257. This set is fixed before any execution begins and
  serves as the denominator for generation-side coverage metrics (C1, C2).

- **W_exec** (executed workflow subset): The subset of W for which B3 execution was performed
  against a live application instance under benchmark-valid conditions.
  W_exec ⊂ W, |W_exec| = 241. This set serves as the denominator for execution coverage (C3).

### Why W_exec ≠ W

W contains 257 workflows across 6 subjects. W_exec contains 241 workflows across 5 subjects.
The difference (16 workflows) corresponds to softscanner-cqa-frontend, which is included in the
**generation corpus** (all 16 workflows have valid plans and generated test code) but excluded
from the **execution corpus** because no benchmark-valid execution run was performed against a
live instance of that application.

This is intentional and methodologically justified:
- Generation completeness (C1, C2) and execution feasibility (C3) are different dimensions.
  C1/C2 measure whether the pipeline can transform every workflow into executable code —
  this is a property of the pipeline itself and is evaluated over all 6 subjects.
- C3 measures whether generated tests pass against running applications — this is a property
  of the interaction between generated code and application runtime, and can only be measured
  where benchmark-valid execution is available.
- Including softscanner-cqa in W but not in W_exec does not constitute incomplete evaluation.
  It reflects the explicit separation of generation coverage (pipeline property) from execution
  coverage (runtime property).

### Metric definitions

- **C1 (Plan coverage):** |{w ∈ W : B1 produces valid ActionPlan for w}| / |W|
- **C2 (Code coverage):** |{w ∈ W : B2 produces syntactically valid test for w}| / |W|
- **C3 (Execution coverage):** |{w ∈ W_exec : B3 outcome = PASS}| / |W_exec_denom|

  where W_exec_denom = W_exec minus:
  - PRUNED workflows (provably infeasible; excluded from denominator)
  - FAIL_APP_NOT_READY outcomes (environment deficiency, not pipeline deficiency)
  - User-declared skips (manifest.skipWorkflows)

  In the current evaluation: 0 PRUNED, 0 FAIL_APP_NOT_READY, 0 skips, so W_exec_denom = W_exec = 241.

### Validity precondition for C3

C3 is only reportable when the benchmark run has **zero FAIL_INTEGRITY** outcomes. FAIL_INTEGRITY
indicates that a test's exit code and its structured execution log disagree, meaning the outcome
cannot be trusted. A benchmark run with any FAIL_INTEGRITY invalidates C3 for that subject.
The 2026-04-03 snapshot has 0 FAIL_INTEGRITY across all 241 tests.

---

## F. Authoritative Empirical Snapshot

**Snapshot date:** 2026-04-03 (integrity-verified, environment-clean benchmark run)
**Source:** `docs/analysis/phase-b/diagnostic-reclassification-report.md`

### F.1 Subject Corpus

| # | Subject | Angular | Auth | Nodes | Edges | Struct | Exec | Workflows |
|---|---------|---------|------|-------|-------|--------|------|-----------|
| 1 | posts-users-ui-ng | 15 | No | 72 | 147 | 116 | 31 | 18 |
| 2 | heroes-angular | 11 | No | 67 | 88 | 68 | 20 | 19 |
| 3 | softscanner-cqa | 17 | OAuth | 42 | 84 | 67 | 17 | 16 |
| 4 | airbus-inventory | 12 | JWT | 68 | 149 | 108 | 41 | 21 |
| 5 | spring-petclinic | 18 | No | 195 | 430 | 302 | 128 | 74 |
| 6 | ever-traduora | 12 | JWT | 253 | 511 | 396 | 115 | 109 |
| | **Total** | | | **697** | **1409** | **1057** | **352** | **257** |

**Note on node/edge counts:** MEMORY.md reports 697 nodes, 1409 edges (1057 structural, 352
executable). The approach-evaluation-report reports 665 nodes, 1345 edges (993 structural, 352
executable). The MEMORY.md figures are the post-Patch-7 canonical values and are authoritative
for this paper. The discrepancy arises from post-audit patches (Patch 7: bounded transitive
call following, WIDGET_CONTAINS_WIDGET emission) applied after the evaluation report snapshot.

### F.2 Workflow Classification

| Subject | Total | FEASIBLE | CONDITIONAL | PRUNED |
|---------|-------|----------|-------------|--------|
| posts-users-ui-ng | 18 | 12 | 6 | 0 |
| heroes-angular | 19 | 19 | 0 | 0 |
| softscanner-cqa | 16 | 15 | 1 | 0 |
| airbus-inventory | 21 | 13 | 8 | 0 |
| spring-petclinic | 74 | 40 | 34 | 0 |
| ever-traduora | 109 | 46 | 63 | 0 |
| **Total** | **257** | **145 (56%)** | **112 (44%)** | **0** |

### F.3 Trigger Kind Distribution

| Kind | Count | % |
|------|-------|---|
| WTH (Widget Triggers Handler) | 170 | 66% |
| WNR (Widget Navigates Route) | 43 | 17% |
| WSF (Widget Submits Form) | 33 | 13% |
| WNE (Widget Navigates External) | 11 | 4% |

### F.4 Generation Coverage

- **C1 (Plan coverage):** 257/257 = **100%**
- **C2 (Code coverage):** 257/257 = **100%**
- Tests generated: 257 files
- Total action steps: 428 across all tests
- Average steps per test: 1.7

### F.5 Execution Coverage (Benchmark Run 2026-04-03)

| Subject | Tests | Pass | Fail | C3 |
|---------|-------|------|------|-----|
| posts-users-ui-ng | 18 | 16 | 2 | 88.9% |
| heroes-angular | 19 | 17 | 2 | 89.5% |
| airbus-inventory | 21 | 19 | 2 | 90.5% |
| spring-petclinic | 74 | 55 | 19 | 74.3% |
| ever-traduora | 109 | 49 | 60 | 45.0% |
| **Total (5 subj.)** | **241** | **156** | **85** | **64.7%** |

**softscanner-cqa-frontend** is a generation-only subject: all 16 workflows have valid plans
(C1 = 100%) and generated test code (C2 = 100%), validating pipeline completeness on this
subject. It is excluded from the execution corpus (W_exec) because no benchmark-valid execution
run was performed against a live instance. C3 is reported over W_exec (5 subjects, 241 tests).

### F.6 Failure Taxonomy (85 failures)

| Family | Count | % | Layer |
|--------|-------|---|-------|
| L3: async-gate + repeater-readiness | 63 | 74% | Runtime |
| L2: postcondition-mismatch | 11 | 13% | Oracle |
| L3: locator-mismatch | 6 | 7% | Structural |
| L2: external-redirect | 2 | 2% | Oracle |
| L4: backend-validation | 1 | 1% | Environment |
| L3: dialog-precondition | 1 | 1% | Structural |
| L3: element-not-interactable | 1 | 1% | Structural |

**Dominant failure family:** Async permission/data gates (63/85 = 74%), concentrated in
ever-traduora (52) and spring-petclinic (9). These are widgets behind async pipes or
expression-gated visibility predicates that do not materialize within the implicit wait timeout.

### F.7 AutoE2E Comparison

AutoE2E produces a state graph and feature database but does **not** generate executable tests.

| Dimension | This work | AutoE2E |
|-----------|-----------|---------|
| Executable tests generated | 257 | 0 |
| Subjects with full gen. coverage (C2=100%) | 6/6 | 0/6 |
| Subjects with meaningful exploration | 6/6 | 1/6 (petclinic only) |
| Form submission workflows | 33 WSF tested | 0 form submissions |
| Auth-protected subjects | 2/2 covered | 0/2 (auth wall) |
| Coverage denominator | Fixed (257) | Variable (exploration-dependent) |
| Determinism | Byte-identical | Non-deterministic |

AutoE2E subject-level results:
- petclinic: 9 states, 72 actions, 46 features (most complete)
- posts-users: 7 states, 30/95 actions, 5 features (30-action ceiling)
- heroes: 5 states, 30/53 actions, ~25 features (30-action ceiling)
- traduora: 3 states, 13 actions, 0 features (auth wall)
- airbus: 1 state, 3 actions, 0 features (auth wall + finality)
- softscanner-cqa: 9 states, 30/452 actions, 6 features (30-action ceiling)

---

## G. Conflicts and Outdated Statements Found

### G.1 Stale short-paper claims (MUST NOT reuse)

| Claim | Source | Status |
|-------|--------|--------|
| "coverage improved from 61% to 87%" | Short paper intro, abstract | **STALE.** Based on 2-subject evaluation (petclinic + heroes). Current C3 = 64.7% on 5 subjects. |
| "two Angular applications" | Short paper eval | **STALE.** Now 6 subjects. |
| "augmented workflows" terminology | Short paper throughout | **Retained as paper-level term.** See §E.1 for frozen definition. Implementation artifact = TaskWorkflow; paper term = augmented workflow. |
| Title mentions "LLMs" | Short paper title | **STALE.** The current pipeline is fully deterministic with no LLM component. LLMs are mentioned only as future work for CONDITIONAL workflow data generation. |

### G.2 Node/edge count discrepancy

- MEMORY.md: 697 nodes, 1409 edges (post-Patch-7, canonical)
- approach-evaluation-report: 665 nodes, 1345 edges (pre-Patch-7 snapshot)
- **Decision:** Use MEMORY.md figures (697/1409). The evaluation report predates patches that added WIDGET_CONTAINS_WIDGET edges and bounded transitive call following.

### G.3 Angular version discrepancy

- MEMORY.md says heroes-angular is Angular 11, approach-evaluation-report says Angular 14.
- subjects.md says posts is Angular 18, evaluation report says Angular 18.
- **Decision:** Verify from actual package.json of each subject if needed. For the paper, use the versions from subjects.md/MEMORY.md as they are more recently maintained.

### G.4 Workflow count: 256 vs 257

- Phase A GT: 256 unique triggers (excludes UI-feedback events)
- Phase B GT: 257 workflows (full A2WorkflowSet)
- approach.md clarifies: Phase B GT includes 1 A2-surplus trigger that Phase A GT excluded.
- **Decision:** Use 257 as the paper's workflow count (full A2 space). Mention the 256/257 distinction only if discussing GT construction methodology.

### G.5 softscanner-cqa: generation-only subject

- softscanner-cqa has 16 workflows, C1=C2=100% (plans derived, tests generated)
- Excluded from W_exec (no benchmark-valid execution run performed)
- **Decision:** C1 and C2 are reported over W (6 subjects, 257 workflows). C3 is reported
  over W_exec (5 subjects, 241 tests, 156 pass, 64.7%). softscanner-cqa is described in the
  evaluation as a generation-only subject that validates pipeline completeness. This is not an
  incomplete evaluation; it reflects the explicit separation of generation and execution coverage.

---

## H. Scope Decisions

### In scope for SEAA 2026 paper

- Phase A: A1 multigraph extraction, A2 workflow enumeration + classification
- Phase B: B0 manifest, B1 plan derivation, B2 code generation, B3 execution, B4 coverage
- B3 execution observability as methodological component: per-test structured execution logs,
  integrity verification (FAIL_INTEGRITY detection, log/exit-code agreement, freshness checks),
  outcome classification (8 types), and the diagnostic evidence model that supports the failure
  taxonomy. This is part of the approach, not merely the evaluation protocol.
- Empirical evaluation: 6 subjects in W (generation), 5 subjects in W_exec (execution)
- AutoE2E comparison
- Failure taxonomy (85 residuals, 7 families) derived from multi-layer diagnostic evidence
- Determinism protocol and verification
- Coverage metrics: C1, C2, C3

### Out of scope

- C4 (oracle strength) — deferred, not evaluated
- LLM-assisted data generation for CONDITIONAL workflows — future work
- A3 entity/service analysis — implementation exists but not part of the evaluated pipeline
- B0 seed script generation — implementation exists but operational, not a contribution
- CDP network evidence capture (Chrome DevTools Protocol request/response logging) — used in
  diagnostic investigations but not part of the core execution contract; optional per-subject
- Multi-framework support (React, Vue) — Angular only
- Recovery/improvement projections — mentioned in discussion, not claimed as results
- Subscribe callback capture (Variant C) — A1 enhancement, part of extraction, not separately evaluated

---

## H.1 Evaluation Section Contract (Binding for 04_evaluation.tex)

### Coverage metric definitions (exact)

| Metric | Name | Numerator | Denominator | Frozen value |
|--------|------|-----------|-------------|-------------|
| C1 | Plan coverage | workflows with valid ActionPlan | \|W\| = 257 | 257/257 = 100% |
| C2 | Code coverage | workflows with valid generated test | \|W\| = 257 | 257/257 = 100% |
| C3 | Execution coverage | workflows with PASS outcome | \|W_exec_denom\| = 241 | 156/241 = 64.7% |

### Denominator inclusion/exclusion rules

| Category | C1/C2 denominator (W) | C3 denominator (W_exec_denom) |
|----------|----------------------|------------------------------|
| All enumerated workflows (6 subjects) | Included | — |
| Executed workflows (5 subjects) | — | Included |
| Generation-only subject (softscanner-cqa) | Included | Excluded (no benchmark run) |
| PRUNED workflows | Included (count = 0) | Excluded from denom (count = 0) |
| FAIL_APP_NOT_READY outcomes | N/A | Excluded from denom (count = 0) |
| User-declared skips (skipWorkflows) | N/A | Excluded from denom (count = 0) |
| All other failure outcomes | N/A | Counted against C3 |

### Validity preconditions for reporting C3

1. Zero FAIL_INTEGRITY outcomes (log/exit-code agreement verified for every test)
2. Per-test execution logs exist for every test in W_exec
3. All logs are from the current run (freshness check: log mtime > run start time)
4. No known environment contamination (port collision, stale processes, seed absence)

Current snapshot satisfies all four: 241/241 logs complete, 0 FAIL_INTEGRITY, 0 contamination.

---

## I. Section-by-Section Storyline

### 00 Abstract (~200 words)

**Flow:** Problem (E2E coverage lacks fixed denominator) -> Gap (existing approaches use
derived/explored artifacts as denominator) -> Approach (source-driven pipeline: multigraph
extraction + workflow enumeration + test generation) -> Results (6 subjects, 257 workflows,
C1=C2=100%, C3=64.7% on 5 subjects, failure taxonomy with 7 families) -> Significance
(first approach to achieve full generation coverage over a fixed, implementation-grounded
workflow space and characterize residual failures systematically).

### 01 Introduction (~2 pages)

**Flow:**
1. E2E testing validates web apps from user perspective; effectiveness depends on workflow coverage
2. Coverage requires a reference space; if the reference is derived/explored, coverage reflects the derivation quality, not implementation completeness
3. Static approaches (MBT, artifact-driven) derive models but don't ground them in implementation; dynamic approaches (crawling) explore but coverage is exploration-bounded
4. Research gap: no approach constructs a finite, constraint-aware workflow space directly from source code and uses it as a fixed coverage denominator
5. Research objective and 3 RQs
6. Contributions (4 items)
7. Brief evaluation summary: 6 Angular subjects, 257 workflows, C1=C2=100%, C3=64.7%, 7 failure families
8. Paper organization

### 02 Related Work (~2 pages)

**Rhetorical purpose:** Deepen the Introduction's positioning by analyzing each relevant
family of prior work along consistent comparison dimensions. Show precisely what each family
contributes and what it cannot provide relative to the coverage-denominator problem. Conclude
with a positioning paragraph that bridges to the Approach section.

**Non-goal:** This section is not a survey. It must not repeat the Introduction's
static-vs-dynamic overview; it must deepen and organize that overview analytically.

**Families (in order):**

**A. Model-based and specification-driven testing** (~1 paragraph)
- Input: external models (FSMs, UML, use cases, requirements, user stories)
- Coverage notion: model-defined criteria (state, transition, path coverage)
- Strength: systematic test selection from structured models
- Limitation: denominator is the model, not the implementation; guards, auth constraints,
  and state-dependent visibility are typically abstracted away or partially encoded;
  coverage reflects model fidelity, not implementation completeness
- Behavioral granularity: state/transition level (page or route)
- Citations: utting_legeard_mbt_book_2010, utting_taxonomy_2012, garousi_mbt_practice_2021,
  nebut_usecase_driven_tse_2006, garcia_automated_2011, wang_umtg_tse_2022

**B. Source-driven and code-driven extraction** (~1.5 paragraphs)
Three sub-moves, ordered from enabling foundations to closest prior work:

B.1 Static-analysis foundations for JavaScript web applications:
  - Jensen et al.~(2011): modeling HTML DOM and browser API for static analysis of JS
  - Madsen et al.~(2013): framework-aware static analysis infrastructure for JS applications
  - These establish that sound static reasoning about JS control/data flow and DOM interaction
    is feasible, but target general program analysis, not test generation or workflow enumeration.
  - Behavioral granularity: variable/function/API level (not widget/interaction level)
  - Citations: jensen_static_analysis_js_2011, madsen_practical_static_js_2013

B.2 Testing-oriented event/dependency extraction:
  - Sung et al.~(2016): JSDEP — static DOM event dependency analysis, used to guide ARTEMIS
    test generation; computes dependencies between event handlers and DOM elements
  - Park et al.~(2018): event-handler-based analysis with DOM/CSS visibility considerations,
    but hybrid (depends on dynamically collected states for soundness)
  - These target event-level dependencies for test selection, but operate at DOM-event
    granularity and do not enumerate constraint-aware workflows or produce a fixed denominator.
  - Behavioral granularity: DOM event / handler dependency level
  - Citations: sung_static_analysis_web_testing_2016, park_eventhandler_2018

B.3 SPA navigation/model extraction for verification:
  - Oshima et al.~(2018): model-checking method for SPA page transitions extracted from
    Angular/component-based source code; closest to our extraction target
  - VeriFlow (Zhang et al., 2025): static extraction of navigational graphs from SPA
    JavaScript bundles for access-control verification
  - These extract navigation structure from SPA source code, but for verification rather than
    test generation. They capture route/page-level transitions, not widget-level interaction
    behavior, handler-effect closures, or constraint surfaces (guards, params, form validity,
    visibility predicates).
  - Behavioral granularity: page/route/state level
  - Citations: oshima_spa_model_checking_2018, zhang_veriflow_2025

Gap synthesis for Family B: Prior source-driven work demonstrates that static extraction
from frontend code is feasible at multiple levels (variable, event, route). However, we are
not aware of prior work that combines all of: (1) widget-level interaction extraction,
(2) handler-effect closure computation, (3) constraint-surface aggregation (guards, params,
form validity, visibility), (4) finite workflow enumeration with a fixed coverage denominator,
and (5) executable test generation from the resulting space.

**C. Crawling and runtime-exploration-based testing** (~1 paragraph)
- Input: running application instance
- Coverage notion: discovered states, transitions, or code coverage
- Strength: discovers actual runtime behavior; no manual model required
- Limitation: exploration-bounded (budget, auth walls, dynamic regions);
  non-deterministic; no fixed denominator (denominator changes with each run);
  auth-protected states often unreachable
- Behavioral granularity: state/transition level (discovered pages and actions)
- Citations: mesbah_crawling_2008, mesbah_crawljax_tweb_2012, webexplor_rl_2021,
  sherin_qexplore_2023, liu_rl_web_crawling_2024, memon_gui_ripping_2003,
  dominguez_osorio_ripuppet_2019, ricos_distributed_scriptless_jes_2023

**D. LLM-based test generation and web agents** (~1 paragraph)
- Input: textual artifacts (user stories, form descriptions, DOM state)
- Coverage notion: feature coverage, task success, scenario completeness
- Strength: semantic reasoning over natural language; can target complex scenarios
- Limitation: non-deterministic; no structural grounding in source code;
  hallucination risk (plausible but non-existent scenarios); auth challenges;
  no fixed implementation-grounded denominator
- Key fact for positioning: AutoE2E produces a state graph and feature database
  but does NOT generate executable test code — making direct C3 comparison impossible;
  comparison is qualitative + structural
- Behavioral granularity: feature/task level (inferred, not extracted)
- Citations: leotta_ai_e2e_web_test_2024, cavalcanti_autotest_llm_empirical_2025,
  junior_genia-e2etest_2025, li_llm_form_test_empirical_2026,
  alian_feature-driven_2025, chevrot_auto_web_agents_test_2025,
  shahbandeh_naviqate_2024

**E. Positioning summary** (~1 paragraph)
- State how our work differs along the comparison dimensions
- Key framing: novelty is not "source-driven" alone (B.1-B.3 show source-driven work exists)
  but the specific combination of: direct frontend-source extraction + finite fixed denominator
  + explicit constraint handling + executable test generation + integrity-verified execution
- Bridge to §3

**Comparison dimensions (positioning matrix):**

| Dimension | MBT/Spec | Source-driven (B) | Crawling | LLM-based | Our work |
|-----------|----------|-------------------|----------|-----------|----------|
| Interaction space source | External model/spec | App source code | Runtime exploration | Text/DOM/LLM | Frontend source code |
| Behavioral granularity | State/transition | Variable→event→route | State/transition | Feature/task | Widget/handler/constraint |
| Fixed denominator | Model-fixed | N/A (not test-gen) | No (exploration) | No | Yes (W) |
| Constraint-aware | Partial | Partial (B.2 events) | No | No | Yes (full surface) |
| Auth-aware | Rarely | No | Blocked | Limited | Yes (manifest) |
| Executable test output | Yes (from model) | No | Varies | Varies | Yes (257/257) |
| Deterministic | Model-dependent | Yes (static) | No | No | Yes (byte-identical) |

**Inherited from short paper:** MBT guard-abstraction argument, artifact-driven
"specification-plausible yet unexecutable" observation, exploration-bounded coverage
argument.

**New for SEAA:** Source-driven as a distinct, literature-grounded family (B.1-B.3);
LLM-based as its own family; AutoE2E does not generate executable tests;
behavioral granularity as a comparison dimension; positioning as combination novelty
(not "first source-driven").

### 03 Approach (~5-6 pages)

#### 03.0 Overview Subsection Contract

**Rhetorical purpose:** Present the full pipeline at a high level so the reader has a
complete map before encountering formal definitions. Establish the artifact flow, name
the two phases, state what each phase takes and produces, and connect phases to RQs.

**Order of presentation:**
1. One-sentence pipeline statement (source code → fixed workflow space → executable tests → coverage)
2. Phase A summary: A1 (multigraph extraction) and A2 (workflow enumeration + classification)
3. Phase B summary: B0 (manifest), B1 (plan derivation), B2 (code generation),
   B3 (evidence-producing execution), B4 (coverage computation)
4. RQ mapping: RQ1 → Phase A; RQ2 → Phase B (B0–B2); RQ3 → Phase B (B3–B4) + evaluation
5. Pipeline figure reference
6. Forward pointer to detailed subsections

**Core artifacts named in the overview (must be later defined):**
- UI Interaction Multigraph (A1 output)
- Augmented workflow / workflow space W (A2 output)
- Subject manifest (B0 output, manual)
- ActionPlan (B1 output)
- Selenium test file (B2 output)
- Execution results with per-test evidence (B3 output)
- Coverage metrics C1, C2, C3 (B4 output)

**Phase-level input/output:**

| Phase | Input | Output | Deterministic? |
|-------|-------|--------|---------------|
| A1 | Angular source code + tsconfig | UI Interaction Multigraph (a1-multigraph.json) | Yes (byte-identical) |
| A2 | A1 multigraph | Workflow space W (a2-workflows.json) | Yes (byte-identical) |
| B0 | A2 workflows + manual input | Subject manifest (subject-manifest.json) | N/A (manual) |
| B1 | A1 + A2 + manifest | ActionPlans (b1-plans.json) | Yes |
| B2 | B1 plans + manifest | Selenium test files (*.test.ts) | Yes |
| B3 | B2 tests + running app | Execution results + per-test evidence | No (runtime) |
| B4 | B3 results + A2 workflows | Coverage metrics C1, C2, C3 | Yes (given B3) |

**RQ mapping:**
- **RQ1** (representation + construction) → Phase A (A1 + A2)
- **RQ2** (realization with full generation coverage) → Phase B generation (B0 + B1 + B2)
- **RQ3** (empirical effectiveness + failure taxonomy) → Phase B execution (B3 + B4) + evaluation

**What the figure must show:**
- Two visually grouped phases (Phase A, Phase B)
- Seven stages as boxes: A1, A2, B0, B1, B2, B3, B4
- Arrows showing artifact flow between stages
- External inputs: Angular source code (into A1), running application (into B3),
  manual input (into B0)
- Key artifacts labeled on arrows: multigraph, workflow space W, manifest, plans, tests,
  results, coverage
- RQ annotations on the phase groups

**What must be deferred to later subsections:**
- Formal definition of node kinds and edge kinds (→ Phase A subsection)
- Formal definition of augmented workflow, effect closure, constraint classification (→ Phase A)
- ActionPlan structure, precondition types, locator strategy (→ Phase B subsection)
- Execution model details, failure classification, integrity verification (→ Phase B)
- Coverage metric formulas and denominator rules (→ Phase B or Evaluation)

#### 03.1–03.N Detailed Subsection Flow

1. Phase A1: UI Interaction Multigraph — 6 node kinds, 18 edge kinds, deterministic extraction from Angular AST, constraint surfaces, UI property gates
2. Phase A2: Workflow enumeration — trigger-centric, one workflow per enabled trigger edge, effect closure, constraint classification (FEASIBLE/CONDITIONAL/PRUNED)
3. Phase B0: Subject manifest — per-subject runtime configuration (accounts, route params, auth setup)
4. Phase B1: ActionPlan derivation — RealizationIntent binding, precondition materialization (auth, navigation, dialog), form field scoping, locator strategy
5. Phase B2: Code generation — Selenium WebDriver test emission, one test per plan
6. Phase B3: Evidence-producing execution — per-test isolation (separate WebDriver), bounded retry with escalation, structured per-test execution logs (step-level evidence, screenshots, timing), integrity verification (FAIL_INTEGRITY: log/exit-code agreement, freshness checks), outcome classification (8 types). Observability is cross-cutting: generated tests (B2) emit structured logs; the runner (B3) verifies their integrity; the failure taxonomy (evaluation) consumes the evidence layers.
7. Phase B4: Coverage — C1/C2/C3 definitions, denominator construction, PRUNED exclusion. C3 denominator excludes PRUNED workflows, FAIL_APP_NOT_READY (environment deficiency), and user-declared skips. C3 validity depends on integrity-verified execution (zero FAIL_INTEGRITY).

### 04 Evaluation (~4-5 pages)

**Flow:**
1. Research questions and evaluation questions mapping
2. Subject corpus: 6 Angular apps spanning multiple framework versions, varying complexity (42-253 nodes, 16-109 workflows), 2 with auth
3. Experimental setup: determinism protocol, benchmark execution protocol, diagnostic protocol
4. EQ1 results: multigraph statistics, determinism verification (byte-identical across runs), GT validation (257/257)
5. EQ2 results: C1=C2=100%, generation statistics (257 tests, 428 steps)
6. EQ3 results: C3=64.7% (156/241), per-subject breakdown, failure taxonomy (7 families), dominant failure analysis
7. AutoE2E comparison: quantitative (tests generated, auth coverage, form coverage) and qualitative (fixed vs variable denominator, determinism)
8. Threats to validity

### 05 Conclusion (~0.5 page)

**Flow:**
1. Summary: source-driven pipeline, fixed workflow space, full generation coverage, characterized execution boundary
2. Key finding: the dominant execution barrier is runtime widget materialization (74% of failures), not generation or planning deficiency
3. Future work: async-gate handling (B5.2), stronger postcondition oracles (C4), multi-framework support, LLM-assisted CONDITIONAL data generation
