# spring-petclinic-angular Environment Setup

Authoritative runbook for running the spring-petclinic-angular subject locally.

---

## Prerequisites
- Node.js 18+
- Docker (for Spring Boot REST backend)

## 1. Spring Boot REST Backend (Docker)

```bash
docker run -d -p 9966:9966 --name=petclinic webappdockers/petclinic-rest:latest
```

Wait ~30 seconds for Spring Boot to start. Verify:
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:9966/petclinic/api/owners
# Expected: 200
```

The Docker image includes an embedded H2 database with pre-seeded data:
- 10 owners, 13 pets, 6 vets, 4 visits, 6 pet types, 3 specialties
- All entities have numeric IDs starting from 1

## 2. Angular Frontend

**CRITICAL:** The app's `src/index.html` has `<base href="/petclinic/">` which causes asset loading failures with `ng serve`. Before starting the dev server, temporarily change this to `<base href="/">`:

```bash
cd C:/Users/basha/git/github/autoe2e/benchmark/pet-clinic/spring-petclinic-angular
sed -i 's|<base href="/petclinic/">|<base href="/">|' src/index.html
npx ng serve --port 4200
```

Verify:
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:4200
# Expected: 200
```

After testing, revert the change:
```bash
git checkout src/index.html
```

## 3. Manifest-Critical Values

| Field | Value | Notes |
|---|---|---|
| `baseUrl` | `http://localhost:4200` | Default Angular port |
| `accounts` | `[]` | No auth |
| `routeParamValues.id` | `"1"` | Global default — all entities have id=1 |
| `routeParamOverrides` | 9 route templates | Per-entity-family `:id` binding (all set to "1") |

All 9 `routeParamOverrides` entries map `:id` to `"1"`, which corresponds to real seeded entities in the Docker backend.

## 4. Run B3/B4

```bash
cd C:/Users/basha/git/claude/softscanner_fa
npm run b3 -- spring-petclinic-angular
```

**Note:** 74 workflows with up to 3 retries each — B3 can take 30-50 minutes.

## 5. Teardown

```bash
# Stop Angular frontend (Ctrl+C)
# Revert base-href if not already done:
cd C:/Users/basha/git/github/autoe2e/benchmark/pet-clinic/spring-petclinic-angular
git checkout src/index.html
# Stop and remove Docker backend:
docker stop petclinic && docker rm petclinic
```

## 6. Known Environment Issues

- `<base href="/petclinic/">` in index.html must be changed to `/` for `ng serve` to work (assets load from wrong path otherwise)
- Angular 18 does not need `--openssl-legacy-provider`
- The backend Docker image uses an embedded H2 database — data resets on container restart
- 74 tests means B3 takes significantly longer than other subjects (~30-50 min)
