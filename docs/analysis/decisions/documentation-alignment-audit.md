# Documentation Alignment Audit

**Date:** 2026-03-19

---

## 1. Authoritative Document Audit

### approach.md

| Claim | Spec says | Implementation does | Status |
|---|---|---|---|
| B1 Start Route Selection | "Prefer unguarded routes" (rule 2) | Prefers guarded when `guardNames.length > 0` (B1-G1) | **CONTRADICTORY** |
| B3 failure classifier rule 3 | `NoSuchElementError`, `StaleElementReferenceError` only | Also checks `InvalidArgumentError`, `ElementNotInteractableError` | **INCOMPLETE** |
| B1 form field key resolution | `formControlName → nameAttr → idAttr → fieldNodeId` | Also uses CSS `class` as compound selector before `fieldNodeId` | **INCOMPLETE** |
| Login credential materialization | Not mentioned | B1 uses manifest account credentials for login-route WSF | **MISSING** |
| Login WSF oracle | Not mentioned | `assert-no-crash` when WSF is on login route and terminal = start | **MISSING** |
| B2 viewport | Not mentioned | `--window-size=1920,1080` in Chrome options | **MISSING** (implementation detail) |
| B2 click mechanism | Not mentioned | JS click via `executeScript` for all click steps | **MISSING** (implementation detail) |
| B2 screenshots | Not mentioned | `driver.takeScreenshot()` at 3 checkpoints, path from `import.meta.url` | **MISSING** (implementation detail) |
| B3 file provisioning | Not mentioned | `/tmp/test-file.txt` created at B3 runtime | **MISSING** (implementation detail) |
| B3 subprocess PATH cleaning | Not mentioned | npm `node_modules` entries removed from subprocess PATH | **MISSING** (implementation detail) |
| Dynamic-ID postcondition | Correctly documented | Matches implementation | **CURRENT** |
| SubjectManifest schema | Correctly documented | Matches implementation | **CURRENT** |
| B4 CoverageReport schema | Correctly documented | Matches implementation | **CURRENT** |
| B3 ExecutionResult schema | Correctly documented | Implementation adds `attemptDetails`, `screenshots` (not in spec) | **INCOMPLETE** |

**Normative contradictions requiring spec amendment:**
1. Start Route Selection rule 2 — spec must document auth-aware preference
2. Failure classifier rule 3 — spec must add `InvalidArgumentError`, `ElementNotInteractableError`
3. Form field key resolution — spec must add CSS `class` step
4. Login credential materialization — spec must document the rule
5. Login WSF oracle — spec must document `assert-no-crash` for login-route WSF

**Implementation details NOT requiring spec amendment** (B2/B3 runtime details):
- Viewport size, JS click, screenshots, file provisioning, PATH cleaning

### ROADMAP.md

| Claim | Reality | Status |
|---|---|---|
| Stage 4e (B3 Execution) | "NOT STARTED" | **STALE** — B3 is implemented and running |
| Stage 5 (B4 Coverage) | Not mentioned | **INCOMPLETE** — B4 is implemented |
| Documentation consolidation | Not mentioned | **INCOMPLETE** — consolidation completed |

### CLAUDE.md

| Claim | Reality | Status |
|---|---|---|
| Phase B Architecture lists B0/B1/B2 only | B3/B4 exist at `src/phase-b/b3/`, `src/phase-b/b4/` | **STALE** |
| CLIs listed: b0, b1-intent, b1-plan, b2 | `b3-cli.ts` also exists with `npm run b3` | **STALE** |
| Determinism scripts: b0, b1, b1-plan, b2 | No B3 determinism script (B3 is non-deterministic by nature) | **CURRENT** (correct) |
| GT location: `docs/analysis/phase-b/gt/` | Still correct | **CURRENT** |

### README.md

| Claim | Reality | Status |
|---|---|---|
| Phase B status | Lists B0/B1/B2 only | **STALE** — B3/B4 implemented |
| Acceptance gates | 6 gates (no B3) | **CURRENT** (B3 is not a determinism gate) |
| Project description | "extraction pipeline" | **CURRENT** (accurate high-level) |

---

## 2. Derivative Document Audit

| File | Role | Alignment | Issues |
|---|---|---|---|
| foundations/phase-a.md | System description | **Aligned** | Matches approach.md and implementation |
| foundations/phase-b.md | System description | **Partially aligned** | Documents CURRENT implementation including features NOT YET in approach.md (auth-aware route selection, class locator, login credential, login oracle). Accurately describes reality but diverges from normative spec. |
| decisions/phase-b-evolution.md | Decision log | **Aligned** | Records evolution without redefining norms |
| runtime/airbus-inventory.md | Subject report | **Aligned** | Describes observed results accurately |
| runtime/posts-users-ui-ng.md | Subject report | **Aligned** | Describes observed results accurately |
| validation/README.md | Category index | **Aligned** | Correct structure |
| validation/runtime-conventions.md | Execution policy | **Aligned** | Matches B3 behavior |
| validation/subjects.md | Corpus registry | **Aligned** | Contains Phase A extraction commands (appropriate) |
| validation/airbus-inventory-setup.md | Subject runbook | **Aligned** | Reproducible commands |
| validation/posts-users-ui-ng-setup.md | Subject runbook | **Aligned** | Reproducible commands |
| validation/approach-evaluation-report.md | Evaluation | **Aligned** | Independent of pipeline evolution |
| validation/autoe2e-benchmark-evaluation-report.md | Evaluation | **Aligned** | Independent of pipeline evolution |

---

## 3. Minimum Required Corrections

### approach.md (normative spec — 5 amendments needed)

| # | Issue | Change |
|---|---|---|
| S1 | Start Route Selection contradicts implementation | Update rule 2: "If workflow requires auth guards, prefer guarded routes; otherwise prefer unguarded" |
| S2 | Failure classifier incomplete | Add `InvalidArgumentError` and `ElementNotInteractableError` to rule 3 |
| S3 | Form field key resolution incomplete | Add CSS `class` (compound selector) before `fieldNodeId` fallback |
| S4 | Login credential materialization missing | Add rule: WSF on login route uses manifest account credentials |
| S5 | Login WSF oracle missing | Add rule: WSF where start = terminal = loginRoute uses `assert-no-crash` |

### ROADMAP.md (sequencing doc — 3 updates needed)

| # | Issue | Change |
|---|---|---|
| R1 | Stage 4e marked NOT STARTED | Update to DONE with implementation summary |
| R2 | B4 stage missing | Add Stage 4f (B4 Coverage) as DONE |
| R3 | Documentation consolidation missing | Add Stage 4g or note under Stage 4 |

### CLAUDE.md (implementation discipline — 2 updates needed)

| # | Issue | Change |
|---|---|---|
| C1 | Phase B Architecture missing B3/B4 | Add B3/B4 subdirectories and `b3-cli.ts` |
| C2 | Phase B Isolation Rules missing B3 | Add B3 isolation rules (consumes B2 tests + running app) |

### README.md (project description — 1 update needed)

| # | Issue | Change |
|---|---|---|
| D1 | No mention of B3/B4 | Add B3/B4 to Phase B description and script list |

### foundations/phase-b.md (no change needed)

This file correctly describes the CURRENT implementation state. Once approach.md is updated (S1-S5), foundations/phase-b.md will be aligned with both spec and implementation.

---

## 4. Documentation Hierarchy Contract

### Authoritative layer (defines norms)

| Document | Exclusive responsibility |
|---|---|
| **approach.md** | Normative semantics, schemas, algorithms. All B0-B4 behavior rules. Single source of truth for "what the system SHOULD do." |
| **ROADMAP.md** | Work sequencing, deliverables, gate criteria. Single source of truth for "what is done vs TODO." |
| **CLAUDE.md** | Implementation discipline, architecture constraints, scripts, git conventions. Single source of truth for "how to work in this repo." |
| **README.md** | Public project description, quick-start, high-level architecture. Single source of truth for "what this project IS." |

**Must NOT contain:** runtime results, failure triage, historical narrative, per-subject data.

### Analysis layer (internal reasoning)

| Directory | Exclusive responsibility | Must NOT contain |
|---|---|---|
| **foundations/** | Current system behavior descriptions (Phase A, Phase B). Derived from authoritative docs + implementation. | Historical narrative, per-subject results, normative claims beyond spec |
| **decisions/** | Compressed evolution log. Past decisions + rationale. | Current system descriptions, runtime data, normative claims |
| **runtime/** | Per-subject execution results. One file per executed subject. | System descriptions, historical decisions, normative claims |
| **phase-b/gt/** | Ground truth JSON data files. Machine-readable only. | Prose, analysis, reports |

### Validation layer (reproducible execution)

| Document | Exclusive responsibility | Must NOT contain |
|---|---|---|
| **subjects.md** | Corpus registry: subject list + Phase A extraction metadata | Runtime instructions, failure analysis |
| **evaluation reports** | Academic evaluation against methodology/benchmarks | Runtime data, system descriptions |
| **subject runbooks** | Setup/execute/teardown instructions per subject | Analysis, failure reasoning, system descriptions |
| **README.md** | Category definitions + pointers | Actual content (index only) |
| **runtime-conventions.md** | Cross-subject execution policies | Per-subject specifics, analysis |

---

## 5. Readiness Decision for Airbus Residual Re-adjudication

**NOT READY — AUTHORITATIVE DOCS MUST BE FIXED FIRST**

**Justification:**

The normative spec (approach.md) contains 5 contradictions or omissions relative to the implemented B1/B3 behavior that directly affect failure adjudication:

1. **Start Route Selection** — the spec says "prefer unguarded" but implementation prefers guarded when auth is required. Any adjudication of MainNavComponent failures must reference the CURRENT rule, which is NOT in the spec. A reviewer comparing spec vs behavior would conclude the implementation is wrong.

2. **Failure classifier** — the spec lists only 2 error types for `FAIL_ELEMENT_NOT_FOUND` but implementation checks 4. Any adjudication of `FAIL_UNKNOWN` elimination relies on the expanded classifier, which is NOT in the spec.

3. **Login credential materialization** — the spec doesn't mention this. Any adjudication of LoginPageComponent_WSF must reference this rule.

4. **Login WSF oracle** — the spec doesn't mention `assert-no-crash` for login-route WSF. Any adjudication of the login timeout failure must reference this postcondition rule.

5. **CSS class locator** — the spec doesn't mention this fallback. Any adjudication of the GetAllProducts `.material-icons.edit` locator success must reference this.

**Required before re-adjudication:**
- Apply S1-S5 to approach.md
- Apply R1-R3 to ROADMAP.md
- Apply C1-C2 to CLAUDE.md
- Apply D1 to README.md

After these corrections, the documentation stack will be internally consistent and the Airbus residual failures can be adjudicated against a coherent normative base.
