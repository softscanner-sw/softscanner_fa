# posts-users-ui-ng Environment Setup

Authoritative runbook for running the posts-users-ui-ng subject locally.

---

## Prerequisites
- Docker and Docker Compose
- Node.js 18+

## 1. Start the Backend (Docker Compose)

```bash
cd C:/Users/basha/git/github/posts-users-backend
docker-compose up -d
```

This starts:
- **MySQL 8.0** on port 3307 (database: `posts_users`, user: `appuser`, password: `apppassword`)
- **Backend** (Express + TypeScript) on port 5000, connected to MySQL

The MySQL container runs deterministic SQL seed scripts on first startup. No manual seeding required.

Wait ~15 seconds, then verify:
```bash
curl -s http://localhost:5000/
# Expected: "NG Posts & Users Backend is running"

curl -s http://localhost:5000/api/users | python3 -m json.tool | head -5
# Expected: Alice Johnson user object with UUID 3f57c674-52eb-48f7-b067-3254fdba47ff
```

## 2. Start the Frontend

```bash
cd C:/Users/basha/git/github/posts-users-ui-ng
npx ng serve --port 4200
```

Runs on **port 4200**. Verify:
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:4200
# Expected: 200
```

## 3. Seed Data (Automatic)

The following entities are created automatically by `init/01-schema.sql` on MySQL first startup:

| Entity | ID | Key Fields |
|---|---|---|
| User: Alice Johnson | `3f57c674-52eb-48f7-b067-3254fdba47ff` | email: alice@example.com, bio > 150 chars (329 chars) |
| User: Bob Smith | `a1b2c3d4-e5f6-7890-abcd-ef1234567890` | email: bob@example.com, short bio |
| Post: Getting Started with Angular | `b1a2c3d4-0001-4000-a001-000000000001` | author: Alice |
| Post: Introduction to REST APIs | `b1a2c3d4-0002-4000-a002-000000000002` | author: Bob |

**Manual UI seeding is NOT required.** The manifest's `routeParamValues.id` is the fixed UUID `3f57c674-52eb-48f7-b067-3254fdba47ff` matching Alice.

To reset to clean seed state: `docker-compose down -v && docker-compose up -d`

## 4. Manifest-Critical Values

| Field | Value | Notes |
|---|---|---|
| `baseUrl` | `http://localhost:4200` | Angular dev server |
| `accounts` | `[]` | No auth required |
| `routeParamValues.id` | `3f57c674-52eb-48f7-b067-3254fdba47ff` | Fixed UUID — matches SQL seed, no discovery required |

## 5. Run B3/B4

```bash
cd C:/Users/basha/git/claude/softscanner_fa
npm run b3 -- posts-users-ui-ng
```

## 6. Teardown

```bash
# Stop frontend (Ctrl+C or kill ng serve process)

# Stop backend + database
cd C:/Users/basha/git/github/posts-users-backend
docker-compose down        # preserves data
docker-compose down -v     # resets to seed state
```

## 7. Expected Results

**17/18 pass (94.4% C3)** on clean seed state.

Single known residual: `UserSearchComponent_WTH` — A2 verdict CONDITIONAL. The clear-search button has `*ngIf="searchEntry"` and only renders after typing into the search input. Materializing this precondition requires multi-step reasoning beyond B1's current scope.
