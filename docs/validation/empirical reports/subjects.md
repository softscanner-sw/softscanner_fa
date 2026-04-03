# Validation Subjects — Registry

This document is the canonical registry of the six validation subjects used across all phases of the pipeline. It records subject identity, local paths, and A1 extraction commands.

For all other information, see:
- **Setup/teardown:** `docs/validation/runbooks/<subject>-setup.md`
- **Manifest values:** `docs/validation/manifest/subject-onboarding-guide.md`
- **CLI reference:** `README.md` (Phase A + Phase B commands)
- **Benchmark results:** `docs/ROADMAP.md` (Stage 5 results table)
- **Residual analysis:** `docs/analysis/phase-b/diagnostic-reclassification-report.md`
- **Output artifact formats:** `README.md` (Output artifacts section)

---

## Subject metadata

| # | Name | Local path | Framework | tsconfig |
|---|------|-----------|-----------|----------|
| 1 | posts-users-ui-ng | `C:/Users/basha/git/github/posts-users-ui-ng` | Angular 18 | `tsconfig.json` |
| 2 | spring-petclinic-angular | `C:/Users/basha/git/github/autoe2e/benchmark/pet-clinic/spring-petclinic-angular` | Angular 14 | `tsconfig.json` |
| 3 | heroes-angular | `C:/Users/basha/git/github/heroes-angular` | Angular 14 | `src/tsconfig.app.json` |
| 4 | softscanner-cqa-frontend | `C:/Users/basha/git/softscanner/softscanner-continuous-quality-assessment-frontend` | Angular 17.3 | `tsconfig.app.json` |
| 5 | ever-traduora | `C:/Users/basha/git/github/autoe2e/benchmark/ever-traduora/webapp` | Angular 12.2 | `src/tsconfig.app.json` |
| 6 | airbus-inventory | `C:/Users/basha/git/github/Inventory-Management-System/AirbusInventory` | Angular 12.2 | `tsconfig.app.json` |

> **tsconfig note:** Always supply a tsconfig that directly includes source files (e.g., `tsconfig.app.json` for Angular CLI projects). A solution-style tsconfig with `"files": []` and only `"references"` entries yields zero source files in ts-morph.

---

## A1 extraction commands

```bash
# Subject 1 — posts-users-ui-ng
npm run a1 -- "C:/Users/basha/git/github/posts-users-ui-ng" tsconfig.json output/posts-users-ui-ng

# Subject 2 — spring-petclinic-angular
npm run a1 -- "C:/Users/basha/git/github/autoe2e/benchmark/pet-clinic/spring-petclinic-angular" tsconfig.json output/spring-petclinic-angular

# Subject 3 — heroes-angular
npm run a1 -- "C:/Users/basha/git/github/heroes-angular" src/tsconfig.app.json output/heroes-angular

# Subject 4 — softscanner-cqa-frontend
npm run a1 -- "C:/Users/basha/git/softscanner/softscanner-continuous-quality-assessment-frontend" tsconfig.app.json output/softscanner-cqa-frontend

# Subject 5 — ever-traduora
npm run a1 -- "C:/Users/basha/git/github/autoe2e/benchmark/ever-traduora/webapp" src/tsconfig.app.json output/ever-traduora

# Subject 6 — airbus-inventory
npm run a1 -- "C:/Users/basha/git/github/Inventory-Management-System/AirbusInventory" tsconfig.app.json output/airbus-inventory
```

## A2 enumeration commands

```bash
npm run a2 -- output/posts-users-ui-ng/json/a1-multigraph.json output/posts-users-ui-ng
npm run a2 -- output/spring-petclinic-angular/json/a1-multigraph.json output/spring-petclinic-angular
npm run a2 -- output/heroes-angular/json/a1-multigraph.json output/heroes-angular
npm run a2 -- output/softscanner-cqa-frontend/json/a1-multigraph.json output/softscanner-cqa-frontend
npm run a2 -- output/ever-traduora/json/a1-multigraph.json output/ever-traduora
npm run a2 -- output/airbus-inventory/json/a1-multigraph.json output/airbus-inventory
```

## Batch run

```bash
npm run run:all              # A1 + A2 + viz for all 6 subjects
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

| Subject | Benchmark | Results |
|---|---|---|
| posts-users-ui-ng | Executed | See `docs/ROADMAP.md` Stage 5 |
| heroes-angular | Executed | See `docs/ROADMAP.md` Stage 5 |
| airbus-inventory | Executed | See `docs/ROADMAP.md` Stage 5 |
| spring-petclinic-angular | Executed | See `docs/ROADMAP.md` Stage 5 |
| ever-traduora | Executed | See `docs/ROADMAP.md` Stage 5 |
| softscanner-cqa-frontend | Not executed | — |
