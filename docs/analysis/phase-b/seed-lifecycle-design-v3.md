# Extended Seed Lifecycle Design v3

**Date:** 2026-04-03
**Status:** Final design consolidation — not yet implemented
**Supersedes:** seed-lifecycle-design-v2.md (to be archived after implementation)

---

## 1. CURRENT DESIGN STRENGTHS

The v2 design correctly identified:
- Entity family inference from route paths and service names
- Three-layer seed architecture (requirements → implementation → reconciliation)
- B0-led reconciliation replacing manifest mutation
- Structured seed output convention
- Separation of positive and negative guards

These remain the foundation. This document extends them.

---

## 2. WHAT IS STILL MISSING

| Gap | Impact |
|---|---|
| **No entity-definition analysis** | Route segments give entity NAMES but not FIELDS, TYPES, RELATIONSHIPS, or FOREIGN KEYS. The actual TypeScript interfaces (`Owner { id, firstName, pets: Pet[] }`) are richer. |
| **No service body analysis (A3)** | Service files contain HTTP method + endpoint + payload type. Without this, seed scripts can't be generated with correct API calls. |
| **NGXS/store indirection unhandled** | Traduora's data flow: Component → `store.dispatch(Action)` → State handler → Service → HTTP. A1/A3 must trace through this chain. |
| **No backend inspection design** | Backend DTO validation rules (date formats, uniqueness, required fields) are invisible. |
| **Flat seed output** | `Record<string, string>` can't express entity instances, relationships, or creation order. |
| **No script generation** | B0 collects a user-provided command string. It doesn't scaffold the script. |
| **Airbus excluded** | Not under the same canonical mechanism as traduora. |

---

## 3. EXTENDED ANALYSIS MODEL

### Analysis phases

```
A1: Multigraph extraction (EXISTING)
  → Nodes: Route, Component, Service, Widget, Module, External
  → Edges: structural + executable
  → Constraint surfaces, UI properties, source refs

A2: Workflow enumeration (EXISTING)
  → TaskWorkflows with trigger edges, effect closures, verdicts

A3: Service & Entity Analysis (NEW)
  → Service method inventory (HTTP method, endpoint, payload type, response type)
  → Entity interface/class extraction (fields, types, optionality, foreign keys)
  → Entity relationship graph (from interface imports + field types)
  → NGXS/store action→handler→service chains (when detected)
  → Output: entity-schema.json

B0: Manifest wizard + seed contract (EXISTING, EXTENDED)
  → Consumes A1, A2, A3 artifacts
  → Infers seed requirements from entity schema
  → Scaffolds seed script from A3 service endpoints
  → Reconciles seed output into manifest

B1-B3: Plan, Generate, Execute (EXISTING)
```

### A3 is a NEW analysis phase, not an extension of A1

**Why separate from A1:**
- A1 extracts the UI interaction multigraph. Its concern is widgets, routes, edges, and constraint surfaces.
- A3 extracts the data/entity layer. Its concern is HTTP endpoints, TypeScript interfaces, CRUD semantics, and entity relationships.
- Different consumers: A1 feeds A2 (workflow enumeration). A3 feeds B0 (seed requirements).
- Different extraction mechanisms: A1 uses template parsing + handler body analysis. A3 uses service file analysis + type resolution.

---

## 4. ENTITY-DEFINITION ANALYSIS

### What exists in subject codebases (evidence from research)

**Petclinic** — TypeScript interfaces in dedicated entity files:
```typescript
// owners/owner.ts
export interface Owner {
  id: number;
  firstName: string; lastName: string;
  address: string; city: string; telephone: string;
  pets: Pet[];  // → relationship: Owner has many Pets
}

// pets/pet.ts
export interface Pet {
  id: number;
  ownerId: number;  // → foreign key to Owner
  name: string; birthDate: string;
  type: PetType;    // → relationship to PetType
  owner: Owner;     // → back-reference
  visits: Visit[];  // → relationship: Pet has many Visits
}
```

**Traduora** — model classes/interfaces in `models/` directories:
```typescript
// projects/models/project.ts
export interface Project { id: string; name: string; description?: string; role: string; }
// projects/models/term.ts  
export interface Term { id: string; value: string; context: string | null; labels: Label[]; }
// projects/models/label.ts
export class Label { id: string; value: string; color: string; }
```

**Airbus** — entity types embedded in components (no separate model files):
```typescript
// LoginFormClass.ts
export class LoginFormClass { emailid: string; password: string; }
// Product shape inferred from form fields: productId, productName, description, category, units
```

### What A3 entity analysis must extract

```typescript
interface EntityDefinition {
  name: string;                    // "Owner", "Project", "Product"
  sourceFile: string;              // path to the .ts file
  kind: 'interface' | 'class';
  fields: EntityField[];
  relationships: EntityRelationship[];
}

interface EntityField {
  name: string;                    // "firstName", "id", "ownerId"
  type: string;                    // "string", "number", "PetType"
  optional: boolean;               // from `?:` syntax
  isId: boolean;                   // heuristic: field named "id" or ending in "Id"
  isForeignKey: boolean;           // heuristic: field type is another entity
}

interface EntityRelationship {
  from: string;                    // "Owner"
  to: string;                     // "Pet"
  kind: 'has-many' | 'belongs-to' | 'has-one';
  foreignKeyField?: string;       // "ownerId" on Pet
  evidence: string;               // "Pet.ownerId: number" or "Owner.pets: Pet[]"
}
```

### Extraction approach

1. **Find entity files:** Scan for `export interface` and `export class` declarations in:
   - `**/models/*.ts`
   - `**/entities/*.ts`
   - Named entity files (e.g., `owner.ts`, `pet.ts`)
   - Files imported by service files

2. **Parse fields:** For each interface/class, extract field name, type, and optionality using ts-morph.

3. **Detect IDs:** Fields named `id` or matching `*Id` pattern → mark as ID/foreign key.

4. **Detect relationships:** 
   - Field type is another entity interface → `has-one` or `belongs-to`
   - Field type is `Entity[]` → `has-many`
   - Import chain confirms the target entity

5. **Build entity graph:** Directed graph of entity relationships, rooted at entities with no parent.

---

## 5. A3 SERVICE ANALYSIS

### What service files contain (evidence from codebases)

**Direct HTTP pattern** (petclinic, airbus, posts, heroes):
```typescript
export class OwnerService {
  entityUrl = environment.REST_API_URL + 'owners';
  addOwner(owner: Owner): Observable<Owner> {
    return this.http.post<Owner>(this.entityUrl, owner);
  }
}
```

Extractable: HTTP method (`post`), endpoint URL (`owners`), payload type (`Owner`), response type (`Owner`).

**NGXS/store pattern** (traduora):
```typescript
// Component dispatches:
this.store.dispatch(new CreateProject(name, description));

// State handler calls service:
@Action(CreateProject)
createProject(ctx, action: CreateProject) {
  return this.projectsService.create(action).pipe(...);
}

// Service makes HTTP call:
create(data: { name: string; description?: string }): Observable<Project> {
  return this.http.post<Payload<Project>>(`${this.endpoint}/projects`, data);
}
```

Extractable: same information, but requires tracing through Action class → State handler → Service method.

### A3 extraction pipeline

```
Step 1: Inventory service files
  Find all @Injectable classes that inject HttpClient
  
Step 2: Extract HTTP call sites
  For each service method containing this.http.get/post/put/patch/delete:
    → HTTP method
    → URL (string literal or template)
    → Request body type (generic parameter)
    → Response type (generic parameter)

Step 3: Link to entities
  Resolve request/response types to EntityDefinition from Step 4
  
Step 4: Detect NGXS/store indirection
  Find @State classes with @Action handlers
  For each handler:
    → Action class (constructor params = payload)
    → Service call inside handler
    → Link action payload to service method parameter

Step 5: Build service call inventory
```

### A3 output artifact: `entity-schema.json`

```typescript
interface EntitySchema {
  entities: EntityDefinition[];
  relationships: EntityRelationship[];
  serviceEndpoints: ServiceEndpoint[];
  storeActions?: StoreAction[];  // NGXS/Redux-specific
}

interface ServiceEndpoint {
  serviceName: string;           // "OwnerService"
  methodName: string;            // "addOwner"
  httpMethod: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  urlPattern: string;            // "/owners" or "/owners/:id"
  requestType?: string;          // "Owner" (TypeScript type name)
  responseType?: string;         // "Owner"
  entityFamily: string;          // "Owner" (inferred)
  crudOperation: 'create' | 'read' | 'update' | 'delete' | 'search';
}

interface StoreAction {
  actionClass: string;           // "CreateProject"
  actionType: string;            // "[Projects] Create project"
  payloadFields: EntityField[];  // constructor params
  handlerState: string;          // "ProjectsState"
  serviceCall: string;           // "projectsService.create"
  endpoint: ServiceEndpoint;     // resolved endpoint
}
```

---

## 6. NGXS / STORE ANALYSIS

### The problem

Traduora has 26 service nodes in A1 but only 4 CCS edges captured. The real data flow:

```
Component → this.store.dispatch(new CreateProject(name, desc))
  ↓ (NGXS dispatch — invisible to A1)
ProjectsState @Action(CreateProject) handler
  → this.projectsService.create(action)
    → this.http.post('/projects', data)
```

A1's bounded call following sees `this.store.dispatch(...)` as a service call to the NGXS Store service, but does NOT follow into the state handler.

### Design for NGXS analysis

**Detection:** A3 detects NGXS when:
- `@ngxs/store` appears in imports
- `@State` and `@Action` decorators are found
- `Store` is injected in components

**Analysis approach:**

1. **Find all Action classes** — classes with `static readonly type = '...'`
2. **Find all @Action handlers** — methods decorated with `@Action(ActionClass)` in `@State` classes
3. **For each handler:** trace the service call inside (same service analysis as direct HTTP)
4. **Link dispatch sites to handlers:** match `store.dispatch(new ActionClass(...))` in components to `@Action(ActionClass)` handlers

**Whether NGXS analysis should be part of A3 or a sibling:**

Part of A3. A3's concern is "how does data flow between frontend and backend." NGXS is just another data flow pattern, like direct HTTP calls. A3 should handle both:
- Direct: Component → Service → HTTP
- Store-mediated: Component → Store → State → Service → HTTP

### Brittleness boundaries

| Pattern | Robustness | Notes |
|---|---|---|
| `this.http.get/post/put/delete` | HIGH | Standard HttpClient API |
| `@Action(ClassName)` handler | HIGH | Decorator-based, syntactically identifiable |
| `store.dispatch(new Action(...))` | MEDIUM | Constructor call detection needed |
| RxJS pipe chains in handlers | LOW | Complex operator chains vary widely |
| Dynamic endpoint construction | LOW | Template literals with variables |

**Recommendation:** Extract the HIGH and MEDIUM patterns. Skip LOW (fall back to user input for complex cases).

---

## 7. BACKEND INSPECTION SCENARIOS

### Case 1: Backend codebase available + analyzable

**Spring Boot (petclinic backend):**
- Entity classes: `@Entity public class Owner { @NotBlank String firstName; @Size(min=2) String lastName; }`
- Controllers: `@PostMapping("/owners") public Owner addOwner(@Valid @RequestBody Owner owner)`
- Validation annotations: `@NotNull`, `@NotBlank`, `@Size`, `@Pattern`, `@Email`

**What this reveals beyond frontend:**
- Backend validation rules (stricter than frontend HTML5 validators)
- Required fields not marked in frontend forms
- Date/format constraints
- Unique constraints
- Foreign key constraints

**NestJS (traduora backend):**
- DTOs: `export class CreateProjectDto { @IsString() @IsNotEmpty() name: string; }`
- Controllers: `@Post() create(@Body() dto: CreateProjectDto)`
- Validation: `class-validator` decorators

**Implementation:** A separate analyzer per backend framework. Spring Boot → Java/Kotlin parser. NestJS → TypeScript parser (same tooling as frontend).

### Case 2: Backend available but different tech

Examples: Python/Django, Go/Gin, Ruby/Rails, PHP/Laravel

**What we can do:** Each backend framework has conventions. Entity definitions are typically in model files. A framework-specific parser could extract field names, types, and validation rules.

**Practical approach:** Start with Spring Boot and NestJS (covers 2 of our 5 subjects). Other frameworks as demand arises.

### Case 3: Backend unavailable

**What we can still infer from the frontend alone:**
- Entity names (from service names, route paths, model files)
- Field names and frontend-side types (from interfaces)
- Frontend validation constraints (from form schemas)
- API endpoint patterns (from service HTTP calls)
- CRUD operations (from HTTP methods)
- Entity relationships (from interface imports and field types)

**What remains unknown:**
- Backend-only validation rules
- Database constraints (unique, auto-increment)
- Generated IDs (UUID vs numeric)
- Foreign key behavior (cascade, restrict)

**How this maps to seed generation:**
- Inferred fields → seed script generates valid payloads
- Unknown validation → conservative defaults + user review
- Unknown ID format → seed script captures response IDs

---

## 8. PROPOSED NEW ARTIFACTS

### 1. `entity-schema.json` (A3 output, per subject)
- Location: `output/<subject>/json/entity-schema.json`
- Producer: A3 analysis phase
- Consumer: B0 wizard, seed script generator
- Content: EntityDefinition[], EntityRelationship[], ServiceEndpoint[], StoreAction[]

### 2. `seed-requirements.json` (B0 output, per subject)
- Location: `output/<subject>/json/seed-requirements.json`
- Producer: B0 wizard (from A1/A2/A3)
- Consumer: seed script generator, B0 validator
- Content: entity family requirements with fields, counts, relationships, creation order

### 3. `seed-script.mjs` (B0-generated, per subject)
- Location: `subjects/<subject>/seed-script.mjs`
- Producer: B0 wizard seed script generator
- Consumer: user (runs manually or via seedCommand)
- Content: generated API calls with placeholders for environment-specific values

### 4. `seed-output.json` (seed script output, per subject)
- Location: `subjects/<subject>/seed-output.json`
- Producer: seed script
- Consumer: B0 reconcile command
- Content: structured entity instances + routeParamValues

---

## 9. B0 SCRIPT-GENERATION MODEL

### Generation from A3 artifacts

Given `entity-schema.json`, B0 generates a seed script that:

1. **Orders entities by dependency** (parents first): Owner → Pet → Visit
2. **For each entity:** generates an API call using the service endpoint:
   ```javascript
   // Create Owner (from OwnerService.addOwner → POST /owners)
   const owner = await apiCall('POST', '/owners', {
     firstName: '{{firstName}}',  // string, required, minLength: 2
     lastName: '{{lastName}}',    // string, required, minLength: 2
     address: '{{address}}',      // string, required
     city: '{{city}}',            // string, required
     telephone: '{{telephone}}',  // string, required, pattern: ^[0-9]{0,10}$
   });
   seedOutput.entities.owner = owner;
   seedOutput.routeParamValues.id = String(owner.id);
   ```
3. **Fills conservative default values** for known field types:
   - string → `"test-<fieldName>-<hash>"`
   - email → `"test-<hash>@example.com"`
   - number → `1`
   - date → `"2025-01-01"`
   - select (with known first option) → first option value
4. **Marks placeholders** for values it can't determine:
   ```javascript
   // TODO: Replace with a valid value for this field
   telephone: '{{telephone}}',  // pattern: ^[0-9]{0,10}$
   ```
5. **Writes seed-output.json** at the end

### Script structure

```javascript
#!/usr/bin/env node
/**
 * Seed script for <subject> (generated by B0 wizard)
 * Run: node subjects/<subject>/seed-script.mjs
 * Output: subjects/<subject>/seed-output.json
 */

const BASE_API = process.env.SEED_API_URL || '{{apiBaseUrl}}';
const seedOutput = { entities: {}, routeParamValues: {}, meta: { timestamp: new Date().toISOString(), backendUrl: BASE_API, idempotent: true } };

async function apiCall(method, path, body, headers = {}) { ... }
async function findOrCreate(method, listPath, createPath, matchFn, body) { ... }

async function main() {
  // --- Entity: Owner (POST /owners) ---
  const owner = await findOrCreate('GET', '/owners', '/owners', 
    (list) => list.find(o => o.firstName === 'test-owner'),
    { firstName: 'test-owner', lastName: 'test', address: '123 Main St', city: 'Springfield', telephone: '1234567890' }
  );
  seedOutput.entities.owner = owner;
  seedOutput.routeParamValues.id = String(owner.id);

  // --- Entity: Pet (POST /owners/:ownerId/pets) ---
  // depends on: Owner
  const pet = await findOrCreate(...);
  seedOutput.entities.pet = pet;

  // Write output
  fs.writeFileSync('subjects/<subject>/seed-output.json', JSON.stringify(seedOutput, null, 2));
}

main().catch(err => { console.error('Seed failed:', err); process.exit(1); });
```

### User interaction model

1. B0 wizard generates the script with conservative defaults
2. User reviews → edits environment-specific values (API URL, credentials)
3. User runs the script
4. B0 reconcile merges seed-output.json into manifest

---

## 10. SUBJECT-BY-SUBJECT IMPLICATIONS

### Traduora

| Layer | What's inferable | What needs user input |
|---|---|---|
| **Entities** | Project, Label, Term, Locale, User, ApiClient, TeamMember (from model files) | None — model files are clear |
| **Relationships** | Project → {Label, Term, Locale, TeamMember, ApiClient} (from route nesting) | None |
| **Service endpoints** | POST /projects, POST /auth/signup, etc. (from service files) | API base URL |
| **NGXS chain** | CreateProject action → ProjectsState handler → projectsService.create → POST /projects | None — patterns are standard |
| **Auth** | AuthGuard (2 accounts needed), NoAuthGuard (negative), CanGuard (admin role) | Credentials |
| **Dynamic IDs** | projectId is UUID (from Project.id: string) | Captured from POST response |
| **Backend validation** | Not visible from frontend | User may need formDataOverrides |
| **Generated script** | Full API seed script with Project + User + Locale + Term creation | User confirms API URL + credentials |

### Airbus

| Layer | What's inferable | What needs user input |
|---|---|---|
| **Entities** | Product, User (from service names + form fields) | None |
| **Relationships** | None (flat entity model) | None |
| **Service endpoints** | POST /addProduct, POST /login, DELETE /deleteProduct (from service files) | API base URL |
| **Auth** | CanActivateRouteGuard (1 account needed) | Credentials |
| **Dynamic IDs** | Product IDs may be auto-generated | Depends on backend |
| **Backend validation** | Email format for login (from form validator) | Password bcrypt format |
| **Generated script** | SQL seed script (schema + users) OR API script | User chooses approach |

### Petclinic

| Layer | What's inferable | What needs user input |
|---|---|---|
| **Entities** | Owner, Pet, Visit, PetType, Vet, Specialty (from model files — richest) | None |
| **Relationships** | Owner→Pet (ownerId), Pet→Visit, Pet→PetType (from interface fields) | None |
| **Service endpoints** | Full REST: GET/POST/PUT/DELETE per entity (from service files) | API base URL |
| **Auth** | None | None |
| **Seed status** | Pre-seeded (Docker image with H2 data.sql) | None |
| **Generated script** | Not needed — pre-seeded | None |

### Posts

| Layer | What's inferable | What needs user input |
|---|---|---|
| **Entities** | Post, User (from service names) | None |
| **Relationships** | None visible in routes | None |
| **Service endpoints** | CRUD per entity (from service files) | API base URL |
| **Auth** | None | None |
| **Seed status** | Pre-seeded (Docker SQL) | None |
| **Generated script** | Not needed | None |

### Heroes

| Layer | What's inferable | What needs user input |
|---|---|---|
| **Entities** | Hero, Villain (from service names) | None |
| **Relationships** | None | None |
| **Seed status** | None needed (json-server static file) | None |

---

## 11. DOC HIERARCHY CLEANUP PLAN

### Proposed naming conventions
- `docs/paper/` — scientific publications (approach.md, scientific-report.md)
- `docs/validation/` — protocols, guides, runbooks, subject setup
- `docs/analysis/` — diagnostic reports, design docs (active)
- `docs/archive/` — historical/forensic docs (read-only)
- `docs/architecture/` — diagrams (figures, PlantUML)

### Current file audit

| File | Action | Target | Reason |
|---|---|---|---|
| `docs/paper/approach.md` | KEEP | — | Normative spec |
| `docs/paper/scientific-report.md` | KEEP | — | Scientific report |
| `docs/ROADMAP.md` | KEEP | — | Sequencing + status |
| `docs/validation/benchmark-execution-protocol.md` | KEEP | — | Benchmark rules |
| `docs/validation/diagnostic-protocol.md` | KEEP | — | Diagnostic rules |
| `docs/validation/b0-manifest-guide.md` | KEEP | — | User-facing B0 guide |
| `docs/validation/subject-onboarding-guide.md` | KEEP | — | Per-subject input reference |
| `docs/validation/subjects.md` | KEEP | — | Subject registry |
| `docs/validation/*-setup.md` (5 files) | KEEP | — | Per-subject runbooks |
| `docs/validation/approach-evaluation-report.md` | KEEP | — | AutoE2E comparison (referenced by report §3) |
| `docs/validation/autoe2e-benchmark-evaluation-report.md` | KEEP | — | AutoE2E data |
| `docs/analysis/phase-b/diagnostic-reclassification-report.md` | KEEP | — | Current residual catalog |
| `docs/analysis/phase-b/gt/*.json` (6 files) | KEEP | — | Ground truth data |
| `docs/analysis/phase-b/seed-lifecycle-design-v2.md` | ARCHIVE | `docs/archive/` | Superseded by v3 |
| `docs/analysis/phase-b/seed-lifecycle-design-v3.md` | KEEP | — | Current design (this doc) |
| `docs/archive/b0-seed-contract-design.md` | KEEP | — | Already archived |
| `docs/archive/oracle-strength-audit-2026-04-02.md` | KEEP | — | Already archived |
| `docs/archive/phase-b-evolution.md` | KEEP | — | Already archived |
| `docs/architecture/README.md` | KEEP | — | Diagram index |
| `docs/architecture/*.png + *.puml` | KEEP | — | Figures |
| `docs/paper/figures/**` | KEEP | — | Report figures |
| `docs/presentation/approach.pptx` | KEEP | — | Presentation |
| `docs/presentation/generate-pptx.py` | KEEP | — | Presentation tooling |

**Total: 0 deletions, 1 archive move (v2→archive), rest kept.**

---

## 12. COMMIT-READINESS ASSESSMENT

### Current state

| Check | Status |
|---|---|
| Typecheck (src) | PASS |
| Typecheck (test) | PASS |
| Unit tests (267) | PASS |
| B0 validation (6 subjects) | 6/6 VALID |
| Benchmark baseline (5 subjects) | 156/241 (64.7%) integrity-verified |
| Doc alignment | Consistent across ROADMAP, scientific-report, diagnostic-report |
| Stale docs cleaned | Yes (24 files deleted/archived previously) |
| Manifest schema consistency | All 5 manifests match current schema |
| seedRequirements populated | All 5 subjects |
| NoAuthGuard warnings | Eliminated |
| FAIL_INTEGRITY mechanism | Working (trust harness passed) |
| Canonical B3 invocation | Documented + enforced |

### Assessment: YES, the current state is stable enough to commit.

The codebase is in a clean, validated state with:
- All gates green
- Benchmark-valid baselines for 5 subjects
- No stale contradictory docs
- Schema/validator/wizard aligned
- Design docs recorded but not yet implemented

**Recommended commit message:**
```
Phase B: B0 seed contract + execution integrity + benchmark baseline

- B0: seedRequirements schema with authGuards/negativeGuards/seedStatus
- B0: executionConfig validation (all subfields type-checked)
- B0: batchResetCommand for rate-limit mitigation
- B0: wizard prompts for execution config + seed status
- B3: FAIL_INTEGRITY outcome + per-test log verification
- B3: adaptive per-test timeout from plan metadata
- B3: canonical invocation via node tsx/cli.mjs (npm lifecycle workaround)
- B2: subscribe callback capture (Variant C) + timeout defaults 5s/10s/15s
- B2: CDP network evidence batched to test-end
- Benchmark: 5-subject integrity-verified baseline (156/241, 64.7%)
- Docs: benchmark protocol, diagnostic protocol, manifest guide, onboarding guide
```

---

## 13. RECOMMENDED NEXT SEQUENCE

### Step 1: Commit current state
Clean checkpoint before A3 implementation.

### Step 2: Implement A3 service + entity analysis
- New phase: `src/phase-a3/` or `src/analyzers/service/`
- Entity definition extraction from model/interface files
- Service HTTP call extraction
- NGXS action→handler→service chain tracing
- Output: `entity-schema.json`

### Step 3: Implement B0 seed script generation
- Read entity-schema.json
- Generate seed-script.mjs template
- Implement b0:reconcile command
- Stop seed-traduora.mjs from patching manifest

### Step 4: B5.2 pre-wait redesign
- Addresses 63/85 residuals
- Can proceed in parallel with A3 if resourced

### Step 5: B5.4 oracle fixes
- Addresses 11/85 residuals
- Independent of A3

---

## 14. EXPLICITLY DEFERRED ITEMS

- Backend codebase analysis (Spring Boot entity/DTO scanning)
- Full B5.5 per-workflow seed differentiation
- Automatic seed validation (checking entity existence at runtime)
- softscanner-cqa-frontend execution
- Cross-subject seed coordination
- Seed script auto-execution from wizard (user runs manually for now)
