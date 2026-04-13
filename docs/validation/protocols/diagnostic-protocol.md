# Diagnostic Protocol for Failure Analysis

**Authority:** This protocol defines the normative process for diagnosing test failures and constructing the residual catalog.
**Effective:** 2026-04-03
**Context:** Established to ensure failure classification is evidence-based, exhaustive, and reproducible.

---

## 1. Purpose

When a benchmark-valid B3 run produces failures, each failure must be diagnosed using a structured multi-layer evidence protocol before being classified into a residual family. No failure should be classified by symptom alone (e.g., "FAIL_TIMEOUT") — the root cause layer must be determined from the full evidence chain.

---

## 2. Evidence Layers (ordered by diagnostic depth)

For each failing workflow, the diagnostic protocol inspects evidence at 10 layers, in this order:

### Layer 1 — B3 Result
**Source:** `output/<subject>/json/b3-results.json`
**Fields:** `outcome`, `attempts`, `durationMs`, `error`, `attemptDetails`
**Question:** What outcome did B3 assign? What was the raw error text?

### Layer 2 — Per-Test Execution Log (I1 evidence)
**Source:** `output/<subject>/logs/<testFile>.log.json`
**Fields:** `outcome`, `failedStepId`, `failureKind`, `duration`, `steps[]`
**Questions:**
- Which step failed? (stepId, stepType)
- What was the failure kind? (timeout, locator-not-found, assertion-failed, etc.)
- What was the exact error message?
- What were routeBefore / routeAfter at the failing step?
- How many steps succeeded before the failure?

### Layer 3 — Per-Test Network Evidence (I2 evidence)
**Source:** `output/<subject>/logs/<testFile>.log.json` → `steps[].networkEvidence[]`
**Fields:** `url`, `method`, `status`, `timing`
**Questions:**
- Were there any HTTP 4xx/5xx responses?
- Did the backend API respond at all?
- Were auth endpoints returning 200 or 429?
- Did form submission endpoints accept or reject the data?
- Is the failure at L4 (backend) or L3 (frontend materialization)?

### Layer 4 — Screenshots
**Source:** `output/<subject>/screenshots/<testName>/`
**Questions:**
- What was the actual DOM state at failure time?
- Was the page loaded? Was it the right page?
- Were expected elements visible?
- Was there an error message on screen?

### Layer 5 — Generated Test Code (B2 artifact)
**Source:** `output/<subject>/tests/<testFile>.test.ts`
**Questions:**
- What locator strategy was used for the failing step?
- What URL was navigated to?
- What postcondition was asserted?
- Is the postcondition appropriate for the workflow's structural characteristics?
- Does the test have auth preconditions? Which account?

### Layer 6 — Action Plan (B1 artifact)
**Source:** `output/<subject>/json/b1-plans.json`
**Questions:**
- What preconditions, steps, and postconditions were planned?
- What locator was derived? What priority chain was used?
- What form data was generated?
- Was an auth account assigned? Which guards does it satisfy?
- Is the postcondition type (assert-url-matches vs assert-no-crash) correct for this workflow?

### Layer 7 — Realization Intent (B1 artifact)
**Source:** `output/<subject>/json/b1-intents.json`
**Questions:**
- What trigger widget was identified? What kind, tag, attributes?
- What form schema was derived?
- What constraints (guards, params, roles) were identified?
- Does the intent correctly represent the structural workflow?

### Layer 8 — A2 Workflow
**Source:** `output/<subject>/a2-workflows.json`
**Questions:**
- What trigger edge kind? (WTH, WSF, WNR, WNE)
- What effect steps are in the closure?
- Does the effect closure contain CNR (component-navigates-route)?
- What is the terminal node?
- What is the verdict (FEASIBLE, CONDITIONAL)?
- What constraints are present?

### Layer 9 — A1 Multigraph
**Source:** `output/<subject>/json/a1-multigraph.json`
**Questions:**
- Does the trigger edge exist and have correct refs?
- Does the target widget exist in the DOM according to extraction?
- What are the widget's UI properties (visibility, enablement, insideNgFor, compositionGates)?
- Is the component correctly activated by its route?
- Are there unresolved navigations or missing edges?

### Layer 10 — Subject Source Code
**Source:** The actual Angular application source files
**Questions:**
- Does the widget actually exist in the template at the expected location?
- Is the widget conditionally rendered (*ngIf, *ngFor, async pipe)?
- What does the handler actually do? Does it navigate, or just modify state?
- Are there runtime dependencies (API data, permissions) that static analysis cannot see?
- Is the locator strategy correct for the actual DOM structure?

### Layer 11 — Manifest & Environment
**Source:** `subjects/<subject>/subject-manifest.json`, setup runbooks
**Questions:**
- Are the auth credentials valid and active?
- Are route param values correct for the current seed state?
- Are there form data overrides needed?
- Is the preAttemptCommand adequate?
- Is the seed data complete for this workflow?

### Layer 12 — Ground Truth
**Source:** `docs/analysis/phase-b/gt/<subject>.json`
**Questions:**
- What did ground truth predict for this workflow?
- Does the B1 intent/plan match GT?
- If there's a GT mismatch, is it in the plan or in the execution?

---

## 3. Classification Taxonomy

After collecting evidence, classify each failure into exactly one family:

### Environment families (not pipeline deficiencies)
- **ENV:auth-rate-limit** — HTTP 429 on auth endpoint (rate limiter, not credential issue)
- **ENV:seed-data-absent** — Required entity doesn't exist in backend
- **ENV:app-identity-mismatch** — Wrong application on the port
- **ENV:port-contamination** — Stale process occupying the port

### L2 families (navigation/oracle layer)
- **L2:external-redirect** — External URL redirected; oracle asserts original URL
- **L2:non-navigating-handler** — Handler doesn't navigate; oracle incorrectly asserts URL change
- **L2:parameterized-postcondition** — URL contains dynamic ID; assertion uses literal pattern
- **L2:postcondition-url-mismatch** — Other URL assertion failure

### L3 families (DOM/materialization layer)
- **L3:async-permission-gate** — Widget behind async/permission pipe not materialized
- **L3:repeater-data-readiness** — Widget inside *ngFor, data not loaded in time
- **L3:user-action-precondition** — Widget requires prior user action to become visible
- **L3:material-sidenav** — Widget inside Material sidenav/drawer
- **L3:dialog-precondition** — Dialog requires multi-step opener sequence
- **L3:locator-mismatch** — Locator strategy doesn't match actual DOM
- **L3:element-not-interactable** — Element exists but not clickable/typeable

### L4 families (backend state layer)
- **L4:backend-validation** — Backend rejects form data (HTTP 400)
- **L4:backend-auth-rejection** — Backend rejects credentials (HTTP 401/403)
- **L4:missing-route-params** — Route params resolve to undefined

### Mixed/structural families
- **STRUCT:multi-step-precondition** — Workflow requires preceding workflows to execute first
- **STRUCT:composition-gap** — A1 doesn't model a required component relationship

---

## 4. Diagnostic Procedure

For each failing workflow:

1. **Read Layer 1** (B3 result) — note outcome and raw error
2. **Read Layer 2** (per-test log) — identify failing step, step type, failure kind
3. **Read Layer 3** (network evidence) — check for HTTP errors, auth issues, backend rejections
4. **Check Layer 4** (screenshots) — if available, verify DOM state
5. **If the failure is at a precondition step:**
   - Check Layer 5 (generated test) for auth/navigation code
   - Check Layer 6 (plan) for assignment and precondition config
   - Check Layer 11 (manifest) for credential and seed validity
6. **If the failure is at an action step:**
   - Check Layer 5 for the locator used
   - Check Layer 7 (intent) for the widget metadata
   - Check Layer 9 (A1) for the widget's UI properties
   - Check Layer 10 (source code) for conditional rendering
7. **If the failure is at a postcondition step:**
   - Check Layer 5 for the assertion type and expected URL
   - Check Layer 8 (A2) for the effect closure — does it contain CNR?
   - Check Layer 3 for backend response codes
8. **Classify** into exactly one family from the taxonomy
9. **Record** the evidence chain: which layers provided the classification evidence

---

## 5. Confidence Levels

- **HIGH** — Classification is supported by I1 + I2 evidence and confirmed by artifact inspection
- **MEDIUM** — Classification is supported by I1 evidence but I2 is absent or inconclusive; artifact inspection consistent
- **LOW** — Classification is based on symptom pattern matching; deeper investigation needed

---

## 6. Catalog Entry Format

Each entry in the residual catalog must contain:

```
Workflow ID: <full or abbreviated ID>
Subject: <subject name>
B3 Outcome: <outcome from b3-results.json>
Failed Step: <stepId> <stepType>
Failure Kind: <from per-test log>
I2 Evidence: <HTTP status codes if available, or "not available">
Family: <from taxonomy>
Root Cause: <1-2 sentence explanation>
Evidence Layers Used: <e.g., L1, L2, L3, L5, L8>
Confidence: HIGH / MEDIUM / LOW
Candidate Strategy: <what would fix this>
```

---

## 7. Catalog Aggregation

After all individual entries are classified:

1. Group by family
2. Count per family per subject
3. Identify the top-3 families by count
4. For each family, identify:
   - Whether the issue is structural, runtime, environment, or oracle
   - Whether a fix exists and its estimated scope
   - Priority relative to other families
5. Produce the summary table

---

## 8. Protocol Versioning

This protocol may be amended as new evidence sources become available (e.g., O3/O4 oracles, I3 application instrumentation). Each amendment must be recorded with a date and reason.
