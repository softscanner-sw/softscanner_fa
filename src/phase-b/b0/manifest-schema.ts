/**
 * manifest-schema.ts
 * SubjectManifest type definition for Phase B0.
 *
 * Authority: docs/paper/approach.md — Phase B §B0 (normative).
 * Do not modify without spec amendment.
 *
 * Phase isolation: this file imports only from src/models/ (types only).
 */

// ---------------------------------------------------------------------------
// SubjectManifest — per-subject runtime configuration for Phase B
// ---------------------------------------------------------------------------

/**
 * AuthSetup — how to authenticate against the subject's login form.
 * Required when the manifest declares accounts with guardSatisfies.
 * Provides the login mechanism so B1 can populate PreCondition.config
 * and B2 can generate Selenium authentication code.
 */
export interface AuthSetup {
  /** Path for the login page (e.g., "/login"). */
  loginRoute: string;
  /** CSS selector for the username input field. */
  usernameField: string;
  /** CSS selector for the password input field. */
  passwordField: string;
  /** CSS selector for the login submit button. */
  submitButton: string;
  /**
   * CSS selector for an element that is ONLY present after successful login.
   * This is the sole auth success signal — the auth precondition polls for this
   * element's presence after submitting credentials. Required when authSetup is present.
   * Example: 'app-bar [routerLink="/projects"]' or 'mat-sidenav-container'.
   */
  authSuccessSelector: string;
}

/** An account that can satisfy one or more route guards. */
export interface ManifestAccount {
  /** Login username / email. */
  username: string;
  /** Login password. */
  password: string;
  /** Role names this account holds. */
  roles: string[];
  /** Guard class names this account satisfies (e.g. "AuthGuard", "CanGuard"). */
  guardSatisfies: string[];
}

/**
 * SubjectManifest — the normative per-subject contract for Phase B execution.
 *
 * Authority: docs/paper/approach.md — Phase B §B0 SubjectManifest schema.
 * Maps guard names to credentials, route params to concrete values,
 * and form fields to valid test data.
 */
/**
 * ExecutionConfig — execution-readiness settings consumed only by B3.
 * B0 validates schema if present. B1 and B2 ignore it.
 */
export interface ExecutionConfig {
  /** URL to GET for readiness check. Expects HTTP 200. Defaults to baseUrl. */
  readinessEndpoint?: string;
  /** Maximum wait time (ms) for app readiness. Defaults to 30000. */
  readinessTimeoutMs?: number;
  /** Human-readable notes about required seed data or fixtures.
   *  Informational only — not validated by B0 or B3. */
  seedDataNotes?: string[];
  /**
   * Shell command to run before each test attempt.
   * Used to reset application state that would otherwise cascade between attempts
   * (e.g., login lockout counters for rate-limited auth APIs).
   */
  preAttemptCommand?: string;
}

export interface SubjectManifest {
  /** Subject name (must match the subject directory name). */
  subjectName: string;
  /** Base URL where the subject application is served (e.g. "http://localhost:4200"). */
  baseUrl: string;
  /** Available test accounts with guard satisfaction mappings. */
  accounts: ManifestAccount[];
  /**
   * Route parameter name → concrete value for parameterized routes.
   * This value is applied to ALL route templates that use the named parameter.
   * When the same parameter name (e.g. `:id`) is used by multiple semantically
   * distinct entity families (e.g. /owners/:id vs /pets/:id), use
   * routeParamOverrides for per-template specificity.
   */
  routeParamValues: Record<string, string>;
  /**
   * Per-route-template parameter overrides.
   * Keys: route template fullPath (e.g. "/owners/:id", "/pets/:id/edit").
   * Values: param name → concrete value for that specific template.
   * B1 checks this first; falls back to routeParamValues when absent.
   * Use when the same param name refers to different entity types in different
   * route families and each entity type requires a distinct seed value.
   */
  routeParamOverrides?: Record<string, Record<string, string>>;
  /** Workflow-specific form data overrides: workflowId → fieldName → value. */
  formDataOverrides?: Record<string, Record<string, string>>;
  /** Workflow IDs to exclude from execution. */
  skipWorkflows?: string[];
  /** Login mechanism for authenticated workflows. Required when accounts have guardSatisfies. */
  authSetup?: AuthSetup;
  /** Execution-readiness configuration. Consumed only by B3. */
  executionConfig?: ExecutionConfig;
}
