/**
 * plan-deriver.ts
 * Derives ActionPlans from RealizationIntents + SubjectManifest + A1 multigraph.
 *
 * Pure derivation — deterministic, no LLM, no side effects.
 *
 * Phase isolation: imports only from src/models/, src/workflows/graph-index.ts,
 * src/phase-b/b0/manifest-schema.ts, and src/phase-b/b1/ types.
 */

import type {
  A1Multigraph,
  ComponentNode,
  Edge,
  ExternalNode,
  RouteNode,
  WidgetNode,
} from '../../models/multigraph.js';
import { buildGraphIndex, computeInputRef } from '../../workflows/graph-index.js';
import type { GraphIndex } from '../../workflows/graph-index.js';
import type { SubjectManifest, ManifestAccount } from '../b0/manifest-schema.js';
import type { B1IntentSet, RealizationIntent, IntentFormField, IntentStartRoute } from './intent-types.js';
import type {
  ActionPlan,
  ActionStep,
  Assignment,
  AssignmentAccount,
  B1PlanSet,
  PostCondition,
  PreCondition,
  ScopedLocator,
} from './plan-types.js';

// ---------------------------------------------------------------------------
// Assignment resolution
// ---------------------------------------------------------------------------

/**
 * Select the first manifest account that satisfies all required auth guards.
 * NoAuth-style guards (case-insensitive "noauth") are excluded from matching
 * since they require unauthenticated access, not credentials.
 */
function selectAccount(
  guardNames: string[],
  accounts: ManifestAccount[],
): AssignmentAccount | undefined {
  const authGuards = guardNames.filter(g => !g.toLowerCase().includes('noauth'));
  if (authGuards.length === 0) return undefined;

  for (const acct of accounts) {
    const satisfies = new Set(acct.guardSatisfies);
    if (authGuards.every(g => satisfies.has(g))) {
      return { username: acct.username, password: acct.password, roles: [...acct.roles] };
    }
  }
  return undefined;
}

/**
 * Bind route parameters from the manifest.
 *
 * Lookup order (most-specific first):
 * 1. routeParamOverrides[terminalRoutePath][paramName]  — terminal route template override
 * 2. routeParamOverrides[startRoutePath][paramName]     — start route template override
 * 3. routeParamValues[paramName]                        — global fallback
 * 4. "<paramName>" placeholder                          — manifest has no binding
 *
 * routeParamOverrides lets subjects distinguish semantically different entity types
 * that happen to share the same `:paramName` (e.g. `/owners/:id` vs `/pets/:id`).
 */
function bindRouteParams(
  requiredParams: string[],
  manifest: SubjectManifest,
  startRoutePath?: string,
  terminalRoutePath?: string,
): Record<string, string> {
  const params: Record<string, string> = {};
  const overrides = manifest.routeParamOverrides;
  for (const p of requiredParams) {
    const termOverride = terminalRoutePath ? overrides?.[terminalRoutePath]?.[p] : undefined;
    const startOverride = startRoutePath ? overrides?.[startRoutePath]?.[p] : undefined;
    params[p] = termOverride ?? startOverride ?? manifest.routeParamValues[p] ?? `<${p}>`;
  }
  return params;
}

// ---------------------------------------------------------------------------
// Deterministic constraint-aware value synthesis
// ---------------------------------------------------------------------------
//
// Precedence order (first match wins):
//   1. (manifest override — handled in buildFormData, not here)
//   2. Non-editable exclusion signals (hidden/readonly/cssVisibility)
//      — these fields are excluded in deriveFormSchema, never reach here.
//   3. Semantic widget/type evidence (inputType, widgetKind, tagName)
//   4. Extracted option/value evidence (firstOptionValue for select/radio)
//   5. Date-format evidence (dateFormat from Angular date pipe)
//   6. Literal constraints (pattern, minLength/maxLength, min/max)
//   7. Bounded semantic-name heuristic (field name contains date/phone/zip/city/etc.)
//   8. Deterministic fallback (test-{key})
//
// No randomness. No faker. No LLM. No open-ended heuristics.
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic default value for a form field by examining
 * the full extracted constraint surface.
 */
function defaultFormValue(field: IntentFormField): string {
  const key = field.formControlName ?? field.nameAttr ?? field.idAttr ?? field.fieldNodeId;
  const t = field.inputType?.toLowerCase();

  // ── P3: Semantic widget/type evidence ──────────────────────────────
  // InputType is the strongest signal — browsers enforce type-specific formats.

  if (t === 'email') return 'test@example.com';
  if (t === 'password') return 'Test123!';
  if (t === 'number') return _synthNumber(field);
  if (t === 'tel') return '1234567890';
  if (t === 'url') return 'https://example.com';
  if (t === 'color') return '#000000';
  if (t === 'date') return '2024-01-01';
  if (t === 'time') return '12:00';
  if (t === 'month') return '2024-01';
  if (t === 'week') return '2024-W01';
  if (t === 'datetime-local') return '2024-01-01T12:00';
  if (t === 'file') return '/tmp/test-file.txt';

  // WidgetKind-based (Checkbox, Radio, RadioGroup)
  if (field.widgetKind === 'Checkbox') return 'true';
  if (field.widgetKind === 'RadioGroup' || field.widgetKind === 'Radio') return 'selected';

  // ── P4: Extracted option/value evidence ────────────────────────────
  // For select/mat-select: prefer actual option values extracted from A1.
  if (field.tagName === 'select' || field.tagName === 'mat-select') {
    if (field.firstOptionValue !== undefined) return field.firstOptionValue;
    return 'option-1';
  }

  if (field.tagName === 'textarea') return `test-${key}`;

  // ── P5: Date-format evidence (Angular date pipe) ───────────────────
  // Detected from ngModelText containing "| date:'format'" — stronger than name heuristic.
  if (field.dateFormat !== undefined) return '2024-01-01';

  // ── P6: Literal constraints ────────────────────────────────────────
  // Pattern → generate compliant value for known pattern families.
  if (field.pattern !== undefined) {
    const patternValue = _synthFromPattern(field);
    if (patternValue !== undefined) return patternValue;
  }

  // minLength/maxLength — pad or truncate the base value.
  if (field.minLength !== undefined && field.minLength > 0) {
    const base = `test-${key}`;
    if (base.length < field.minLength) return base.padEnd(field.minLength, 'x');
    return field.maxLength !== undefined ? base.slice(0, field.maxLength) : base;
  }
  if (field.maxLength !== undefined) {
    const base = `test-${key}`;
    return base.slice(0, field.maxLength);
  }

  // ── P7: Bounded semantic-name heuristic ────────────────────────────
  // Only fires when no stronger evidence exists above.
  const nameHint = _synthFromNameHeuristic(key);
  if (nameHint !== undefined) return nameHint;

  // ── P8: Deterministic fallback ─────────────────────────────────────
  return `test-${key}`;
}

/** Synthesize a number respecting min/max constraints. */
function _synthNumber(field: IntentFormField): string {
  if (field.min !== undefined && field.max !== undefined) {
    // Use min (safe, within range)
    return String(field.min);
  }
  if (field.min !== undefined) return String(field.min);
  if (field.max !== undefined) return String(Math.min(1, field.max));
  return '1';
}

/**
 * Synthesize a value that matches common pattern families.
 * Returns undefined if the pattern is not recognized.
 */
function _synthFromPattern(field: IntentFormField): string | undefined {
  const p = field.pattern!;
  const len = field.maxLength ?? field.minLength ?? 10;
  const safeLen = Math.min(len, 20);

  // Digits-only patterns: ^[0-9]*$, ^\d+$, ^[0-9]{n}$, etc.
  if (/^\^?\[?0-9\]?[*+]?\$?$|^\^?\\d[*+]?\$?$/.test(p) ||
      /^\^?\[0-9\]\{/.test(p) || /^\^?\\d\{/.test(p)) {
    return '1'.repeat(safeLen);
  }

  // Alpha-only patterns: ^[a-zA-Z]+$, ^[A-Za-z\s]+$
  if (/^\^?\[a-zA-Z\\s?\][*+]?\$?$/.test(p) || /^\^?\[A-Za-z/.test(p)) {
    return 'Test'.padEnd(safeLen, 'x').slice(0, safeLen);
  }

  // Alphanumeric patterns: ^[a-zA-Z0-9]+$
  if (/^\^?\[a-zA-Z0-9\][*+]?\$?$/.test(p)) {
    return 'Test1'.padEnd(safeLen, '0').slice(0, safeLen);
  }

  // Phone patterns: ^\+?[0-9\-\s()]+$, ^\d{10}$
  if (/phone|tel/i.test(p) || /^\^?\+?\[?0-9\\-\\s()\]/.test(p)) {
    return '1234567890'.slice(0, safeLen);
  }

  // Email patterns
  if (/email|@/i.test(p)) return 'test@example.com';

  // URL patterns
  if (/^https?|url/i.test(p)) return 'https://example.com';

  return undefined;
}

/**
 * Semantic name hints — last resort before generic fallback.
 * Limited to well-known field name patterns with deterministic values.
 */
function _synthFromNameHeuristic(key: string): string | undefined {
  const k = key.toLowerCase();

  // Date-like names: intentionally NOT handled here.
  // Date values should only come from P3 (inputType=date) or P5 (dateFormat from date pipe).
  // Name-based date heuristics produce garbled input on Angular Material datepickers
  // (which render as type="text", not type="date") and cause form submission failures.
  // Phone/fax
  if (k.includes('phone') || k.includes('fax') || k.includes('mobile') || k.includes('telephone')) {
    return '1234567890';
  }
  // Postal/zip
  if (k.includes('zip') || k.includes('postal') || k.includes('postcode')) {
    return '12345';
  }
  // City
  if (k === 'city' || k.includes('city')) return 'TestCity';
  // Address
  if (k.includes('address') || k.includes('street')) return '123 Test St';
  // Country/state
  if (k === 'country') return 'US';
  if (k === 'state') return 'CA';

  return undefined;
}

/**
 * Build form data for a WSF workflow.
 * Uses formDataOverrides from manifest when present; otherwise generates defaults.
 */
function buildFormData(
  workflowId: string,
  formSchema: IntentFormField[] | undefined,
  manifest: SubjectManifest,
  startRoutePath?: string,
): Record<string, string> {
  if (formSchema === undefined || formSchema.length === 0) return {};

  const overrides = manifest.formDataOverrides?.[workflowId];
  const data: Record<string, string> = {};

  // B1-G2: Login-form credential materialization.
  // When the workflow IS the login form (start route = authSetup.loginRoute),
  // use manifest account credentials for matching fields instead of defaults.
  let loginCredentials: Record<string, string> | undefined;
  if (manifest.authSetup !== undefined &&
      startRoutePath === manifest.authSetup.loginRoute &&
      manifest.accounts !== undefined && manifest.accounts.length > 0) {
    const account = manifest.accounts[0]!;
    const userFCN = manifest.authSetup.usernameField.match(/formcontrolname='([^']+)'/)?.[1];
    const passFCN = manifest.authSetup.passwordField.match(/formcontrolname='([^']+)'/)?.[1];
    loginCredentials = {};
    if (userFCN !== undefined) loginCredentials[userFCN] = account.username;
    if (passFCN !== undefined) loginCredentials[passFCN] = account.password;
  }

  for (const field of formSchema) {
    const key = field.formControlName ?? field.nameAttr ?? field.idAttr ?? field.fieldNodeId;
    if (overrides !== undefined && overrides[key] !== undefined) {
      data[key] = overrides[key];
    } else if (loginCredentials !== undefined && field.formControlName !== undefined &&
               loginCredentials[field.formControlName] !== undefined) {
      data[key] = loginCredentials[field.formControlName]!;
    } else {
      data[key] = defaultFormValue(field);
    }
  }

  return data;
}

function resolveAssignment(
  intent: RealizationIntent,
  manifest: SubjectManifest,
  startRouteGuards: string[],
  startRoute: IntentStartRoute | undefined,
): Assignment {
  // Use the selected startRoute's guards for account selection.
  const account = selectAccount(startRouteGuards, manifest.accounts);
  const requiredParams = startRoute?.requiredParams ?? [];

  // Also bind params needed by terminalRoutePath (may differ from startRoute)
  const terminalParams = intent.terminalRoutePath !== undefined
    ? extractParamNames(intent.terminalRoutePath)
    : [];
  const allParams = [...new Set([...requiredParams, ...terminalParams])].sort();

  const routeParams = bindRouteParams(allParams, manifest, startRoute?.fullPath, intent.terminalRoutePath);
  const formData = buildFormData(intent.workflowId, intent.formSchema, manifest, startRoute?.fullPath);

  return {
    ...(account !== undefined ? { account } : {}),
    routeParams,
    formData,
  };
}

// ---------------------------------------------------------------------------
// Route path resolution
// ---------------------------------------------------------------------------

/**
 * Select the preferred start route from the intent's startRoutes.
 * Deterministic selection per spec (approach.md §B1 Start Route Selection):
 *   1. Exclude wildcard routes (fullPath contains **)
 *   2. Prefer unguarded routes (no auth guards)
 *   3. Fewest required params
 *   4. Shortest fullPath
 *   5. Alphabetical by fullPath
 */
function selectStartRoute(
  startRoutes: IntentStartRoute[],
  index: GraphIndex,
  requiresAuth: boolean,
  triggerComponentId?: string,
): IntentStartRoute | undefined {
  if (startRoutes.length === 0) return undefined;

  // Step 0: prefer routes that activate the trigger's component (if known).
  // This prevents selecting a list-page route when the trigger is on an add-page route.
  if (triggerComponentId !== undefined) {
    const activatingRoutes = startRoutes.filter(r => {
      const routeEdges = index.edgesByFrom.get(r.routeId) ?? [];
      return routeEdges.some(e => e.kind === 'ROUTE_ACTIVATES_COMPONENT' && e.to === triggerComponentId);
    });
    if (activatingRoutes.length > 0) {
      startRoutes = activatingRoutes;
    }
  }

  // Step 1: exclude wildcards
  let candidates = startRoutes.filter(r => !r.fullPath.includes('**'));
  if (candidates.length === 0) candidates = [...startRoutes];

  // Classify each candidate's guard status
  const classified = candidates.map(r => {
    const node = index.nodeMap.get(r.routeId);
    const guards = node?.kind === 'Route'
      ? (node as RouteNode).meta.guards
      : [];
    const authGuards = guards.filter(g => !g.toLowerCase().includes('noauth'));
    return { route: r, guarded: authGuards.length > 0 };
  });

  // B1-G1: When the workflow requires auth guards, prefer guarded routes.
  // Shared components (nav bars) render auth-conditional content only on guarded routes.
  // When the workflow does NOT require auth, prefer unguarded routes (simpler execution).
  classified.sort((a, b) => {
    if (a.guarded !== b.guarded) {
      return requiresAuth
        ? (a.guarded ? -1 : 1)    // guarded first when auth required
        : (a.guarded ? 1 : -1);   // unguarded first when no auth
    }
    const pa = a.route.requiredParams.length;
    const pb = b.route.requiredParams.length;
    if (pa !== pb) return pa - pb;
    if (a.route.fullPath.length !== b.route.fullPath.length) {
      return a.route.fullPath.length - b.route.fullPath.length;
    }
    return a.route.fullPath.localeCompare(b.route.fullPath);
  });

  return classified[0]!.route;
}

/**
 * Extract :param names from a route path.
 */
function extractParamNames(routePath: string): string[] {
  const params: string[] = [];
  const re = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(routePath)) !== null) {
    params.push(m[1]!);
  }
  return params;
}

/**
 * Detect whether an attribute value is likely a binding expression (e.g., "label", "item.name")
 * rather than a literal string. Single identifiers and dot-access expressions are binding candidates.
 */
function _isBindingExpression(value: string): boolean {
  return /^[a-zA-Z_$][a-zA-Z0-9_$.]*$/.test(value.trim());
}

/**
 * Generic CSS class set — styling/layout utility classes that do not identify
 * a specific element. When ALL classes on a widget are generic, the class
 * selector cannot disambiguate siblings → fall through to tag-position.
 *
 * Matches exact tokens and prefix patterns (e.g., 'col-*').
 */
const GENERIC_CSS_CLASSES = new Set([
  // Bootstrap button
  'btn', 'btn-default', 'btn-primary', 'btn-secondary', 'btn-success',
  'btn-danger', 'btn-warning', 'btn-info', 'btn-link', 'btn-outline-primary',
  'btn-outline-secondary', 'btn-outline-success', 'btn-outline-danger',
  'btn-outline-warning', 'btn-outline-info', 'btn-sm', 'btn-lg', 'btn-block',
  // Bootstrap form
  'form-control', 'form-group', 'form-horizontal', 'form-inline', 'form-check',
  'form-check-input', 'form-check-label', 'form-label', 'form-select',
  'form-text', 'form-floating', 'input-group',
  // Bootstrap grid/layout
  'row', 'container', 'container-fluid', 'container-sm', 'container-md',
  'container-lg', 'container-xl',
  // Bootstrap card
  'card', 'card-body', 'card-header', 'card-footer', 'card-title', 'card-text',
  // Bootstrap panel (v3)
  'panel', 'panel-body', 'panel-heading', 'panel-default',
  // Bootstrap table
  'table', 'table-responsive', 'table-striped', 'table-bordered', 'table-hover',
  // Bootstrap nav
  'nav', 'nav-item', 'nav-link', 'navbar', 'navbar-nav',
  // Bootstrap alert/badge
  'alert', 'badge',
  // Bootstrap spacing/display utilities
  'clearfix', 'float-left', 'float-right', 'text-center', 'text-left', 'text-right',
  'd-none', 'd-block', 'd-flex', 'd-inline', 'd-inline-block', 'd-inline-flex',
  // Bootstrap close / dropdown / misc interactive
  'close', 'dropdown-item', 'dropdown-toggle', 'dropdown-menu',
  'custom-select', 'form-control-sm', 'form-check-input',
  // Bootstrap button variants
  'btn-dark', 'btn-light', 'btn-outline-dark', 'btn-outline-light',
  // Bootstrap text/color utilities
  'text-dark', 'text-muted', 'text-light', 'text-white', 'text-sm',
  'bg-transparent', 'bg-light', 'bg-dark', 'bg-white', 'bg-primary', 'bg-secondary',
  // Bootstrap border utilities
  'border', 'border-top', 'border-bottom', 'border-left', 'border-right',
  'rounded', 'rounded-0',
  // Bootstrap flex utilities
  'flex-row', 'flex-column', 'flex-1',
  'align-self-center', 'align-self-start', 'align-self-end',
  'justify-content-between', 'justify-content-center', 'justify-content-start', 'justify-content-end',
  // Bootstrap misc
  'no-underline', 'is-editing', 'readonly', 'modal-title', 'modal-header', 'modal-body', 'modal-footer',
  'section-title-row', 'font-serif', 'edit-controls', 'input-group',
  // Material
  'mat-raised-button', 'mat-button', 'mat-icon-button', 'mat-flat-button',
  'mat-stroked-button', 'mat-fab', 'mat-mini-fab',
  'mat-form-field', 'mat-input-element',
  // Generic structural
  'active', 'disabled', 'hidden', 'show', 'fade', 'collapse',
  'list-group', 'list-group-item',
]);

const GENERIC_CSS_PREFIXES = ['col-', 'offset-', 'order-', 'p-', 'px-', 'py-', 'pt-', 'pb-', 'pl-', 'pr-',
  'm-', 'mx-', 'my-', 'mt-', 'mb-', 'ml-', 'mr-', 'g-', 'gx-', 'gy-',
  'w-', 'h-', 'align-', 'justify-', 'bg-', 'text-', 'rounded-', 'border-',
  'd-sm-', 'd-md-', 'd-lg-', 'd-xl-', 'font-', 'btn-outline-'];

function _isGenericCssClass(cls: string): boolean {
  if (GENERIC_CSS_CLASSES.has(cls)) return true;
  return GENERIC_CSS_PREFIXES.some(prefix => cls.startsWith(prefix));
}

function _allClassesGeneric(classAttr: string): boolean {
  const tokens = classAttr.split(/\s+/).filter(c => c !== '');
  if (tokens.length === 0) return true;
  return tokens.every(_isGenericCssClass);
}

/**
 * Build a tag-position locator value from a widget's nodeId stableIndex.
 */
function _tagPositionFromNodeId(nodeId: string, tagName?: string): string {
  const idParts = nodeId.split('|');
  const lastPart = idParts[idParts.length - 1] ?? '';
  const stableIndex = parseInt(lastPart, 10);
  const tag = tagName ?? 'element';
  return Number.isFinite(stableIndex) ? `${tag}:${stableIndex + 1}` : tag;
}

/**
 * Substitute :param placeholders with concrete values.
 */
function substituteParams(
  fullPath: string,
  routeParams: Record<string, string>,
): string {
  let result = fullPath;
  for (const [key, value] of Object.entries(routeParams)) {
    result = result.replace(`:${key}`, value);
  }
  return result;
}

// ---------------------------------------------------------------------------
// ScopedLocator derivation
// ---------------------------------------------------------------------------

/**
 * Resolve a ScopedLocator for a trigger widget from A1 metadata.
 *
 * Deterministic priority chain (strict order):
 *   a. data-testid
 *   b. id
 *   c. formControlName
 *   d. name
 *   e. aria-label
 *   f. placeholder
 *   g. routerLink / href (navigation elements only)
 *   h. tag + discriminating attribute (e.g., button[type="submit"])
 *   i. scoped CSS class (non-generic only)
 *   j. tag-position (nth-of-type) — LAST fallback
 */
export function resolveWidgetLocator(
  intent: RealizationIntent,
): ScopedLocator {
  const w = intent.triggerWidget;
  const attrs = w.attributes;

  let strategy: ScopedLocator['strategy'];
  let value: string;
  let _locatorDebug: string; // debug: why this strategy was chosen

  // (a) data-testid
  if (attrs['data-testid'] !== undefined && attrs['data-testid'] !== '') {
    strategy = 'data-testid';
    value = attrs['data-testid'];
    _locatorDebug = 'primary: data-testid attr present';
  // (b) id
  } else if (attrs['id'] !== undefined && attrs['id'] !== '') {
    strategy = 'id';
    value = attrs['id'];
    _locatorDebug = 'primary: id attr present';
  // (c) formControlName
  } else if (w.formControlName !== undefined && w.formControlName !== '') {
    strategy = 'formcontrolname';
    value = w.formControlName;
    _locatorDebug = 'primary: formControlName present';
  // (d) name
  } else if (attrs['name'] !== undefined && attrs['name'] !== '') {
    strategy = 'name';
    value = attrs['name'];
    _locatorDebug = 'primary: name attr present';
  // (e) aria-label (skip binding expressions)
  } else if (attrs['aria-label'] !== undefined && attrs['aria-label'] !== '' &&
             !_isBindingExpression(attrs['aria-label'])) {
    strategy = 'aria-label';
    value = attrs['aria-label'];
    _locatorDebug = 'primary: aria-label attr present';
  // (f) placeholder
  } else if (attrs['placeholder'] !== undefined && attrs['placeholder'] !== '') {
    strategy = 'placeholder';
    value = attrs['placeholder'];
    _locatorDebug = 'primary: placeholder attr present';
  // (g) routerLink / href — navigation elements only
  } else if (w.routerLinkText !== undefined && w.routerLinkText !== '' && w.tagName === 'a' &&
      !w.routerLinkText.includes('{{') && !_isBindingExpression(w.routerLinkText.replace(/^['"]|['"]$/g, ''))) {
    strategy = 'routerlink';
    value = w.routerLinkText.replace(/^['"]|['"]$/g, '');
    _locatorDebug = 'primary: routerLink on <a>';
  } else if (attrs['href'] !== undefined && attrs['href'] !== '') {
    strategy = 'href';
    value = attrs['href'];
    _locatorDebug = 'primary: href attr present';
  // (h) tag + discriminating attribute (type, role)
  } else if (_tagAttributeLocator(w.tagName, attrs) !== undefined) {
    strategy = 'custom';
    value = _tagAttributeLocator(w.tagName, attrs)!;
    _locatorDebug = 'fallback: tag+attribute combination';
  // (i) scoped CSS class (non-generic only)
  } else if (attrs['class'] !== undefined && attrs['class'] !== '' && !_allClassesGeneric(attrs['class'])) {
    strategy = 'custom';
    value = attrs['class'].split(/\s+/).map(c => `.${c}`).join('');
    _locatorDebug = 'fallback: semantic CSS class';
  // (j) tag-position — LAST fallback
  } else {
    strategy = 'tag-position';
    value = _tagPositionFromNodeId(w.nodeId, w.tagName);
    _locatorDebug = 'fallback: tag-position (no semantic selector available)';
  }

  // Debug: log locator strategy selection
  if (process.env['B1_LOCATOR_DEBUG'] === '1') {
    const widgetDesc = `${w.tagName ?? 'element'}[${w.nodeId.split('|').slice(-2).join('|')}]`;
    console.error(`[B1-locator] ${widgetDesc}: strategy=${strategy} value=${value} (${_locatorDebug})`);
  }

  const locator: ScopedLocator = {
    strategy,
    value,
    ...(w.componentSelector !== undefined ? { componentSelector: w.componentSelector } : {}),
    ...(w.tagName !== undefined ? { tagName: w.tagName } : {}),
  };

  if (w.containingFormId !== undefined) {
    locator.formSelector = 'form';
  }

  return locator;
}

/**
 * Generate a tag+attribute CSS selector for discriminating elements.
 * Returns undefined if no discriminating attribute is available.
 * Used as priority (h) — above CSS class, below semantic attributes.
 */
function _tagAttributeLocator(
  tagName: string | undefined,
  attrs: Record<string, string>,
): string | undefined {
  if (tagName === undefined) return undefined;
  // type attribute on button/input — discriminates submit/reset/button/text/etc.
  const typeAttr = attrs['type'];
  if (typeAttr !== undefined && typeAttr !== '') {
    return `${tagName}[type="${typeAttr}"]`;
  }
  // role attribute
  const roleAttr = attrs['role'];
  if (roleAttr !== undefined && roleAttr !== '') {
    return `${tagName}[role="${roleAttr}"]`;
  }
  return undefined;
}

/**
 * Resolve a ScopedLocator for a form field widget.
 */
export function resolveFieldLocator(
  field: IntentFormField,
  componentSelector?: string,
): ScopedLocator {
  let strategy: ScopedLocator['strategy'];
  let value: string;

  if (field.formControlName !== undefined && field.formControlName !== '') {
    strategy = 'formcontrolname';
    value = field.formControlName;
  } else if (field.nameAttr !== undefined && field.nameAttr !== '') {
    strategy = 'name';
    value = field.nameAttr;
  } else if (field.idAttr !== undefined && field.idAttr !== '') {
    strategy = 'id';
    value = field.idAttr;
  } else {
    strategy = 'tag-position';
    value = field.tagName ?? 'input';
  }

  return {
    strategy,
    value,
    ...(componentSelector !== undefined ? { componentSelector } : {}),
    ...(field.tagName !== undefined ? { tagName: field.tagName } : {}),
    formSelector: 'form',
  };
}

// ---------------------------------------------------------------------------
// Dialog detection
// ---------------------------------------------------------------------------

/**
 * Detect if a trigger widget's owning component is a dialog/modal rendered inline.
 * A component is a dialog candidate if:
 *   1. It has an inbound COMPONENT_COMPOSES_COMPONENT edge (CCC)
 *   2. Its selector contains "dialog" or "modal" (case-insensitive)
 *
 * Only dialog/modal-named components are detected. Non-dialog inline components
 * (e.g., inline add forms) are NOT detected — the CCS→CCC chain approach produces
 * false positives (clicking Delete instead of Add, screenshot-proven).
 *
 * Returns undefined when:
 *   - No CCC composition relationship exists
 *   - Selector does not match dialog/modal naming
 *   - Multiple plausible openers exist (ambiguous)
 */
function detectInlineComponentOpener(
  intent: RealizationIntent,
  index: GraphIndex,
  _selectedStartRoute: IntentStartRoute | undefined,
): { openerSelector: string; dialogSelector: string } | undefined {
  const triggerCompSelector = intent.triggerWidget.componentSelector;
  if (triggerCompSelector === undefined) return undefined;

  // Only detect dialog/modal-named components.
  if (!/dialog|modal/i.test(triggerCompSelector)) return undefined;

  const triggerCompId = findComponentIdBySelector(triggerCompSelector, index);
  if (triggerCompId === undefined) return undefined;

  // Composition-aware refusal: if the dialog component is composed inside a
  // deferred/repeated context (ng-template, *ngFor), it may not be in the DOM.
  // Refuse the opener to prevent false COMP_NOT_IN_DOM failures.
  const cccEdgesToComp = [...index.edgesByFrom.values()]
    .flat()
    .filter(e => e.kind === 'COMPONENT_COMPOSES_COMPONENT' && e.to === triggerCompId);
  const isComposedDeferred = cccEdgesToComp.some(e =>
    e.compositionContext?.insideNgTemplate === true ||
    e.compositionContext?.insideNgFor !== undefined);
  if (isComposedDeferred) return undefined;

  // Find CCC edges where triggerCompId is the target → opener is the source.
  for (const [sourceId, edges] of index.edgesByFrom) {
    for (const edge of edges) {
      if (edge.kind === 'COMPONENT_COMPOSES_COMPONENT' && edge.to === triggerCompId) {
        const sourceNode = index.nodeMap.get(sourceId);
        if (sourceNode?.kind === 'Component') {
          const sel = (sourceNode as ComponentNode).meta.selector;
          if (sel !== undefined) {
            return { openerSelector: sel, dialogSelector: triggerCompSelector };
          }
        }
      }
    }
  }

  return undefined;
}

function findComponentIdBySelector(
  selector: string,
  index: GraphIndex,
): string | undefined {
  for (const [id, node] of index.nodeMap) {
    if (node.kind === 'Component' && (node as ComponentNode).meta.selector === selector) {
      return id;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// PreCondition generation
// ---------------------------------------------------------------------------

function resolvePreConditions(
  intent: RealizationIntent,
  assignment: Assignment,
  manifest: SubjectManifest,
  index: GraphIndex,
  startRoute: IntentStartRoute | undefined,
): PreCondition[] {
  const pcs: PreCondition[] = [];

  // 1. auth-setup (if guarded workflow with account)
  if (assignment.account !== undefined && manifest.authSetup !== undefined) {
    pcs.push({
      type: 'auth-setup',
      config: {
        loginRoute: manifest.authSetup.loginRoute,
        username: assignment.account.username,
        password: assignment.account.password,
        usernameField: manifest.authSetup.usernameField,
        passwordField: manifest.authSetup.passwordField,
        submitButton: manifest.authSetup.submitButton,
        ...(manifest.authSetup.authSuccessSelector !== undefined
          ? { authSuccessSelector: manifest.authSetup.authSuccessSelector }
          : {}),
      },
    });
  }

  // 2. navigate-to-route (always — use selected startRoute)
  if (startRoute !== undefined) {
    const url = substituteParams(startRoute.fullPath, assignment.routeParams);
    pcs.push({
      type: 'navigate-to-route',
      config: { url },
    });
  }

  // 3. trigger-dialog-open (if dialog/modal component detected)
  const dialog = detectInlineComponentOpener(intent, index, startRoute);
  if (dialog !== undefined) {
    // B1-G3: Ensure the navigate route has the opener component rendered.
    const openerCompId = findComponentIdBySelector(dialog.openerSelector, index);
    if (openerCompId !== undefined) {
      for (const [nodeId, node] of index.nodeMap) {
        if (node.kind !== 'Route') continue;
        const routeEdges = index.edgesByFrom.get(nodeId) ?? [];
        const activates = routeEdges.some(e =>
          e.kind === 'ROUTE_ACTIVATES_COMPONENT' && e.to === openerCompId);
        if (activates) {
          const routeNode = node as RouteNode;
          const routeUrl = substituteParams(routeNode.meta.fullPath, assignment.routeParams);
          const navPc = pcs.find(pc => pc.type === 'navigate-to-route');
          if (navPc !== undefined) {
            navPc.config['url'] = routeUrl;
          }
          break;
        }
      }
    }

    // F4: Derive the specific opener widget action via CCS→CCC chain.
    let openerWidgetSelector: string | undefined;
    if (openerCompId !== undefined) {
      const dialogCompId = findComponentIdBySelector(dialog.dialogSelector, index);
      if (dialogCompId !== undefined) {
        const openerCCSEdges = index.edgesByFrom.get(openerCompId) ?? [];
        const hasCCC = openerCCSEdges.some(e =>
          e.kind === 'COMPONENT_COMPOSES_COMPONENT' && e.to === dialogCompId);
        if (hasCCC) {
          const ccsEGIds = new Set<string>();
          for (const e of openerCCSEdges) {
            if (e.kind === 'COMPONENT_CALLS_SERVICE') {
              const egId = (e as Edge & { effectGroupId?: string }).effectGroupId;
              if (egId !== undefined) ccsEGIds.add(egId);
            }
          }
          const cnrEGIds = new Set<string>();
          for (const e of openerCCSEdges) {
            if (e.kind === 'COMPONENT_NAVIGATES_ROUTE') {
              const egId = (e as Edge & { effectGroupId?: string }).effectGroupId;
              if (egId !== undefined) cnrEGIds.add(egId);
            }
          }
          for (const [, edges] of index.edgesByFrom) {
            for (const e of edges) {
              if (e.kind !== 'WIDGET_TRIGGERS_HANDLER') continue;
              if (e.to !== openerCompId) continue;
              const egId = (e as Edge & { effectGroupId?: string }).effectGroupId;
              if (egId === undefined || !ccsEGIds.has(egId)) continue;
              if (cnrEGIds.has(egId)) continue;
              const widgetNode = index.nodeMap.get(e.from);
              if (widgetNode?.kind === 'Widget') {
                const wn = widgetNode as WidgetNode;
                const attrs = wn.meta.attributes ?? {};
                if (attrs['data-testid'] !== undefined && attrs['data-testid'] !== '') {
                  openerWidgetSelector = `[data-testid="${attrs['data-testid']}"]`;
                  break;
                } else if (attrs['id'] !== undefined && attrs['id'] !== '') {
                  openerWidgetSelector = `#${attrs['id']}`;
                  break;
                } else if (attrs['class'] !== undefined && attrs['class'] !== '' && !_allClassesGeneric(attrs['class'])) {
                  openerWidgetSelector = attrs['class'].split(/\s+/).map(c => `.${c}`).join('');
                  break;
                } else {
                  openerWidgetSelector = _tagPositionFromNodeId(wn.id, wn.meta.tagName);
                  break;
                }
              }
            }
            if (openerWidgetSelector !== undefined) break;
          }
        }
      }
    }

    pcs.push({
      type: 'trigger-dialog-open',
      config: {
        openerSelector: dialog.openerSelector,
        dialogSelector: dialog.dialogSelector,
        ...(openerWidgetSelector !== undefined ? { openerWidgetSelector } : {}),
      },
    });
  }

  // 4. Same-component modal opener (template-backed trigger widget).
  // When the trigger widget is inside an ng-template (modal), there must be a
  // non-template button in the SAME component that opens the modal.
  // Applies to both WSF (form inside modal) and WTH (button inside modal).
  //
  // Composition-aware refusal: if the component is composed by a parent inside
  // a structural directive (ng-template, *ngIf, *ngFor), the component may not
  // be in the DOM. In that case, refuse the opener precondition to prevent
  // false COMP_NOT_IN_DOM failures.
  {
    const triggerNode = index.nodeMap.get(intent.triggerWidget.nodeId);
    if (triggerNode?.kind === 'Widget' && (triggerNode as WidgetNode).meta.isTemplateContent === true) {
      const compSelector = intent.triggerWidget.componentSelector;
      if (compSelector !== undefined) {
        const compId = findComponentIdBySelector(compSelector, index);

        // Check if this component is composed inside a deferred/repeated context.
        // If any CCC edge pointing TO this component has compositionContext indicating
        // deferred rendering, refuse the opener (the component may not be in the DOM).
        const cccEdgesToComp = [...index.edgesByFrom.values()]
          .flat()
          .filter(e => e.kind === 'COMPONENT_COMPOSES_COMPONENT' && e.to === compId);
        const isComposedDeferred = cccEdgesToComp.some(e =>
          e.compositionContext?.insideNgTemplate === true ||
          e.compositionContext?.insideNgFor !== undefined);
        if (isComposedDeferred) {
          // Component is composed inside a parent's ng-template or *ngFor.
          // It may not be in the DOM — refuse opener precondition.
          // (The test will fail cleanly on the step, not with a false opener.)
        } else if (compId !== undefined) {
          // Find all non-template buttons in the same component with WTH edges
          const compWidgets = [...index.nodeMap.values()].filter(
            n => n.kind === 'Widget' && (n as WidgetNode).meta.componentId === compId
              && (n as WidgetNode).meta.isTemplateContent !== true
              && (n as WidgetNode).meta.widgetKind === 'Button',
          ) as WidgetNode[];
          // Among non-template buttons, find ones that have WTH edges (handlers)
          const openerCandidates = compWidgets.filter(w => {
            const edges = index.edgesByFrom.get(w.id) ?? [];
            return edges.some(e => e.kind === 'WIDGET_TRIGGERS_HANDLER');
          });
          if (openerCandidates.length === 1) {
            // Single non-template button with a handler — defensible opener.
            // Compute position among non-template siblings only (template-backed
            // buttons are in <ng-template> and not rendered in the DOM).
            const opener = openerCandidates[0]!;
            const nonTemplateButtons = compWidgets; // already filtered to non-template
            const openerIdx = nonTemplateButtons.indexOf(opener);
            const tag = opener.meta.tagName ?? 'button';
            const openerLocator = `${tag}:${openerIdx + 1}`;
            // ng-bootstrap modals render at <body> level as <ngb-modal-window>.
            pcs.push({
              type: 'trigger-dialog-open',
              config: {
                openerSelector: compSelector,
                dialogSelector: 'ngb-modal-window',
                openerWidgetSelector: openerLocator,
              },
            });
          }
        }
      }
    }
  }

  return pcs;
}

// ---------------------------------------------------------------------------
// ActionStep generation
// ---------------------------------------------------------------------------

function generateSteps(
  intent: RealizationIntent,
  assignment: Assignment,
  index: GraphIndex,
): ActionStep[] {
  const steps: ActionStep[] = [];
  const triggerLocator = resolveWidgetLocator(intent);

  // Visibility gate: prepend wait-for-element if trigger has visibility predicate
  const triggerNode = index.nodeMap.get(intent.triggerWidget.nodeId);
  if (triggerNode?.kind === 'Widget') {
    const ui = (triggerNode as WidgetNode).meta.ui;
    if (ui.visibleExprText !== undefined && ui.visibleExprText !== '') {
      steps.push({
        type: 'wait-for-element',
        locator: triggerLocator,
        description: `Wait for trigger to become visible (${ui.visibleExprText})`,
      });
    }
  }

  const triggerEdgeId = intent.effectSteps[0]?.edgeId ?? '';

  switch (intent.triggerKind) {
    case 'WIDGET_SUBMITS_FORM': {
      // Determine scope for form fields. If the form is template-backed (ng-bootstrap modal),
      // the modal renders at <body> level as <ngb-modal-window>, not inside the component.
      const isModalForm = triggerNode?.kind === 'Widget' &&
        (triggerNode as WidgetNode).meta.isTemplateContent === true;
      const fieldScope = isModalForm ? 'ngb-modal-window' : intent.triggerWidget.componentSelector;

      // Form field steps
      if (intent.formSchema !== undefined) {
        for (const field of intent.formSchema) {
          const fieldLocator = resolveFieldLocator(field, fieldScope);
          const key = field.formControlName ?? field.nameAttr ?? field.idAttr ?? field.fieldNodeId;
          const value = assignment.formData[key] ?? '';

          if (field.tagName === 'select' || field.tagName === 'mat-select') {
            steps.push({
              type: 'select-option',
              locator: fieldLocator,
              value,
              description: `Select "${value}" in ${field.tagName}[${key}]`,
            });
          } else if (field.widgetKind === 'RadioGroup') {
            // Click the first mat-radio-button using native DOM click (not JS executeScript).
            // Angular Material radio buttons require events to propagate through Zone.js
            // to update the parent mat-radio-group's form control.
            const radioLocator: ScopedLocator = {
              ...fieldLocator,
              strategy: 'custom',
              value: field.formControlName !== undefined
                ? `[formcontrolname='${field.formControlName}'] mat-radio-button`
                : `${field.tagName} mat-radio-button`,
            };
            steps.push({
              type: 'click',
              locator: radioLocator,
              description: `Native-click first radio option in ${field.tagName}[${key}]`,
            });
          } else if (field.widgetKind === 'Checkbox' || field.widgetKind === 'Radio') {
            steps.push({
              type: 'click',
              locator: fieldLocator,
              description: `Click ${field.tagName}[${key}]`,
            });
          } else if (field.inputType === 'file') {
            steps.push({
              type: 'type',
              locator: fieldLocator,
              value,
              description: `Set file path "${value}" on ${field.tagName}[${key}]`,
            });
          } else if (field.dateFormat !== undefined) {
            // Angular date-pipe fields (type="text" with ngModel date pipe) — use type (sendKeys only).
            steps.push({
              type: 'type',
              locator: fieldLocator,
              value,
              description: `Set date "${value}" on ${field.tagName}[${key}]`,
            });
          } else if (field.inputType === 'date' || field.inputType === 'datetime-local' ||
                     field.inputType === 'time' || field.inputType === 'month' || field.inputType === 'week') {
            // Native date/time inputs: use clear-and-type so Angular's reactive form
            // control receives the input event and updates. The B2 emitter detects
            // "date" in the description and reformats ISO dates for Chrome's segment input.
            steps.push({
              type: 'clear-and-type',
              locator: fieldLocator,
              value,
              description: `Type date "${value}" into ${field.tagName}[${key}]`,
            });
          } else {
            steps.push({
              type: 'clear-and-type',
              locator: fieldLocator,
              value,
              description: `Type "${value}" into ${field.tagName}[${key}]`,
            });
          }
        }
      }

      // Submit step — rescope to modal window if template-backed
      const submitLocator = isModalForm
        ? { ...triggerLocator, componentSelector: 'ngb-modal-window' }
        : triggerLocator;
      steps.push({
        type: 'submit',
        locator: submitLocator,
        edgeId: triggerEdgeId,
        description: `Submit form via ${intent.triggerWidget.tagName ?? 'form'}`,
      });
      break;
    }

    case 'WIDGET_TRIGGERS_HANDLER':
    case 'WIDGET_NAVIGATES_ROUTE':
    case 'WIDGET_NAVIGATES_EXTERNAL': {
      // Rescope template-backed triggers to the dialog container.
      // No template→DOM positional projection: the locator priority chain
      // (resolveWidgetLocator) already selected the best semantic locator.
      // If tag-position was selected as last fallback, it uses the
      // stableIndex from the nodeId — no per-region recomputation.
      const isTemplateTrigger = triggerNode?.kind === 'Widget' &&
        (triggerNode as WidgetNode).meta.isTemplateContent === true;
      const clickLocator = isTemplateTrigger
        ? { ...triggerLocator, componentSelector: 'ngb-modal-window' }
        : triggerLocator;
      steps.push({
        type: 'click',
        locator: clickLocator,
        edgeId: triggerEdgeId,
        description: `Click ${intent.triggerWidget.tagName ?? 'element'} (${intent.triggerKind})`,
      });
      break;
    }

    default:
      steps.push({
        type: 'click',
        locator: triggerLocator,
        edgeId: triggerEdgeId,
        description: `Trigger ${intent.triggerKind}`,
      });
  }

  return steps;
}

// ---------------------------------------------------------------------------
// PostCondition generation
// ---------------------------------------------------------------------------

function resolvePostConditions(
  intent: RealizationIntent,
  assignment: Assignment,
  index: GraphIndex,
  manifest: SubjectManifest,
  startRoutePath?: string,
): PostCondition[] {
  const pcs: PostCondition[] = [];

  // B1-G2b: Login-form WSF postcondition.
  // When the workflow IS the login form (start route = login route AND terminal = same route),
  // the real post-login destination is unresolvable via A2 (RouterService indirection).
  // Use assert-no-crash instead — login success is already validated by every auth-setup precondition.
  if (intent.triggerKind === 'WIDGET_SUBMITS_FORM' &&
      manifest.authSetup !== undefined &&
      startRoutePath === manifest.authSetup.loginRoute &&
      intent.terminalRoutePath === startRoutePath) {
    pcs.push({ type: 'assert-no-crash' });
    return pcs;
  }

  // P3: Wildcard route postcondition — /** is a route template, not a navigable URL.
  if (intent.terminalRoutePath !== undefined && intent.terminalRoutePath.includes('**')) {
    pcs.push({ type: 'assert-no-crash' });
    return pcs;
  }

  // R2: WNE with target="_blank" — headless Chrome opens new tab, URL stays on current page.
  // Use assert-no-crash since same-tab URL assertion is not meaningful.
  if (intent.triggerKind === 'WIDGET_NAVIGATES_EXTERNAL') {
    const attrs = intent.triggerWidget.attributes;
    if (attrs['target'] === '_blank') {
      pcs.push({ type: 'assert-no-crash' });
      return pcs;
    }
  }

  // F2: Dual-trigger interference — WTH on widget with routerLink.
  // JS click fires both the handler AND routerLink navigation, making the
  // post-click URL unpredictable. Use assert-no-crash for WTH on dual-trigger widgets.
  if (intent.triggerKind === 'WIDGET_TRIGGERS_HANDLER' &&
      intent.triggerWidget.routerLinkText !== undefined &&
      intent.triggerWidget.routerLinkText !== '') {
    pcs.push({ type: 'assert-no-crash' });
    return pcs;
  }

  // F3: CSS-hidden widget — A1 heuristic cssVisibilityHint.
  // When the trigger widget is heuristically detected as CSS-hidden,
  // the interaction result is unpredictable. Use assert-no-crash.
  const triggerNode = index.nodeMap.get(intent.triggerWidget.nodeId);
  if (triggerNode?.kind === 'Widget') {
    const ui = (triggerNode as WidgetNode).meta.ui;
    if (ui.cssVisibilityHint === false) {
      pcs.push({ type: 'assert-no-crash' });
      return pcs;
    }
  }

  // WTH without CNR — narrowed postcondition rule.
  // Only weaken to assert-no-crash when CCS evidence shows a router/navigation service call
  // (handler navigates indirectly via service). Otherwise use assert-url-matches with
  // the start route (handler stays on page).
  if (intent.triggerKind === 'WIDGET_TRIGGERS_HANDLER') {
    const hasCNR = intent.effectSteps.some(s => s.kind === 'COMPONENT_NAVIGATES_ROUTE');
    if (!hasCNR) {
      const hasCCS = intent.effectSteps.some(s => s.kind === 'COMPONENT_CALLS_SERVICE');
      if (hasCCS) {
        // Check if any CCS target is a navigation/router service (indirect navigation)
        const hasNavServiceCCS = intent.effectSteps.some(s => {
          if (s.kind !== 'COMPONENT_CALLS_SERVICE') return false;
          const edge = index.edgeById.get(s.edgeId);
          if (edge?.to === undefined || edge.to === null) return false;
          const targetNode = index.nodeMap.get(edge.to);
          if (targetNode?.kind !== 'Service') return false;
          // Check service name for router/navigation keywords
          return /router|navigation/i.test(edge.to);
        });
        if (hasNavServiceCCS) {
          // Handler calls a router/navigation service — destination unpredictable
          pcs.push({ type: 'assert-no-crash' });
          return pcs;
        }
      }
      // Fix A: Form-submit button with zero captured effects.
      // When the trigger is type="submit" inside a form but A1 captured neither CCS nor CNR,
      // the handler likely calls a service + navigates via subscribe() callback (depth 2+,
      // beyond A1's bounded tracing). Screenshot-proven: these handlers navigate away.
      // Use assert-no-crash rather than asserting the start route.
      if (!hasCCS) {
        const attrs = intent.triggerWidget.attributes;
        const isSubmitButton = attrs['type'] === 'submit';
        const isInForm = intent.triggerWidget.containingFormId !== undefined;
        if (isSubmitButton && isInForm) {
          pcs.push({ type: 'assert-no-crash' });
          return pcs;
        }
      }

      // No navigation evidence: handler stays on page → assert start route URL
      // (A2's terminal guess is unreliable without CNR — prefer start route)
    }
  }

  if (intent.triggerKind === 'WIDGET_NAVIGATES_EXTERNAL') {
    // External URL from A1 ExternalNode
    const extNode = index.nodeMap.get(intent.terminalNodeId);
    if (extNode?.kind === 'External') {
      pcs.push({
        type: 'assert-url-matches',
        expected: (extNode as ExternalNode).meta.url,
      });
    } else {
      pcs.push({ type: 'assert-no-crash' });
    }
  } else if (intent.terminalRoutePath !== undefined) {
    // WTH without CNR: A2's terminal guess is unreliable — prefer start route.
    // The handler has no navigation evidence, so the page should stay at start route.
    const isWthNoCNR = intent.triggerKind === 'WIDGET_TRIGGERS_HANDLER' &&
      !intent.effectSteps.some(s => s.kind === 'COMPONENT_NAVIGATES_ROUTE');
    const effectivePath = isWthNoCNR && startRoutePath !== undefined
      ? startRoutePath
      : intent.terminalRoutePath;

    // For WSF (form submission) workflows: detect server-generated params.
    // If the terminal route has params NOT in any start route, the entity is likely
    // created by the form handler and the ID is server-generated. Keep :param
    // placeholder in the expected URL (B2 emits regex match).
    let paramsToSubstitute = assignment.routeParams;
    if (intent.triggerKind === 'WIDGET_SUBMITS_FORM') {
      const startParamNames = new Set<string>();
      for (const sr of intent.startRoutes) {
        for (const m of sr.fullPath.matchAll(/:([a-zA-Z_][a-zA-Z0-9_]*)/g)) {
          startParamNames.add(m[1]!);
        }
      }
      const filtered: Record<string, string> = {};
      for (const [k, v] of Object.entries(assignment.routeParams)) {
        if (startParamNames.has(k)) filtered[k] = v;
      }
      paramsToSubstitute = filtered;
    }
    const expected = substituteParams(effectivePath, paramsToSubstitute);
    pcs.push({
      type: 'assert-url-matches',
      expected,
    });
  } else {
    pcs.push({ type: 'assert-no-crash' });
  }

  return pcs;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Derive one ActionPlan per non-skipped RealizationIntent.
 * Pure function of intents + manifest + A1 — deterministic, no side effects.
 */
export function derivePlans(
  intentSet: B1IntentSet,
  manifest: SubjectManifest,
  a1: A1Multigraph,
): B1PlanSet {
  const index = buildGraphIndex(a1);
  const inputRef = computeInputRef(a1);

  const skipSet = new Set(manifest.skipWorkflows ?? []);
  const plans: ActionPlan[] = [];
  let skipped = 0;

  for (const intent of intentSet.intents) {
    if (skipSet.has(intent.workflowId)) {
      skipped++;
      continue;
    }

    // Select the best startRoute per spec §B1 Start Route Selection
    // B1-G1: pass requiresAuth so shared-component workflows prefer guarded routes
    const requiresAuth = intent.guardNames.length > 0;
    const triggerCompId = intent.triggerWidget.componentSelector !== undefined
      ? findComponentIdBySelector(intent.triggerWidget.componentSelector, index)
      : undefined;
    const startRoute = selectStartRoute(intent.startRoutes, index, requiresAuth, triggerCompId);
    const startRouteId = startRoute?.routeId;
    const startRouteNode = startRouteId !== undefined ? index.nodeMap.get(startRouteId) : undefined;
    const startRouteGuards = startRouteNode?.kind === 'Route'
      ? [...(startRouteNode as RouteNode).meta.guards]
      : [];

    const assignment = resolveAssignment(intent, manifest, startRouteGuards, startRoute);
    const preConditions = resolvePreConditions(intent, assignment, manifest, index, startRoute);
    const steps = generateSteps(intent, assignment, index);
    const postConditions = resolvePostConditions(intent, assignment, index, manifest, startRoute?.fullPath);

    plans.push({
      workflowId: intent.workflowId,
      planVersion: 1,
      assignment,
      preConditions,
      steps,
      postConditions,
    });
  }

  return {
    input: inputRef,
    plans,
    stats: {
      totalPlanned: plans.length,
      skipped,
    },
  };
}
