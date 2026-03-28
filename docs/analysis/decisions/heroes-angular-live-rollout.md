# heroes-angular Live Rollout Decision

**Date:** 2026-03-19 (updated after residual corrections)
**Result:** 17/19 (89.5% C3) — 2 genuinely external residuals

---

## Fixes Applied (3 phases)

### Phase 1: `href` in A1 interesting attributes
`href` was missing from `extractBoundedAttributes`, causing B1 to use positional selectors for WNE external links.
**Impact:** +6 AboutComponent tests resolved.

### Phase 2: `target` in A1 + B1 postcondition for target="_blank"
`target` added to A1 interesting attributes. B1 detects `target="_blank"` on WNE workflows and emits `assert-no-crash` (headless Chrome can't follow new-tab navigation).
**Impact:** +3 HeaderBarBrand/Links tests resolved.

### Phase 3: Binding expression detection in B1
B1 now detects attribute values that are Angular binding expressions (single identifier pattern like `label`) and skips them in the locator priority chain. Falls through to CSS class selector.
**Impact:** +1 ButtonFooterComponent test resolved.

---

## Residual Classification (final)

| Test | Root cause | Classification |
|---|---|---|
| 521a1214_AboutComponent_WNE | twitter.com→x.com permanent redirect | True external limitation |
| 9bd04822_AboutComponent_WNE | aka.ms→azure.microsoft.com redirect | True external limitation |

These 2 residuals are provably outside framework control — the destination domains changed independently of the source code.

---

## Files Modified

- `src/analyzers/template/widgets/widget-utils.ts` — added `'target'` to interesting attributes
- `src/phase-b/b1/plan-deriver.ts` — R2 (target="_blank" postcondition) + R3 (binding expression detection)
- `docs/analysis/runtime/heroes-angular.md` — updated to 17/19
- `docs/analysis/decisions/heroes-angular-live-rollout.md` — updated
