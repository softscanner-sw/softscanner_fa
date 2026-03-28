# Runtime Conventions
Policies for B3/B4 execution across all validation subjects.

---

## Execution Model
- Applications must be started externally before B3 execution
- B3 does not start, stop, or manage application processes
- One subject at a time — no parallel multi-subject execution

## Readiness Check
- HTTP GET to `manifest.baseUrl` before any test execution
- 30-second timeout with 1-second retry backoff
- If readiness fails, all workflows → `FAIL_APP_NOT_READY` (not test failure)

## Artifact Locations

```
output/<subject>/
  json/
    a1-multigraph.json       # Phase A stable
    a2-workflows.json        # Phase A stable
    b1-intents.json           # B1 stable
    b1-plans.json             # B1 manifest-dependent
    b2-tests.json             # B2 generation metadata
    b3-results.json           # B3 per-run
    b4-coverage.json          # B4 per-run
  tests/
    <hash>_<Component>_<Kind>.test.ts
  screenshots/
    <testName>/
      001_after-preconditions.png
      002_after-steps.png
      003_final.png (or 003_error.png)
  b3-b4-report.md
  b3-b4-report.pdf
logs/
  b3-execution.log
```

## Execution Command
```bash
npm run b3 -- <subjectName>
```

## Separation from Analysis
- Runtime artifacts (`output/`, `logs/`) are per-run ephemeral data
- Analysis documents (`docs/analysis/`) contain system-level reasoning
- Validation documents (`docs/validation/`) contain reproducible execution instructions
- These layers must not be mixed