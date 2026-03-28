# Phase B Evolution — Decision Log
Compressed chronological record of Phase B decisions, from B0 through B3/B4 hardening.

---

## B0 (2026-03-12)
- Removed non-normative `AuthMechanism` and `timeout` fields from manifest schema
- Added `authSetup?: AuthSetup` (loginRoute, usernameField, passwordField, submitButton)
- B0 wizard CLI created (`src/b0-wizard-cli.ts`) for manifest scaffolding from A2
- Wizard corrections: authSetup derivation from A1, multi-family param prompting, routeParamOverrides

## B1 (2026-03-12 — 2026-03-15)
### 5 normative spec amendments frozen
1. **Start Route Selection** — exclude wildcards; prefer unguarded; fewest params; shortest path
2. **Route Param Scope** — assignment includes params from both startRoute and terminalRoutePath
3. **Form Field Scope** — all widget kinds included with kind-aware step types (click/type/select-option)
4. **Auth Materialization** — based on selected startRoute's guards only
5. **Dialog Precondition** — CCC target + `/dialog|modal/i` selector match

### Execution-input realism audit (2026-03-15)
- Verified value provenance: manifest overrides → defaults → route params → accounts
- Fixed V-01: mat-select default value `option-1` (was `test-{key}`)
- Classification: 14 execution-ready, 2 weak placeholders, 1 semantic sentinel (file input)

## B2 (2026-03-12 — 2026-03-15)
- Pure emitter architecture: ActionPlan → Selenium TypeScript test string
- 257/257 tests generated, byte-identical determinism
- Executability issues E-01..E-09 resolved (subprocess model, auth wait, mat-select CDK overlay, form submit)

## B3/B4 Implementation (2026-03-15)
- B3 runner: readiness check → subprocess execution → bounded retry → failure classification
- B4 coverage: tiered metrics (C1/C2/C3/C4) with denominator rules
- Screenshot defect: npm PATH injection caused tsx subprocess to exit before IIFE completed → fixed by cleaning `node_modules` from subprocess PATH
- Observability boundary: mandatory evidence = structured B3 results; optional = OpenTelemetry (deferred)
- External framework (`softscanner-continuous-quality-assessment-backend`): reuse nothing — instruments AUT, not test execution

## B1/B2 Hardening (2026-03-15 — 2026-03-19)
Fixes driven by posts-users-ui-ng and airbus-inventory runtime results:

| Fix | Layer | Description |
|---|---|---|
| routerLink for buttons | B1 | Skip `routerlink` CSS for non-`<a>` elements (Angular doesn't render attribute) |
| routerLink quote stripping | B1 | Strip JS quotes from `routerLinkText` (`'/path'` → `/path`) |
| tag-position stableIndex | B1+B2 | Use widget stableIndex for nth-of-type position |
| CSS class locator fallback | B1 | Use compound CSS class selector before tag-position fallback |
| Auth-aware route selection (B1-G1) | B1 | Prefer guarded routes when workflow requires auth |
| Login credential materialization (B1-G2) | B1 | Use manifest credentials for login-form WSF |
| Login WSF oracle (B1-G2b) | B1 | `assert-no-crash` for login-route WSF (terminal unresolvable) |
| Dialog opener route (B1-G3) | B1 | Navigate to route that activates opener component |
| Dynamic-ID postcondition | B1+B2 | WSF terminal params not in start routes → regex URL assertion |
| File path resolution | B2 | `path.resolve()` for absolute platform-native paths |
| Chrome viewport | B2 | `--window-size=1920,1080` (sidenav visibility) |
| JS click | B2 | `executeScript('click')` to bypass CSS overlay interception |
| File provisioning | B3 | Create `/tmp/test-file.txt` at runtime |
| Failure classifier | B3 | Added `ElementNotInteractableError` and `InvalidArgumentError` |

## Spec Amendments Applied to approach.md
1. `idAttr` field in formSchema
2. Form Field Scope rewrite (widget-kind-aware step types, key resolution order)
3. Composite widget capture (RadioGroup, Option)
4. Dynamic-ID postcondition rule
5. `routeParamOverrides` in SubjectManifest
