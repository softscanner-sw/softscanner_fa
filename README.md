# SoftScanner — Automated End-to-End Test Generation for Web Applications

> End-to-end automated test generation pipeline for Angular frontends: statically extracts a navigation-interaction multigraph, enumerates user-trigger workflows, derives test plans, generates Selenium WebDriver tests, executes them against a live application, and reports tiered coverage.

---

## Overview

SoftScanner Frontend Analyzer (SoftScanner FA) implements a multi-phase pipeline that goes from Angular source code to executable Selenium tests — with zero manual test authoring.

```
Source code (TypeScript + Angular templates)
    |
    v
+-- Phase A (static, deterministic) -------------------------+
|                                                             |
|  A1: Parsers -> Analyzers -> NavigationGraphBuilder         |
|      => A1Multigraph (nodes, edges, constraints)            |
|                                                             |
|  A2: GraphIndex -> TaskEnumerator -> Classifier             |
|      => A2WorkflowSet (classified single-trigger workflows) |
+-------------------------------------------------------------+
    |
    v
+-- Phase B (manifest-driven, deterministic until B3) -------+
|                                                             |
|  B0: SubjectManifest validation (accounts, params, auth)    |
|  B1: RealizationIntent + ActionPlan derivation              |
|  B2: Selenium WebDriver test code generation                |
|  B3: Test execution (bounded retry, failure classification) |
|  B4: Tiered coverage reporting (C1/C2/C3)                  |
+-------------------------------------------------------------+
    |
    v
Per-subject results: pass/fail, screenshots, coverage report
```

---

## Current status

| Stage | Status | Description |
|---|---|---|
| Phase A1 | COMPLETE | Deterministic multigraph extraction (6 node kinds, 18 edge kinds) |
| Phase A2 | COMPLETE | TaskWorkflow enumeration (257 workflows across 6 subjects) |
| B0 | COMPLETE | Manifest validation + seed contract (6/6 subjects valid) |
| B1 | COMPLETE | Intent + plan derivation (257/257 GT matched) |
| B2 | COMPLETE | Test code generation (257/257, 100% generation rate) |
| B3/B4 | COMPLETE | 5-subject benchmark baseline (integrity-verified) |
| B5.0 | COMPLETE | Observability contract (structured logs, unified screenshots, pipeline JSONL) |
| B5.1 | PARTIAL | Adaptive timeouts, CDP network evidence (batched) |
| B5.2–B5.6 | DEFERRED | Execution enhancements (see approach.md §B5) |

### Benchmark results (integrity-verified, environment-clean)

> Authoritative source: `docs/ROADMAP.md` Stage 5. Summary below for quick reference.

| Subject | C3 | Pass/Total | Status |
|---|---|---|---|
| posts-users-ui-ng | 88.9% | 16/18 | Closed |
| heroes-angular | 89.5% | 17/19 | Closed |
| airbus-inventory | 90.5% | 19/21 | Closed |
| spring-petclinic-angular | 74.3% | 55/74 | Closed |
| ever-traduora | 45.0% | 49/109 | Closed |
| softscanner-cqa-frontend | — | — | Not executed |
| **Aggregate** | **64.7%** | **156/241** | **85 residuals** |

---

## Design invariants

| Invariant | Description |
|---|---|
| **Deterministic** | Same codebase + config -> identical output (stable IDs, stable ordering). |
| **Traceable** | Every node and edge carries `SourceRef` pointers back to source file + char offset. |
| **Bounded** | Constraints are summaries only. Template snippets are length-capped. |
| **Phase-isolated** | Each phase consumes only the prior phase's serialized JSON. No cross-phase AST access. |

---

## Project structure

```
softscanner_fa/
+-- src/
|   +-- models/                         # Data model (type-only)
|   +-- parsers/                        # Thin, deterministic AST adapters (ts-morph, @angular/compiler)
|   +-- analyzers/                      # Domain analyzers (routes, templates, business logic, guards)
|   +-- builders/                       # Aggregate analyzer outputs into Multigraph
|   +-- orchestrator/                   # End-to-end A1 pipeline
|   +-- workflows/                      # A2: TaskWorkflow enumeration (A1Multigraph only)
|   +-- visualization/                  # Pure consumer of A1/A2 artifacts
|   +-- phase-b/                        # Phase B modules (isolated from Phase A)
|   |   +-- b0/                        # Manifest validation
|   |   +-- b1/                        # Intent + plan derivation
|   |   +-- b2/                        # Selenium test code generation
|   |   +-- b3/                        # Test execution + bounded retry
|   |   +-- b4/                        # Coverage computation
|   +-- services/                       # Utility services (I/O, cache, validate, export)
|   +-- a1-cli.ts, a2-cli.ts          # Phase A CLIs
|   +-- b0-cli.ts .. b3-cli.ts        # Phase B CLIs
|   +-- viz-cli.ts                     # Visualization CLI
|
+-- subjects/                           # Per-subject manifests
|   +-- <subject>/subject-manifest.json
|
+-- output/                             # Generated artifacts (per-subject)
|   +-- <subject>/json/                # A1, A2, B1, B2, B3, B4 JSON artifacts
|   +-- <subject>/tests/               # Generated Selenium test files
|   +-- <subject>/screenshots/         # B3 execution screenshots
|
+-- scripts/                           # Determinism verifiers, batch runners
+-- docs/
|   +-- paper/approach.md             # Normative spec (authoritative)
|   +-- paper/scientific-report.md    # Scientific/technical report
|   +-- ROADMAP.md                    # Work sequencing and gates
|   +-- validation/protocols/         # Benchmark + diagnostic protocols
|   +-- validation/manifest/          # B0 manifest guide + subject onboarding
|   +-- validation/runbooks/          # Per-subject setup runbooks
|   +-- analysis/phase-b/             # Diagnostic catalog, GT data, design docs
|
+-- .github/workflows/ci.yml         # CI: typecheck + test + build + lint + determinism
```

---

## Getting started

### Prerequisites
- Node.js >= 18
- npm >= 9
- Chrome/Chromium (for B3 Selenium execution)

### Install
```bash
npm install
```

### Acceptance gates
```bash
npm run typecheck        # source typecheck (tsconfig.src.json)
npm run typecheck:tests  # test typecheck (tsconfig.test.json)
npm test                 # unit + integration tests (267 tests)
npm run lint             # ESLint
```

---

## CLI reference

### Phase A — Static extraction
```bash
npm run a1 -- <projectRoot> <tsConfigPath> [outputDir] [--debug]   # A1 multigraph
npm run a2 -- <a1BundlePath> [outputDir]                            # A2 workflows
npm run viz -- <outputDir>                                          # Visualization
npm run run:all                                                     # All 6 subjects
```

### Phase B — Test generation and execution
```bash
npm run b0:validate                        # Validate all subject manifests
npm run b0:wizard                          # Interactive manifest generation wizard
npm run b1:intents                         # Derive RealizationIntents (all subjects)
npm run b1:plans                           # Generate ActionPlans (all subjects)
npm run b2:codegen                         # Generate Selenium tests (all subjects)

# B3 test execution (requires live app — do NOT use npm run b3)
node node_modules/tsx/dist/cli.mjs src/b3-cli.ts <subjectName> [--max-retries N] [--batch-size N]
```

### Determinism verification
```bash
npm run verify:determinism -- "<projectRoot>" "<tsConfigPath>"   # A1 + A2
npm run verify:b0-determinism                                     # B0
npm run verify:b1-determinism                                     # B1 intents
npm run verify:b1-plan-determinism                                # B1 plans
npm run verify:b2-determinism                                     # B2 codegen
```

---

## Output artifacts

### Per-subject (`output/<subject>/`)

| Directory | File | Phase | Contents |
|---|---|---|---|
| `json/` | `a1-multigraph.json` | A1 | Full multigraph (nodes, edges, stats) |
| `json/` | `a2-workflows.json` | A2 | Classified TaskWorkflows |
| `json/` | `b1-intents.json` | B1 | RealizationIntents |
| `json/` | `b1-plans.json` | B1 | ActionPlans |
| `json/` | `b2-tests.json` | B2 | Generation metadata |
| `json/` | `b3-results.json` | B3 | Execution results |
| `json/` | `b4-coverage.json` | B4 | Tiered coverage |
| `tests/` | `*.test.ts` | B2 | Generated Selenium WebDriver tests |
| `screenshots/` | `*.png` | B3 | Execution screenshots (per-test, unified via B5.0) |
| `logs/` | `*.log.json` | B5.0 | Per-test structured execution logs |
| `vis/` | `*.html`, `data.js` | Viz | A1 graph + A2 workflows + B3 execution dashboard |

### Framework/system logs (`logs/`)

| File | Phase | Format | Contents |
|---|---|---|---|
| `b0-pipeline.jsonl` | B0 | JSONL | Manifest validation events |
| `b1-intent-pipeline.jsonl` | B1 | JSONL | Intent derivation events |
| `b1-plan-pipeline.jsonl` | B1 | JSONL | Plan generation events |
| `b2-pipeline.jsonl` | B2 | JSONL | Code generation events |
| `b3-pipeline.jsonl` | B3 | JSONL | Test execution events (per-test outcomes) |
| `a1-pipeline.jsonl` | A1 | JSONL | Extraction events |
| `a2-pipeline.jsonl` | A2 | JSONL | Enumeration events |
| `viz-pipeline.jsonl` | VIZ | JSONL | Visualization generation events |

Framework logs use `PipelineLogEvent` schema: timestamp, phase, operation, subject, severity, event, message, duration, outcome, context. Separate from per-test B5.0 observability logs.

---

## The model

### Node kinds (6)
Module, Route, Component, Widget, Service, External

### Edge kinds (18)
**Structural (11):** MODULE_DECLARES_COMPONENT, MODULE_DECLARES_ROUTE, MODULE_IMPORTS_MODULE, MODULE_EXPORTS_MODULE, MODULE_PROVIDES_SERVICE, ROUTE_ACTIVATES_COMPONENT, ROUTE_HAS_CHILD, COMPONENT_CONTAINS_WIDGET, WIDGET_CONTAINS_WIDGET, COMPONENT_COMPOSES_COMPONENT

**Executable (7):** WIDGET_NAVIGATES_ROUTE, WIDGET_NAVIGATES_EXTERNAL, WIDGET_TRIGGERS_HANDLER, WIDGET_SUBMITS_FORM, COMPONENT_CALLS_SERVICE, COMPONENT_NAVIGATES_ROUTE, ROUTE_REDIRECTS_TO_ROUTE

### TaskWorkflow (A2)
One workflow per user-trigger edge. Steps = trigger + handler-scoped service calls + optional navigation + redirect closure. Verdict: FEASIBLE / CONDITIONAL / PRUNED.

### Phase B pipeline
B0 validates manifests. B1 derives intents and plans (locators, values, preconditions, postconditions). B2 generates Selenium tests. B3 executes with bounded retry and 7-category failure classification. B4 reports C1 (plan) / C2 (code) / C3 (execution) coverage.

---

## Validation subjects

Six Angular applications (Angular 12–18) validate the pipeline. See:
- **Subject registry** (paths, frameworks, A1 commands): `docs/validation/empirical reports/subjects.md`
- **Setup runbooks**: `docs/validation/runbooks/<subject>-setup.md`
- **Manifest values**: `docs/validation/manifest/subject-onboarding-guide.md`
- **Benchmark results**: `docs/ROADMAP.md` (Stage 5 results table)

---

## Authoritative documentation

| File | Responsibility |
|---|---|
| `docs/paper/approach.md` | Normative semantics, schemas, Phase B spec |
| `docs/paper/scientific-report.md` | Scientific/technical report with empirical results |
| `docs/ROADMAP.md` | Work sequencing, stage gates, benchmark results |
| `CLAUDE.md` | Implementation discipline, architectural rules, B3 execution invariants |
| `docs/validation/protocols/` | Benchmark execution protocol, diagnostic protocol |
| `docs/validation/manifest/` | B0 manifest guide, subject onboarding guide |
| `docs/validation/runbooks/` | Per-subject setup/teardown runbooks |
| `docs/validation/empirical reports/subjects.md` | Subject registry (paths, frameworks, commands) |
| `docs/analysis/phase-b/diagnostic-reclassification-report.md` | Current residual failure catalog |
| `docs/analysis/phase-b/gt/*.json` | Ground truth data (257 entries across 6 subjects) |

---

## How to add a new subject

1. Run A1: `npm run a1 -- <projectRoot> <tsConfigPath>`
2. Run A2: `npm run a2 -- output/<subject>/json/a1-multigraph.json`
3. Create manifest: `subjects/<subject>/subject-manifest.json` (or use `npm run b0:wizard`)
4. Validate: `npm run b0:validate`
5. Generate: `npm run b1:intents && npm run b1:plans && npm run b2:codegen`
6. Create setup runbook: `docs/validation/<subject>-setup.md`
7. Start the application per the runbook
8. Execute: `npm run b3 -- <subject>`

---

## CI checks (branch protection)

| Check | Job |
|---|---|
| Typecheck & Test (Node 18/20/22) | typecheck-and-test matrix |
| Build | build |
| Lint | lint |
| Determinism | determinism |

---

## Contributing

See [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md).

---

## License

MIT
