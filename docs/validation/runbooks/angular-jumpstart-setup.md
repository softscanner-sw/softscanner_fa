# angular-jumpstart Environment Setup

Authoritative runbook for running the angular-jumpstart subject locally.

---

## Prerequisites
- Node.js 18+ (Angular 20 supports Node 18.19+, 20.x, 22.x)

## 1. Build the Angular App

```bash
cd C:/Users/basha/git/github/Angular-JumpStart
npm install
npm run build
```

## 2. Start the Express Server (Serves Both App + API)

```bash
cd C:/Users/basha/git/github/Angular-JumpStart
npm start
```

This starts the Express server on **port 8080** (`server.js`). It serves the built Angular app from `dist/` AND the JSON API (`/api/customers`, `/api/auth/login`). It loads `public/data/customers.json` and `public/data/states.json` into memory at startup. No database required.

**Do NOT use `ng serve` (port 4200) for benchmarking.** The Angular app's `getApiUrl()` routes API calls to port 7071 (Azure Functions emulator) when running on port 4200, causing all data-loading to fail silently.

Verify:
```bash
curl -s http://localhost:8080/api/customers/page/0/10 | head -c 200
# Expected: JSON array of customer objects
curl -s -X POST -H "Content-Type: application/json" -d '{"email":"x","password":"x"}' http://localhost:8080/api/auth/login
# Expected: "true"
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080
# Expected: 200 (Angular app served from dist/)
```

## 3. Seed Data (Static, In-Repo)

Customer and state data are static JSON files committed to the subject repo. No seeding action required. Modifications during a test session are kept in Express memory and lost on backend restart.

| Entity | ID | Key Fields |
|---|---|---|
| Customer 1 | `1` | ted james, Phoenix AZ, 2 orders |
| Customer 2 | `2` | Michelle Thompson, Encinitas CA |
| Customers 3–11 | `3..11` | Variations across US states with full address + orders |

The manifest pins `routeParamValues.id` to `"1"`.

## 4. Auth Behavior

Authentication is a mock: `POST /api/auth/login` always returns `true` (`server.js:113`). No password validation is performed server-side; the form-level validators on the client require email format + password ≥ 6 chars with at least 1 digit.

The manifest credentials `test@example.com` / `password1` satisfy the client validators and are accepted by the mock backend. The single class-based guard, `CanActivateGuard`, protects `/customers/:id/edit`.

## 5. Manifest-Critical Values

| Field | Value | Notes |
|---|---|---|
| `baseUrl` | `http://localhost:8080` | Express server (app + API) |
| `accounts` | 1 account | Mock auth — any valid-format email + 6+ char password works |
| `routeParamValues.id` | `"1"` | First customer in the static seed |
| `authSetup.usernameField` | `#email` | `login.component.html:18` |
| `authSetup.passwordField` | `#password` | `login.component.html:46` |
| `authSetup.submitButton` | `form.login-form .login-submit` | `login.component.html:73` (scoped) |
| `authSetup.authSuccessSelector` | `app-customers` | Customer list root component selector after redirect to `/customers` |

## 6. Run B3/B4

```bash
cd C:/Users/basha/git/claude/softscanner_fa
node node_modules/tsx/dist/cli.mjs src/b3-cli.ts angular-jumpstart
```

`npm run b3` is **prohibited** for benchmark claims (per `docs/validation/protocols/benchmark-execution-protocol.md` §0).

## 7. Teardown

```bash
# Stop Express server (Ctrl+C in the node server.js terminal)
```

No state is persisted to disk during normal operation; restart restores the static seed.

## 8. Known Caveats

- **`CanDeactivateGuard` modal.** The edit form (`/customers/:id/edit`) registers a `CanDeactivateGuard` that opens a modal Promise when navigating away with unsaved changes (`customer-edit.component.ts:131-143`). Generated tests that fill the form and navigate elsewhere may hang on this modal. Mitigation: tests should save the form before any subsequent navigation, or the workflow should be skipped via `skipWorkflows`.
- **Lazy-loaded Google Maps.** The map view (`map.component.ts`) requires a Google Maps API key not present in the repo. Workflows that depend on the map will fail. Treated as known residuals.
- **300 ms transition timers** on modal hide and growler notifications — already accommodated by the default `navigationWait: 10000ms` profile.
- **Stateful in-memory backend.** Modifications to customers persist across tests within a single backend session. To force a clean baseline between full benchmark runs, restart `node server.js`.
