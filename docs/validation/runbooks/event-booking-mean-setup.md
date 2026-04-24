# event-booking-mean Environment Setup

Authoritative runbook for running the event-booking-mean subject locally.

---

## Prerequisites
- Node.js ≥ 18 (tested on 22.18.0)
- MongoDB Community Server running locally on port **27017** (default). No specific version is pinned by the backend; Mongoose 8.0.1 supports MongoDB 4.4+.
- Angular CLI is not globally required (dev-dep in the frontend package).

## 1. Start MongoDB

```bash
# Windows — MongoDB is typically installed as a service:
sc query MongoDB | grep STATE
# If not running:
net start MongoDB

# Linux / macOS:
sudo systemctl start mongod
```

Verify:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:27017
# Expected: 200 (or equivalent "It looks like you are trying to access MongoDB..." response)
```

The backend auto-creates the `TPL` database on first connection; no manual creation required.

## 2. Start the Backend

```bash
cd C:/Users/basha/git/github/Event-Booking-App-MEAN-STACK/EventNest/Backend
npm install
node server.js
```

Listens on **port 3000**. The Backend has no `start` script, so `node server.js` is the canonical invocation. Output: `Connected to MongoDB` + `Server is working on port 3000`.

Verify:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/TPL/Events
# Expected: 200
```

## 3. Seed Data

The backend stores bcrypt-hashed passwords. `SomeDemoData.txt` in the repo root has plaintext credentials for reference but is **not** a usable seed file. Use the pipeline seed script to register the three demo accounts via the backend API — idempotent on re-run:

```bash
cd C:/Users/basha/git/claude/softscanner_fa
node scripts/seed-event-booking-mean.mjs
```

This posts to `/TPL/Users/register` for alice@example.com, bob@example.com, charlie@example.com with passwords from the demo file. If an account already exists, the backend returns HTTP 400 and the script treats that as success.

Manifest `accounts[0]` uses Alice (`alice@example.com` / `password123`). She satisfies the class-based `AuthGuardService` on `/create-event`.

## 4. Start the Frontend

```bash
cd C:/Users/basha/git/github/Event-Booking-App-MEAN-STACK/EventNest/Frontend/app
npm install
npx ng serve --port 4200
```

Listens on **port 4200**. Verify:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4200
# Expected: 200
```

## 5. Manifest-Critical Values

| Field | Value | Notes |
|---|---|---|
| `baseUrl` | `http://localhost:4200` | Angular dev server |
| `accounts[0].username` | `alice@example.com` | Matches seeded Alice123 user |
| `accounts[0].password` | `password123` | Matches seed |
| `accounts[0].guardSatisfies` | `["AuthGuardService"]` | Class-based guard at `src/app/auth-guard.service.ts` |
| `routeParamValues` | `{}` | No `:param` placeholders in routes |
| `authSetup.loginRoute` | `/login` | |
| `authSetup.usernameField` | `input#email` | `login.component.html:10` |
| `authSetup.passwordField` | `input#password` | `login.component.html:13` |
| `authSetup.submitButton` | `form button[type='submit']` | `login.component.html:19` |
| `authSetup.authSuccessSelector` | `a.my-events` | Navbar "RSVPs" link, only rendered when `isLoggedIn === true` (`header.component.html`) |
| `executionConfig.seedCommand` | `node scripts/seed-event-booking-mean.mjs` | Runs once before the test suite |

## 6. Run B3 / B4

```bash
cd C:/Users/basha/git/claude/softscanner_fa
node node_modules/tsx/dist/cli.mjs src/b3-cli.ts event-booking-mean --max-retries 1 --batch-size 10
```

`npm run b3` is **prohibited** for benchmark claims (`docs/validation/protocols/benchmark-execution-protocol.md` §0).

## 7. Teardown

```bash
# Stop frontend (Ctrl+C in ng serve terminal)
# Stop backend (Ctrl+C in node server.js terminal)
# Stop MongoDB (leave running if shared with other dev work, or: net stop MongoDB)
```

Registered users and created events persist in the MongoDB `TPL` database across runs. To reset:
```bash
mongosh TPL --eval 'db.users.deleteMany({}); db.events.deleteMany({})'
# Then re-seed.
```

## 8. Required Local Subject Patch

The benchmark surfaced a confirmed backend crash bug in `EventNest/Backend/routes/Event.js:39`. The original code:
```js
return res.status(400).send({ error: 'Invalid date provided' .req.body.Date});
```
uses `.` (member-access) instead of `+` (concatenation), crashing the Node process on any event-creation POST without a valid Date. The one-line fix:
```js
return res.status(400).send({ error: 'Invalid date provided: ' + req.body.Date });
```
This patch is **mandatory** for reproducible benchmark results. Without it, the backend crashes mid-run and subsequent tests receive cascading FAIL_TIMEOUTs. Pre-fix C3: 13.3%; post-fix C3: 33.3%.

## 9. Known Caveats

- **SessionStorage-only auth.** The frontend `AuthService` stores `isLoggedIn` in sessionStorage. Selenium's per-test browser isolation handles this correctly (each test starts with empty storage and must log in via the auth precondition).
- **Backend has no JWT despite README claim.** Login returns the raw user record. The frontend does not attach an `Authorization` header to subsequent requests; routes are protected only client-side by the `AuthGuardService` consulting sessionStorage. This is a subject-quality caveat, not a pipeline issue.
- **Mixed-case routes.** The frontend calls `/TPL/Users/Login` (capital L) and `/TPL/Users/Register`; the backend defines `/login` and `/register` (lowercase). Express's default routing is case-insensitive, so this works — but if anyone adds `app.set('case sensitive routing', true)` in the future, it will break.
- **Event creation requires file upload.** `CreateEventComponent` uses `multer` server-side; workflows that try to submit the event form without picking an image may stall on validation. Treat image-dependent workflows as expected residuals.
- **No route params.** `routeParamValues = {}`. This is the first authenticated subject in the corpus with no param-driven routes — a useful denominator variant.
