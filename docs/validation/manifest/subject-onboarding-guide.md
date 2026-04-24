# Subject Onboarding Guide

**Purpose:** Concrete per-subject input reference for manifest generation via the B0 wizard.
**Usage:** Read this before running the wizard for a subject. It tells you exactly what values to enter and why.
**Scope:** The seven subjects in the frozen benchmark corpus. See `docs/validation/empirical reports/subjects.md` for the subject registry and `docs/ROADMAP.md` Stage 5 for current metrics.

---

## posts-users-ui-ng

### What the wizard infers
- Route param `id` needed (6 CONDITIONAL workflows depend on it)
- Form workflows present (WSF triggers exist)
- No auth guards

### What you must provide
| Field | Value | Confidence | Why |
|---|---|---|---|
| baseUrl | `http://localhost:4200` | Confirmed | Standard Angular dev server |
| routeParamValues.id | `3f57c674-52eb-48f7-b067-3254fdba47ff` | Confirmed | Alice Johnson's UUID from the Docker seed SQL |
| seedStatus | `pre-seeded` | Confirmed | Docker Compose runs seed SQL automatically on first boot |

### Known pitfalls
- The backend is Express, NOT Angular — it runs on port 5000. The frontend proxies to it.
- The `id` value is a UUID, not a numeric ID. Use the first seeded user's UUID.
- `formDataOverrides` may be needed for NewUser WSF — the backend rejects duplicate emails (POST 400).

### Execution config
- **seedCommand:** Not needed (Docker auto-seeds)
- **preAttemptCommand:** Not needed (no rate limiting)
- **batchResetCommand:** Not needed
- **enableNetworkEvidence:** Recommended (has WSF workflows + backend API)

---

## heroes-angular

### What the wizard infers
- No auth guards
- No route params
- No form workflows

### What you must provide
| Field | Value | Confidence | Why |
|---|---|---|---|
| baseUrl | `http://localhost:7626` | Confirmed | NOT port 4200 — heroes uses 7626 |
| seedStatus | `none` | Confirmed | json-server with static db.json |

### Known pitfalls
- **Port 7626**, not 4200. The manifest baseUrl must match.
- json-server modifies `db.json` on disk during tests. Run `git checkout db.json` after test runs to reset.
- Requires `NODE_OPTIONS=--openssl-legacy-provider` for Angular 11 on Node 17+.
- Two WNE (external link) workflows will always fail because twitter.com→x.com and aka.ms→azure redirect.

### Execution config
- None needed. This is the simplest subject.

---

## airbus-inventory

### What the wizard infers
- Auth guard `CanActivateRouteGuard` (11 CONDITIONAL workflows)
- Form workflows present
- No route params (entity ID is embedded in runtime state, not route)

### What you must provide
| Field | Value | Confidence | Why |
|---|---|---|---|
| baseUrl | `http://localhost:4200` | Confirmed | Standard Angular dev server |
| accounts[0].username | `airbus02@gmail.com` | Confirmed | Email format required by frontend Validators.email |
| accounts[0].password | `1234` | Confirmed | Bcrypt hash in DB matches this plain text |
| accounts[0].roles | `["user"]` | Confirmed | |
| accounts[0].guardSatisfies | `["CanActivateRouteGuard"]` | Confirmed | |
| authSetup.loginRoute | `/login` | Confirmed | Angular route config |
| authSetup.usernameField | `input[formcontrolname='emailid']` | Confirmed | login-page.component.html |
| authSetup.passwordField | `input[formcontrolname='password']` | Confirmed | login-page.component.html |
| authSetup.submitButton | `button[type='submit']` | Confirmed | login-page.component.html |
| authSetup.authSuccessSelector | `mat-sidenav-container` | Confirmed | Post-login Material layout element |
| seedStatus | `needs-command` | Confirmed | MySQL must be seeded with schema + users |

### Known pitfalls
- The DB username is `airbus02@gmail.com` (email format), NOT `airbus02` (which is in the original SQL). The frontend form has email validation.
- Backend (Spring Boot) runs on port 8080 — conflicts with traduora. Do not run both simultaneously.
- MySQL runs on port 3306 — also conflicts with traduora. Use separate Docker containers.
- Angular 12 requires `NODE_OPTIONS=--openssl-legacy-provider` on Node 17+.

### Execution config
- **seedCommand:** `docker exec -i airbus-mysql mysql -u root -ppassword Product < scripts/airbus-seed.sql` (or equivalent inline SQL)
- **preAttemptCommand:** Not needed (no rate limiting)
- **batchResetCommand:** Not needed
- **enableNetworkEvidence:** Recommended

---

## spring-petclinic-angular

### What the wizard infers
- Route param `id` needed (34 CONDITIONAL workflows — all entity CRUD routes)
- Form workflows present (12 WSF triggers)
- No auth guards

### What you must provide
| Field | Value | Confidence | Why |
|---|---|---|---|
| baseUrl | `http://localhost:4200` | Confirmed | Standard Angular dev server |
| routeParamValues.id | `1` | Confirmed | All seeded entities start at id=1 |
| routeParamOverrides | See below | Confirmed | Multiple entity families share `:id` |
| seedStatus | `pre-seeded` | Confirmed | Docker image includes H2 in-memory DB with seed data |

### Route param overrides (9 templates, all `id=1`)
```json
{
  "/owners/:id": { "id": "1" },
  "/owners/:id/edit": { "id": "1" },
  "/owners/:id/pets/add": { "id": "1" },
  "/pets/:id/edit": { "id": "1" },
  "/pets/:id/visits/add": { "id": "1" },
  "/pettypes/:id": { "id": "1" },
  "/specialties/:id": { "id": "1" },
  "/vets/:id/edit": { "id": "1" },
  "/visits/:id/edit": { "id": "1" }
}
```

### Known pitfalls
- **Base href must be changed before `ng serve`.** The source `index.html` has `<base href="/petclinic/">` which breaks asset loading. Change to `<base href="/">` before starting, revert after.
- Backend runs on port 9966 (Docker). The Angular app proxies API calls to `http://localhost:9966/petclinic/api/`.
- Some form submissions fail with HTTP 400 due to backend DTO validation being stricter than frontend. Consider `formDataOverrides` for PetAdd and VisitAdd.

### Execution config
- **seedCommand:** Not needed (Docker image is pre-seeded)
- **preAttemptCommand:** Not needed
- **batchResetCommand:** Not needed
- **enableNetworkEvidence:** Recommended (has complex form submissions + entity API)

---

## ever-traduora

### What the wizard infers
- Auth guards: `AuthGuard` (most routes), `CanGuard` (admin routes)
- Negative guard: `NoAuthGuard` (login/signup pages — require NOT being logged in)
- Route params: `projectId`, `localeCode`
- Form workflows present

### What you must provide
| Field | Value | Confidence | Why |
|---|---|---|---|
| baseUrl | `http://localhost:4200` | Confirmed | Angular 12 dev server |
| accounts[0].username | `admin@test.com` | Confirmed | Created by seed script |
| accounts[0].password | `Test1234!` | Confirmed | Seed script value |
| accounts[0].roles | `["admin"]` | Confirmed | |
| accounts[0].guardSatisfies | `["AuthGuard", "CanGuard"]` | Confirmed | Project admin satisfies both |
| accounts[1].username | `user@test.com` | Confirmed | Created by seed script |
| accounts[1].password | `Test1234!` | Confirmed | Seed script value |
| accounts[1].roles | `["user"]` | Confirmed | |
| accounts[1].guardSatisfies | `["AuthGuard"]` | Confirmed | Regular user, no CanGuard |
| routeParamValues.projectId | `<UUID from seed>` | **Tentative** | UUID generated by seed — changes on each seed run |
| routeParamValues.localeCode | `en` | Confirmed | Created by seed script |
| authSetup.loginRoute | `/login` | Confirmed | Angular route |
| authSetup.usernameField | `input[formcontrolname='email']` | Confirmed | login.component.html |
| authSetup.passwordField | `input[formcontrolname='password']` | Confirmed | login.component.html |
| authSetup.submitButton | `button[type='submit']` | Confirmed | login.component.html |
| authSetup.authSuccessSelector | `app-bar [routerLink='/projects']` | Confirmed | Post-login nav element |
| seedStatus | `needs-command` | Confirmed | Accounts + project + locale must be provisioned |

### Known pitfalls
- **Node 16 required for frontend.** Angular 12 + TypeScript 4.2.3 do not compile on Node 22.
- **projectId is dynamic.** The seed script creates a project and gets a UUID back. You must update `routeParamValues.projectId` after seeding, then regenerate B1/B2.
- **Rate limiting.** The traduora backend has an in-memory NestJS rate limiter. `preAttemptCommand` resets DB lockout but NOT the in-memory limiter. `batchResetCommand` restarts the container to clear it.
- **Port conflicts.** Backend on 8080 (conflicts with airbus), MySQL on 3306 (conflicts with airbus). Never run both simultaneously.

### Execution config
- **seedCommand:** `node scripts/seed-traduora.mjs` (idempotent — creates accounts, project, locales, terms, translations, labels, team member, API client)
- **preAttemptCommand:** `docker exec mysqldb mysql -u tr -pchange_me tr_dev -e "UPDATE user SET loginAttempts = 0, lastLogin = NULL;"`
- **batchResetCommand:** `docker restart traduora && sleep 10`
- **enableNetworkEvidence:** Yes (auth-heavy, complex API interactions)

---

## angular-jumpstart

### What the wizard infers
- Route param `id` needed (workflows on `/customers/:id` family)
- Form workflows present (login, edit)
- One auth guard (`CanActivateGuard`) on `/customers/:id/edit`
- Modern control-flow templates (`@if`/`@for`) extracted via the A1 modernization patches

### What you must provide
| Field | Value | Confidence | Why |
|---|---|---|---|
| baseUrl | `http://localhost:8080` | Confirmed | Express server serves the built app on 8080 and exposes `/api/*`; the Angular dev server on 4200 routes API calls to port 7071 (Azure Functions emulator) and silently fails |
| accounts[0].username | `test@example.com` | Confirmed | Mock backend accepts any RFC-format email |
| accounts[0].password | `password1` | Confirmed | Validators require ≥6 chars + 1 digit; backend ignores password |
| accounts[0].guardSatisfies | `["CanActivateGuard"]` | Confirmed | Class-based guard at `/src/app/customer/guards/can-activate.guard.ts` |
| routeParamValues.id | `"1"` | Confirmed | First customer in `public/data/customers.json` |
| authSetup.loginRoute | `/login` | Confirmed | Angular route |
| authSetup.usernameField | `#email` | Confirmed | login.component.html:18 |
| authSetup.passwordField | `#password` | Confirmed | login.component.html:46 |
| authSetup.submitButton | `form.login-form .login-submit` | Confirmed | login.component.html:73 (scoped) |
| authSetup.authSuccessSelector | `cm-customers` | Confirmed | Customer list component selector after `/customers` redirect (`cm-` is JumpStart's component prefix) |
| seedStatus | `pre-seeded` | Confirmed | Static JSON files committed in `public/data/` |

### Known pitfalls
- **`CanDeactivateGuard` modal.** The edit form opens a Promise-based modal on dirty-navigation. Generated tests must save before navigating away, or the workflow will hang.
- **Lazy-loaded Google Maps.** Map workflows fail without an API key (not committed). Treat as known residuals.
- **Stateful in-memory backend.** Customer modifications persist across tests within a backend session. Restart `node server.js` for a clean baseline between full benchmark runs.

### Execution config
- **readinessEndpoint:** `http://localhost:4200`
- **enableNetworkEvidence:** Yes
- **No seedCommand needed** — static seed in repo

---

## event-booking-mean

### What the wizard infers
- One class-based auth guard (`AuthGuardService`) on `/create-event`
- No route parameters (all static paths)
- Form workflows present (login, register, create-event)
- Needs a seed command (Mongo + register-at-bootstrap); no static seed data shipped

### What you must provide
| Field | Value | Confidence | Why |
|---|---|---|---|
| baseUrl | `http://localhost:4200` | Confirmed | Angular dev server |
| accounts[0].username | `alice@example.com` | Confirmed | Matches seeded Alice123 from `SomeDemoData.txt` |
| accounts[0].password | `password123` | Confirmed | Matches seed |
| accounts[0].guardSatisfies | `["AuthGuardService"]` | Confirmed | `auth-guard.service.ts` guards `/create-event` |
| routeParamValues | `{}` | Confirmed | No `:param` placeholders in the routes array |
| authSetup.loginRoute | `/login` | Confirmed | |
| authSetup.usernameField | `input#email` | Confirmed | `login.component.html:10` |
| authSetup.passwordField | `input#password` | Confirmed | `login.component.html:13` |
| authSetup.submitButton | `form button[type='submit']` | Confirmed | `login.component.html:19` |
| authSetup.authSuccessSelector | `a.my-events` | Confirmed | Navbar "RSVPs" link only rendered when `isLoggedIn === true` |
| executionConfig.seedCommand | `node scripts/seed-event-booking-mean.mjs` | Confirmed | Idempotent register-via-API |
| seedStatus | `needs-command` | Confirmed | MongoDB + account registration required |

### Known pitfalls
- **Backend crash on malformed event payload.** `Event.js:39` has a typo that crashes the Node process when `/TPL/Events/add` receives a request without an image. B3 attempts to submit the event form without a file and triggers this. Restart the backend before re-runs.
- **Header `href=""` links.** Navbar uses empty `href` attributes on several links instead of `routerLink`. Workflows that target these as `WIDGET_NAVIGATES_EXTERNAL`/`WIDGET_NAVIGATES_ROUTE` will post-condition-fail because the URL does not change.
- **SessionStorage-only auth.** No JWT — auth state is stored in sessionStorage. Per-test Selenium isolation handles this correctly (each test logs in fresh via the auth precondition).
- **No route params.** `routeParamValues = {}`. This is the first authenticated subject in the corpus with no param-driven routes — a useful denominator variant.

### Execution config
- **seedCommand:** `node scripts/seed-event-booking-mean.mjs` (idempotent register of Alice, Bob, Charlie)
- **enableNetworkEvidence:** Yes
- **No preAttemptCommand / batchResetCommand needed** — sessionStorage auth is cleared automatically between tests by Selenium's per-test browser isolation

---

## Values summary table

| Subject | Auth | Params | Seed status | CDP | Rate-limit mitigation |
|---|---|---|---|---|---|
| posts-users-ui-ng | No | id (UUID) | pre-seeded | Yes | None needed |
| heroes-angular | No | None | none | No | None needed |
| airbus-inventory | Yes (1 account) | None | needs-command | Yes | None needed |
| spring-petclinic-angular | No | id=1 (9 overrides) | pre-seeded | Yes | None needed |
| ever-traduora | Yes (2 accounts) | projectId (UUID), localeCode | needs-command | Yes | preAttemptCommand + batchResetCommand |
| angular-jumpstart | Yes (1 mock account) | id=1 | pre-seeded | Yes | None needed |
| event-booking-mean | Yes (1 account) | None | needs-command | Yes | None needed |
