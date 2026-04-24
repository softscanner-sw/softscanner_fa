# Validation Subjects — Registry

This document is the canonical registry of the seven validation subjects used across all phases of the pipeline. It records subject identity, local paths, and A1 extraction commands.

For all other information, see:
- **Setup/teardown:** `docs/validation/runbooks/<subject>-setup.md`
- **Manifest values:** `docs/validation/manifest/subject-onboarding-guide.md`
- **CLI reference:** `README.md` (Phase A + Phase B commands)
- **Benchmark results:** `docs/ROADMAP.md` (Stage 5 results table)
- **Baseline comparator rationale:** `docs/analysis/phase-b/baseline-admissibility-study.md`, `docs/analysis/phase-b/baseline-family-audit.md`
- **Output artifact formats:** `README.md` (Output artifacts section)

---

## Subject metadata

| # | Name | Framework | tsconfig | Upstream repository (subdir within repo) |
|---|------|-----------|----------|------------------------------------------|
| 1 | posts-users-ui-ng | Angular 15 | `tsconfig.json` | `https://github.com/anonbnr/posts-users-ui-ng` |
| 2 | heroes-angular | Angular 11 | `src/tsconfig.app.json` | `https://github.com/johnpapa/heroes-angular` |
| 3 | airbus-inventory | Angular 12 | `tsconfig.app.json` | `https://github.com/Akash-goyal-github/Inventory-Management-System` (subdir `AirbusInventory/`) |
| 4 | spring-petclinic-angular | Angular 18 | `tsconfig.json` | `https://github.com/parsaalian/autoe2e` (subdir `benchmark/pet-clinic/spring-petclinic-angular/`) |
| 5 | ever-traduora | Angular 12 | `src/tsconfig.app.json` | `https://github.com/parsaalian/autoe2e` (subdir `benchmark/ever-traduora/webapp/`) |
| 6 | angular-jumpstart | Angular 20 (standalone, `@if`/`@for`) | `tsconfig.app.json` | `https://github.com/DanWahlin/Angular-JumpStart` |
| 7 | event-booking-mean | Angular 17 (NgModule, MEAN stack) | `tsconfig.app.json` | `https://github.com/bekitos101/Event-Booking-App-MEAN-STACK` (subdir `EventNest/Frontend/app/`) |

The A1 extraction commands below assume each subject is cloned locally under a common root (the examples use `C:/Users/basha/git/github/` for reference; substitute your local path).

> **tsconfig note:** Always supply a tsconfig that directly includes source files (e.g., `tsconfig.app.json` for Angular CLI projects). A solution-style tsconfig with `"files": []` and only `"references"` entries yields zero source files in ts-morph.

> **Modern Angular note:** Subject 6 (angular-jumpstart) uses Angular v17+ new control-flow syntax (`@if`, `@for`) and standalone-component lazy routing (`loadComponent`). A1 extraction supports these features. Pre-modernization, new control-flow blocks were silently dropped by the template parser and lazy-loaded components produced no `ROUTE_ACTIVATES_COMPONENT` edges.

> **Backend-stack diversity:** The corpus spans seven backend configurations (Express REST, JSON Server, Spring REST with H2, NestJS with MySQL, Spring Boot with MySQL, Express with MongoDB, Express with static JSON) and three authentication schemes (unauthenticated, JWT, credential-based). Four of the seven subjects are authentication-protected.

---

## A1 extraction commands

```bash
# Subject 1 — posts-users-ui-ng
npm run a1 -- "C:/Users/basha/git/github/posts-users-ui-ng" tsconfig.json output/posts-users-ui-ng

# Subject 2 — heroes-angular
npm run a1 -- "C:/Users/basha/git/github/heroes-angular" src/tsconfig.app.json output/heroes-angular

# Subject 3 — airbus-inventory
npm run a1 -- "C:/Users/basha/git/github/Inventory-Management-System/AirbusInventory" tsconfig.app.json output/airbus-inventory

# Subject 4 — spring-petclinic-angular
npm run a1 -- "C:/Users/basha/git/github/autoe2e/benchmark/pet-clinic/spring-petclinic-angular" tsconfig.json output/spring-petclinic-angular

# Subject 5 — ever-traduora
npm run a1 -- "C:/Users/basha/git/github/autoe2e/benchmark/ever-traduora/webapp" src/tsconfig.app.json output/ever-traduora

# Subject 6 — angular-jumpstart
npm run a1 -- "C:/Users/basha/git/github/Angular-JumpStart" tsconfig.app.json output/angular-jumpstart

# Subject 7 — event-booking-mean
npm run a1 -- "C:/Users/basha/git/github/Event-Booking-App-MEAN-STACK/EventNest/Frontend/app" tsconfig.app.json output/event-booking-mean
```

## A2 enumeration commands

```bash
npm run a2 -- output/posts-users-ui-ng/json/a1-multigraph.json output/posts-users-ui-ng
npm run a2 -- output/heroes-angular/json/a1-multigraph.json output/heroes-angular
npm run a2 -- output/airbus-inventory/json/a1-multigraph.json output/airbus-inventory
npm run a2 -- output/spring-petclinic-angular/json/a1-multigraph.json output/spring-petclinic-angular
npm run a2 -- output/ever-traduora/json/a1-multigraph.json output/ever-traduora
npm run a2 -- output/angular-jumpstart/json/a1-multigraph.json output/angular-jumpstart
npm run a2 -- output/event-booking-mean/json/a1-multigraph.json output/event-booking-mean
```

## Batch run

```bash
npm run run:all              # A1 + A2 + viz for all 7 subjects
npm run run:all -- --skip-a1 # reuse existing A1 bundles
```

## Phase B commands

```bash
# B0 — Manifest validation
npm run b0:validate

# B0 — Interactive manifest wizard
npm run b0:wizard

# B1 — Intent + plan derivation (all subjects)
npm run b1:intents
npm run b1:plans

# B2 — Test code generation (all subjects)
npm run b2:codegen

# B3 — Test execution (per subject, requires live app)
# IMPORTANT: use this exact invocation, NOT npm run b3
node node_modules/tsx/dist/cli.mjs src/b3-cli.ts <subjectName> --max-retries 1 --batch-size 10

# Determinism verification
npm run verify:b0-determinism
npm run verify:b1-determinism
npm run verify:b1-plan-determinism
npm run verify:b2-determinism
```

See `docs/validation/protocols/benchmark-execution-protocol.md` for the full benchmark protocol.
See `docs/validation/runbooks/<subject>-setup.md` for per-subject setup/teardown.

## Benchmark execution status

| Subject | Workflows | C1 | C2 | C3 | Pass/Total |
|---|---|---|---|---|---|
| posts-users-ui-ng | 18 | 100% | 100% | 94.4% | 17/18 |
| heroes-angular | 19 | 100% | 100% | 89.5% | 17/19 |
| airbus-inventory | 21 | 100% | 100% | 90.5% | 19/21 |
| spring-petclinic-angular | 74 | 100% | 100% | 86.5% | 64/74 |
| ever-traduora | 109 | 100% | 100% | 47.7% | 52/109 |
| angular-jumpstart | 47 | 100% | 100% | 76.6% | 36/47 |
| event-booking-mean | 15 | 100% | 100% | 53.3% | 8/15 |
| **Total (7 subjects)** | **303** | **100%** | **100%** | **70.3%** | **213/303** |

All runs are integrity-verified (303/303 per-test logs, 0 FAIL_INTEGRITY).
