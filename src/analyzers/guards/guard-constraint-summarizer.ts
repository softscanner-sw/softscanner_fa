/**
 * guard-constraint-summarizer.ts
 * Converts route guard bindings from "guard name strings" into bounded
 * ConstraintSummary objects by statically inspecting guard class bodies.
 *
 * This is a Phase 1 post-pass: it receives a fully-built RouteMap and
 * returns an enriched copy with constraintSummary fields populated on
 * RouteGuardBindings (and optionally rolled up to the Route itself).
 *
 * Heuristics (all bounded, no symbolic execution):
 *   authRequired    — detect auth-service / isLoggedIn / isAuthenticated checks
 *   rolesRequired   — detect role/permission string literals in guard body
 *   featureFlags    — detect feature-flag key string literals
 *   requiresEntityState — detect guard checks against entity-level state tokens
 *
 * Prohibited:
 *   - Satisfiability / SMT solving
 *   - Runtime execution
 *   - Free-form text summarization
 */

import type { Project, Node } from 'ts-morph';
import type { RouteMap, Route, RouteGuardBinding } from '../../models/routes.js';
import type { ConstraintSummary } from '../../models/constraints.js';
import { TsAstUtils } from '../../parsers/ts/ts-ast-utils.js';

// ---------------------------------------------------------------------------
// Heuristic keyword sets
// ---------------------------------------------------------------------------

/** Identifiers that suggest an authentication check. */
const AUTH_KEYWORDS = new Set([
  'isLoggedIn', 'isAuthenticated', 'authService', 'authGuard',
  'authenticated', 'currentUser', 'getToken', 'isSignedIn',
]);

/** Common role/permission-related method/property names. */
const ROLE_GETTER_NAMES = new Set([
  'hasRole', 'hasPermission', 'checkRole', 'userRole',
  'requiredRole', 'roles', 'permissions',
]);

/** Feature-flag method/property names. */
const FEATURE_FLAG_NAMES = new Set([
  'isEnabled', 'featureEnabled', 'featureFlag', 'getFlag',
  'isFeatureActive', 'featureFlags',
]);

// ---------------------------------------------------------------------------
// Summarizer
// ---------------------------------------------------------------------------

export class GuardConstraintSummarizer {
  private readonly _cfg: { maxTemplateSnippetLength?: number };

  constructor(cfg?: { maxTemplateSnippetLength?: number }) {
    this._cfg = cfg ?? {};
  }

  /**
   * Enrich all RouteGuardBindings in the RouteMap with ConstraintSummaries.
   * Returns a new RouteMap; does not mutate the input.
   */
  summarize(project: Project, routeMap: RouteMap): RouteMap {
    const enrichedRoutes = routeMap.routes.map((route) =>
      this._enrichRoute(project, route),
    );

    const byId: Record<string, Route> = {};
    for (const route of enrichedRoutes) {
      byId[route.id] = route;
    }

    return { routes: enrichedRoutes, byId };
  }

  // ---------------------------------------------------------------------------
  // Per-route enrichment
  // ---------------------------------------------------------------------------

  private _enrichRoute(project: Project, route: Route): Route {
    const enrichedGuards = route.guards.map((guard) =>
      this._enrichGuard(project, guard),
    );

    // Roll up all guard summaries into one route-level summary
    const rolledUp = this._mergeConstraintSummaries(
      enrichedGuards.map((g) => g.constraintSummary).filter(
        (s): s is ConstraintSummary => s !== undefined,
      ),
    );

    const merged: Route = { ...route, guards: enrichedGuards };
    const cs = rolledUp ?? route.constraintSummary;
    if (cs !== undefined) merged.constraintSummary = cs;
    return merged;
  }

  // ---------------------------------------------------------------------------
  // Per-guard summarization
  // ---------------------------------------------------------------------------

  private _enrichGuard(project: Project, guard: RouteGuardBinding): RouteGuardBinding {
    const decl = TsAstUtils.resolveSymbolToDeclaration(project, guard.guardName);

    if (decl === null) {
      return guard; // Cannot resolve — leave as-is
    }

    const summary = this._summarizeGuardDeclaration(decl);

    const enriched: RouteGuardBinding = { ...guard };
    const cs = summary ?? guard.constraintSummary;
    if (cs !== undefined) enriched.constraintSummary = cs;
    return enriched;
  }

  private _summarizeGuardDeclaration(decl: Node): ConstraintSummary | null {
    const text = decl.getText();
    const maxLen = this._cfg.maxTemplateSnippetLength ?? 200;

    const summary: ConstraintSummary = {};
    let hasContent = false;

    // ── Auth check detection ─────────────────────────────────────────────
    for (const keyword of AUTH_KEYWORDS) {
      if (text.includes(keyword)) {
        summary.authRequired = true;
        hasContent = true;
        break;
      }
    }

    // ── Role extraction ──────────────────────────────────────────────────
    const roles = this._extractRoleStrings(decl, maxLen);
    if (roles.length > 0) {
      summary.rolesRequired = roles;
      hasContent = true;
    }

    // ── Feature flag extraction ──────────────────────────────────────────
    const flags = this._extractFeatureFlagKeys(decl, maxLen);
    if (flags.length > 0) {
      summary.featureFlags = flags;
      hasContent = true;
    }

    // ── Entity state detection ───────────────────────────────────────────
    const entityStates = this._extractEntityStateTokens(decl);
    if (entityStates.length > 0) {
      summary.requiresEntityState = entityStates;
      hasContent = true;
    }

    return hasContent ? summary : null;
  }

  // ---------------------------------------------------------------------------
  // Extraction heuristics
  // ---------------------------------------------------------------------------

  private _extractRoleStrings(decl: Node, maxLen: number): string[] {
    const roles: string[] = [];

    // Check if a role-getter identifier is referenced in the guard body
    const text = decl.getText();
    let hasRoleGetter = false;
    for (const name of ROLE_GETTER_NAMES) {
      if (text.includes(name)) {
        hasRoleGetter = true;
        break;
      }
    }

    if (!hasRoleGetter) return [];

    // Extract string literals near role references (bounded)
    const literals = TsAstUtils.extractArrayOfStringLiterals(decl);
    for (const lit of literals) {
      const trimmed = TsAstUtils.truncateDeterministically(lit, maxLen);
      if (trimmed.length > 0 && /^[A-Za-z][A-Za-z0-9_-]*$/.test(trimmed)) {
        roles.push(trimmed);
      }
    }

    return [...new Set(roles)].sort();
  }

  private _extractFeatureFlagKeys(decl: Node, maxLen: number): string[] {
    const flags: string[] = [];
    const text = decl.getText();

    let hasFlagMethod = false;
    for (const name of FEATURE_FLAG_NAMES) {
      if (text.includes(name)) {
        hasFlagMethod = true;
        break;
      }
    }

    if (!hasFlagMethod) return [];

    const literals = TsAstUtils.extractArrayOfStringLiterals(decl);
    for (const lit of literals) {
      const trimmed = TsAstUtils.truncateDeterministically(lit, maxLen);
      if (trimmed.length > 0) flags.push(trimmed);
    }

    return [...new Set(flags)].sort();
  }

  private _extractEntityStateTokens(decl: Node): string[] {
    // Detect common entity-state guard patterns by looking for well-known
    // property accesses that indicate required entity context.
    const ENTITY_PATTERNS: Record<string, string> = {
      isOrgSelected: 'orgSelected',
      selectedOrg: 'orgSelected',
      isAccountActive: 'accountActive',
      accountStatus: 'accountActive',
      tenantId: 'tenantSelected',
    };

    const text = decl.getText();
    const tokens: string[] = [];

    for (const [pattern, token] of Object.entries(ENTITY_PATTERNS)) {
      if (text.includes(pattern)) tokens.push(token);
    }

    return [...new Set(tokens)].sort();
  }

  // ---------------------------------------------------------------------------
  // Merge helper
  // ---------------------------------------------------------------------------

  private _mergeConstraintSummaries(
    summaries: ConstraintSummary[],
  ): ConstraintSummary | null {
    if (summaries.length === 0) return null;

    const merged: ConstraintSummary = {};
    let hasContent = false;

    for (const s of summaries) {
      if (s.authRequired === true) {
        merged.authRequired = true;
        hasContent = true;
      }
      if (s.rolesRequired !== undefined && s.rolesRequired.length > 0) {
        merged.rolesRequired = [...new Set([...(merged.rolesRequired ?? []), ...s.rolesRequired])].sort();
        hasContent = true;
      }
      if (s.featureFlags !== undefined && s.featureFlags.length > 0) {
        merged.featureFlags = [...new Set([...(merged.featureFlags ?? []), ...s.featureFlags])].sort();
        hasContent = true;
      }
      if (s.requiresEntityState !== undefined && s.requiresEntityState.length > 0) {
        merged.requiresEntityState = [...new Set([...(merged.requiresEntityState ?? []), ...s.requiresEntityState])].sort();
        hasContent = true;
      }
      if (s.requiredParams !== undefined && s.requiredParams.length > 0) {
        merged.requiredParams = [...new Set([...(merged.requiredParams ?? []), ...s.requiredParams])].sort();
        hasContent = true;
      }
      if (s.notes !== undefined && s.notes.length > 0) {
        merged.notes = [...(merged.notes ?? []), ...s.notes];
        hasContent = true;
      }
    }

    return hasContent ? merged : null;
  }
}
