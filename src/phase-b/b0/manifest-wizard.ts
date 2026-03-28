/**
 * manifest-wizard.ts
 * Pure wizard context builder for the Phase B0 manifest scaffolding wizard.
 *
 * Authority: docs/paper/approach.md — Phase B §B0 Manifest Wizard.
 * Phase isolation: imports only from src/models/.
 * No I/O — all readline/prompt logic lives in b0-wizard-cli.ts.
 *
 * Exports:
 *   buildWizardContext       — per-guard and per-param context for prompting
 *   deriveAuthSetupFromA1    — deterministic authSetup suggestion from A1 widget data
 *   buildParamFamilyGroups   — detects multi-family params (e.g. :id → owners/pets/vets)
 *   scaffoldManifest         — pure skeleton with empty strings (programmatic use)
 *   wizardStats              — compact summary stats
 */

import type {
  A1Multigraph,
  RouteNode,
  WidgetNode,
} from '../../models/multigraph.js';
import type { A2WorkflowSet, TaskWorkflow, WorkflowVerdict } from '../../models/workflow.js';
import type { EdgeKind } from '../../models/multigraph.js';
import type { SubjectManifest } from './manifest-schema.js';

// ---------------------------------------------------------------------------
// Wizard context types — derived deterministically from A2 + optional A1
// ---------------------------------------------------------------------------

export interface WorkflowRef {
  id: string;
  verdict: WorkflowVerdict;
  triggerKind: EdgeKind;
  terminalPath: string | undefined;
  startPaths: string[];
}

export interface GuardContext {
  name: string;
  isNoAuth: boolean;
  workflowCount: number;
  workflows: WorkflowRef[];
  startRoutePaths: string[];
}

export interface ParamContext {
  name: string;
  workflowCount: number;
  workflows: WorkflowRef[];
  startRouteTemplates: string[];
  terminalRouteTemplates: string[];
}

export interface WizardContext {
  subjectName: string;
  totalWorkflows: number;
  nonPrunedCount: number;
  guardedWorkflowCount: number;
  parameterizedWorkflowCount: number;
  guards: GuardContext[];
  params: ParamContext[];
}

export function buildWizardContext(
  a2: A2WorkflowSet,
  routePathMap: Map<string, string> = new Map(),
): WizardContext {
  const nonPruned = a2.workflows.filter((wf) => wf.verdict !== 'PRUNED');

  const allGuards = new Set<string>();
  const allParams = new Set<string>();
  for (const wf of nonPruned) {
    for (const g of wf.cw.guards) allGuards.add(g);
    for (const p of wf.cw.requiredParams) allParams.add(p);
  }

  const guards: GuardContext[] = [...allGuards]
    .sort((a, b) => {
      const aNoAuth = a.toLowerCase().includes('noauth');
      const bNoAuth = b.toLowerCase().includes('noauth');
      if (aNoAuth !== bNoAuth) return aNoAuth ? 1 : -1;
      return a.localeCompare(b);
    })
    .map((g) => buildGuardContext(g, nonPruned, routePathMap));

  const params: ParamContext[] = [...allParams]
    .sort((a, b) => a.localeCompare(b))
    .map((p) => buildParamContext(p, nonPruned, routePathMap));

  return {
    subjectName: '',
    totalWorkflows: a2.stats.workflowCount,
    nonPrunedCount: nonPruned.length,
    guardedWorkflowCount: nonPruned.filter((wf) => wf.cw.guards.length > 0).length,
    parameterizedWorkflowCount: nonPruned.filter((wf) => wf.cw.requiredParams.length > 0).length,
    guards,
    params,
  };
}

function buildGuardContext(
  guardName: string,
  nonPruned: TaskWorkflow[],
  routePathMap: Map<string, string>,
): GuardContext {
  const affected = nonPruned
    .filter((wf) => wf.cw.guards.includes(guardName))
    .sort((a, b) => a.id.localeCompare(b.id));
  const startPaths = dedup(
    affected.flatMap((wf) =>
      wf.startRouteIds.map((rid) => routePathMap.get(rid)).filter((p): p is string => p !== undefined),
    ),
  ).sort();
  return {
    name: guardName,
    isNoAuth: guardName.toLowerCase().includes('noauth'),
    workflowCount: affected.length,
    workflows: affected.slice(0, 10).map((wf) => toWorkflowRef(wf, routePathMap)),
    startRoutePaths: startPaths,
  };
}

function buildParamContext(
  paramName: string,
  nonPruned: TaskWorkflow[],
  routePathMap: Map<string, string>,
): ParamContext {
  const affected = nonPruned
    .filter((wf) => wf.cw.requiredParams.includes(paramName))
    .sort((a, b) => a.id.localeCompare(b.id));
  const colonParam = `:${paramName}`;
  const startRouteTemplates = dedup(
    affected.flatMap((wf) =>
      wf.startRouteIds
        .map((rid) => routePathMap.get(rid))
        .filter((p): p is string => p !== undefined && p.includes(colonParam)),
    ),
  ).sort();
  const terminalRouteTemplates = dedup(
    affected
      .map((wf) => routePathMap.get(wf.terminalNodeId))
      .filter((p): p is string => p !== undefined && p.includes(colonParam)),
  ).sort();
  return {
    name: paramName,
    workflowCount: affected.length,
    workflows: affected.slice(0, 10).map((wf) => toWorkflowRef(wf, routePathMap)),
    startRouteTemplates,
    terminalRouteTemplates,
  };
}

function toWorkflowRef(wf: TaskWorkflow, routePathMap: Map<string, string>): WorkflowRef {
  return {
    id: wf.id,
    verdict: wf.verdict,
    triggerKind: wf.steps[0]?.kind ?? ('WIDGET_TRIGGERS_HANDLER' as EdgeKind),
    terminalPath: routePathMap.get(wf.terminalNodeId),
    startPaths: wf.startRouteIds
      .map((rid) => routePathMap.get(rid))
      .filter((p): p is string => p !== undefined),
  };
}

// ---------------------------------------------------------------------------
// AuthSetup derivation from A1 multigraph
// ---------------------------------------------------------------------------

export type DerivedFieldConfidence = 'HIGH' | 'MEDIUM' | 'UNRESOLVED';

export interface DerivedField {
  value: string;
  /** Evidence used to derive this value (human-readable). */
  evidence: string;
  confidence: DerivedFieldConfidence;
}

export interface AuthSetupDerivation {
  loginRoute: DerivedField;
  usernameField: DerivedField;
  passwordField: DerivedField;
  submitButton: DerivedField;
  authSuccessSelector: DerivedField;
}

/**
 * Attempt to derive authSetup selectors deterministically from A1 multigraph data.
 *
 * Algorithm:
 * 1. Find routes that have a login form (contains both a password input and a
 *    username/email input in the component activated on that route).
 * 2. Among candidates, prefer NoAuthGuard routes; then routes with "login" in path.
 * 3. Extract CSS selectors from the login form widgets using priority:
 *    - formControlName → `input[formcontrolname='..']`   (HIGH)
 *    - inputType       → `input[type='..']`               (MEDIUM)
 *    - nameAttr        → `input[name='..']`               (MEDIUM)
 *    - unresolved                                          (UNRESOLVED)
 */
export function deriveAuthSetupFromA1(a1: A1Multigraph): AuthSetupDerivation {
  const UNRESOLVED: DerivedField = { value: '', evidence: 'not found in A1', confidence: 'UNRESOLVED' };

  // Index: routeId → componentIds
  const activationMap = new Map<string, string[]>();
  for (const edge of a1.multigraph.edges) {
    if (edge.kind === 'ROUTE_ACTIVATES_COMPONENT' && edge.to !== null) {
      const list = activationMap.get(edge.from) ?? [];
      list.push(edge.to);
      activationMap.set(edge.from, list);
    }
  }

  // Index: componentId → WidgetNode[]
  const widgetsByComponent = new Map<string, WidgetNode[]>();
  for (const node of a1.multigraph.nodes) {
    if (node.kind === 'Widget') {
      const w = node as WidgetNode;
      const list = widgetsByComponent.get(w.meta.componentId) ?? [];
      list.push(w);
      widgetsByComponent.set(w.meta.componentId, list);
    }
  }

  // Collect all route nodes
  const allRoutes = a1.multigraph.nodes.filter((n) => n.kind === 'Route') as RouteNode[];

  // Identify login-form routes: route → component has both password + username widgets
  interface LoginCandidate {
    route: RouteNode;
    widgets: WidgetNode[];
  }
  const loginCandidates: LoginCandidate[] = [];

  for (const route of allRoutes) {
    const componentIds = activationMap.get(route.id) ?? [];
    const widgets = componentIds.flatMap((cId) => widgetsByComponent.get(cId) ?? []);

    const hasPassword = widgets.some(
      (w) => w.meta.ui.inputType === 'password' || w.meta.ui.formControlName === 'password',
    );
    const hasUsername = widgets.some(
      (w) =>
        w.meta.ui.inputType === 'email' ||
        ['email', 'username', 'login', 'user', 'emailid'].some(
          (k) => w.meta.ui.formControlName?.toLowerCase().includes(k),
        ) ||
        (w.meta.tagName === 'input' &&
          w.meta.ui.inputType !== 'password' &&
          w.meta.ui.inputType !== 'checkbox' &&
          w.meta.ui.inputType !== 'submit' &&
          w.meta.ui.inputType !== 'radio'),
    );

    if (hasPassword && hasUsername) {
      loginCandidates.push({ route, widgets });
    }
  }

  if (loginCandidates.length === 0) {
    return { loginRoute: UNRESOLVED, usernameField: UNRESOLVED, passwordField: UNRESOLVED, submitButton: UNRESOLVED, authSuccessSelector: UNRESOLVED };
  }

  // Select best login candidate:
  // 1. NoAuthGuard route with 'login' in path
  // 2. NoAuthGuard route
  // 3. Unguarded route with 'login' in path
  // 4. Any route with 'login' in path
  // 5. First candidate
  const ranked = loginCandidates.sort((a, b) => {
    const aNoAuth = a.route.meta.guards.some((g) => g.toLowerCase().includes('noauth'));
    const bNoAuth = b.route.meta.guards.some((g) => g.toLowerCase().includes('noauth'));
    const aLogin = a.route.meta.fullPath.toLowerCase().includes('login');
    const bLogin = b.route.meta.fullPath.toLowerCase().includes('login');
    if (aNoAuth && !bNoAuth) return -1;
    if (!aNoAuth && bNoAuth) return 1;
    if (aLogin && !bLogin) return -1;
    if (!aLogin && bLogin) return 1;
    return a.route.meta.fullPath.localeCompare(b.route.meta.fullPath);
  });

  const best = ranked[0]!;
  const widgets = best.widgets;

  // Derive loginRoute
  const loginRoute: DerivedField = {
    value: best.route.meta.fullPath,
    evidence: `route ${best.route.meta.fullPath} has login form widgets`,
    confidence: best.route.meta.fullPath.includes('login') ? 'HIGH' : 'MEDIUM',
  };

  // Derive passwordField
  const pwWidget = widgets.find(
    (w) => w.meta.ui.inputType === 'password' || w.meta.ui.formControlName === 'password',
  );
  let passwordField: DerivedField;
  if (pwWidget?.meta.ui.formControlName) {
    passwordField = {
      value: `input[formcontrolname='${pwWidget.meta.ui.formControlName}']`,
      evidence: `formControlName="${pwWidget.meta.ui.formControlName}"`,
      confidence: 'HIGH',
    };
  } else if (pwWidget?.meta.ui.inputType === 'password') {
    passwordField = { value: `input[type='password']`, evidence: `inputType="password"`, confidence: 'HIGH' };
  } else {
    passwordField = UNRESOLVED;
  }

  // Derive usernameField (the non-password, non-checkbox, non-submit input)
  const usernameKeywords = ['email', 'username', 'login', 'user', 'emailid'];
  const unWidget =
    widgets.find(
      (w) =>
        w.meta.tagName === 'input' &&
        w.meta.ui.inputType !== 'password' &&
        w.meta.ui.inputType !== 'checkbox' &&
        w.meta.ui.inputType !== 'submit' &&
        usernameKeywords.some((k) => w.meta.ui.formControlName?.toLowerCase().includes(k)),
    ) ??
    widgets.find(
      (w) =>
        w.meta.tagName === 'input' &&
        (w.meta.ui.inputType === 'email' || w.meta.ui.inputType === 'text'),
    ) ??
    widgets.find(
      (w) =>
        w.meta.tagName === 'input' &&
        w.meta.ui.inputType !== 'password' &&
        w.meta.ui.inputType !== 'checkbox' &&
        w.meta.ui.inputType !== 'submit',
    );

  let usernameField: DerivedField;
  if (unWidget?.meta.ui.formControlName) {
    usernameField = {
      value: `input[formcontrolname='${unWidget.meta.ui.formControlName}']`,
      evidence: `formControlName="${unWidget.meta.ui.formControlName}"`,
      confidence: 'HIGH',
    };
  } else if (unWidget?.meta.ui.nameAttr) {
    usernameField = {
      value: `input[name='${unWidget.meta.ui.nameAttr}']`,
      evidence: `name="${unWidget.meta.ui.nameAttr}"`,
      confidence: 'HIGH',
    };
  } else if (unWidget?.meta.ui.inputType === 'email') {
    usernameField = { value: `input[type='email']`, evidence: `inputType="email"`, confidence: 'MEDIUM' };
  } else {
    usernameField = UNRESOLVED;
  }

  // Derive submitButton
  const submitWidget = widgets.find(
    (w) =>
      w.meta.tagName === 'button' &&
      (w.meta.attributes?.['type'] === 'submit' || w.meta.ui.inputType === 'submit'),
  );
  const submitField: DerivedField = submitWidget
    ? { value: `button[type='submit']`, evidence: `button[type="submit"] in login form`, confidence: 'HIGH' }
    : UNRESOLVED;

  return { loginRoute, usernameField, passwordField, submitButton: submitField, authSuccessSelector: UNRESOLVED };
}

// ---------------------------------------------------------------------------
// Param family grouping (for route-param prompting)
// ---------------------------------------------------------------------------

/**
 * A group of route templates that share the same param name AND the same
 * entity family (first path segment before the param in the URL).
 */
export interface ParamFamily {
  /** Entity family identifier: the path segment immediately before `:paramName`. */
  entityFamily: string;
  /** All route templates using :paramName in this entity context (sorted). */
  routeTemplates: string[];
  /** Number of A2 workflows affected by this family. */
  workflowCount: number;
  /** Representative template used as the routeParamOverrides key. */
  representativeTemplate: string;
}

/** All family groups for a single route param name. */
export interface ParamFamilyGroup {
  paramName: string;
  /** True when the same param appears in ≥2 distinct entity families. */
  isMultiFamily: boolean;
  /** One entry per entity family, sorted by entityFamily name. */
  families: ParamFamily[];
  /** Total workflows using this param (across all families). */
  totalWorkflowCount: number;
}

/**
 * Build entity-family groups for each route param, using A2 workflows + A1 route map.
 *
 * A "multi-family" param (like `:id` in spring-petclinic) appears in routes whose
 * first path segment differs (e.g. /owners/:id vs /pets/:id → families: owners, pets).
 * The caller should prompt per-family for multi-family params and use routeParamOverrides;
 * for single-family params, routeParamValues is sufficient.
 */
export function buildParamFamilyGroups(
  a2: A2WorkflowSet,
  routePathMap: Map<string, string>,
): ParamFamilyGroup[] {
  const nonPruned = a2.workflows.filter((wf) => wf.verdict !== 'PRUNED');

  // Collect all unique param names
  const allParams = new Set<string>();
  for (const wf of nonPruned) {
    for (const p of wf.cw.requiredParams) allParams.add(p);
  }

  const groups: ParamFamilyGroup[] = [];

  for (const paramName of [...allParams].sort()) {
    const paramWfs = nonPruned.filter((wf) => wf.cw.requiredParams.includes(paramName));
    const colonParam = `:${paramName}`;

    // Collect all route templates containing :paramName, with their entity family
    // Map: entityFamily → { templates: Set, workflowIds: Set }
    const familyMap = new Map<string, { templates: Set<string>; workflowIds: Set<string> }>();

    for (const wf of paramWfs) {
      // Collect all templates this workflow uses for this param
      const templates: string[] = [];
      for (const rid of wf.startRouteIds) {
        const p = routePathMap.get(rid);
        if (p && p.includes(colonParam)) templates.push(p);
      }
      const termPath = routePathMap.get(wf.terminalNodeId);
      if (termPath && termPath.includes(colonParam)) templates.push(termPath);

      // Also collect any template that uses this param even if the workflow
      // only has the param because of the terminal route
      if (templates.length === 0) {
        // param is required but no start/terminal template has it in our map
        // use a generic family bucket
        const bucket = familyMap.get('(param)') ?? { templates: new Set(), workflowIds: new Set() };
        bucket.workflowIds.add(wf.id);
        familyMap.set('(param)', bucket);
        continue;
      }

      for (const template of templates) {
        const family = extractEntityFamily(template, paramName);
        const bucket = familyMap.get(family) ?? { templates: new Set(), workflowIds: new Set() };
        bucket.templates.add(template);
        bucket.workflowIds.add(wf.id);
        familyMap.set(family, bucket);
      }
    }

    const families: ParamFamily[] = [...familyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([entityFamily, { templates, workflowIds }]) => {
        const sortedTemplates = [...templates].sort();
        // Representative: shortest template in the family (typically the base route)
        const rep = sortedTemplates.reduce(
          (shortest, t) => (t.length < shortest.length ? t : shortest),
          sortedTemplates[0] ?? `/${entityFamily}/:${paramName}`,
        );
        return {
          entityFamily,
          routeTemplates: sortedTemplates,
          workflowCount: workflowIds.size,
          representativeTemplate: rep,
        };
      });

    groups.push({
      paramName,
      isMultiFamily: families.length > 1,
      families,
      totalWorkflowCount: paramWfs.length,
    });
  }

  return groups;
}

/** Extract the entity family from a route template for a given param.
 *  Entity family = the path segment immediately before `:paramName`.
 *  E.g. "/owners/:id" → "owners", "/projects/:projectId" → "projects".
 */
function extractEntityFamily(routeTemplate: string, paramName: string): string {
  const segments = routeTemplate.split('/').filter((s) => s.length > 0);
  const colonParam = `:${paramName}`;
  const paramIdx = segments.indexOf(colonParam);
  if (paramIdx <= 0) return segments[0] ?? 'root';
  return segments[paramIdx - 1] ?? segments[0] ?? 'root';
}

// ---------------------------------------------------------------------------
// scaffoldManifest — pure skeleton builder (kept for programmatic use)
// ---------------------------------------------------------------------------

export function scaffoldManifest(
  a2: A2WorkflowSet,
  subjectName: string,
  baseUrl: string,
): SubjectManifest {
  const requiredGuards = new Set<string>();
  const requiredParams = new Set<string>();
  for (const wf of a2.workflows) {
    for (const g of wf.cw.guards) requiredGuards.add(g);
    for (const p of wf.cw.requiredParams) requiredParams.add(p);
  }
  const authGuards = [...requiredGuards].filter((g) => !g.toLowerCase().includes('noauth')).sort();
  const noAuthGuards = [...requiredGuards].filter((g) => g.toLowerCase().includes('noauth')).sort();
  const accounts: SubjectManifest['accounts'] = [
    ...authGuards.map((g) => ({ username: '', password: '', roles: [] as string[], guardSatisfies: [g] })),
    ...noAuthGuards.map((g) => ({ username: '', password: '', roles: [] as string[], guardSatisfies: [g] })),
  ];
  const routeParamValues: Record<string, string> = {};
  for (const p of [...requiredParams].sort()) routeParamValues[p] = '';
  const manifest: SubjectManifest = { subjectName, baseUrl, accounts, routeParamValues };
  if (authGuards.length > 0) {
    manifest.authSetup = { loginRoute: '/login', usernameField: '', passwordField: '', submitButton: '', authSuccessSelector: '' };
  }
  return manifest;
}

// ---------------------------------------------------------------------------
// wizardStats
// ---------------------------------------------------------------------------

export interface WizardStats {
  guardCount: number;
  paramCount: number;
  accountsScaffolded: number;
  authSetupRequired: boolean;
}

export function wizardStats(manifest: SubjectManifest): WizardStats {
  return {
    guardCount: manifest.accounts.reduce((n, a) => n + a.guardSatisfies.length, 0),
    paramCount: Object.keys(manifest.routeParamValues).length,
    accountsScaffolded: manifest.accounts.length,
    authSetupRequired: manifest.authSetup !== undefined,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dedup<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}
