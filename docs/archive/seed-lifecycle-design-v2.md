# Extended Seed Lifecycle Design

**Date:** 2026-04-03
**Status:** Design document — not yet implemented
**Scope:** Full seed lifecycle architecture including workflow-level data awareness, seed script generation, and schema inspection

---

## 1. PROBLEM REFRAMING

The seed problem is not "how to run a script and collect an ID."

The seed problem is: **given a set of test workflows, determine what application state must exist before each workflow can execute, and provision that state reliably.**

This requires answers to three questions the pipeline currently cannot answer:
1. **What entities must exist?** (e.g., an Owner with id=1, a Project with a specific UUID)
2. **What relationships between entities must hold?** (e.g., the Pet must belong to the Owner)
3. **What values must those entities have?** (e.g., valid email format, specific role assignment)

The current model treats seeding as an environment detail external to the pipeline. The correct model treats seed requirements as **structurally derivable preconditions** that the pipeline infers, the user confirms/augments, and the CLI scaffolds.

---

## 2. WHY THE CURRENT DESIGN IS INSUFFICIENT

| Gap | Current state | Impact |
|---|---|---|
| No entity model | Pipeline knows param names but not entity types | Can't generate "create an Owner" |
| No relationship model | Pipeline doesn't know Owner→Pet→Visit | Can't order entity creation |
| No CRUD inference | A1 has service names but no HTTP method/endpoint | Can't generate API seed calls |
| Seed script is ad-hoc | `seed-traduora.mjs` is 238 lines of hand-written API calls | Not generalizable |
| Dynamic IDs break manifest | Script mutates manifest directly | Violates read-only manifest principle |
| Subject-level only | Same seed for all 109 workflows | Some workflows need data others don't |
| No validation of seed completeness | B0 can't check "do the required entities exist?" | Silent failures |

---

## 3. EXTENDED SEED MODEL

### Three-layer seed architecture

```
Layer 1: SEED REQUIREMENTS (inferred from A1/A2/B1)
  → Entity families needed
  → Entity relationships
  → CRUD operations expected
  → Minimum cardinalities
  → Value constraints from form schemas

Layer 2: SEED IMPLEMENTATION (scaffolded by B0, customized by user)
  → API-based seed script (generated template)
  → SQL-based seed script (for pre-seeded Docker subjects)
  → Manual runbook (fallback for complex cases)

Layer 3: SEED RECONCILIATION (B0-mediated)
  → Seed script outputs structured data
  → B0 merges dynamic values into manifest
  → B0 validates completeness
```

### Entity family model

An **entity family** is a backend data type required by one or more workflows. It is inferred from:

| Source | What it reveals | Confidence |
|---|---|---|
| Route path segment before `:param` | Entity type name (`/owners/:id` → `Owner`) | HIGH |
| Service node name | Entity service (`OwnerService`) | HIGH |
| Effect group handler name | CRUD operation (`onSubmit`, `deletePet`) | MEDIUM |
| Form schema fields | Entity attributes and constraints | MEDIUM |
| Route nesting | Entity relationships (`/owners/:id/pets/add` → Owner has Pets) | HIGH |
| Guard requirements | Auth entity (user account) | HIGH |

### Seed requirement record

For each entity family, the pipeline can infer:
```typescript
interface EntityFamilyRequirement {
  entityName: string;           // e.g., "Owner", "Project"
  sourceSurface: string;        // e.g., "route-segment", "service-name", "guard"
  paramName?: string;           // e.g., "id", "projectId"
  parentEntity?: string;        // e.g., "Owner" for Pet (from route nesting)
  minCount: number;             // minimum entities needed (usually 1)
  crudOperations: string[];     // e.g., ["create", "read", "update", "delete"]
  knownFields: FieldHint[];     // from form schemas
  workflowCount: number;        // how many workflows depend on this entity
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

interface FieldHint {
  name: string;                 // e.g., "firstName", "email"
  type: string;                 // e.g., "text", "email", "number"
  required: boolean;
  constraints?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
  };
}
```

---

## 4. ANALYSIS SURFACES

### 4a. A1/A2-derived (currently available)

| Signal | Source | Inference | Confidence |
|---|---|---|---|
| Route path: `/owners/:id` | A1 Route nodes | Entity "Owner" with param "id" | HIGH |
| Route nesting: `/owners/:id/pets/add` | A1 Route tree | Owner→Pet relationship | HIGH |
| Service name: `OwnerService` | A1 Service nodes | Entity "Owner" | HIGH |
| Effect group: `PetAddComponent::onSubmit → PetService` | A1 CCS edges | Pet CRUD: create | MEDIUM |
| Guard: `AuthGuard` | A2 workflow constraints | User account entity | HIGH |
| Form fields: `firstName, lastName, email` | B1 form schema | Entity attributes | MEDIUM |
| Required params: `["id"]` | A2 workflow constraints | Entity must exist with this ID | HIGH |

**What this surface CAN do:** Identify entity families, their relationships, required CRUD operations, attribute names and constraints.

**What this surface CANNOT do:** Determine valid concrete values, backend validation rules beyond frontend constraints, actual API endpoints or HTTP methods.

### 4b. Frontend service body analysis (A3 phase — most impactful next inference surface)

**The gap:** A1's CCS edges tell us "Component calls Service" but NOT which HTTP method, which endpoint URL, or which payload shape. This information is statically available in Angular service files:

```typescript
// In owner.service.ts — ALL of this is statically analyzable
getOwners(): Observable<Owner[]> { return this.http.get<Owner[]>(`${this.baseUrl}/owners`); }
addOwner(owner: Owner): Observable<Owner> { return this.http.post<Owner>(this.baseUrl, owner); }
deleteOwner(id: number): Observable<void> { return this.http.delete<void>(`${this.baseUrl}/${id}`); }
```

From service method bodies we can infer:
- **HTTP method** for each CCS edge (POST = create, PUT = update, DELETE = delete, GET = read)
- **API endpoint URLs** (string literals or template interpolations)
- **Request body types** (TypeScript generics on `HttpClient.post<T>()`)
- **Response types** (Observable/Promise generic parameters)
- **Entity CRUD lifecycles** ("add-owner submits POST /api/owners; edit-owner requires GET /api/owners/:id first")

**Per-subject evidence (from codebase research):**

| Subject | Service files | HTTP patterns visible | Key finding |
|---|---|---|---|
| petclinic | OwnerService, PetService, etc. (9) | Standard REST: `http.get/post/put/delete` | Clean CRUD per entity; base URLs are `/api/owners`, `/api/pets`, etc. |
| traduora | 17+ services but most use NGXS store dispatch | NGXS actions trigger effects → service calls | Most business logic goes through store, not direct service calls. CCS edges only capture 4/100+ actual API calls. |
| airbus | ProductService, AuthenticationServiceService | Direct `http.post/get/delete` | Simple CRUD; SharedServiceService passes data between components |
| posts | PostService, UserService | Direct `http.get/post/put/delete` | Standard REST; 3 calls per handler (likely create + navigate) |
| heroes | HeroService, VillainService | `http.get/post/put/delete` to json-server | In-memory json-server; no real backend validation |

**Three backend inspection scenarios:**

| Scenario | Feasibility | Approach |
|---|---|---|
| **Backend codebase available + analyzable** | HIGH for Spring Boot, NestJS | Parse DTOs, entity classes, controllers. Extract validation annotations. |
| **Backend codebase available but different tech** | MEDIUM | Parse the relevant source in a technology-specific way. |
| **Backend codebase unavailable** | LOW | Frontend-only inference + user input. Fall back to form schemas. |

**Recommendation:** A3 frontend service analysis is the highest-impact next step. It unlocks HTTP method + endpoint + payload inference from existing Angular source code, without needing backend access. This directly feeds seed script generation (knowing the exact POST endpoint and payload shape for each entity creation).

### 4c. Backend-derived (future, not current priority)

For Spring Boot backends:
- Entity class annotations (`@Entity`, `@Column`, `@NotNull`, `@Size`)
- Controller endpoint mappings (`@PostMapping`, `@GetMapping`)
- DTO validation annotations (`@Valid`, `@NotBlank`, `@Pattern`)

This is valuable but requires a separate analyzer. Deferred to after A3 frontend service analysis.

### 4d. Runbook/manual-derived (always available)

The user always knows:
- What backend technology is used
- What database exists
- What seed data is pre-loaded
- What credentials work
- What API authentication mechanism is used

The wizard captures this through prompts. This is the fallback for anything inference cannot determine.

---

## 5. WORKFLOW-LEVEL VS SUBJECT-LEVEL REQUIREMENTS

### Current model: subject-level only
Every workflow in a subject gets the same manifest. The same `routeParamValues.id = "1"` is used for all owner, pet, vet, etc. routes.

### Why workflow-level matters

Petclinic example:
- OwnerListComponent WTH needs: at least 1 Owner in the database (for list buttons to render)
- PetAddComponent WSF needs: Owner with id=1 exists (to create a Pet under it)
- VisitAddComponent WSF needs: Owner with id=1, Pet with id=1 belonging to that Owner

These are different requirements. The pipeline currently can't express "this workflow needs entities X and Y to exist."

### Proposed model: entity-family-level requirements

Requirements are expressed per entity family, not per workflow. The entity family model naturally aggregates:

```
Subject: spring-petclinic-angular
Entity families:
  Owner:   min 1, param: id=1, fields: [firstName, lastName, address, city, telephone]
  Pet:     min 1, param: id=1, parent: Owner(id=1), fields: [name, birthDate, type]
  Visit:   min 1, param: id=1, parent: Pet(id=1), fields: [date, description]
  PetType: min 1, param: id=1, fields: [name]
  Vet:     min 1, param: id=1, fields: [firstName, lastName]
  Specialty: min 1, param: id=1, fields: [name]
```

This is richer than `routeParamValues: { id: "1" }` but still subject-level. Workflow-level dependency tracking (which workflows need which entities) is an optimization for later.

---

## 6. SEED SCRIPT GENERATION MODEL

### Template-based generation

B0 generates a seed script template from the entity family model:

```javascript
// Auto-generated seed script for spring-petclinic-angular
// Generated by: npx tsx src/b0-wizard-cli.ts
// Edit the concrete values below, then run this script.

const BASE_API = '{{baseApiUrl}}'; // e.g., http://localhost:9966/petclinic/api

const entities = {
  owner: {
    endpoint: '/owners',
    method: 'POST',
    payload: {
      firstName: '{{owner.firstName}}',  // REQUIRED, minLength: 2
      lastName: '{{owner.lastName}}',    // REQUIRED, minLength: 2
      address: '{{owner.address}}',      // REQUIRED
      city: '{{owner.city}}',            // REQUIRED
      telephone: '{{owner.telephone}}',  // REQUIRED, pattern: ^[0-9]{0,10}$
    },
    captureId: 'id',  // capture the response ID for downstream entities
  },
  pet: {
    endpoint: '/owners/{{owner.id}}/pets',  // depends on owner
    method: 'POST',
    payload: {
      name: '{{pet.name}}',       // REQUIRED
      birthDate: '{{pet.birthDate}}', // REQUIRED
      typeId: '{{petType.id}}',   // depends on petType
    },
    captureId: 'id',
  },
  // ... etc
};
```

### Generation inputs

| Input | Source | Used for |
|---|---|---|
| Entity families | Route path analysis (A1) | Script structure |
| API endpoints | Service URL patterns (A3 future) or user prompt | Request URLs |
| Payload fields | B1 form schema | Request body template |
| Field constraints | B1 form schema | Placeholder value generation |
| Entity relationships | Route nesting analysis (A1) | Execution order |
| Auth mechanism | Manifest authSetup | Script auth preamble |

### Generation levels

| Level | What B0 generates | User effort |
|---|---|---|
| **Full auto** | Complete script with API calls and value generation | User reviews and runs |
| **Template** | Script skeleton with placeholders | User fills placeholders |
| **Hints only** | List of entities needed with field requirements | User writes script from scratch |

**Recommendation:** Start with **Template** level. The wizard generates a script with `{{placeholder}}` values that the user fills in. This is achievable now with current inference. Full auto requires A3 service analysis.

### Idempotency contract

Generated scripts must:
- Check if an entity already exists before creating (GET before POST)
- Return existing entity IDs if already created
- Never create duplicates

### Output contract

Scripts must write `subjects/<subject>/seed-output.json`:
```json
{
  "entities": {
    "owner": { "id": "1", "firstName": "Alice" },
    "pet": { "id": "1", "name": "Rex" },
    "project": { "id": "125fda89-..." }
  },
  "routeParamValues": {
    "id": "1",
    "projectId": "125fda89-..."
  }
}
```

The `routeParamValues` section is what B0 reconcile merges into the manifest.

---

## 7. OUTPUT / RECONCILIATION MODEL

### Structured seed output (replaces flat B1 proposal)

```typescript
interface SeedOutput {
  /** Entity instances created/found by the seed script */
  entities: Record<string, Record<string, string>>;
  /** Route param values to merge into manifest (canonical merge source) */
  routeParamValues: Record<string, string>;
  /** Optional: per-template param overrides */
  routeParamOverrides?: Record<string, Record<string, string>>;
  /** Metadata: when the seed was run, against which backend */
  meta: {
    timestamp: string;
    backendUrl: string;
    idempotent: boolean;
  };
}
```

### Reconciliation command: `b0:reconcile`

```bash
npx tsx src/b0-reconcile-cli.ts <subjectName>
```

1. Reads `subjects/<subject>/subject-manifest.json`
2. Reads `subjects/<subject>/seed-output.json`
3. Merges `seedOutput.routeParamValues` into `manifest.routeParamValues`
4. Merges `seedOutput.routeParamOverrides` into `manifest.routeParamOverrides` if present
5. Validates the merged manifest via B0
6. Writes the manifest (atomic overwrite)
7. Reports changes

**The manifest is written by B0, not by the seed script.** The seed script only writes `seed-output.json`.

---

## 8. CLI UX FLOW

### Complete flow (for a seed-requiring subject):

```
Step 1: WIZARD (B0)
  npx tsx src/b0-wizard-cli.ts <a2Path> [baseUrl] --out subjects/<subject>/subject-manifest.json
  
  → Infers entity families from A1/A2
  → Prompts for accounts, auth, route params
  → For dynamic params: writes PLACEHOLDER value (e.g., "<projectId>")
  → Prompts for seedStatus, seedCommand
  → Generates seedRequirements with entity families
  → Optionally generates seed script template: subjects/<subject>/seed-script.mjs
  → Writes manifest

Step 2: SEED (User)
  # User reviews/edits the generated seed script template
  # User runs it against the live backend:
  node subjects/<subject>/seed-script.mjs
  
  → Creates entities in the backend
  → Writes subjects/<subject>/seed-output.json with IDs

Step 3: RECONCILE (B0)
  npx tsx src/b0-reconcile-cli.ts <subjectName>
  
  → Reads seed-output.json
  → Merges dynamic values into manifest
  → Validates
  → Writes manifest

Step 4: GENERATE (B1/B2)
  npm run b1:plans && npm run b2:codegen

Step 5: EXECUTE (B3)
  node node_modules/tsx/dist/cli.mjs src/b3-cli.ts <subject> --max-retries 1
  
  → Optionally re-runs seedCommand for freshness
```

### For pre-seeded subjects:
Steps 2-3 are skipped. The wizard collects concrete values directly.

---

## 9. SUBJECT COMPARISON

### ever-traduora

| Aspect | Current | Proposed |
|---|---|---|
| **Entity families** | Not modeled | `Project`, `User`, `Locale`, `Term`, `ApiClient`, `Label`, `TeamMember` |
| **Entity relationships** | Not modeled | Project → {Locale, Term, Label, TeamMember, ApiClient} |
| **Seed script** | Hand-written `scripts/seed-traduora.mjs` | Template-generated `subjects/ever-traduora/seed-script.mjs` |
| **Dynamic values** | projectId (UUID) | Captured in seed-output.json |
| **Manifest mutation** | Script patches directly | B0 reconcile merges |
| **Seed output** | `.seed-output.json` (dead) | `seed-output.json` (canonical, consumed by reconcile) |

**NGXS complication:** Traduora uses NGXS state management. Most component→service calls go through store dispatch chains (`this.store.dispatch(new CreateProject(...))`), not direct `this.projectService.create()` calls. A1's CCS edges capture only 4 of 100+ actual API interactions because the subscribe callback capture and bounded call following don't trace through NGXS action→effect→service chains. A3 service analysis would need to either (a) trace NGXS action handlers, or (b) analyze service files directly regardless of how they're called.

### airbus-inventory

| Aspect | Current | Proposed |
|---|---|---|
| **Entity families** | Not modeled | `User`, `Product` |
| **Entity relationships** | None | None |
| **Seed script** | Manual SQL per runbook | Template-generated SQL seed or API script |
| **Dynamic values** | None (fixed credentials) | None |
| **Manifest mutation** | None needed | None needed |
| **Seed output** | N/A | Optional (no dynamic values) |

### spring-petclinic-angular (pre-seeded contrast)

| Aspect | Current | Proposed |
|---|---|---|
| **Entity families** | Not modeled | `Owner`, `Pet`, `Visit`, `PetType`, `Vet`, `Specialty` |
| **Entity relationships** | Implicit in routeParamOverrides | Explicit: Owner→Pet→Visit |
| **Seed script** | Not needed (Docker pre-seeded) | Not needed |
| **Dynamic values** | None (all id=1) | None |
| **seedStatus** | `pre-seeded` | `pre-seeded` |

---

## 10. REQUIRED SCHEMA / ARTIFACT CHANGES

### New type: EntityFamilyRequirement (in manifest or separate artifact)

```typescript
interface EntityFamilyRequirement {
  entityName: string;
  paramName?: string;
  parentEntity?: string;
  minCount: number;
  crudOperations: string[];
  knownFields: Array<{
    name: string;
    type: string;
    required: boolean;
    constraints?: Record<string, unknown>;
  }>;
  workflowCount: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}
```

### SeedRequirements extension

```typescript
interface SeedRequirements {
  authGuards: string[];
  negativeGuards: string[];
  routeParams: string[];
  hasFormWorkflows: boolean;
  seedStatus: 'pre-seeded' | 'needs-command' | 'none';
  entityFamilies?: EntityFamilyRequirement[];  // NEW: inferred entity model
}
```

### New artifact: seed-output.json (per subject)

Convention path: `subjects/<subject>/seed-output.json`
Written by: seed script
Read by: `b0:reconcile`
Format: SeedOutput interface (structured, not flat)

### New CLI: b0-reconcile-cli.ts

Merges seed output into manifest. Validates. Writes.

### New generation: seed script template

Written by wizard when `seedStatus === 'needs-command'`.
Located at: `subjects/<subject>/seed-script.mjs` (generated template)

---

## 11. IMPLEMENTATION OPTIONS

### Option 1: Entity inference + reconcile only (minimal)
- Add entity family inference to wizard
- Add b0:reconcile command
- Modify seed-traduora.mjs to not patch manifest
- No seed script generation

Effort: LOW. Unblocks the reconcile flow. Doesn't address script generation.

### Option 2: Entity inference + reconcile + template generation (recommended)
- All of Option 1
- Plus: wizard generates seed script templates from entity model
- Template has placeholders for API URLs and values
- User fills and runs

Effort: MEDIUM. Provides the full CLI-guided seed experience.

### Option 3: Entity inference + reconcile + A3 service analysis + full auto generation
- All of Option 2
- Plus: new A3 phase analyzes frontend service files for API endpoints
- Generated seed scripts have real API URLs and value generators
- Minimal user editing needed

Effort: HIGH. Requires new analyzer phase. Best long-term architecture.

**Recommendation: Option 2 now, Option 3 later.**

---

## 12. RECOMMENDED PLAN

### Phase 1 (this implementation batch):
1. Add entity family inference to the wizard (from A1 routes + services + A2 params)
2. Add `entityFamilies` to `SeedRequirements`
3. Create `b0-reconcile-cli.ts`
4. Modify `seed-traduora.mjs` to stop patching manifest
5. Update docs

### Phase 2 (next batch):
1. Add seed script template generation to wizard
2. Generate `subjects/<subject>/seed-script.mjs` from entity model
3. Add `SeedOutput` structured output format

### Phase 3 (future):
1. A3 frontend service analysis (API endpoint extraction)
2. Full auto seed script generation
3. Backend schema inspection (for Spring Boot / NestJS subjects)

---

## 13. WHAT SHOULD BE DEFERRED

- Full B5.5 workflow-level data-aware preconditions (per-workflow seed differentiation)
- Backend codebase analysis (Spring Boot entity scanning, NestJS DTO parsing)
- Cross-subject seed coordination
- Automatic seed validation (checking if entities actually exist in the running backend)
- softscanner-cqa-frontend

---

## 14. RISKS / UNKNOWNS

1. **Entity inference accuracy.** Route segment → entity name is heuristic. `/api/v1/auth/token` doesn't map to a "token" entity. Mitigation: the user reviews and edits the inferred entity model.

2. **API endpoint diversity.** Not all backends follow RESTful conventions. Some use RPC-style endpoints. Mitigation: the wizard prompts for API base URL and the template is editable.

3. **Backend validation rules.** Frontend form constraints don't capture all backend rules (date formats, uniqueness, foreign key constraints). Mitigation: `formDataOverrides` and generated value templates with conservative defaults.

4. **Dynamic ID formats.** UUIDs vs numeric auto-increment vs custom formats. Mitigation: the seed output captures whatever the backend returns; reconcile doesn't assume format.

5. **Idempotency complexity.** "Check if exists before creating" requires knowing the lookup endpoint and unique key. For simple CRUD APIs this is straightforward; for complex backends it's harder. Mitigation: generated scripts include GET-before-POST patterns.
