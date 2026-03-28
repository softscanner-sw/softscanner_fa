# Presentation Outline — Phase B Overview

Generated: 2026-03-12
File: `docs/presentation/phase-b-overview.pptx`
Slides: 17

---

## Slide 1 — Title
**Automating End-to-End Functional Testing of Web Applications based on Augmented Workflows and LLMs**
- EASE 2026, Glasgow, 9–12 June 2026
- Current implementation status through Phase B2, validated on 6 Angular applications

## Slide 2 — Problem Context and Motivation
**Claims:**
- E2E testing validates frontend behavior from the user's perspective
- Existing approaches compute coverage over interaction spaces derived from models, specifications, or runtime artifacts
- Coverage is bounded by abstraction choices or exploration policies, not by the implementation itself
- No existing approach constructs a finite, constraint-aware workflow reference space grounded in the frontend implementation

**Source:** main.pdf §1 (Introduction), approach.md (Strategy)

## Slide 3 — Research Objective and Questions
**Claims:**
- RQ1 (Representation): How to represent behavior such that the workflow space is complete, constraint-aware, finite, and executable?
- RQ2 (Construction): How to derive this representation systematically and deterministically from source code?
- RQ3 (Realization): How to instantiate and execute workflows to maximize coverage over the space?
- Each RQ addresses a specific research issue (representational inadequacy, systematic construction, operational feasibility)

**Source:** main.pdf §3 (Approach), approach.md (Phase A + Phase B)

## Slide 4 — Why Existing Approaches Are Insufficient (Related Work)
**Claims:**
- Static approaches (MBT, requirements-driven, LLM synthesis): interaction space defined by spec, not implementation; may miss guards/constraints
- Dynamic approaches (crawling, web agents, AutoE2E): space defined by exploration budget; coverage reflects discovered subset
- Gap: no prior work constructs a finite, constraint-aware workflow reference space grounded directly in the frontend implementation

**Source:** main.pdf §2 (Related Work)

## Slide 5 — Core Idea: Augmented Workflows over a Closed Workflow Space
**Claims:**
- Key insight: separate representation construction (Phase A) from realization (Phase B)
- Augmented workflow: path annotated with constraints extracted from the implementation
- Constraints: route guards, roles, required parameters, atomic UI predicates
- W = all non-PRUNED workflows — fixed, finite, implementation-grounded
- Coverage = |E| / |W| where E = successfully executed workflows

**Source:** main.pdf §3 (RQ1), approach.md (A2.2 Classification, B4 Coverage)

## Slide 6 — End-to-End Pipeline Overview
**Claims:**
- Phase A (static): A1 multigraph extraction → A2 workflow enumeration → W
- Phase B (realization): B0 manifest → B1 intent + plan → B2 code gen → B3 execution → B4 coverage
- Current validated status: A1–B2 complete (257/257), B3–B4 pending

**Source:** approach.md (B0–B4 Decomposition table), subjects.md (commands + output files)

## Slide 7 — A1: UI Interaction Multigraph
**Claims:**
- A1 constructs a unified multigraph G from Angular AST inspection
- 6 node kinds (Module, Route, Component, Widget, Service, External)
- 18 edge kinds (11 structural + 7 executable)
- Every node/edge backed by SourceRef; ConstraintSurface on every executable edge
- Deterministic: same codebase → byte-identical output
- Across 6 subjects: 665 nodes, 1345 edges

**Source:** approach.md §1–9 (node kinds, edge kinds, schema), subjects.md (observed output)

## Slide 8 — A2: Task Workflow Enumeration and Classification
**Claims:**
- Exactly 1 TaskWorkflow per trigger edge (WTH/WSF/WNR/WNE)
- Handler-scoped effect closure via effectGroupId (CCS, CNR)
- Deterministic redirect closure (cycle-safe, visit-cap)
- Classification: FEASIBLE / CONDITIONAL / PRUNED (strict rule order, no SAT)
- Total: 257 workflows (145 FEASIBLE, 112 CONDITIONAL, 0 PRUNED)

**Source:** approach.md (A2.1–A2.2), subjects.md (A2 Task Workflow Summary table)

## Slide 9 — Phase B: From Workflows to Executable Tests
**Claims:**
- B0: SubjectManifest validates per-subject config (credentials, params, auth setup) against A2
- B1.1: RealizationIntent — deterministic derivation from A1 + A2 (no manifest needed)
- B1.2: ActionPlan — binds intent to manifest values; preconditions, steps, postconditions
- B2: 1 Selenium test file per ActionPlan, deterministic, 257/257 = 100% generation rate
- B3/B4: Execution with bounded retry + tiered coverage reporting (planned, not yet validated)

**Source:** approach.md (B0–B4 schemas), b1-closure-report.md, b2-closure-report.md

## Slide 10 — Ground-Truth Construction and Alignment
**Claims:**
- 257 manually constructed GT entries across 6 subjects
- 150 initial mismatches → ~100 GT repairs, 5 spec amendments, 3 validator fixes, 2 code fixes
- Final: 257/257 match for both B1 intents and B1 plans
- 5 normative decisions frozen in approach.md during GT adjudication

**Source:** b1-closure-report.md (§4 GT Validation, §5 GT Repairs, §6 Adjudication)

## Slide 11 — Validation Corpus: 6 Angular Applications
**Claims:**
- 6 subjects: Angular 12–18, varied architecture, with/without auth guards
- Total: 665 nodes, 1345 edges, 257 workflows
- Selection covers: flat vs modular, auth vs public, standard forms vs Material vs NgRx
- All subjects validated for byte-identical determinism

**Source:** subjects.md (Subject metadata, Observed output sections)

## Slide 12 — Current Validated Results
**Claims:**
- A1–B2: all stages complete and validated (257/257 across all metrics)
- B3–B4: pending implementation
- Determinism verified at every stage (separate verification scripts)
- 248 automated tests, all green

**Source:** subjects.md (Phase B commands section), b1-closure-report.md (§8 Gate Summary), b2-closure-report.md (§6 Gate Summary)

## Slide 13 — Coverage Model: Generation vs. Execution vs. Oracle
**Claims:**
- C1 (Plan coverage): 257/257 = 100% — validated
- C2 (Code coverage): 257/257 = 100% — validated
- C3 (Execution coverage): pending B3; FAIL_APP_NOT_READY excluded from denominator
- C4 (Oracle strength): deferred
- 125 workflows (49%) need no entity data; 129 (50%) require entity data; 97 (38%) require auth
- Generation coverage is necessary but not sufficient for E2E success

**Source:** approach.md (B4 Coverage Reporting), execution-readiness-audit.md (§3 GT-Backed Classification)

## Slide 14 — Comparison with AutoE2E
**Claims:**
- Fundamental difference: our W is source-grounded; AutoE2E's space is exploration-bounded
- AutoE2E does not generate executable test files (confirmed by code inspection + 6 runs)
- Paper evaluation (2 subjects, same W): 84.5%/88.9% (ours) vs 58.3%/63.9% (AutoE2E)
- Mapping AutoE2E actions to our W is deterministic but approximate
- Current 6-subject execution coverage is pending B3

**Source:** main.pdf §4 (Evaluation, Table 1), autoe2e-benchmark-evaluation-report.md (§5, §30)

## Slide 15 — AutoE2E: 6-Subject Benchmark Evidence
**Claims:**
- AutoE2E executed on all 6 subjects used in our validation corpus
- Auth-protected apps (traduora, airbus) severely constrained: 3 and 1 states respectively
- Form submission requires PetClinic-specific data-testid attributes; fails on standard Angular forms
- 30-action ceiling is primary bottleneck for accessible apps
- Comparison is fundamentally asymmetric (source-grounded vs exploration-bounded)

**Source:** autoe2e-benchmark-evaluation-report.md (§5, §30 Cross-Benchmark Comparison)

## Slide 16 — Current Limitations and Open Issues
**Claims:**
- Execution: B3 not implemented; 129 workflows depend on entity data; C3 remains key open metric
- Methodological: Angular-specific; bounded path length k=5; single-trigger model; postconditions limited to URL-match + no-crash
- Paper evaluation on 2 subjects only; full 6-subject execution pending
- AutoE2E comparison mapping is deterministic but approximate

**Source:** main.pdf §4 (Threats to Validity), execution-readiness-audit.md (§1–4)

## Slide 17 — Conclusion and Contributions
**Claims:**
- Augmented workflows: navigation paths annotated with implementation-level constraints
- Finite, closed workflow space W as the coverage denominator
- Automated pipeline A1→A2→B0–B2, deterministic throughout
- GT-validated on 6 subjects (257 workflows, 0 mismatches)
- Paper evaluation: consistent coverage improvement over AutoE2E on same W
- Honest status: generation coverage validated (100%); execution coverage validated on 2 subjects; full 6-subject execution pending B3

**Source:** main.pdf §5 (Conclusion), all implementation artifacts

---

## Source Files Used
1. `docs/paper/main.pdf` — problem statement, RQs, related work, evaluation results
2. `docs/paper/approach.md` — full normative spec (A1, A2, B0–B4 schemas)
3. `docs/validation/subjects.md` — validation corpus, commands, observed output stats
4. `docs/validation/autoe2e-benchmark-evaluation-report.md` — 6-subject AutoE2E benchmark
5. `docs/analysis/phase-b/b1-closure-report.md` — B1 GT validation and adjudication
6. `docs/analysis/phase-b/b2-closure-report.md` — B2 generation coverage
7. `docs/analysis/phase-b/execution-readiness-audit.md` — execution-readiness analysis

## Missing Sources
None. All required source files were available and read.

## Qualified Comparisons
- **AutoE2E comparison (slide 14–15):** The paper's quantitative comparison (84.5% vs 58.3%, 88.9% vs 63.9%) is from the paper evaluation on 2 subjects with execution validation. The 6-subject AutoE2E evidence is qualitative (no executable tests produced by AutoE2E, so no execution-level comparison is possible across all 6 subjects). The action-to-workflow mapping used in the paper is deterministic but approximate — this is explicitly stated on slide 14.
- **Execution coverage:** Explicitly marked as pending throughout. Generation coverage (C1+C2 = 100%) is never presented as execution-proven coverage.
