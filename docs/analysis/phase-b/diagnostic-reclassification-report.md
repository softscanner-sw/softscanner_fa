# Diagnostic Reclassification Report

**Date:** 2026-04-03 (clean baseline — environment distortion eliminated)
**Protocol:** `docs/validation/diagnostic-protocol.md`
**Benchmark:** `docs/validation/benchmark-execution-protocol.md`

---

## 0. BENCHMARK RESULTS (integrity-verified, environment-clean)

| Subject | Total | Pass | Fail | C3 | Logs | Integrity |
|---|---|---|---|---|---|---|
| posts-users-ui-ng | 18 | 16 | 2 | 88.9% | 18/18 | 0 |
| heroes-angular | 19 | 17 | 2 | 89.5% | 19/19 | 0 |
| airbus-inventory | 21 | 19 | 2 | 90.5% | 21/21 | 0 |
| spring-petclinic-angular | 74 | 55 | 19 | 74.3% | 74/74 | 0 |
| ever-traduora | 109 | 49 | 60 | 45.0% | 109/109 | 0 |
| **Total** | **241** | **156** | **85** | **64.7%** | **241/241** | **0** |

All results benchmark-valid per protocol. Environment distortion (HTTP 429 rate-limiting) eliminated via `batchResetCommand` (Docker container restart between batches).

**Delta from prior run (rate-limited):**
- Traduora: 39→49 PASS (+10), 70→60 FAIL (-10), 35.8%→45.0%
- Aggregate: 146→156 PASS (+10), 95→85 FAIL (-10), 60.6%→64.7%
- ENV:auth-rate-limit: 28→0 (eliminated)

---

## 1. RESIDUAL CATALOG (85 failures)

### Family 1: L3 Async/Permission Gate + Repeater Readiness — 63 failures
**Subjects:** ever-traduora (52), spring-petclinic-angular (9), posts-users-ui-ng (1), airbus-inventory (1)
**Evidence layers:** L1, L2, L3, L7, L9
**Confidence:** HIGH

The dominant family (74% of all residuals). Two sub-types:

**A. B5.2 pre-wait timeout (traduora — 43):** The B5.2 mechanism emits a descriptive gate expression (`project$ | async`, `can: 'X' | async`) but has no concrete CSS selector to poll. Always times out at 5s.

**B. Repeater/list data readiness (all subjects — 20):** Widgets inside `*ngFor` or behind `*ngIf`. The implicit wait (5s) is insufficient for the API fetch→render→bind cycle. Positional locators (`button:N`) depend on data volume.

**Strategy:** Replace B5.2 descriptive wait with DOM-presence polling for the trigger widget's CSS selector (10-15s timeout). For repeaters, calibrate pre-wait + use `data-testid` locators.

### Family 2: L2 Postcondition Mismatch — 11 failures
**Subjects:** spring-petclinic-angular (10), ever-traduora (1)
**Evidence layers:** L1, L2, L3, L8
**Confidence:** HIGH

Postcondition URL-match times out. All-200 CDP (no backend errors). Three sub-types:

**A. Non-navigating handler (petclinic — ~7):** Handler completes but doesn't navigate. Oracle incorrectly asserts URL change. A2 effect closure analysis needed to distinguish unconditional navigation, conditional navigation, and non-navigation.

**B. Conditional navigation (petclinic — ~3):** Handler CAN navigate but navigation is conditional on runtime state (parent context, entity existence). The postcondition is structurally correct but runtime conditions prevent navigation.

**C. Auth-guarded redirect (traduora — 1):** NotFoundComponent WNR targets `/projects` (auth-guarded) without auth → gets `/login` instead.

**Strategy:** B5.4b — for handlers WITHOUT unconditional CNR in effect closure, emit `assert-no-crash`. For handlers WITH conditional CNR, emit `assert-url-contains` with either the target route OR the current route (accept both). For auth-guarded targets without auth, adjust expected URL.

### Family 3: L3 Locator Mismatch — 6 failures
**Subjects:** ever-traduora (6)
**Evidence layers:** L1, L2, L5, L9
**Confidence:** MEDIUM

Positional locators (`button:N`) or `formcontrolname` locators fail on dynamic pages. Button count differs between static extraction and runtime DOM.

**Strategy:** Improve B1 locator priority to prefer text-content, aria-label, or `data-testid` over tag-position.

### Family 4: L2 External Redirect — 2 failures
**Subjects:** heroes-angular (2)
**Evidence layers:** L1, L2, L3
**Confidence:** HIGH

twitter.com→x.com, aka.ms→azure.microsoft.com. Oracle asserts original URL.

**Strategy:** B5.4a host-family equivalence table.

### Family 5: L4 Backend Validation — 1 failure
**Subjects:** posts-users-ui-ng (1)
**Evidence layers:** L1, L2, L3
**Confidence:** HIGH

POST 400 — backend rejects generated form data.

**Strategy:** Manifest `formDataOverrides` for the specific field.

### Family 6: L3 Dialog Precondition — 1 failure
**Subjects:** airbus-inventory (1)
**Evidence layers:** L1, L2, L5
**Confidence:** HIGH

Dialog requires prior form submission (multi-step precondition).

**Strategy:** Deferred — inherent single-trigger model limitation.

### Family 7: L3 Element Not Interactable — 1 failure
**Subjects:** ever-traduora (1)
**Evidence layers:** L1, L2, L3
**Confidence:** HIGH

Reset-password form requires a valid token URL parameter. Without it, fields are disabled.

**Strategy:** Structurally unrealizable — skip in manifest or implement multi-step precondition.

---

## 2. SUMMARY TABLE

| # | Family | Count | % | Type | Strategy |
|---|---|---|---|---|---|
| 1 | L3:async-gate + repeater | 63 | 74% | Runtime | B5.2 DOM-presence polling |
| 2 | L2:postcondition-mismatch | 11 | 13% | Oracle | B5.4b non-nav detection |
| 3 | L3:locator-mismatch | 6 | 7% | Structural | B1 locator improvement |
| 4 | L2:external-redirect | 2 | 2% | Oracle | B5.4a host-family |
| 5 | L4:backend-validation | 1 | 1% | Environment | Manifest override |
| 6 | L3:dialog-precondition | 1 | 1% | Structural | Deferred |
| 7 | L3:not-interactable | 1 | 1% | Structural | Skip or multi-step |
| | **Total** | **85** | | | |

---

## 3. STRATEGY RANKING

### Batch A: B5.2 Pre-Wait Redesign (63 failures addressed)
**Scope:** Replace descriptive B5.2 wait with concrete DOM-presence polling for the trigger widget's CSS selector. Increase timeout to 10-15s. For repeaters, add explicit `waitForElement` with the widget's own locator.
**Estimated recovery:** 25-40 tests (not all will resolve — some depend on data/permissions)
**Confidence:** MEDIUM-HIGH
**Blast radius:** B2 emitter change (pre-wait step generation). No A1/A2 changes.
**Dependencies:** None

### Batch B: B5.4b Postcondition Oracle (11 failures addressed)
**Scope:** Distinguish three postcondition cases:
- **Unconditional navigation** (CNR in effect closure, no guards/conditions): `assert-url-matches`
- **Conditional navigation** (CNR present but behind guards/params): `assert-url-matches OR assert-no-url-change` (accept either)
- **Non-navigation** (no CNR in effect closure): `assert-no-crash`
**Estimated recovery:** 8-11 tests
**Confidence:** HIGH
**Blast radius:** B1 plan derivation + B2 emitter. No A1/A2 changes.
**Dependencies:** None (independent of Batch A)

### Batch C: B5.4a External Redirect Oracle (2 failures addressed)
**Scope:** Host-family equivalence table for known domain redirects.
**Estimated recovery:** 2 tests
**Confidence:** HIGH
**Blast radius:** B2 emitter only.
**Dependencies:** None

### Batch D: B1 Locator Improvement (6 failures addressed)
**Scope:** Prefer text-content/aria-label over tag-position in B1 locator priority chain.
**Estimated recovery:** 3-5 tests
**Confidence:** MEDIUM
**Blast radius:** B1 plan derivation + B2 regeneration.
**Dependencies:** None

### Batch E: Manifest Fix (1 failure)
**Scope:** `formDataOverrides` for posts NewUser WSF.
**Estimated recovery:** 1 test
**Confidence:** HIGH
**Blast radius:** Manifest only.

### Projected C3 after Batches A-E:
- **~195-210/241 (81-87%)** — up from 64.7%
