# Airbus Residual Upstream Corrections

**Date:** 2026-03-19
**Before:** 15/21 (71.4% C3)
**After:** 19/21 (90.5% C3)

---

## F1 — Service-mediated navigation terminal (Phase A1 fix)

**Root cause:** A1's `_extractFromMethod()` stopped at service call boundaries. `this.routerService.routeToUpdateProduct()` was classified as a ServiceCall, not a Navigate context. No CNR edge was emitted. A2 defaulted terminal to the start route.

**Fix:** Bounded Router-service tracing in `logic-utils.ts`. When a ServiceCall targets a class matching `/router|navigation/i`, A1 resolves the service class via ts-morph, finds the called method, and recursively extracts Navigate call contexts from it (depth-limited to 1 level).

**Result:** 4 new CNR edges in Airbus: GetAllProducts→/update, LoginPage→/dashboard, SuccessfulDialog→/getAllProducts, UnSuccessfulDialog→/getAllProducts.

**Fix layer:** Phase A1 implementation.
**Spec update:** approach.md §A2 terminal resolution limitation documented.

## F2 — Dual-trigger widget (B1 postcondition fix)

**Root cause:** WTH workflow on a widget that also has `routerLink`. JS click fires both the handler AND routerLink navigation, making the post-click URL unpredictable.

**Fix:** B1 postcondition generation detects `triggerWidget.routerLinkText` on WTH workflows and emits `assert-no-crash` instead of `assert-url-matches`. Both WTH and WNR workflows are preserved in A2 (WTH/WNR deduplication explicitly rejected).

**Fix layer:** B1 implementation only.
**WTH/WNR dedup rejected:** Yes — both workflows remain in A2 enumeration.

## F3 — CSS-hidden widget (Phase A1 enhancement + B1 consumption)

**Root cause:** A1 captured visibility from `*ngIf`/`[hidden]` directives but not from CSS class-based hiding (`class="hide"`).

**Fix:** New `cssVisibilityHint` field on `WidgetUIProps` (multigraph.ts). Populated heuristically when CSS class tokens match `/\b(hide|hidden|d-none|visually-hidden|sr-only)\b/i`. NOT mapped to `visibleLiteral` — remains explicitly heuristic. B1 consumes it conservatively: when `cssVisibilityHint === false`, emit `assert-no-crash` postcondition.

**Fix layer:** Phase A1 (field + population) + B1 (consumption).

## F4 — Dialog opener action (B1 derivation fix)

**Root cause:** Dialog precondition clicked the opener component root element instead of the specific trigger widget. The spec defined the opener COMPONENT but not the opener ACTION.

**Fix:** B1 dialog precondition now traces: CCC (opener → dialog) + CCS edges with matching effectGroupIds + WTH edges from widgets in the opener component. Prefers handlers that do NOT have associated CNR edges (non-navigating handlers are more likely to open dialogs on the current page). Derives the opener widget's CSS class selector (e.g., `.material-icons.delete`). B2 emits a scoped click on this specific widget.

**Fix layer:** B1 implementation + B2 emission.
**Constraint:** Only emits opener widget when a single defensible candidate exists (non-navigating handler with matching effectGroupId).

---

## GT Updates
- airbus-GT-06: terminalUrl `/dashboard` → `/update` (F1: edit handler CNR)
- airbus-GT-10: terminalUrl `/login` → `/dashboard` (F1: login handler CNR)
- airbus-GT-19: terminalUrl `/dashboard` → `/getAllProducts` (F1: dialog handler CNR)
- airbus-GT-20: terminalUrl `/dashboard` → `/getAllProducts` (F1: dialog handler CNR)

---

## Remaining Failures (2/21)

| Test | Outcome | Root cause | Classification |
|---|---|---|---|
| 45249d9e MainNav toggle | FAIL_TIMEOUT | `visibleExprText: "isHandset$ | async"` — viewport-conditional (A2 CONDITIONAL) | Spec-consistent residual |
| 89688c49 SuccessfulDialog | FAIL_TIMEOUT | Delete API failed → UnSuccessfulDialog appeared instead. Screenshot proves dialog opener F4 fix works — the wrong dialog appeared due to backend error | Runtime data issue |

---

## Posts-users-ui-ng Regression Check
- 18/18 GT matched
- 100% B2 generation
- B1 plan determinism verified
- Zero regressions

---

## End-State Answers

1. **Which failures were truly upstream-fixable?** F1 (A1 Router tracing), F2 (B1 postcondition), F3 (A1 cssVisibilityHint + B1 consumption), F4 (B1 dialog opener action)
2. **Which required Phase A1/A2 changes?** F1 (A1 call context extraction) and F3 (A1 WidgetUIProps)
3. **Which required only B1/B2 changes?** F2 (B1 postcondition) and F4 (B1+B2 dialog opener)
4. **Was WTH/WNR deduplication explicitly rejected?** Yes — both workflows preserved in A2
5. **How is CSS visibility represented and consumed?** `cssVisibilityHint: boolean | undefined` on WidgetUIProps. Heuristic from class tokens. B1 uses it for conservative postcondition weakening only.
6. **How is dual-trigger interference modeled?** B1 detects `routerLinkText` on WTH trigger widgets and emits `assert-no-crash` (click interference makes URL unpredictable)
7. **How is dialog opener action derived?** CCC → CCS effectGroupId matching → WTH edge resolution → prefer non-navigating handlers → CSS class selector of trigger widget
8. **Updated Airbus pass/fail/C3?** 19/21 (90.5% C3)
9. **Updated posts pass/fail/C3?** 17/18 (94.4% C3) — seeded rerun 2026-03-19. Previous 10/18 was environment-empty; previous 14/18 contained 1 false-positive.
10. **Any F1-F4 regressions?** Zero. With correct seed data, posts improved from 14/18 (with false positive) to 17/18 (all genuine passes). The only residual is UserSearchComponent_WTH (CONDITIONAL: *ngIf="searchEntry").
11. **Is the system ready to move to the next subject?** Yes
