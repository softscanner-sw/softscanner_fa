# Baseline Admissibility Study for SEAA 2026 Paper

## A. Frozen Benchmark Recap

| Subject | C3 (Execution) | Workflows |
|---|---|---|
| posts-users-ui-ng | 94.4% (17/18) | 18 |
| heroes-angular | 89.5% (17/19) | 19 |
| airbus-inventory | 90.5% (19/21) | 21 |
| spring-petclinic-angular | 86.5% (64/74) | 74 |
| ever-traduora | 47.7% (52/109) | 109 |
| angular-jumpstart | 76.6% (36/47) | 47 |
| event-booking-mean | 53.3% (8/15) | 15 |
| **Aggregate** | **70.3% (213/303)** | **303** |

Denominator: 303 TaskWorkflows, deterministically derived from A1 multigraph via A2 enumeration. Each workflow is a single-trigger effect closure with formal classification (FEASIBLE / CONDITIONAL). Ground truth: 257 hand-validated entries. Determinism: byte-identical across runs. Median per-subject C3: 86.5%.

---

## B. Baseline Landscape Review

### Landscape map

The E2E web testing literature (2018-2026) contains four distinct families:

1. **Crawl-based model extraction** (Crawljax, FragGen, DANTE, TESTAR, QExplore) — explore a running app's DOM states, build state-flow graphs, optionally derive regression tests. Denominator: DOM state coverage or code coverage.

2. **LLM-driven feature/test generation** (AutoE2E, GenIA-E2ETest, Le et al.) — use LLMs to infer testable functionality from observed UI states or NL specs, then synthesize executable test scripts. Denominator: features exercised or requirement fulfillment.

3. **Autonomous web agents evaluated as testers** (WebTestPilot, SeeAct, PinATA, WebTestBench, WebArena) — LLM/VLM agents that interact with live web apps and optionally infer oracles. Denominator: task completion rate, bug detection precision/recall.

4. **Static-analysis-driven test derivation** (SoftScanner FA) — our approach. Statically extracts a UI interaction multigraph from source code, enumerates workflows, materializes executable Selenium tests. Denominator: workflow execution coverage against a formally derived task space.

**Critical observation:** Family 4 has no direct competitor. No other published approach derives a deterministic test denominator from source-code static analysis of a web application's UI interaction structure. This is our contribution's novelty anchor — but it also means no baseline shares our denominator.

---

## C. Candidate-by-Candidate Admissibility Analysis

### Inclusion Criteria Applied

| # | Criterion |
|---|---|
| IC-1 | Public paper or preprint |
| IC-2 | Public code or replication package |
| IC-3 | Runnable on external web applications (not only closed benchmarks) |
| IC-4 | Produces executable E2E behavior (tests, traces, or agent executions) |
| IC-5 | Task formulation close enough for quantitative or semi-quantitative comparison |
| IC-6 | Prefers workflows/tasks/scenarios over isolated GUI actions |

---

### Candidate 1: AutoE2E

| Field | Value | Status |
|---|---|---|
| **Paper** | "Feature-Driven End-To-End Test Generation" | Confirmed |
| **Authors** | Alian, Nashid, Shahbandeh, Shabani, Mesbah (UBC) | Confirmed |
| **Venue** | ICSE 2025 (arXiv:2408.01894) | Confirmed |
| **Repo** | github.com/parsaalian/autoe2e | Confirmed public |
| **Task formulation** | BFS exploration of running web app + LLM feature inference → executable E2E test scenarios | Confirmed |
| **Denominator** | Feature coverage = features exercised / total features (LLM-inferred) | Confirmed |
| **Result** | 79% average feature coverage on E2EBench (8 apps) | Confirmed |
| **Shared subjects** | ever-traduora (confirmed), PetClinic (theirs is Spring MVC; ours is the Angular frontend) | Confirmed/Partial |

**Inclusion analysis:**
- IC-1: PASS (ICSE 2025)
- IC-2: PASS (public repo)
- IC-3: PASS (URL-only input)
- IC-4: PASS (executable E2E tests)
- IC-5: **PARTIAL** — denominator is "features" (LLM-inferred, non-deterministic, subjective) vs our "TaskWorkflows" (formally derived, deterministic). AutoE2E reports 41 features for traduora; we have 109 TaskWorkflows. The mapping is many-to-many.
- IC-6: PASS (multi-step features)

**Denominator commensurability:**
- AutoE2E "features" are LLM-inferred from observed UI states. Different LLM runs may yield different feature sets. Feature granularity is user-centric ("A user can create a project") vs our widget-trigger-centric ("Widget W on Route R triggers handler H").
- On ever-traduora: 41 features vs 109 workflows. Ratio ~2.7x. This is not a simple rescaling — features aggregate multiple trigger paths into one "capability," while workflows decompose each trigger into a separate test target.
- **Direct quantitative comparison (Feature Coverage % vs C3 %) would be methodologically invalid** because the denominators measure fundamentally different things.
- **Mapped comparison** is possible but requires: (a) mapping each AutoE2E feature to the workflow(s) it covers, (b) defining a shared denominator, (c) accepting subjective judgment in the mapping. This is defensible as a semi-quantitative structural comparison but not as a head-to-head metric contest.

**Practical runnability on our subjects:**
- Requires: MongoDB Atlas, Redis, Anthropic API key (paid), Python 3.10+
- Must serve our 7 Angular apps as running instances
- **Angular SPA compatibility: UNCONFIRMED.** AutoE2E's E2EBench subjects are mostly server-rendered (PetClinic Spring MVC, MantisBT PHP, Conduit, etc.). Angular SPAs with client-side routing may challenge the BFS crawler.
- **Estimated effort:** 2-3 days for environment setup, 1-2 days per subject for runs (LLM API cost: ~$20-50/subject), 2-3 days for feature-workflow mapping analysis. Total: ~2-3 weeks.

**Threats to validity:**
1. LLM non-determinism: AutoE2E results vary across runs. Our results are deterministic.
2. Feature definition subjectivity: "41 features" for traduora is AutoE2E's judgment; a different LLM/prompt might yield 30 or 55.
3. Angular SPA crawling: AutoE2E may fail to explore Angular-routed pages if BFS doesn't trigger client-side navigation properly.
4. Infrastructure gap: AutoE2E requires cloud MongoDB + Redis + API keys; our pipeline is fully local.

**Verdict: CONDITIONALLY ADMISSIBLE (strongest candidate, but denominator is incommensurable)**

---

### Candidate 2: WebTestPilot

| Field | Value | Status |
|---|---|---|
| **Paper** | "WebTestPilot: Agentic End-to-End Web Testing..." | Confirmed |
| **Authors** | Teoh, Lin, Nguyen, Ren, Zhang, Dong (NUS) | Confirmed |
| **Venue** | PACM SE / FSE 2026 (arXiv:2602.11724) | Confirmed preprint |
| **Repo** | github.com/code-philia/WebTestPilot | Confirmed public |
| **Task formulation** | NL requirement → VLM agent execution with symbolized GUI oracles | Confirmed |
| **Denominator** | Task completion rate + bug detection P/R on 100 NL requirements | Confirmed |
| **Result** | 99% TC, 96% P, 96% R | Confirmed |

**Inclusion analysis:**
- IC-1: PASS (FSE 2026 preprint)
- IC-2: PASS
- IC-3: PASS (URL + NL spec)
- IC-4: PASS (agent traces with oracles)
- IC-5: **FAIL** — requires NL specifications as input; we'd have to manually author 303 NL requirements to compare. This introduces a confound (quality of NL specs) that makes the comparison unreliable.
- IC-6: PASS

**Additional concerns:**
- FSE 2026 vs SEAA 2026 timeline overlap. Citing a concurrent FSE paper is appropriate but running it as a baseline is unusual.
- Bug-injection evaluation model (110 injected bugs) is orthogonal to our workflow coverage model.

**Verdict: INADMISSIBLE (requires manual NL spec authoring for all 303 workflows; transforms the comparison from automated-to-automated into manual-to-automated)**

---

### Candidate 3: Crawljax

| Field | Value | Status |
|---|---|---|
| **Paper** | "Crawling AJAX-Based Web Applications..." (ACM TWEB 2012) | Confirmed |
| **Repo** | github.com/crawljax/crawljax | Confirmed |
| **Output** | State-flow graph (NOT executable tests) | Confirmed |

**Inclusion analysis:**
- IC-4: **FAIL** — does not produce executable tests. State-flow graph only.
- IC-5: **FAIL** — denominator is DOM state count, not workflow coverage.

**Note:** AutoE2E already benchmarks against Crawljax (+558% improvement). We can cite this indirect comparison without replicating Crawljax ourselves.

**Verdict: INADMISSIBLE (no executable test output)**

---

### Candidate 4: DANTE

| Field | Value | Status |
|---|---|---|
| **Paper** | "Dependency-Aware Web Test Generation" (ICST 2020) | Confirmed |
| **Repo** | github.com/matteobiagiola/ICST20-submission-material-DANTE | Confirmed (submission material) |
| **Output** | Executable Selenium test schedules | Confirmed |

**Inclusion analysis:**
- IC-2: PARTIAL (submission material, not a runnable tool)
- IC-5: **FAIL** — denominator is test suite minimality / feasibility, not functional coverage
- IC-6: PARTIAL (dependency chains, not user workflows)

**Verdict: INADMISSIBLE (submission material only, wrong denominator)**

---

### Candidate 5: FragGen

| Field | Value | Status |
|---|---|---|
| **Paper** | "Fragment-Based Test Generation" (IEEE TSE 2022) | Confirmed |
| **Repo** | None found | Confirmed absent |

**Verdict: INADMISSIBLE (no public code)**

---

### Candidate 6: GenIA-E2ETest

| Field | Value | Status |
|---|---|---|
| **Paper** | SBES 2025 (arXiv:2510.01024) | Confirmed |
| **Repo** | github.com/uffsoftwaretesting/GenIA-E2ETest | Confirmed |
| **Output** | Robot Framework E2E scripts | Confirmed |

**Inclusion analysis:**
- IC-5: **PARTIAL** — uses NL test descriptions as input (manual authoring required)
- Evaluation is very small (2 apps, 12 test cases). Not comparable in scale to our 303 workflows.
- SBES (Brazilian regional symposium) vs ICSE/FSE/SEAA — venue gap.

**Verdict: INADMISSIBLE (requires manual NL input, insufficient scale)**

---

### Candidate 7: WebTestBench

| Field | Value | Status |
|---|---|---|
| **Paper** | arXiv:2603.25226 (March 2026) | Confirmed preprint |
| **Repo** | github.com/friedrichor/WebTestBench | Confirmed |

**Inclusion analysis:**
- IC-3: **FAIL** — uses synthesized web apps with injected defects, not external apps
- IC-5: **FAIL** — evaluates agent checklist generation capability, not test coverage

**Verdict: INADMISSIBLE (benchmark for agent evaluation, not a test generation tool)**

---

### Candidate 8: SeeAct / PinATA

| Field | Value | Status |
|---|---|---|
| **Papers** | SeeAct (ICML 2024), PinATA (ISSTA 2025) | Confirmed |
| **Repos** | Both public | Confirmed |

**Inclusion analysis:**
- IC-4: PARTIAL (agent traces, not portable test scripts)
- IC-5: **FAIL** — task completion or verdict accuracy, not workflow coverage

**Verdict: INADMISSIBLE (wrong output format and denominator)**

---

### Candidate 9: TESTAR

| Field | Value | Status |
|---|---|---|
| **Paper** | STVR 2021 | Confirmed |
| **Repo** | github.com/TESTARtool/TESTAR_dev | Confirmed, actively maintained |

**Inclusion analysis:**
- IC-4: **FAIL** — scriptless testing; no test file output
- IC-5: **FAIL** — GUI state coverage
- IC-6: **FAIL** — random/guided exploration, not workflow-driven

**Verdict: INADMISSIBLE (scriptless, random exploration)**

---

### Candidate 10: Testilizer

| Field | Value | Status |
|---|---|---|
| **Paper** | ASE 2014 | Confirmed |
| **Repo** | github.com/saltlab/Testilizer | Confirmed (abandoned ~2015) |

**Inclusion analysis:**
- IC-3: PARTIAL (requires existing test suite as seed)

**Verdict: INADMISSIBLE (requires seed test suite — circular dependency)**

---

### Mobile/Unit candidates (QTypist, GPTDroid, AUITestAgent, TestPilot, LIBRO)

All **INADMISSIBLE**: wrong domain (mobile or unit-level), do not address web E2E testing.

---

## D. Decision Matrix

### A. Fully Admissible Baselines

**None.** No existing public baseline shares our formally-derived workflow denominator. This is a confirmed gap in the literature.

### B. Conditionally Admissible Baselines

| Rank | Baseline | Condition | Comparison Type |
|---|---|---|---|
| **B-1** | **AutoE2E** (ICSE 2025) | Angular SPA compatibility unconfirmed; denominator is "features" not "workflows"; requires pilot to assess feature↔workflow mapping tractability | **Mapped** (semi-quantitative structural comparison on shared subjects) |

### C. Inadmissible Baselines

| Baseline | Reason |
|---|---|
| WebTestPilot (FSE 2026) | Requires manual NL spec authoring; concurrent paper |
| Crawljax (TWEB 2012) | No executable tests; DOM state denominator |
| FragGen (TSE 2022) | No public code |
| DANTE (ICST 2020) | Submission material only; wrong denominator |
| GenIA-E2ETest (SBES 2025) | Requires manual NL; insufficient scale |
| WebTestBench (arXiv 2026) | Synthesized apps; agent evaluation benchmark |
| SeeAct / PinATA | Agent traces; wrong denominator |
| TESTAR | Scriptless; random exploration |
| Testilizer | Requires seed test suite |
| All mobile tools | Wrong domain |

---

## E. Best Baseline Recommendation

### Recommended outcome: **Option 3 — Structural comparison, not quantitative replication**

**Rationale:**

The denominator gap between AutoE2E and SoftScanner FA is not a technical gap that can be bridged by engineering — it is a **fundamental methodological difference**:

| Dimension | AutoE2E | SoftScanner FA |
|---|---|---|
| Input | Running app (black-box) | Source code (white-box) |
| Denominator | LLM-inferred features (non-deterministic) | Formally derived TaskWorkflows (deterministic) |
| Granularity | User-centric capabilities ("create a project") | Widget-trigger-centric actions ("Button B submits Form F") |
| Reproducibility | Varies across LLM runs | Byte-identical across runs |
| Oracle | None (coverage only) | Postcondition assertions |
| Test format | LLM-generated scripts | Template-emitted Selenium WebDriver |
| Shared subject (traduora) | 41 features | 109 workflows |
| Ratio | ~1 feature : ~2.7 workflows | — |

Claiming "70.3% vs 79%" would be comparing percentages over fundamentally different denominators. This is the kind of false comparison that weakens a paper.

### Recommended structural comparison design

Instead of a head-to-head metric contest, the paper should:

1. **Position AutoE2E as the state of the art** in dynamic/LLM-driven E2E test generation (ICSE 2025, 79% feature coverage on E2EBench). Cite it as the strongest published result in the space.

2. **Articulate the complementary contribution** of SoftScanner FA: we solve a different problem (deterministic, source-driven, reproducible test derivation) that AutoE2E does not address. Specifically:
   - Our denominator is formal and reproducible (A2 enumeration is deterministic)
   - Our tests have postcondition oracles (AutoE2E only measures coverage, not correctness)
   - Our pipeline requires no LLM, no API keys, no running app at generation time
   - Our approach works on the source code lifecycle (pre-deployment)

3. **Report shared-subject structural overlap** on ever-traduora:
   - AutoE2E: 41 features, X% covered (from their paper)
   - SoftScanner FA: 109 workflows, 47.7% C3 (from our benchmark)
   - Qualitative mapping: "Feature F maps to workflows W1..Wk" for a sample of features
   - Do NOT compute a single comparable percentage

4. **Acknowledge the limitation honestly**: "No existing public baseline shares our workflow-level denominator, precluding direct quantitative comparison. AutoE2E (ICSE 2025) represents the closest related work but operates on a fundamentally different task formulation (LLM-inferred features vs. statically derived workflows)."

### Why not a feasibility pilot (Option 2)?

A pilot is possible (~2-3 weeks) but the expected outcome is already clear:
- AutoE2E will likely fail or produce degraded results on our Angular SPAs (its E2EBench subjects are mostly server-rendered)
- Even if it runs, the feature↔workflow mapping will be subjective and contested by reviewers
- The effort-to-insight ratio is poor: 2-3 weeks of engineering to produce a comparison that must be heavily caveated anyway
- For SEAA 2026, the structural comparison is sufficient and more honest

A pilot becomes worthwhile only if a reviewer specifically requests it. In that case, run AutoE2E on ever-traduora only (our largest shared subject) and report the mapping.

---

## F. Exact Next Action

**Action: Define the structural comparison section for the paper.**

No replication. No pilot. The paper should contain:

1. **Related Work §**: Position AutoE2E (ICSE 2025), Crawljax (TWEB 2012), WebTestPilot (FSE 2026), and the crawl-based testing family as the comparison landscape. Cite the two 2024-2025 surveys (arXiv:2412.10476, arXiv:2503.05378) for comprehensive coverage.

2. **Comparison table** (in Evaluation or Discussion):

| Dimension | SoftScanner FA | AutoE2E | Crawljax |
|---|---|---|---|
| Input | Source code | Running app | Running app |
| Analysis | Static (AST) | Dynamic (BFS + LLM) | Dynamic (DOM crawl) |
| Test denominator | TaskWorkflows (deterministic) | Features (LLM-inferred) | DOM states |
| Test output | Selenium WebDriver | E2E scripts | State-flow graph |
| Oracle type | Postcondition assertions | None (coverage only) | None |
| Reproducibility | Byte-identical | Non-deterministic | Deterministic |
| LLM dependency | None | Required (API cost) | None |
| Running app needed | At execution (B3) only | At generation + execution | At generation |
| Venue | SEAA 2026 | ICSE 2025 | ACM TWEB 2012 |

3. **Shared-subject note**: "Our benchmark includes ever-traduora, which is also a subject in AutoE2E's E2EBench. AutoE2E identifies 41 features (79% covered); we enumerate 109 TaskWorkflows (47.7% C3). The granularity difference (1 feature ≈ 2.7 workflows) reflects the methodological distinction between user-centric feature inference and trigger-level workflow enumeration."

4. **Limitation statement**: "Direct quantitative comparison with AutoE2E is precluded by the incommensurable denominators. Our contribution is complementary: deterministic, source-driven workflow derivation vs. dynamic, LLM-driven feature discovery."

---

*Study completed 2026-04-22. Frozen benchmark: 213/303 = 70.3% C3.*
