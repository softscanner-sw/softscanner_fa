# B0 Seed-Contract Design

**Date:** 2026-04-03
**Status:** Design proposal — not yet implemented
**Scope:** Redesign seeding so B0 is the canonical seed-requirement contract

---

## 1. CURRENT-STATE AUDIT

### Seed-related fields in `ExecutionConfig` (manifest-schema.ts)

| Field | In spec? | Validated? | Wizard? | Used by manifest? | Status |
|---|---|---|---|---|---|
| `seedCommand` | Yes | No | No | None | Canonical but unused |
| `seedOutputPath` | Yes | No | No | None | Canonical but **NOT IMPLEMENTED** (runtime merge deferred) |
| `seedDataNotes` | Yes | Yes (array) | No | None | Informational only |
| `preAttemptCommand` | Yes | No | No | traduora | Canonical, working |
| `batchResetCommand` | **No** | No | No | traduora | **Ad-hoc — no spec backing** |
| `timeoutProfile` | Yes | No | No | None | Canonical |
| `enableNetworkEvidence` | Yes | No | No | traduora, posts | Canonical |

### External seed mechanisms (outside manifest contract)

| Mechanism | Location | Problem |
|---|---|---|
| `scripts/seed-traduora.mjs` | Project scripts/ | Ad-hoc external script, not integrated into pipeline |
| `.seed-output.json` | subjects/ever-traduora/ | Dead artifact — nothing reads it |
| Manifest disk patching | seed-traduora.mjs line ~225 | Mutates manifest.json on disk; requires B1/B2 re-run |

### B0 wizard gaps
The wizard (`b0-wizard-cli.ts`) prompts for accounts, authSetup, routeParamValues, routeParamOverrides — but NOT for any `executionConfig` field. All execution config must be manually authored.

---

## 2. PROBLEM STATEMENT

The current model treats seeding as an **execution-side add-on** rather than a **structural requirement**:

1. **The manifest and CLI can drift.** The wizard generates a manifest without executionConfig. Users must manually add seed fields. This creates permanent drift between what the wizard knows and what the manifest contains.

2. **Seed requirements are not derived from structural artifacts.** A2 already knows which workflows need auth guards, route params, and form data — but this knowledge is not used to infer seed requirements. Instead, users must independently figure out what to seed.

3. **External scripts are architectural dependencies.** `seed-traduora.mjs` is required to run traduora but is not part of the pipeline contract. It mutates the manifest on disk, creating a hidden dependency between seeding and artifact regeneration.

4. **`seedOutputPath` is specified but not implemented.** The runtime-merge design exists in JSDoc comments but has no code. The workaround (disk mutation) undermines manifest integrity.

5. **`batchResetCommand` has no spec backing.** It was added to solve a specific environment problem (rate limiter) without going through the spec amendment process.

6. **Failures are misclassified.** Some failures currently labeled "environment" or "L4:backend-validation" are actually **missing seed requirements** — the pipeline doesn't know what data the application needs.

---

## 3. SEED-CONTRACT DESIGN

### Principles

1. **B0 owns the seed contract.** All seed requirements are declared in the manifest, validated by B0, and exposed by the wizard.
2. **Structural inference first.** Everything that can be inferred from A1/A2/B1 artifacts IS inferred — but never pretend inference can produce concrete values it cannot.
3. **Explicit unknowns.** When inference identifies a requirement but cannot determine the value, the wizard prompts the user. The manifest records both the requirement and the user-provided value.
4. **No external scripts.** The pipeline does not depend on external seed scripts. If a subject needs seeding, the seed mechanism is declared in the manifest and executed by B3.
5. **No manifest mutation at runtime.** The manifest is generated once by the wizard, validated by B0, and consumed read-only by B1/B2/B3.

### Three-tier requirement model

| Tier | Source | Example | Who provides value? |
|---|---|---|---|
| **Inferred** | A1/A2/B1 artifacts | "This subject has AuthGuard → needs an account" | Wizard scaffolds the requirement; user fills credentials |
| **Declared** | User via wizard | "baseUrl is http://localhost:4200" | User provides directly |
| **Executable** | Manifest executionConfig | "Run this command to seed the database" | User provides command; B3 executes |

### Seed requirement lifecycle

```
A1/A2 extraction → B0 wizard infers requirements → user fills values → manifest validated → B3 executes seed → B3 runs tests
```

No step involves external scripts. No step mutates the manifest.

---

## 4. INFERENCE SURFACE

### What A1/A2/B1 artifacts can infer

| Requirement | Source artifact | Granularity | Can infer? | Needs user input? |
|---|---|---|---|---|
| **Auth accounts needed** | A2 `cw.guards` | Subject-level | YES: guard names | YES: credentials, roles |
| **Auth setup mechanism** | A1 component templates | Subject-level | PARTIAL: login route, form fields | YES: authSuccessSelector |
| **Route params needed** | A2 `cw.requiredParams` | Route-family-level | YES: param names | YES: concrete values (entity IDs) |
| **Route param families** | A1 route templates | Route-family-level | YES: which routes share params | YES: per-family values |
| **Form fields** | B1 `formSchema` | Workflow-level | YES: field names, types, constraints | PARTIAL: value generator handles most; user overrides for backend-strict fields |
| **Base URL** | N/A | Subject-level | NO | YES |
| **Backend seed data** | N/A | Subject-level | NO: static analysis cannot see backend schema | YES: seed command or notes |
| **Rate-limit behavior** | N/A | Subject-level | NO: runtime behavior | YES: reset command |

### Confidence levels

| Inferred requirement | Confidence | Notes |
|---|---|---|
| Guard names → auth needed | HIGH | Deterministic from A2 |
| Param names → entities needed | HIGH | Deterministic from A2 |
| Param families → entity grouping | MEDIUM | Heuristic from route templates |
| Form constraints → valid data | MEDIUM | Frontend constraints only; backend may be stricter |
| Backend seed needs | NONE | Cannot infer from static analysis |

### Key insight
The inference surface tells us **WHAT is needed** (auth, params, form data) but not **WHAT VALUES to use** (credentials, entity IDs, valid form data). The wizard bridges this gap by prompting the user for values that inference identifies as required.

---

## 5. MANIFEST SCHEMA CHANGES

### Fields to keep (canonical, working)
- `accounts` — working, wizard-generated
- `authSetup` — working, wizard-prompted
- `routeParamValues` — working, wizard-prompted
- `routeParamOverrides` — working, wizard-prompted
- `formDataOverrides` — working (optional manual addition)
- `skipWorkflows` — working

### Fields to keep in `executionConfig` (canonical, operational)
- `readinessEndpoint` — canonical
- `readinessTimeoutMs` — canonical
- `preAttemptCommand` — canonical, needed for per-test reset
- `timeoutProfile` — canonical
- `enableNetworkEvidence` — canonical

### Fields to amend in `executionConfig`
- `batchResetCommand` — **add to spec** (currently ad-hoc but proven necessary for rate-limiter reset). Amend approach.md to include it.
- `seedCommand` — **keep** but the wizard MUST prompt for it when the subject has auth or route params (structural inference: "you need seed data")
- `seedDataNotes` — **keep** as informational

### Fields to remove
- `seedOutputPath` — **DELETE**. The runtime-merge design was never implemented. The correct model: seed command runs BEFORE B1/B2 regeneration (not at B3 time). The seed command writes its outputs to the manifest directly via the wizard, or the user re-runs the wizard after seeding. No runtime merge needed.

### New field: `seedRequirements` (wizard-generated, B0-validated)
```typescript
seedRequirements?: {
  /** Structurally inferred: guard names that require auth accounts */
  guardNames: string[];
  /** Structurally inferred: route param names that require entity values */
  routeParams: string[];
  /** Whether the subject has form-submission workflows (implies backend data validation) */
  hasFormWorkflows: boolean;
  /** User-declared: whether a seedCommand is needed */
  needsSeedCommand: boolean;
}
```

This field is **generated by the wizard** from A2 artifacts and **validated by B0** against the manifest's actual `accounts`/`routeParamValues` declarations. If `seedRequirements.guardNames` lists "AuthGuard" but no account satisfies "AuthGuard", B0 emits a warning.

---

## 6. CLI/WIZARD CHANGES

### Current wizard flow
1. Read A2 workflows
2. Prompt for baseUrl
3. Infer guard requirements → prompt for accounts
4. Infer param requirements → prompt for routeParamValues
5. Prompt for authSetup if guards present
6. Write manifest

### New wizard flow (additions in **bold**)
1. Read A2 workflows
2. Prompt for baseUrl
3. Infer guard requirements → prompt for accounts
4. Infer param requirements → prompt for routeParamValues
5. Prompt for authSetup if guards present
6. **Infer seed requirements → write `seedRequirements` field**
7. **If params or auth needed: prompt "Does this subject require seed data provisioning?"**
8. **If yes: prompt for `seedCommand` (idempotent shell command)**
9. **If rate-limiting expected: prompt for `batchResetCommand`**
10. **Prompt for `preAttemptCommand` if auth-heavy subject**
11. **Prompt for CDP: `enableNetworkEvidence`**
12. Write manifest

### Wizard output guarantees
- The manifest is always complete after wizard generation
- No manual field additions needed for standard benchmark execution
- `seedRequirements` is always populated (even if empty — meaning no structural requirements)

---

## 7. CLASSIFICATION RULES

### True seed requirement
A failure where the test needs data/entities that don't exist in the running application, AND the missing data is identifiable from structural artifacts (route params, auth accounts).
- **Signal:** HTTP 404/400 on entity lookup, element-not-found on data-dependent UI
- **Fix:** Correct seedCommand in manifest

### True backend-validation issue
A failure where the test submits data that the backend rejects (HTTP 400), AND the rejection is due to backend DTO rules not visible in frontend validators.
- **Signal:** HTTP 400 on POST/PUT with structurally-valid frontend data
- **Fix:** formDataOverrides in manifest (cannot be fixed by seeding)

### True environment issue
A failure caused by the execution environment (ports, processes, rate limits), not by missing data or wrong data.
- **Signal:** HTTP 429, connection refused, wrong app on port
- **Fix:** preAttemptCommand, batchResetCommand, runbook compliance

### True oracle issue
A failure where the test executed correctly but the assertion is wrong.
- **Signal:** All-200 CDP, handler succeeded, URL didn't match expectation
- **Fix:** B5.4 oracle redesign

### True structural unrealizability
A workflow that cannot be executed as a single-trigger test regardless of seed data.
- **Signal:** Requires prior user action (multi-step chain), requires runtime token (password reset), requires OAuth configuration
- **Fix:** skipWorkflows in manifest (not a seed issue)

### NOT a seed issue (misclassification risk)
- L3 async/permission gate timeouts (B5.2 wait problem, not seed)
- L3 locator mismatches (B1 locator strategy, not seed)
- L2 non-navigating handler postconditions (oracle problem, not seed)

---

## 8. MIGRATION PLAN

### Step 1: Spec amendment (approach.md)
- Add `batchResetCommand` to ExecutionConfig schema
- Remove `seedOutputPath` from ExecutionConfig schema
- Add `seedRequirements` to SubjectManifest schema (wizard-generated, B0-validated)
- Document the three-tier seed requirement model

### Step 2: Schema update (manifest-schema.ts)
- Remove `seedOutputPath` field and JSDoc
- Add `seedRequirements` interface and field
- Add `batchResetCommand` to ExecutionConfig interface

### Step 3: B0 validator update (manifest-validator.ts)
- Validate `seedRequirements` against actual `accounts`/`routeParamValues`
- Validate `executionConfig` sub-field types (seedCommand: string, preAttemptCommand: string, batchResetCommand: string, etc.)
- Warn if `seedRequirements.needsSeedCommand` is true but `seedCommand` is absent

### Step 4: Wizard update (b0-wizard-cli.ts)
- Add seed requirement inference from A2 workflows
- Add prompts for seedCommand, batchResetCommand, preAttemptCommand, enableNetworkEvidence
- Generate `seedRequirements` field automatically

### Step 5: B3 CLI cleanup (b3-cli.ts)
- Remove `seedOutputPath` handling (lines 119-124)
- Keep `seedCommand` execution (already working)

### Step 6: Delete external script
- Delete `scripts/seed-traduora.mjs` (replaced by `seedCommand` in manifest)
- Delete `subjects/ever-traduora/.seed-output.json` (dead artifact)

### Step 7: Manifest migration
- For each subject manifest: re-run wizard to generate `seedRequirements`
- For traduora: set `seedCommand` to the equivalent of what seed-traduora.mjs does (or a reference to a standalone script that doesn't mutate the manifest)

### Migration window
No compatibility window needed. The changes are additive (`seedRequirements` is optional) and the removal (`seedOutputPath`) has no code depending on it.

---

## 9. VALIDATION PLAN

### Schema validation
- B0 must accept manifests with `seedRequirements` present
- B0 must accept manifests without `seedRequirements` (backward compatible)
- B0 must warn when inferred requirements don't match declared values

### Wizard output validation
- Wizard must produce a manifest that passes B0 validation
- Wizard must include `seedRequirements` in output
- Wizard must prompt for `seedCommand` when `seedRequirements.needsSeedCommand` is true

### Determinism
- `seedRequirements` generation must be deterministic (same A2 input → same requirements)
- Wizard prompts must be order-stable

### Focused benchmark check
- After implementation, regenerate the traduora manifest via wizard
- Verify B0 validates it
- Run traduora benchmark → compare with current baseline
- If C3 matches or improves, the seed contract is validated

---

## 10. SUMMARY

### What changes
| Current | New |
|---|---|
| External seed scripts | seedCommand in manifest |
| Manifest mutation on disk | Manifest is read-only after wizard generation |
| seedOutputPath (unimplemented) | Deleted |
| batchResetCommand (no spec) | Added to spec |
| Wizard ignores executionConfig | Wizard prompts for all seed-related fields |
| B0 doesn't validate executionConfig | B0 validates all executionConfig sub-fields |
| Seed requirements implicit | seedRequirements field explicit in manifest |

### What stays the same
| Preserved | Reason |
|---|---|
| accounts, authSetup, routeParamValues | Working, wizard-generated |
| preAttemptCommand | Working, needed per-test |
| seedCommand | Working, needs wizard integration |
| seedDataNotes | Informational, harmless |
| formDataOverrides | Working, optional |

### Implementation order
1. Spec amendment (approach.md) — freeze design
2. Schema + validator + wizard updates
3. B3 CLI cleanup
4. External script deletion
5. Manifest regeneration
6. Validation benchmark
