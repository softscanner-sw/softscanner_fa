# Phase B — System Foundation
Current-state description of Phase B (B0-B4 pipeline).

---

## Pipeline Overview
| Stage | Input | Output |
|---|---|---|
| B0 | A2 + subject manifests | Validation logs |
| B1 | A1 + A2 + manifests | `b1-intents.json`, `b1-plans.json` |
| B2 | B1 plans + manifests | `tests/<workflowId>.test.ts`, `b2-tests.json` |
| B3 | B2 tests + running app | `b3-results.json`, per-test logs, screenshots |
| B4 | B3 results + A2 | `b4-coverage.json` |
| B5.0 | B2 emission (at codegen), B3 runtime (at execution) | `output/<subject>/logs/*.log.json`, `logs/<phase>-pipeline.jsonl` |

---

## B0 — Subject Manifest Validation
**Schema (frozen):**
- `subjectName`, `baseUrl`, `accounts[]` (with `guardSatisfies`), `routeParamValues`, `formDataOverrides?`, `skipWorkflows?`
- Optional: `authSetup` (loginRoute, usernameField, passwordField, submitButton, **authSuccessSelector**)
- Optional: `executionConfig` (readinessEndpoint?, readinessTimeoutMs?, seedDataNotes?, **preAttemptCommand?**)

**Auth contract:** When `authSetup` is present, `authSuccessSelector` is mandatory — a CSS selector for an element present only after successful login. This is the sole auth success signal. B2 polls for it after credential submission. No URL-based, form-disappearance, or fixed-sleep detection.

**Validation:** Schema + A2 cross-check (guards, params, workflow IDs). Hard error if `authSetup` present but `authSuccessSelector` absent.

---

## B1 — RealizationIntent + ActionPlan Generation
### Start Route Selection
1. Exclude wildcards
2. If workflow requires auth (`guardNames.length > 0`): prefer guarded routes
3. Otherwise: prefer unguarded routes
4. Fewest params → shortest path → alphabetical

### Form Field Scope
All direct `WIDGET_CONTAINS_WIDGET` children of the trigger form (excluding Form, Button, Option). Widget-kind-aware step types: click for Checkbox/RadioGroup/Radio, select-option for Select/mat-select, type for file input, clear-and-type for text-like inputs.

**Form field key resolution order:** `formControlName` → `nameAttr` → `idAttr` → CSS `class` → `fieldNodeId` (tag-position fallback with stableIndex).

**Trigger widget locator resolution:** `routerlink` (anchors only) → `href` → `data-testid` → `id` → `formcontrolname` → `name` → `aria-label` → `placeholder` → CSS `class` (compound, best-effort) → `tag-position` (nth-of-type with stableIndex).

### Login-form credential materialization
When the WSF workflow's start route matches `manifest.authSetup.loginRoute`, B1 populates username/password fields from the first manifest account.

### Dynamic-ID postcondition
For WSF workflows where terminal route params are NOT in any start route, B1 retains `:param` template placeholders. B2 emits regex-based URL assertion.

### Login WSF oracle
When the WSF is on the login route and terminal equals start, B1 emits `assert-no-crash` (post-login destination unresolvable via A2).

### Dialog precondition
Dialog detection via CCC edges + `/dialog|modal/i` selector pattern. Navigate URL overridden to the route that activates the opener component.

---

## B2 — Code Generation
**Architecture:** Pure emitter: ActionPlan → Selenium WebDriver TypeScript test file.

### Chrome options
`--headless`, `--no-sandbox`, `--disable-dev-shm-usage`, `--window-size=1920,1080`

### Click mechanism
All click steps use `driver.executeScript('arguments[0].click()', el)` (JS click) to bypass CSS overlay interception (e.g., Bootstrap custom checkboxes).

### Screenshots
- Captured by test code via `driver.takeScreenshot()`
- Path: `output/<subject>/screenshots/<testName>/<seqnum>_<label>.png`
- Checkpoints: after-preconditions, after-steps, final/error
- Failure-resilient: silent catch

### File inputs
`type` step uses `path.resolve()` for absolute platform-native paths. B3 provisions `/tmp/test-file.txt` at runtime.

---

## B3 — Execution
### Execution model
- Readiness: HTTP GET to `manifest.baseUrl` (30s timeout, 1s retry backoff)
- Subprocess: `node <tsx/dist/cli.mjs> <testFile>` with cleaned PATH (npm `node_modules` entries removed)
- Retry: up to 3 attempts; no retry on `FAIL_APP_NOT_READY`
- Sequential: one test at a time per subject
- File provisioning: `/tmp/test-file.txt` created at B3 runtime

### Failure classification (ordered rules)
1. Readiness check failed → `FAIL_APP_NOT_READY`
2. Exit code 0 → `PASS`
3. NoSuchElementError, StaleElementReferenceError, InvalidArgumentError, ElementNotInteractableError → `FAIL_ELEMENT_NOT_FOUND`
4. AssertionError / assertion text → `FAIL_ASSERTION`
5. TimeoutError / timed out → `FAIL_TIMEOUT`
6. Auth-setup context error → `FAIL_AUTH`
7. Otherwise → `FAIL_UNKNOWN`

### Report generation
- Markdown report: `output/<subject>/b3-b4-report.md`
- PDF: pandoc → HTML → Chrome headless print (best-effort)

---

## B4 — Coverage
### Tiered metrics
- **C1 (Plan):** hasPlan / (total - pruned)
- **C2 (Code):** hasCode / (total - pruned)
- **C3 (Execution):** PASS / (total - pruned - appNotReady - skipped)
- **C4 (Oracle):** deferred

### Denominator rules
- PRUNED excluded from all denominators
- FAIL_APP_NOT_READY excluded from C3 (environment deficiency)
- skipWorkflows excluded from C3 (user-declared opt-out)

---

## Observability Boundary
### Mandatory (zero telemetry required)
All execution evidence: outcomes, attempts, durations, errors, screenshots, coverage metrics.

### Optional (deferred)
OpenTelemetry, browser HTTP traces, console errors, route transitions, interaction breadcrumbs.

Telemetry failures must never be classified as test failures.

---

## Ground Truth (Phase B)
257 GT entries across 6 subjects in `docs/analysis/phase-b/gt/<subject>.json`.
GT validates B1 intents (formFieldCount, account, guards) and B1 plans (formDataKeys, stepCount, terminalUrl, preConditions).

---

## B5 — Execution Enhancements
B0–B4 constitute the core pipeline. B5 adds execution-layer enhancements.

**B5.0 — Observability Contract (Implemented):**
- Per-test structured JSON logs: `output/<subject>/logs/<testFile>.log.json`
- Unified screenshot contract via `captureScreenshot()`
- Framework/system pipeline logs: `logs/<phase>-pipeline.jsonl` (PipelineLogEvent JSONL)
- Visualization: `vis/b3-execution.html` consuming B1/B2/B3/B4/B5.0/manifest
- Two distinct logging contracts: framework logs (pipeline behavior) vs per-test logs (execution evidence)

**B5.1–B5.6 (Deferred):**
- B5.1: Network-aware wait strategies (CDP, backoff)
- B5.2: Component-ready and data-ready waits
- B5.3: Repeater-aware locator semantics (*ngFor)
- B5.4: Stronger oracle design (C4)
- B5.5: Data-aware test preconditions
- B5.6: Inline composed-component materialization

See `docs/paper/approach.md` §B5 for full normative spec.

Evidence from completed subject rollouts informs each category. See approach.md for details.