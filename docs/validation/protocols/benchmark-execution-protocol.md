# Benchmark Execution Protocol

**Authority:** This protocol defines normative rules for benchmark-valid test execution.
**Effective:** 2026-04-03
**Context:** Established after oracle-strength audit invalidated a 109/109 traduora result due to missing per-test evidence.

---

## 0. Execution Invariants (non-negotiable)

### Canonical B3 invocation
```
node node_modules/tsx/dist/cli.mjs src/b3-cli.ts <subject> [flags]
```

This is the ONLY invocation path that produces benchmark-valid results.

### Prohibited invocation paths (for benchmark claims)
- `npm run b3` — npm's Windows process lifecycle kills grandchild subprocess event loops
- `npx tsx src/b3-cli.ts` — same npm lifecycle issue
- `node --import tsx/esm src/b3-cli.ts` — when run as a child of npm, same issue
- Any invocation where `npm` is an ancestor process

### Run metadata requirements
Each benchmark-valid run must record:
- Run timestamp (ISO 8601)
- Subject name
- Artifact versions (A1/A2/B1/B2 generation timestamps)
- Timeout policy (adaptive per-test from plan metadata)
- CDP policy (enabled/disabled)
- Seed policy (seedCommand executed / not applicable)
- maxRetries value
- Batch size

### Freshness invariant
Per-test logs MUST be written during the current run. The B3 runner:
1. Cleans `output/<subject>/logs/` before full runs
2. Verifies each per-test log exists after test completion
3. Verifies log mtime > run start time
4. Verifies log outcome agrees with subprocess exit code
5. Downgrades PASS to FAIL_INTEGRITY if any check fails

### App identity invariant
Before any test execution, the B3 readiness check confirms the target application is serving. Additionally, the operator MUST verify app identity (check `<title>` tag or root selector matches the expected subject) before starting the benchmark run.

---

## 1. Subject Lifecycle

### Before each subject run:
1. **Shutdown** all unrelated apps, containers, and processes occupying the subject's ports
2. **Verify** target ports are free (`curl` returns connection refused)
3. **Start** only the current subject's services per its runbook (`docs/validation/<subject>-setup.md`)
4. **Verify app identity** — confirm the correct application is serving (check `<title>` or root selector)
5. **Run seed** if the subject requires it (per runbook)
6. **Verify seed** — confirm key entities exist (e.g., login with manifest credentials via API)

### After each subject run:
1. **Stop** all subject-specific services (frontend, backend, containers)
2. **Reset** modified data if needed (e.g., `git checkout db.json` for heroes)
3. **Verify** no stale processes remain

---

## 2. Run Modes

| Mode | Flag | When allowed | When forbidden |
|---|---|---|---|
| **Full benchmark** | (default) | Clean baseline run; all prior artifacts cleaned | Never with stale artifacts |
| **Resume** | `--resume` | After interruption (crash/timeout) | For benchmark claims without integrity verification |
| **Failed-only** | `--failed-only` | Targeted rerun of failures | When test files have changed since prior run |
| **Selective** | `--only <ids>` | Debugging specific workflows | For aggregate benchmark claims |
| **Diagnostic** | (any + CDP) | Deep failure analysis | Results are diagnostic, not benchmark-valid unless integrity-verified |

---

## 3. Retry Policy

| Context | maxRetries | Justification |
|---|---|---|
| **Benchmark-valid** | 1 | One attempt. Pass or fail cleanly. No retry inflation. |
| **Diagnostic** | 1-3 | Higher retries acceptable for flaky-test investigation. Mark as diagnostic. |

---

## 4. Batching Policy

- Default batch size: 10
- Chrome cleanup between every test (automatic in B3 runner)
- Deep cleanup (temp profiles) between batches
- No parallel test execution within a subject

---

## 5. Logging Policy

### Required artifacts per test:
- `output/<subject>/logs/<testFile>.log.json` — per-test structured execution log
- Must contain: `outcome`, `steps[]` (at least 1 step), timestamps
- Must be written DURING the current run (not stale from prior runs)

### Freshness rules:
- Full benchmark runs clean `output/<subject>/logs/` BEFORE execution
- Per-test log must have mtime within the current run window
- Log outcome must agree with subprocess exit code

### Integrity enforcement (FAIL_INTEGRITY):
B3 verifies after each test:
1. Log file exists
2. Log file is from current run (mtime > run start time)
3. Log outcome matches exit code (PASS log + exit 0 = valid; FAIL log + exit 0 = FAIL_INTEGRITY)
4. Log has at least 1 recorded step
5. If any check fails → FAIL_INTEGRITY (not PASS)

### Stale artifact cleanup:
- `output/<subject>/logs/` cleaned before full benchmark runs
- `output/<subject>/screenshots/` cleaned before full benchmark runs
- `output/<subject>/json/b3-progress.json` cleaned before full benchmark runs
- `output/<subject>/json/b3-results.json` cleaned before full benchmark runs

---

## 6. CDP Policy

| Context | CDP enabled | Rationale |
|---|---|---|
| **Benchmark (small subjects)** | Yes | Overhead acceptable; evidence valuable |
| **Benchmark (large subjects)** | Yes | Batch drain removes per-step overhead |
| **Diagnostic reruns** | Always yes | Required for I2 evidence |

CDP network evidence is batched to test-end (single drain + timestamp attribution). No per-step CDP calls.

---

## 7. Selective Rerun Policy

To rerun specific tests without corrupting the benchmark:
1. Use `--only <workflowIds>` to target specific tests
2. Results are NOT merged into the authoritative b3-results.json
3. Results are for diagnostic investigation only
4. For failed-only reruns, B3 merges prior PASS results — but the merged result is only benchmark-valid if both the original run AND the rerun pass integrity checks

---

## 8. Benchmark-Validity Criteria

A subject run is **benchmark-valid** if and only if ALL of the following hold:

1. App identity verified before run (correct application on correct port)
2. Seed executed and verified (if applicable)
3. Full run mode (not resume/failed-only/selective)
4. Stale artifacts cleaned before run
5. Per-test logs exist for every test in the run
6. Per-test logs are from the current run (freshness verified)
7. Log outcomes agree with exit codes for all tests
8. Zero FAIL_INTEGRITY outcomes
9. No known port contamination or environment issues
10. Results documented with: artifact versions, timeout policy, CDP policy, seed policy

A run that fails any criterion is **diagnostic-only** and must not be cited as benchmark truth.
