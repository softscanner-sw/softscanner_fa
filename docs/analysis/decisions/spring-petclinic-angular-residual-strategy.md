# spring-petclinic-angular Residual Strategy

**Date:** 2026-03-20
**Before:** 42/74 (56.8%)
**After:** 44/74 (59.5%)

---

## Fixes Applied in This Pass

| Fix | Layer | Tests resolved |
|---|---|---|
| Static `readonly` exclusion | B1 | PetAdd/PetEdit WSF (readonly `owner_name` field) |
| routerLink interpolation detection | B1 | OwnerList WNR (`{{owner.id}}` in routerLink) |
| WTH no-CNR postcondition | B1 | PettypeList, SpecialtyList, VetList WTH (terminal = default entry, no CNR evidence) |
| `clear-and-type` catch clear() failure | B2 | Resilience for mat-datepicker inputs |

---

## Family-by-Family Strategy Analysis

### F1 — Edit form postcondition timeouts (6 tests)
**Mechanism:** Form submits via API, server processes, redirect follows.
**Strategies:** (a) Increase NAVIGATION_WAIT → crude, helps some. (b) Wait-for-network-idle → requires CDP. (c) Retry with backoff → adds complexity.
**Recommended:** Defer to B5. The postconditions are correct; the wait window is insufficient.

### F2 — List async-render timeouts (6 tests)
**Mechanism:** Component fetches data from REST API → renders after response.
**Strategies:** (a) Increase IMPLICIT_WAIT → crude. (b) Wait-for-specific-element after navigation → already done (body wait). (c) Wait for component's data observable → requires app instrumentation.
**Recommended:** Defer to B5.

### F3 — PetAdd/PetEdit forms
**Previously:** `invalid element state` from `clear()` on readonly/datepicker.
**Now:** Fixed by readonly exclusion + `clear()` catch. PetAdd WSF/WTH now pass or have correct postconditions.
**Status:** Resolved.

### F4 — Add form element-not-found (4 tests: PettypeAdd, SpecialtyAdd)
**Mechanism:** `app-pettype-add` / `app-specialty-add` component selectors not found. These may be inline components that render lazily after route activation.
**Recommended:** Defer to B5 (component-ready wait strategy needed).

### F5 — OwnerList/Detail navigation (3 tests)
**Previously:** routerLink interpolation (`{{owner.id}}`) caused CSS selector failure.
**Now:** Interpolation detected → falls through to class/tag-position locator.
**Status:** Partially resolved (+1 OwnerList). Remaining failures are postcondition timeouts.

### F6 — VisitList element-not-found (2 tests)
**Mechanism:** `.btn.btn-default` selector for visit action buttons. The visit list may be empty for the seeded pet (pet 1 has 0 visits in seed data).
**Recommended:** Defer to B5 (data-dependent materialization).

---

## Boundary Decision

| Set | Count | Description |
|---|---|---|
| **Set A (current phase)** | **0** | All current-phase defects resolved |
| **Set B (B5)** | **30** | API timing + async rendering + data-dependent |

---

## Parallel Execution Decision
**Reject for now.** Shared H2 backend + data-mutating tests make parallelism unsafe.

---

## Files Changed
- `src/phase-b/b1/plan-deriver.ts` — routerLink interpolation, WTH no-CNR postcondition
- `src/phase-b/b1/intent-deriver.ts` — static readonly exclusion (refined from aggressive to literal-only)
- `src/phase-b/b2/test-emitter.ts` — `clear-and-type` catch clear() failure
- `docs/analysis/phase-b/gt/spring-petclinic-angular.json` — GT synced
- `docs/analysis/runtime/spring-petclinic-angular.md` — updated baseline
