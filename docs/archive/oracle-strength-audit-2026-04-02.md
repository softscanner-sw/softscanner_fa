# Oracle-Strength Audit: Ever-Traduora 109/109 Result

**Date:** 2026-04-02
**Verdict: THE 109/109 RESULT IS INVALID.**

---

## RESOLUTION (2026-04-03)

The execution-integrity issue has been resolved:
- **Root cause diagnosed:** npm's Windows process lifecycle kills grandchild subprocess event loops before async work (WebDriver/Chrome) completes. This is an npm/Windows platform limitation affecting ALL subprocess spawn strategies.
- **Fix implemented:** B3 must be invoked directly (`node node_modules/tsx/dist/cli.mjs src/b3-cli.ts`), not via `npm run`. FAIL_INTEGRITY outcome type added; per-test log verification mandatory; stale artifact cleanup before runs.
- **Integrity-verified rerun completed:** 39/109 (35.8% C3) with 109/109 per-test logs verified. This is the authoritative traduora baseline.
- **The prior 109/109 claim remains permanently invalid.** The new 39/109 result is constructed from verified evidence.

---

## 1. TRUTH-SET VERIFICATION

**Claimed result:** 109/109 PASS (100% C3), run timestamp 2026-04-02T17:26:09.192Z

**Artifacts:**
- `output/ever-traduora/json/b3-results.json` — 109 results, all PASS
- Per-test logs at `output/ever-traduora/logs/` — **STALE from prior contaminated runs** (timestamps 18:56-19:05, not from the 17:26 run)
- All 109 results show: duration 1.3-1.8s, 0 screenshots, 1 attempt each

**Critical anomaly:** Every test completes in 1.3-1.8 seconds with zero screenshots. A real Selenium test with Chrome startup + page navigation + form interaction takes 3-10+ seconds minimum. The durations indicate the tests are NOT executing real browser interactions.

## 2. ROOT CAUSE

**Verified empirically:** When the traduora app is NOT running on port 4200, the same test files still exit with code 0 and produce no log output. The tests silently succeed without executing Selenium interactions.

**Probable mechanism:** The test process launches but Chrome/WebDriver initialization fails silently. The `(async () => { try { await runTest() } catch { process.exit(1) } })()` wrapper does not catch the failure because:
- The unhandled promise rejection from `new Builder().build()` failure doesn't propagate to the catch block
- OR: Chrome launches but `driver.get()` to a non-responding URL puts the URL in the address bar without error, and subsequent element lookups time out but the error path has a gap

**Evidence:**
1. App down → test exits 0, no log written
2. App up → test exits 0, takes 3s (real execution)
3. B3 run shows 1.3-1.8s per test — consistent with app-down behavior
4. Per-test log files on disk are from PRIOR contaminated runs, not the 109/109 run

## 3. 109-WORKFLOW ORACLE-STRENGTH CLASSIFICATION

**Classification is moot — the entire result is a false positive.** The tests did not execute real browser interactions.

However, for the record, the structural classification of what the tests WOULD assert if they ran:

| Category | Count | Description |
|---|---|---|
| O2 assert-url-matches (non-navigating WTH) | 74 | Asserts URL contains start route — trivially true even if handler does nothing |
| O2 assert-url-matches (WSF) | 13 | Asserts URL changes after form submit |
| O2 assert-url-matches (WNR) | 21 | Asserts URL changes to target route — genuine navigation assertion |
| O1 assert-no-crash | 1 | LoginComponent WSF — weakest possible assertion |

Even if the tests had executed properly, **74 of 108 O2 assertions would be weak** because they check the start route URL, which trivially matches when the handler doesn't navigate.

## 4. WHAT MUST HAPPEN

1. **The 109/109 result must be retracted** from all documents
2. **The root cause (silent test failure)** must be diagnosed and fixed before any new benchmark run
3. **The per-test log files must be cleaned** before re-running (stale logs from prior runs persist)
4. **The B3 runner should verify** that per-test logs are written for every test — a test with no log file should be flagged as suspicious
5. **A "canary test"** mechanism should be considered — run one test first and verify it produces a log with steps before proceeding with the full suite

## 5. IMPACT ON DOCUMENTS

### diagnostic-reclassification-report.md
- "ever-traduora: 0 residuals" is **materially incorrect**
- The entire Section 0 (benchmark results) and Section 3.2 (traduora interpretation) must be corrected
- Batch recommendations based on traduora 100% must be revised

### scientific-report.md
- Execution results table: traduora 109/0/100.0% is **false**
- Aggregate C3 89.6% is **false**
- Conclusion paragraph about traduora 100% demonstrating deep auth handling is **false**
- All statements derived from the 109/109 result must be reverted or qualified

### ROADMAP.md
- traduora 100.0% | 109/109 is **false**
- Aggregate row must be corrected

## 6. WHAT THE ACTUAL TRADUORA STATE IS

Without a valid rerun, the best available traduora evidence is the **pre-session baseline** of 48/109 (44% C3) from the original run with the old emitter and 3 retries. However:
- That run was on old emitter tests (IMPLICIT=10000, no adaptive timeout, no CDP batch drain)
- The port contamination issue existed in that run too (we don't know if it was clean)
- The 36/109 diagnostic run was also contaminated (port issue + rate limiting)

**No valid traduora benchmark exists.** A clean rerun is required with:
1. The silent-failure bug fixed
2. Verified correct app on correct port
3. Per-test log validation
4. Stale log cleanup before run
