# posts-users-ui-ng Runtime Report

**Date:** 2026-03-21 (authoritative — after backend stabilization + regression fix)
**Result:** 17/18 passed (94.4% C3)

---

## Coverage

| Tier | Coverage | Fraction |
|---|---|---|
| C1 (Plan) | 100.0% | 18/18 |
| C2 (Code) | 100.0% | 18/18 |
| C3 (Execution) | 94.4% | 17/18 |

---

## Progression

| Run | Pass/Total | C3 | Notes |
|---|---|---|---|
| Original authoritative | 17/18 | 94.4% | Manual seed data, in-memory backend |
| After backend stabilization (interim) | 16/18 | 88.9% | MySQL-backed; NewUserComponent WSF regressed |
| **After regression fix** | **17/18** | **94.4%** | MySQL-backed + B1/B2 interaction fixes; baseline restored |

**Regression root causes (all resolved):**
1. Backend MySQL datetime format: ISO strings with `T`/`Z` rejected by MySQL `DATETIME` column. Fixed by converting to `Date` object in `mysql-user.datasource.ts`.
2. B2 submit step: `executeScript('click')` bypasses Angular's Zone.js `(ngSubmit)` pipeline. Fixed with native `submitBtn.click()`.
3. B2 radio step: same Zone.js bypass. Fixed with native `el.click()` on `mat-radio-button` (description prefix `Native-click`).
4. B2 date sendKeys: Chrome `<input type="date">` interprets `2024-01-01` per-segment → garbled. Fixed by reformatting ISO dates to `MMDDYYYY` digits in B2 emitter.

---

## Backend Architecture

**Previous:** In-memory arrays (data lost on restart, required manual UI seeding)
**Current:** MySQL 8.0 via docker-compose with deterministic SQL seed data

Startup: `cd posts-users-backend && docker-compose up -d`
Teardown: `cd posts-users-backend && docker-compose down [-v]`

Seed includes:
- User `Alice Johnson` (UUID `3f57c674-52eb-48f7-b067-3254fdba47ff`, bio > 150 chars)
- User `Bob Smith` (UUID `a1b2c3d4-e5f6-7890-abcd-ef1234567890`)
- 2 posts

No manual seeding required. `docker-compose down -v && docker-compose up -d` resets to clean seed state.

---

## Remaining Failures (1)

| Workflow | Category | Root Cause |
|---|---|---|
| UserSearchComponent WTH | Known residual (CONDITIONAL) | `*ngIf="searchEntry"` — clear-search button only renders after typing into search input. Requires multi-step precondition beyond B1 scope. |
