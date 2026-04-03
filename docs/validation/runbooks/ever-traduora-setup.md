# ever-traduora Environment Setup

Authoritative runbook for running the ever-traduora subject locally.
Tested 2026-03-24 on Node 16.20.2 + Yarn 1.22.22.

---

## Prerequisites
- Docker and Docker Compose
- **Node.js 16.x** (16.20.2 tested) — Angular 12.2 does not compile on Node 22
- Yarn >=1.13.0 (`npm install -g yarn`)
- Ports 3306, 8080, 4200 free

**Node version:** Use `nvm use 16.20.2` if nvm-windows is installed. Angular 12.2 + TypeScript 4.2.3 require Node 16 or lower. No `NODE_OPTIONS=--openssl-legacy-provider` is needed on Node 16.

**tsconfig warnings in IDE:** The editor may show TypeScript deprecation warnings from a newer TS version in the IDE. These are editor-only diagnostics — the project compiles and runs correctly with its pinned TypeScript 4.2.3 via `ng serve`. Do NOT change tsconfig to suppress IDE warnings.

## 1. Backend Services (Docker Compose)

```bash
cd C:/Users/basha/git/github/autoe2e/benchmark/ever-traduora
docker-compose up -d
```

This starts:
- **MySQL 5.7** on port 3306 (database: `tr_dev`, user: `tr`, password: `change_me`)
- **Traduora API** (NestJS) on port 8080 (auto-runs TypeORM migrations on first boot)

Wait ~20-30 seconds for API to be ready:
```bash
curl -s http://localhost:8080/health
# Expected: {"status":"ok","version":"0.21.0"}
```

**Note:** The health endpoint is at `/health` (root level), NOT at `/api/v1/health`.

**CORS:** The docker-compose.yaml sets `TR_CORS_ENABLED=true` so the API sends `Access-Control-Allow-Origin: *` headers. Without this, browser requests from `http://localhost:4200` are blocked by CORS preflight failures. This was fixed by adding `TR_CORS_ENABLED: 'true'` to the traduora service environment in docker-compose.yaml.

## 2. Frontend (Angular Dev Server)

First-time setup (install dependencies):
```bash
cd C:/Users/basha/git/github/autoe2e/benchmark/ever-traduora/webapp
yarn install --network-timeout 120000
```

Start the dev server:
```bash
cd C:/Users/basha/git/github/autoe2e/benchmark/ever-traduora/webapp
node_modules/.bin/ng serve --port 4200
```

**Note:** Use the local `node_modules/.bin/ng` binary — `npx ng` may not resolve correctly on Node 16. `yarn start` also works but may need the same binary resolution.

The frontend makes direct cross-origin API calls to `http://localhost:8080/api/v1` (no proxy). CORS is enabled by the API in development mode.

Verify:
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:4200
# Expected: 200
```

## 3. Deterministic Seeding

A seed script creates all required data and updates the manifest automatically:

```bash
cd C:/Users/basha/git/claude/softscanner_fa
node scripts/seed-traduora.mjs
```

This creates (idempotent — safe to run multiple times):
- Admin account: `admin@test.com` / `Test1234!`
- Regular user: `user@test.com` / `Test1234!`
- Project: "Test Project" (reuses existing if present)
- Locale: English (`en`) on the project

The script:
1. Waits for the API to be healthy
2. Creates or reuses accounts
3. Creates or reuses the project
4. Adds the locale (idempotent)
5. Writes `subjects/ever-traduora/.seed-output.json` with the `projectId`
6. Updates `subjects/ever-traduora/subject-manifest.json` with the real `projectId`

**No manual copy-paste required.** The manifest is auto-synchronized.

After seeding, regenerate B1/B2:
```bash
npm run b1:intents && npm run b1:plans && npm run b2:codegen
```

## 4. Manifest-Critical Values

| Field | Value | Source |
|---|---|---|
| `baseUrl` | `http://localhost:4200` | Angular dev server |
| `accounts[0].username` | `admin@test.com` | Seed script |
| `accounts[0].password` | `Test1234!` | Seed script |
| `accounts[0].guardSatisfies` | `["AuthGuard","CanGuard"]` | Auto: project creator is Admin |
| `accounts[1].username` | `user@test.com` | Seed script |
| `accounts[1].password` | `Test1234!` | Seed script |
| `accounts[1].guardSatisfies` | `["AuthGuard"]` | Regular user, no project role |
| `routeParamValues.projectId` | UUID from seed | Auto-updated by seed script |
| `routeParamValues.localeCode` | `en` | Seed script |
| `authSetup.loginRoute` | `/login` | Angular route |
| `authSetup.usernameField` | `input[formcontrolname='email']` | Login form |
| `authSetup.passwordField` | `input[formcontrolname='password']` | Login form |
| `authSetup.submitButton` | `button[type='submit']` | Login form |
| `authSetup.authSuccessSelector` | `app-bar [routerLink='/projects']` | Mandatory — post-login nav bar element |
| `executionConfig.preAttemptCommand` | (see manifest) | Resets login lockout counters via SQL |

### Auth contract
`authSuccessSelector` is **mandatory** when `authSetup` is present. It is the sole auth success signal — B2 polls for this element after submitting credentials. No URL-based or form-disappearance detection.

### Auth guards
- `AuthGuard` — requires logged-in user (most routes)
- `CanGuard` — requires project admin/owner role (settings, API clients, team)
- `NoAuthGuard` — requires NOT logged in (login, signup pages)

### API token format
The `/api/v1/auth/token` endpoint returns:
```json
{"access_token":"<jwt>","token_type":"bearer","expires_in":"86400s"}
```
Field is `access_token` (snake_case), NOT `data.accessToken`.

## 5. Run B3/B4

```bash
cd C:/Users/basha/git/claude/softscanner_fa
npm run b3 -- ever-traduora
```

**Note:** 109 workflows — B3 takes 50-70 minutes. Expected result: **48/109 (44.0% C3)**.

30 residuals are structural limitations (inline/modal derivation gaps), 27 are B5 timing, 4 are environment/data/unresolved.

## 6. Teardown

```bash
# Stop Angular frontend (Ctrl+C or kill the ng serve process)

# Stop Docker services
cd C:/Users/basha/git/github/autoe2e/benchmark/ever-traduora
docker-compose down           # preserves database volume
docker-compose down -v        # resets to empty (requires re-seeding)
```

## 7. Full Reset

To reset completely and re-seed:
```bash
cd C:/Users/basha/git/github/autoe2e/benchmark/ever-traduora
docker-compose down -v
docker-compose up -d
# Wait 30s for migrations
cd C:/Users/basha/git/claude/softscanner_fa
node scripts/seed-traduora.mjs
npm run b1:plans && npm run b2:codegen
```

## 8. Known Environment-Sensitive Points

- **Node 16 required** — Angular 12.2 + TypeScript 4.2.3 do not compile on Node 22
- **yarn only** — the project uses yarn workspaces; npm does not resolve correctly
- **ng binary** — use `node_modules/.bin/ng` directly, not `npx ng`
- **Health endpoint** — `/health` (root), not `/api/v1/health`
- **Token response** — `access_token` (snake_case), not `data.accessToken`
- **projectId is UUID** — generated by MySQL, obtained via seed script
- **Port 3306** — ensure no local MySQL is running
- **CORS** — requires `TR_CORS_ENABLED=true` in docker-compose.yaml (already set). Without it, browser preflight requests return 404 and login fails silently. The API uses `origin: '*'` when enabled.
- **tsconfig warnings** — editor-only (newer TS in IDE vs pinned 4.2.3 in project). Verified: the app compiles and runs with its own toolchain.
