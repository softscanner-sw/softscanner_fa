# heroes-angular Environment Setup

Authoritative runbook for running the heroes-angular subject locally.

---

## Prerequisites
- Node.js 18+

## 1. Start Both Frontend and Backend

```bash
cd C:/Users/basha/git/github/heroes-angular
NODE_OPTIONS=--openssl-legacy-provider npm run quick
```

This starts concurrently:
- **Frontend** (Angular 11 via ng serve): `http://localhost:7626`
- **Backend** (json-server): `http://localhost:7627`

`--openssl-legacy-provider` is required for Angular 11 on Node.js 17+.

If `npm run quick` fails, start services separately:
```bash
# Terminal 1: Backend
cd C:/Users/basha/git/github/heroes-angular
npx json-server --port 7627 --routes routes.json db.json

# Terminal 2: Frontend
cd C:/Users/basha/git/github/heroes-angular
NODE_OPTIONS=--openssl-legacy-provider npx ng serve --port 7626 --proxy-config proxy.conf.json
```

Verify:
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:7626      # Expected: 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:7627/api/heroes  # Expected: 200
```

## 2. Data Architecture

The app uses **json-server** with a local `db.json` file as the data store.

**Pre-seeded data (stable, in db.json):**
- 6 heroes with string IDs: `HeroAslaug`, `HeroBjorn`, `HeroIvar`, `HeroLagertha`, `HeroRagnar`, `HeroThora`
- 4 villains with string IDs

**Data behavior:**
- json-server persists changes to `db.json` on disk
- Modifications (add/delete/update) persist across restarts
- To reset: `git checkout db.json` restores original seed data
- Hero selection is done in-UI (component state), NOT via route params — heroes are displayed in a list with a detail panel

**No seed data action required** — the `db.json` file already contains the necessary heroes.

## 3. Manifest-Critical Values

| Field | Value | Notes |
|---|---|---|
| `baseUrl` | `http://localhost:7626` | NOT 4200 — this app serves on 7626 |
| `accounts` | `[]` | No auth |
| `routeParamValues` | `{}` | No route params — hero selection is in-UI |

## 4. A2 Workflow Summary

19 TaskWorkflows (all FEASIBLE, 0 CONDITIONAL):
- Click interactions on hero/villain list items
- Form interactions (add/edit heroes)
- Navigation between heroes/villains/about views
- 2 dialog-based modal workflows

## 5. Run B3/B4

```bash
cd C:/Users/basha/git/claude/softscanner_fa
npm run b3 -- heroes-angular
```

## 6. Teardown

Stop both services:
```bash
# If using npm run quick: Ctrl+C in the terminal
# If using separate terminals: Ctrl+C in each
```

## 7. Known Caveats

- Port 7626 (not 4200) — the manifest `baseUrl` must match
- Backend on port 7627 must be running for API calls (hero CRUD) to work
- Angular 11 requires `NODE_OPTIONS=--openssl-legacy-provider` on Node.js 17+
- json-server modifies `db.json` on disk — use `git checkout db.json` to reset if data is corrupted by test runs
