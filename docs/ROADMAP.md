# Roadmap
## Stage 0 — Paper + spec binding (DONE)

* docs/paper/main.pdf
* docs/paper/approach.md

---

## Stage 1 — Finalize A1 (DONE)

Exit criteria:

* All acceptance gates pass:

  * `npm run typecheck`
  * `npm test`
  * `npm run lint`
  * `npm run verify:determinism`
* Manual bundle inspection confirms:

  * node set includes Virtual/Route/Component/External
  * Route→Component UI_EFFECT transitions exist for every ComponentRoute
  * UI-triggered + programmatic navigation transitions originate from Component nodes
  * `transition.signature` and transition sorting match approach.md §3.4.2–§3.4.3
  * `stableIndex` assigned per (from,to) group per approach.md §3.4.1
* CLI writes output artifacts deterministically (default outputDir supported)
* Route extraction handles `RouterModule.forRoot(routes)` when routes is an identifier (including cross-file)

Artifacts:

* NavigationGraphBuilder aligned with spec
* RouteParser identifier resolution + unit tests
* In-repo minimal Angular fixture + orchestrator integration tests
* Determinism regression coverage
* Toolchain configs (ESLint/Jest/ts-jest/tsconfig.test)
* docs/validation/subjects.md

---

## Stage 2 — GitHub stabilization (DONE)

1. Documentation hardening

* Update `docs/validation/subjects.md` with explicit rule:

  * **tsconfig must include source files; solution-style tsconfig with `files: []` yields empty extraction by design.**
* Update `README.md` to reflect:

  * Phase A1 scope only (A2/A3/B blocked)
  * CLI usage + default outputDir behavior
  * 8 output artifact files list
  * determinism guarantee + verify command
  * tsconfig requirements (must include sources; recommend app tsconfig)
  * link to `docs/validation/subjects.md`

2. Repository publication

* Initialize git repo (if not already)
* Commit with Conventional Commits
* Push to GitHub

3. CI + release gate

* Add CI workflow running:

  * `npm ci`
  * `npm run typecheck`
  * `npm test`
  * `npm run lint`
  * `npm run verify:determinism`
* Protect `main` (require CI checks)
* Before tagging:

  * re-run acceptance protocol locally
  * re-run the three manual subjects commands (from `docs/validation/subjects.md`)
* Tag release: `v0.1-a1`

Exit criteria:

* CI green on `main`
* `v0.1-a1` tag exists on GitHub
* README documents A1 + schema + determinism + tsconfig rule
* Branch protection validated by a merged PR under required checks.

---

## Stage 3 — Begin A2 (ACTIVE once A2 scaffold branch exists)

Branch: `feat/a2-bounded-paths`
Implement bounded entry-to-terminal enumeration over exported G only (no AST re-read).

---