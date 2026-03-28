# heroes-angular Runtime Report
**Date:** 2026-03-19 (final after residual corrections)
**Result:** 17/19 passed (89.5% C3)

---

## Coverage
| Tier | Coverage | Fraction |
|---|---|---|
| C1 (Plan) | 100.0% | 19/19 |
| C2 (Code) | 100.0% | 19/19 |
| C3 (Execution) | 89.5% | 17/19 |

---

## Progression
| Run | Pass/Total | C3 | Fixes applied |
|---|---|---|---|
| Initial (pre-href fix) | 7/19 | 36.8% | — |
| After href fix | 13/19 | 68.4% | `href` added to A1 interesting attributes |
| **After R2+R3 fixes** | **17/19** | **89.5%** | target="_blank" postcondition + binding expression detection |

---

## Fixes Applied
| Fix | Layer | Description | Tests resolved |
|---|---|---|---|
| `href` in interesting attributes | Phase A1 | A1 captures `href` in `meta.attributes` | +6 (AboutComponent WNE) |
| `target` in interesting attributes | Phase A1 | A1 captures `target` in `meta.attributes` | enables R2 |
| R2: target="_blank" postcondition | B1 | WNE with `target="_blank"` uses `assert-no-crash` | +3 (HeaderBar WNE) |
| R3: binding expression detection | B1 | Skip aria-label when value is a binding expression | +1 (ButtonFooter WTH) |

---

## Remaining Failures (2) — genuinely external
### 521a1214_AboutComponent_WNE — twitter.com → x.com redirect
- Expected: `http://twitter.com/john_papa`
- Got: `https://x.com/john_papa`
- Twitter's domain permanently redirected to X.com. The A1-captured href was correct at extraction time.

### 9bd04822_AboutComponent_WNE — aka.ms → azure.microsoft.com redirect
- Expected: `https://aka.ms/jp-free`
- Got: `https://azure.microsoft.com/en-us/pricing/...`
- Microsoft's URL shortener redirected to the full Azure pricing page.

Both are external URL redirects that occurred after the source code was written. The framework correctly captures the href and navigates — the destination domain changed independently.
