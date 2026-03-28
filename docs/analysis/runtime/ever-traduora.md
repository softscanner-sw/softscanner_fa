# ever-traduora Runtime Report

**Date:** 2026-03-27 (authoritative baseline)
**Result:** 48/109 passed (44.0% C3)

---

## Coverage

| Tier | Coverage | Fraction |
|---|---|---|
| C1 (Plan) | 100.0% | 109/109 |
| C2 (Code) | 100.0% | 109/109 |
| C3 (Execution) | 44.0% | 48/109 |

---

## Progression

| Run | Pass/Total | C3 | Notes |
|---|---|---|---|
| Initial (Node 16 ESM error) | 0/109 | 0% | tsx incompatible with Node 16 |
| First clean run (Node 22) | 19/109 | 17.4% | Auth lockout cascade + generic-class + no modal support |
| After generic-class + seed + isTemplateContent | 32/109 | 29.4% | Auth lockout partially mitigated |
| **Final (canonical auth model)** | **48/109** | **44.0%** | authSuccessSelector-only polling, template-aware positioning |

---

## Auth Contract

Ever-traduora uses the canonical Phase B auth contract:
- `authSuccessSelector: "app-bar [routerLink='/projects']"` — sole auth success signal
- `preAttemptCommand` resets login lockout counters via SQL before each test attempt
- Auth success detection: zero-implicit-wait polling for authSuccessSelector, 45s timeout
- No URL-based auth detection, no fixed sleeps, no form-disappearance checks

---

## Remaining Failures (61)

### By classification

| Classification | Count | Families |
|---|---|---|
| True limitation | 30 | Inline components (15), template positional (6), modal opener fail (5), template wait (4) |
| True B5 | 27 | Auth timing (10), DOM positional (8), DOM wait (5), other wait (2), interactable (1), postcondition (1) |
| Unresolved | 2 | Attribute selector not found (UserSettings, Search) |
| Environment | 1 | OAuth provider not configured (SignInWith) |
| Seed/data | 1 | Label entity not seeded (LabelComponent) |

### True limitations (30)
These are structural gaps in the A1→B1 derivation chain:
- **Inline components without derivable opener (15):** Components composed via CCC with zero-widget parents, multiple CCC parents, or no unique non-template opener button.
- **Template positional mismatch (6):** Button position inside ng-bootstrap modal doesn't match rendered DOM despite template-aware counting.
- **Modal opener fail (5):** Opener click doesn't open modal — components with 0 or 2+ non-template buttons where the single-button rule can't derive the opener.
- **Template wait (4):** Element wait inside unopened modal — downstream of opener failure.

### True B5 (27)
These are execution-layer timing issues where the test is correctly generated but runtime element availability exceeds the wait window:
- **Auth timing (10):** Login succeeds (proven by retry success) but Angular transition exceeds 45s for authSuccessSelector to render.
- **DOM positional/wait (13):** Elements in always-rendered DOM not present within implicit wait — async data loading.
- **Other (4):** Non-positional element wait, interactability, postcondition timing.

---

## Environment Requirements

- Node 16 for Angular 12 frontend compilation (webapp)
- Node 22 for framework execution (tsx, B3)
- Docker Compose for backend (MySQL 5.7 + Traduora API)
- CORS enabled via `TR_CORS_ENABLED=true` in docker-compose.yaml
- Deterministic seed: `node scripts/seed-traduora.mjs` (terms, API client, locale, accounts, loginAttempts reset)
