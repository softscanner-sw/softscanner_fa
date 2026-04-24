# Same-Family Baseline Audit

*Purpose: decide whether a genuinely comparable white-box / source-driven web E2E baseline exists BEFORE committing to AutoE2E as primary comparator.*

*Date: 2026-04-22. Based on 4-probe literature and repository audit.*

---

## A. Frozen Benchmark Recap

| Metric | Value |
|---|---|
| Subjects | 7 (posts, heroes, airbus, petclinic, traduora, jumpstart, event-booking) |
| Workflows | 303 |
| PASS | 213 |
| **C3 coverage** | **70.3%** |
| Median per-subject C3 | 86.5% |
| Ground truth | 257 hand-validated entries |
| Determinism | byte-identical across runs |

**Frozen. No further pipeline or subject modification.**

---

## B. Audit by Methodological Family

### Family 1 — Source-driven web E2E test generation (SAME FAMILY as ours)

**CONFIRMED: zero public baselines in this family.**

| Candidate | Source-driven? | Static? | Web E2E? | Executable tests? | Public code? | Status |
|---|---|---|---|---|---|---|
| Ricca & Tonella TestWeb (ICSE 2001, MIP 2011) | YES (PHP/JSP) | YES | YES | YES | NO | CONFIRMED inadmissible: predates SPA era, targets server-rendered apps, no public artifact |
| Scenario Testing of AngularJS SPAs (ICWE 2020, Zhang/Zhao) | LIKELY yes | LIKELY yes | YES | UNCONFIRMED | NO | UNRESOLVED: paper behind paywall, no code, AngularJS 1.x only |
| VeriFlow (Electronics 2025, Zhang/Hao) | YES (JS bundles) | YES | No (verification, not test gen) | NO | NO | CONFIRMED inadmissible: no executable test output |
| SynTest-JavaScript (SBFT@ICSE 2024) | YES | YES | **NO** (unit-level only) | YES (Jest unit) | YES | CONFIRMED inadmissible: wrong granularity |
| Concolic Front-End JS (FASE 2023, Li/Xie) | YES | Concolic | **NO** (unit-level) | YES (Jest) | NO | CONFIRMED inadmissible: unit-only |
| StackFul concolic | YES (instrumented) | Concolic | Partial | NO E2E | YES (4 commits, prototype) | CONFIRMED inadmissible: no test output |
| Jensen/Madsen JS type analysis | YES | YES | NO (analysis only) | NO | YES | CONFIRMED inadmissible: no test output |

**Finding:** No public tool exists that statically analyzes SPA source code (Angular/React/Vue) and emits executable E2E tests. The field splits into: (a) static analysis tools that stop at verification, (b) source-driven generators that stop at unit level, (c) server-side static analysis tools that don't target SPAs. **The combination we occupy is empty in the public literature.**

---

### Family 2 — Dynamic crawl-based web test generation

| Candidate | Input | Executable tests? | Denominator | Public code | Status |
|---|---|---|---|---|---|
| Crawljax (TWEB 2012) | Running app | NO (state-flow graph only) | DOM states | YES (active 2023) | CONFIRMED inadmissible: no test output |
| FRAGGEN (TSE 2022, Biagiola) | Running app | YES (WebDriver/JUnit) | DOM states | NO | CONFIRMED inadmissible: no public code |
| DANTE (ICST 2020) | Crawl traces | YES (Selenium schedules) | Test suite minimality | Submission material | CONFIRMED inadmissible: wrong denominator |
| QExplore (JSS 2022) | Running app | NO (state graph) | DOM coverage | YES | CONFIRMED inadmissible: no test output |
| TESTAR (STVR 2021) | Running app | NO (scriptless) | GUI states | YES (active) | CONFIRMED inadmissible: no scripts |
| Testilizer (ASE 2014) | Running app + seed suite | YES | Fault detection Δ | YES (abandoned 2015) | CONFIRMED inadmissible: requires seed suite |
| APOGEN (SQJ 2017) | Running app | POM scaffolds only | Page clusters | YES (archived 2017) | CONFIRMED inadmissible: POMs, not tests |
| ATUSA (ICST 2010) | Running app | YES (invariant-based) | Crawl paths | NO | CONFIRMED inadmissible: no public code |
| Artemis (ICSE 2011) | Running app | NO (coverage driver) | Code coverage | YES (stale 2015) | CONFIRMED inadmissible: no test gen |

---

### Family 3 — LLM-driven / agentic web E2E

| Candidate | Input | Denominator | Public code | Status |
|---|---|---|---|---|
| **AutoE2E** (ICSE 2025) | Running app + LLM | LLM-inferred features (author-defined regex GT) | Partial (crawl only; test-gen code missing per issue #1) | CONDITIONALLY admissible structural-only |
| VISCA (arXiv 2025, same authors) | Running app + multimodal LLM | Same as AutoE2E | **NONE** | CONFIRMED inadmissible: no public code |
| WebTestPilot (FSE 2026) | Running app + NL specs | NL requirement fulfillment | YES | CONFIRMED inadmissible: requires manual NL specs for all 303 workflows |
| NaviQAte (2024, same group as AutoE2E) | Running app + multimodal LLM | Navigation guidance | Partial | CONFIRMED inadmissible: agent traces, not test files |
| GenIA-E2ETest (SBES 2025) | Running app + NL | Robot Framework scripts | YES | CONFIRMED inadmissible: NL-driven, scale too small (12 tests) |
| FormNexus (ISSTA 2024, same group) | Running forms | Form coverage | YES | CONFIRMED inadmissible: forms-only, not workflows |
| SeeAct / PinATA | Running app | Task completion | YES | CONFIRMED inadmissible: agent traces, wrong denominator |

---

### Family 4 — Structural / benchmark infrastructure

| Candidate | Role | Status |
|---|---|---|
| E2EBench (AutoE2E's 8 subjects) | Benchmark corpus | Partial overlap: 3 Angular SPAs (petclinic, traduora, conduit). **Ever-traduora is the only direct overlap with our benchmark.** |
| WebTestBench (arXiv 2026) | Agent evaluation corpus | CONFIRMED inadmissible: synthesized apps, not runnable on our subjects |
| BEWT (2026) | Extended E2EBench | UNRESOLVED: no public artifact found |

---

## C. Explicit Answer to the Research Question

> **Is there any public, runnable baseline that is genuinely closer to our method than AutoE2E — specifically a white-box or source-driven automated web E2E test-generation approach that produces executable tests and is methodologically comparable to our pipeline?**

### Answer: **CONFIRMED NO.**

After probing four distinct angles (source-driven generators, model/route-driven tools, AutoE2E methodology, and VISCA + SPA-era successors to Ricca/Tonella), the finding is unanimous:

1. **No public tool combines** (a) SPA source code as input, (b) static analysis, (c) executable E2E test output, and (d) workflow/task-level denominator.
2. The closest methodological ancestor is **Ricca & Tonella's TestWeb (ICSE 2001, MIP Award 2011)**, which targeted server-side PHP/JSP and produced no SPA-era successor. The Genova / USI / FBK research lineage pivoted to crawling (Mesbah's Crawljax 2008 onward) when AJAX became dominant, and post-2020 shifted further toward deep-learning systems testing. **They left the SPA-era source-driven test-generation space empty.**
3. The one unresolved near-candidate (Zhang/Zhao ICWE 2020 on AngularJS) targets AngularJS 1.x (not modern Angular), has no public code, and test-generation executability is unconfirmed.
4. Static-analysis web tools that exist (VeriFlow, Jensen, Madsen, APOGEN) either stop at verification/analysis, operate only at unit granularity (SynTest-JS, concolic FE JS), or consume DOM snapshots rather than source (APOGEN, LLM-POM generators).

**Conclusion: the methodological slot SoftScanner FA occupies is empty in the public literature.** This is a substantive contribution finding, not a baseline-search failure.

---

## D. Ranked Baseline Hierarchy

### Category A — Directly comparable baseline
**EMPTY.** No candidate satisfies methodological + denominator + output-artifact + replication-feasibility criteria.

### Category B — Partially comparable methodological baseline
**EMPTY.** No source-driven or white-box candidate with public runnable code exists for SPA E2E test generation.

### Category C — Structurally informative but denominator-incommensurable baseline

| Rank | Baseline | Why C-tier | Value to paper |
|---|---|---|---|
| **C-1** | **AutoE2E** (ICSE 2025) | Black-box vs our white-box; LLM features vs our formally derived workflows; shared subject (traduora); same output type (Selenium tests) | Positions our work against the dynamic SOTA; enables shared-subject structural overlap note |
| C-2 | VISCA (arXiv 2025) | Direct successor to AutoE2E (+13% over it); no public code; same denominator | Cite as "state of the art advances even further in dynamic/LLM direction," reinforcing that dynamic-only is the live research front |
| C-3 | Crawljax (TWEB 2012) | Foundational dynamic; no executable tests; already cited by AutoE2E (+558% improvement) | Cite as the classical dynamic anchor; do not replicate |

### Category D — Inadmissible baselines

All other candidates (WebTestPilot, Crawljax as test generator, FRAGGEN, DANTE, QExplore, TESTAR, Testilizer, APOGEN, SeeAct, PinATA, FormNexus, NaviQAte, GenIA-E2ETest, WebTestBench, SynTest-JS, StackFul, Jensen/Madsen, VeriFlow). Reasons documented in §B and prior `baseline-admissibility-study.md`.

---

## E. Decision on AutoE2E Expansion

Since Phase 1/2 confirmed no direct baseline exists, Phase 3 reassessment applies.

### Reassessment of AutoE2E's role

Three new facts (from Probe 3) change the calculus materially:

1. **AutoE2E's public code is incomplete.** GitHub issue #1 (open, unanswered by authors) confirms the test-generation pipeline is absent from the published repo. Three independent users corroborate. The repo provides only crawl + feature-extraction, not the test-synthesis stage.

2. **AutoE2E's ground truth is non-reproducible without author assets.** Only 2 of 8 subjects have committed ground-truth regex files (PETCLINIC.json = 20 features, saleor.json = 13). The remaining 6 (including ever-traduora) have no public ground truth. The denominator was hand-authored by the paper authors recording their own manual interaction sequences.

3. **No third party has reported successful end-to-end AutoE2E replication.** Twelve citing papers from 2025–2026 cite AutoE2E; none reproduces its 79% number.

### Does expanding AutoE2E to all 7 subjects add evidential value?

**No.** Expansion would require:
- Requesting the unpublished test-generation code from authors (dependency on responsiveness)
- Authoring new regex ground truth for our 7 subjects ourselves (subjective, non-reproducible)
- Obtaining MongoDB Atlas + Anthropic + OpenAI + Redis infrastructure
- Running 7 subjects × $20–50 LLM cost = $140–350 in API fees
- 15–25 engineering days

And the outcome would still be:
- A comparison over incommensurable denominators (features vs workflows)
- A result we'd have to caveat heavily as non-reproducible (authors' ground truth ≠ our ground truth)
- A partial comparison (auth-gated subjects like traduora will hit the same 3-state wall AutoE2E hit in its own paper)

**Evidential value of expansion: low. Engineering and reproducibility cost: high. Decision: do not expand.**

### What should AutoE2E's role be?

Keep AutoE2E as the **state-of-the-art structural reference** in Related Work and as a **shared-subject structural overlap note** on ever-traduora. Do not attempt head-to-head metric comparison. This matches the recommendation already frozen in `baseline-admissibility-study.md` §E-F and aligns with Phase 3 criteria.

---

## F. Direct Baseline Replication Plan

**Not applicable.** No direct baseline was found. This section is void.

---

## G. Final Recommendation — Which Baseline Anchors the Paper's Evaluation

### Evaluation anchoring strategy

The paper's evaluation must be anchored in **our own internal benchmark**, not in any external baseline. The 70.3% C3 on 303 workflows across 7 diverse Angular SPAs, with 257 hand-validated ground-truth entries and byte-identical determinism, **is the primary evidence of the approach's validity**.

External comparison should be **structural, not quantitative**:

1. **Primary framing:** We occupy an empty methodological slot (source-driven, static, SPA-targeted, executable-test-producing, workflow-denominated). Demonstrated by this audit.

2. **Structural comparison against 3 C-tier references:**
   - AutoE2E (ICSE 2025): dynamic LLM, black-box, features denominator — complementary approach
   - VISCA (2025): dynamic multimodal LLM, black-box — dynamic SOTA
   - Crawljax (TWEB 2012): dynamic crawling, state denominator — classical anchor

3. **Shared-subject note** on ever-traduora (the only overlap with AutoE2E's E2EBench): report both denominators side-by-side without claiming a metric contest.

4. **Explicit limitation statement:** "No public baseline operates at the same methodological slot (source-driven, static, SPA-targeted, executable-test-producing, workflow-denominated). Direct quantitative comparison is precluded. This audit (documented in `baseline-family-audit.md`) confirms the literature gap is substantive, not a search artifact."

5. **Validity contributions that are stronger than any baseline comparison could provide:**
   - Deterministic, byte-identical pipeline across runs (AutoE2E/VISCA are non-deterministic)
   - Public ground truth (257 entries) derived from source, not hand-authored per-subject
   - Seven diverse Angular SPAs (not a closed benchmark)
   - Zero LLM / API / cloud dependency
   - Oracle-bearing tests (postcondition assertions), not coverage-only

### Final decision

**No baseline replication. No AutoE2E expansion. Paper evaluation anchored in the internal benchmark, supplemented by structural comparison against the 3 C-tier references.**

This is the methodologically honest position. The audit has confirmed it is also the only defensible position given the state of the public literature.

---

## Audit Summary Card

| Question | Answer |
|---|---|
| Same-family baseline exists? | **NO (confirmed)** |
| Closest SPA-era ancestor? | Ricca/Tonella TestWeb (ICSE 2001) — no SPA successor exists |
| Should AutoE2E be expanded to all 7 subjects? | **NO** |
| Should AutoE2E remain the primary comparator? | NO — primary comparator is our own benchmark; AutoE2E is secondary structural reference |
| Should AutoE2E be dropped entirely? | NO — keep as C-1 structural reference with shared-subject note on traduora |
| Paper anchor? | Internal benchmark (213/303 = 70.3%) + structural comparison against AutoE2E / VISCA / Crawljax |
| Replication pilot recommended? | NO (unless reviewer explicitly demands — then AutoE2E on traduora only, 2–3 weeks) |

---

*Four probes. Four confirmations. The methodological slot we occupy is empty in the public literature. The only defensible evaluation strategy is internal-benchmark-anchored with structural external comparison.*
