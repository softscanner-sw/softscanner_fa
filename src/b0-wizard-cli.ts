#!/usr/bin/env node
/**
 * b0-wizard-cli.ts
 * Interactive Phase B0 manifest wizard.
 *
 * For each required manifest field the wizard prints:
 *   - field path and plain-language meaning
 *   - which workflows depend on it and how many
 *   - A1-derived suggestion with confidence level (HIGH/MEDIUM/UNRESOLVED)
 *   - route/guard/param context derived from A2 + A1 artifacts
 *   - expected input shape and whether empty is invalid
 * Then prompts for the value (Enter to confirm derived suggestion where available).
 *
 * Usage:
 *   npx tsx src/b0-wizard-cli.ts <a2WorkflowsPath> [baseUrl] [--out <path>]
 *
 * Auto-discovers a1-multigraph.json from the same json/ directory as the A2 file
 * for richer route path context and authSetup derivation.
 * Falls back gracefully when A1 is not present.
 *
 * Phase isolation: reads only serialized JSON artifacts (A1 multigraph, A2 workflows).
 * No AST, parsers, analyzers, builders, Angular compiler, ts-morph.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import type { A1Multigraph, RouteNode } from './models/multigraph.js';
import type { A2WorkflowSet } from './models/workflow.js';
import type { SubjectManifest } from './phase-b/b0/manifest-schema.js';
import {
  buildWizardContext,
  deriveAuthSetupFromA1,
  buildParamFamilyGroups,
  type GuardContext,
  type AuthSetupDerivation,
  type DerivedField,
  type ParamFamilyGroup,
} from './phase-b/b0/manifest-wizard.js';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const rawArgs = process.argv.slice(2);

function getFlagArg(flag: string): string | undefined {
  const idx = rawArgs.indexOf(flag);
  return idx >= 0 && idx + 1 < rawArgs.length ? rawArgs[idx + 1] : undefined;
}

const positional = rawArgs.filter((a) => !a.startsWith('--'));
const [a2PathArg, baseUrlArg] = positional;
const outPath = getFlagArg('--out');

if (a2PathArg === undefined) {
  process.stderr.write(
    'Usage: npx tsx src/b0-wizard-cli.ts <a2WorkflowsPath> [baseUrl] [--out <path>]\n' +
    '\n' +
    'Examples:\n' +
    '  npx tsx src/b0-wizard-cli.ts output/heroes-angular/json/a2-workflows.json\n' +
    '  npx tsx src/b0-wizard-cli.ts output/ever-traduora/json/a2-workflows.json \\\n' +
    '    http://localhost:4200 --out subjects/ever-traduora/subject-manifest.json\n',
  );
  process.exit(1);
}

const a2Path = path.resolve(a2PathArg);
if (!fs.existsSync(a2Path)) {
  process.stderr.write(`Error: A2 workflow file not found: ${a2Path}\n`);
  process.exit(1);
}

// Derive subject name from directory structure: output/<subject>/json/a2-workflows.json
const subjectName = path.basename(path.dirname(path.dirname(a2Path)));
const baseUrl = baseUrlArg ?? 'http://localhost:4200';

// ---------------------------------------------------------------------------
// Load A2 + optional A1 for route path context and authSetup derivation
// ---------------------------------------------------------------------------

const a2: A2WorkflowSet = JSON.parse(fs.readFileSync(a2Path, 'utf-8')) as A2WorkflowSet;

// Auto-discover A1 multigraph from same json/ directory
const a1Path = path.join(path.dirname(a2Path), 'a1-multigraph.json');
const routePathMap = new Map<string, string>();
let authDerivation: AuthSetupDerivation | undefined;

if (fs.existsSync(a1Path)) {
  try {
    const a1: A1Multigraph = JSON.parse(fs.readFileSync(a1Path, 'utf-8')) as A1Multigraph;
    for (const node of a1.multigraph.nodes) {
      if (node.kind === 'Route') {
        routePathMap.set(node.id, (node as RouteNode).meta.fullPath);
      }
    }
    authDerivation = deriveAuthSetupFromA1(a1);
  } catch {
    // A1 not critical — wizard degrades gracefully without route paths and derivation
  }
}

const ctx = buildWizardContext(a2, routePathMap);
const paramGroups = buildParamFamilyGroups(a2, routePathMap);

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';
const CYAN   = '\x1b[36m';
const YELLOW = '\x1b[33m';
const GREEN  = '\x1b[32m';
const BLUE   = '\x1b[34m';
const RESET  = '\x1b[0m';
const LINE   = '─'.repeat(62);
const SEP    = `${DIM}${LINE}${RESET}`;

function header(title: string): void {
  process.stdout.write(`\n${BOLD}${CYAN}${title}${RESET}\n${SEP}\n`);
}

function info(label: string, value: string): void {
  process.stdout.write(`  ${DIM}${label.padEnd(28)}${RESET}${value}\n`);
}

function note(text: string): void {
  process.stdout.write(`  ${DIM}⟶ ${text}${RESET}\n`);
}

function derived(field: string, df: DerivedField): void {
  const badge =
    df.confidence === 'HIGH'       ? `${GREEN}[HIGH]${RESET}` :
    df.confidence === 'MEDIUM'     ? `${YELLOW}[MEDIUM]${RESET}` :
                                     `${DIM}[UNRESOLVED]${RESET}`;
  process.stdout.write(`  ${DIM}${field.padEnd(28)}${RESET}${badge}  ${df.value ? BOLD + df.value + RESET : DIM + '(not found)' + RESET}\n`);
  if (df.evidence) {
    process.stdout.write(`  ${DIM}${''.padEnd(28)}evidence: ${df.evidence}${RESET}\n`);
  }
}

function workflowList(
  label: string,
  wfs: Array<{ id: string; triggerKind: string; terminalPath: string | undefined; startPaths: string[] }>,
  total: number,
): void {
  const shown = wfs.slice(0, 6);
  const more  = total - shown.length;
  process.stdout.write(`  ${label} (${total}):\n`);
  for (let i = 0; i < shown.length; i++) {
    const w = shown[i]!;
    const trigger = w.triggerKind.replace('WIDGET_', '').replace('COMPONENT_', '').replace('_HANDLER', '').replace('_ROUTE', '-NAV').replace('_FORM', '-FORM').replace('_EXTERNAL', '-EXT');
    const from    = w.startPaths[0] ?? '(?)';
    const to      = w.terminalPath ?? '(?)';
    const idx     = String(i + 1).padStart(2);
    process.stdout.write(`    ${DIM}${idx}.  [${trigger}]  ${from} → ${to}${RESET}\n`);
  }
  if (more > 0) process.stdout.write(`    ${DIM}… and ${more} more${RESET}\n`);
}

function routeList(label: string, routes: string[]): void {
  if (routes.length === 0) return;
  process.stdout.write(`  ${label}:\n`);
  for (const r of routes.slice(0, 8)) {
    process.stdout.write(`    ${DIM}${r}${RESET}\n`);
  }
  if (routes.length > 8) process.stdout.write(`    ${DIM}… and ${routes.length - 8} more${RESET}\n`);
}

// ---------------------------------------------------------------------------
// readline prompt helpers
// ---------------------------------------------------------------------------

async function prompt(rl: readline.Interface, question: string, defaultValue?: string): Promise<string> {
  const suffix = defaultValue !== undefined ? ` ${DIM}[${defaultValue}]${RESET}` : '';
  return new Promise((resolve) => {
    rl.question(`\n  ${BOLD}${YELLOW}${question}${RESET}${suffix}\n  > `, (answer) => {
      const val = answer.trim();
      resolve(val === '' && defaultValue !== undefined ? defaultValue : val);
    });
  });
}

async function promptRequired(rl: readline.Interface, fieldPath: string, hint: string): Promise<string> {
  let value = '';
  while (value === '') {
    value = await prompt(rl, `${fieldPath}  (${hint})`);
    if (value === '') {
      process.stdout.write(`  ${DIM}This field is required — please enter a value.${RESET}\n`);
    }
  }
  return value;
}

/** Prompt for a field that has a derived suggestion. Enter confirms the derived value. */
async function promptDerivedField(
  rl: readline.Interface,
  fieldPath: string,
  df: DerivedField,
  hint: string,
): Promise<string> {
  if (df.confidence !== 'UNRESOLVED') {
    // Show the derived value and let the user confirm or override
    const badge = df.confidence === 'HIGH' ? `${GREEN}HIGH${RESET}` : `${YELLOW}MEDIUM${RESET}`;
    process.stdout.write(
      `\n  ${DIM}${fieldPath}${RESET}\n` +
      `  Derived (${badge}): ${BOLD}${df.value}${RESET}\n` +
      `  Evidence: ${DIM}${df.evidence}${RESET}\n`,
    );
    const answer = await prompt(rl, 'Press Enter to confirm or type to override', df.value);
    return answer === '' ? df.value : answer;
  } else {
    return promptRequired(rl, fieldPath, hint);
  }
}

// ---------------------------------------------------------------------------
// Subject summary
// ---------------------------------------------------------------------------

function printSubjectSummary(): void {
  header(`B0 Manifest Wizard — ${subjectName}`);
  process.stdout.write('\n');
  info('Subject',                   subjectName);
  info('Base URL',                  baseUrl);
  info('Total workflows (A2)',       String(ctx.totalWorkflows));
  info('Non-PRUNED workflows',       String(ctx.nonPrunedCount));
  info('Guarded workflows',          String(ctx.guardedWorkflowCount));
  info('Parameterized workflows',    String(ctx.parameterizedWorkflowCount));
  info('Auth guards found',          String(ctx.guards.filter((g) => !g.isNoAuth).length));
  info('NoAuth guards found',        String(ctx.guards.filter((g) => g.isNoAuth).length));
  info('Route params found',         String(ctx.params.length));
  info('Multi-family params',        String(paramGroups.filter((g) => g.isMultiFamily).length));
  info('A1 authSetup derivation',    authDerivation ? 'available' : 'not available (A1 missing)');
  process.stdout.write('\n');
}

// ---------------------------------------------------------------------------
// Requirement summary
// ---------------------------------------------------------------------------

function printRequirementSummary(): void {
  header('Manifest Requirements');
  if (ctx.guards.length === 0 && ctx.params.length === 0) {
    process.stdout.write(`  ${GREEN}No auth guards or route params required.${RESET}\n`);
    process.stdout.write(`  This subject needs only subjectName + baseUrl.\n`);
    return;
  }
  if (ctx.guards.length > 0) {
    process.stdout.write(`\n  ${BOLD}Auth accounts required:${RESET}\n`);
    for (const g of ctx.guards) {
      const kind = g.isNoAuth ? '(NoAuth / unauthenticated)' : '(authenticated access)';
      process.stdout.write(`    • account for ${BOLD}${g.name}${RESET} ${DIM}${kind} — ${g.workflowCount} workflows${RESET}\n`);
    }
  }
  if (paramGroups.length > 0) {
    process.stdout.write(`\n  ${BOLD}Route parameters required:${RESET}\n`);
    for (const pg of paramGroups) {
      const scope = pg.isMultiFamily
        ? `multi-family (${pg.families.map((f) => f.entityFamily).join(', ')}) → routeParamOverrides`
        : `single-family → routeParamValues`;
      process.stdout.write(`    • ${BOLD}:${pg.paramName}${RESET} ${DIM}${scope} — ${pg.totalWorkflowCount} workflows${RESET}\n`);
    }
  }
  const needsAuthSetup = ctx.guards.some((g) => !g.isNoAuth);
  if (needsAuthSetup) {
    process.stdout.write(`\n  ${BOLD}authSetup required:${RESET} ${DIM}login form selectors (loginRoute, usernameField, passwordField, submitButton)${RESET}\n`);
    if (authDerivation) {
      process.stdout.write(`  ${BLUE}A1 derivation available — HIGH/MEDIUM confidence fields will be pre-filled.${RESET}\n`);
    }
  }
  process.stdout.write('\n');
}

// ---------------------------------------------------------------------------
// Account prompting
// ---------------------------------------------------------------------------

async function promptAccount(
  rl: readline.Interface,
  idx: number,
  gctx: GuardContext,
): Promise<SubjectManifest['accounts'][number]> {
  const guardKind = gctx.isNoAuth
    ? 'NoAuth / unauthenticated (no credentials needed by B3 — user will not log in)'
    : 'authenticated (B3 will log in with these credentials before running guarded workflows)';

  header(`Account [${idx}] — satisfies guard: ${gctx.name}`);
  process.stdout.write('\n');
  info('Guard type',         guardKind);
  info('Workflows using it', String(gctx.workflowCount));

  workflowList('Affected workflows', gctx.workflows, gctx.workflowCount);
  routeList('Start routes of affected workflows', gctx.startRoutePaths);

  process.stdout.write('\n');

  if (gctx.isNoAuth) {
    note('NoAuth accounts represent unauthenticated sessions (e.g. login/signup pages).');
    note('Provide any non-empty placeholder username/password; B3 will NOT log in with these.');
    note('Roles should be empty [] for NoAuth accounts.');
  } else {
    note('Provide real credentials that satisfy this guard in the running application.');
    note('B3 will navigate to loginRoute, fill these credentials, and submit the login form');
    note('before executing any workflow that requires this guard.');
    note('Note: this guard may appear on routes the workflow navigates to, not only start routes.');
  }

  const username = await promptRequired(
    rl,
    `accounts[${idx}].username`,
    gctx.isNoAuth ? 'any non-empty placeholder, e.g. guest@example.com' : 'e.g. admin@example.com',
  );

  const password = await promptRequired(
    rl,
    `accounts[${idx}].password`,
    gctx.isNoAuth ? 'any non-empty placeholder, e.g. guest123' : 'e.g. admin123',
  );

  const rolesRaw = await prompt(
    rl,
    `accounts[${idx}].roles  (comma-separated, or press Enter for none)`,
    '',
  );
  const roles = rolesRaw === '' ? [] : rolesRaw.split(',').map((r) => r.trim()).filter(Boolean);

  return { username, password, roles, guardSatisfies: [gctx.name] };
}

// ---------------------------------------------------------------------------
// authSetup prompting — uses A1 derivation when available
// ---------------------------------------------------------------------------

async function promptAuthSetup(
  rl: readline.Interface,
  guardedWorkflowCount: number,
): Promise<NonNullable<SubjectManifest['authSetup']>> {
  header('authSetup — Login Form Selectors');
  process.stdout.write('\n');
  info('Purpose',  'CSS selectors for the application\'s login form elements');
  info('Used by',  `B2 auth-setup preconditions in ${guardedWorkflowCount} workflows`);
  process.stdout.write('\n');
  note('B3 will navigate to loginRoute, locate usernameField/passwordField by CSS selector,');
  note('fill in the account credentials, click submitButton, and wait for redirect away from');
  note('loginRoute before proceeding with the main workflow action.');
  process.stdout.write('\n');

  if (authDerivation) {
    process.stdout.write(`  ${BLUE}A1 derivation results:${RESET}\n`);
    derived('authSetup.loginRoute',    authDerivation.loginRoute);
    derived('authSetup.usernameField', authDerivation.usernameField);
    derived('authSetup.passwordField', authDerivation.passwordField);
    derived('authSetup.submitButton',  authDerivation.submitButton);
    process.stdout.write('\n');
    note('HIGH = derived from formControlName (Angular reactive form) — reliable.');
    note('MEDIUM = derived from inputType or nameAttr — verify against the actual form.');
    note('UNRESOLVED = not found in A1; you must provide the CSS selector manually.');
    process.stdout.write('\n');
  } else {
    note('A1 multigraph not found — all fields require manual entry.');
    note('CSS selector examples:');
    note('  input[formcontrolname=\'email\']    — Angular reactive form');
    note('  input[name=\'username\']            — traditional name attribute');
    note('  input[type=\'email\']               — by input type');
    note('  button[type=\'submit\']             — submit button');
    process.stdout.write('\n');
  }

  const emptyDerivation: DerivedField = { value: '', evidence: '', confidence: 'UNRESOLVED' };

  const loginRoute = await promptDerivedField(
    rl,
    'authSetup.loginRoute',
    authDerivation?.loginRoute ?? emptyDerivation,
    'path to the login page, e.g. /login',
  );

  const usernameField = await promptDerivedField(
    rl,
    'authSetup.usernameField',
    authDerivation?.usernameField ?? emptyDerivation,
    'CSS selector for username/email input, e.g. input[formcontrolname=\'email\']',
  );

  const passwordField = await promptDerivedField(
    rl,
    'authSetup.passwordField',
    authDerivation?.passwordField ?? emptyDerivation,
    'CSS selector for password input, e.g. input[formcontrolname=\'password\']',
  );

  const submitButton = await promptDerivedField(
    rl,
    'authSetup.submitButton',
    authDerivation?.submitButton ?? emptyDerivation,
    'CSS selector for login submit button, e.g. button[type=\'submit\']',
  );

  const authSuccessSelector = await promptDerivedField(
    rl,
    'authSetup.authSuccessSelector',
    authDerivation?.authSuccessSelector ?? emptyDerivation,
    'CSS selector for an element ONLY present after login, e.g. app-bar or mat-sidenav-container',
  );

  return { loginRoute, usernameField, passwordField, submitButton, authSuccessSelector };
}

// ---------------------------------------------------------------------------
// Route param prompting — entity-family aware
// ---------------------------------------------------------------------------

/** Single-family param: prompt once, result goes in routeParamValues. */
async function promptParamSingleFamily(
  rl: readline.Interface,
  group: ParamFamilyGroup,
): Promise<string> {
  const family = group.families[0];
  const templates = family?.routeTemplates ?? [];

  header(`Route Parameter: :${group.paramName}`);
  process.stdout.write('\n');
  info('Param name',        `:${group.paramName}`);
  info('Scope',             'routeParamValues (single entity family)');
  info('Workflows using it', String(group.totalWorkflowCount));
  process.stdout.write('\n');

  if (templates.length > 0) {
    routeList('Route templates using this param', templates);
    process.stdout.write('\n');
  }

  note(`This value is substituted for ":${group.paramName}" in route URLs at test execution time.`);
  note(`Category: static environment seed data — a record with this ID must exist in the database.`);

  if (group.paramName === 'id' || group.paramName.endsWith('Id') || group.paramName.endsWith('_id')) {
    note(`Example values: "1", "2", "abc-123"`);
  } else if (group.paramName === 'localeCode') {
    note(`A locale with this code must be registered in the project.  Example: "en", "fr", "de"`);
  } else if (group.paramName === 'projectId') {
    note(`A project with this ID must exist and be accessible by the configured account.`);
  }
  process.stdout.write('\n');

  return promptRequired(
    rl,
    `routeParamValues.${group.paramName}`,
    `concrete value for ":${group.paramName}" in route URLs`,
  );
}

/** Multi-family param: prompt per entity family, results go in routeParamOverrides. */
async function promptParamMultiFamily(
  rl: readline.Interface,
  group: ParamFamilyGroup,
): Promise<Map<string, string>> {
  header(`Route Parameter: :${group.paramName}  (multi-family)`);
  process.stdout.write('\n');
  info('Param name',         `:${group.paramName}`);
  info('Scope',              'routeParamOverrides (distinct values per entity family)');
  info('Workflows using it', String(group.totalWorkflowCount));
  info('Entity families',    group.families.map((f) => f.entityFamily).join(', '));
  process.stdout.write('\n');

  note(`":${group.paramName}" is shared by ${group.families.length} distinct entity families.`);
  note(`Each family requires a separate seed record — one global value is NOT sufficient.`);
  note(`You will be prompted once per family.  Each value is stored in routeParamOverrides.`);
  note(`Category: static environment seed data — records must exist before test execution.`);
  process.stdout.write('\n');

  const values = new Map<string, string>();

  for (const family of group.families) {
    process.stdout.write(`\n  ${BOLD}Entity family: ${family.entityFamily}${RESET}  (${family.workflowCount} workflows)\n`);
    routeList('Route templates in this family', family.routeTemplates);
    process.stdout.write('\n');
    note(`Provide the ID of an existing ${family.entityFamily} record in the running application.`);
    process.stdout.write('\n');

    const value = await promptRequired(
      rl,
      `routeParamOverrides["${family.representativeTemplate}"]["${group.paramName}"]`,
      `concrete ${family.entityFamily} ID, e.g. "1"`,
    );
    values.set(family.entityFamily, value);
  }

  return values;
}

/**
 * Collect all route param values.
 * Returns routeParamValues (global) and routeParamOverrides (per-template for multi-family params).
 */
async function collectRouteParams(rl: readline.Interface): Promise<{
  routeParamValues: Record<string, string>;
  routeParamOverrides: Record<string, Record<string, string>>;
}> {
  const routeParamValues: Record<string, string> = {};
  const routeParamOverrides: Record<string, Record<string, string>> = {};

  for (const group of paramGroups) {
    if (!group.isMultiFamily) {
      const value = await promptParamSingleFamily(rl, group);
      routeParamValues[group.paramName] = value;
    } else {
      const familyValues = await promptParamMultiFamily(rl, group);

      // Store fallback in routeParamValues (first family value)
      const firstFamily = group.families[0];
      if (firstFamily) {
        const fallbackVal = familyValues.get(firstFamily.entityFamily);
        if (fallbackVal !== undefined) {
          routeParamValues[group.paramName] = fallbackVal;
        }
      }

      // Store per-template overrides for every template in each family
      for (const family of group.families) {
        const val = familyValues.get(family.entityFamily);
        if (val === undefined) continue;
        for (const template of family.routeTemplates) {
          const existing = routeParamOverrides[template] ?? {};
          existing[group.paramName] = val;
          routeParamOverrides[template] = existing;
        }
      }
    }
  }

  return { routeParamValues, routeParamOverrides };
}

// ---------------------------------------------------------------------------
// Main interactive wizard
// ---------------------------------------------------------------------------

async function runWizard(): Promise<void> {
  printSubjectSummary();
  printRequirementSummary();

  // No fields needed — trivially complete
  if (ctx.guards.length === 0 && ctx.params.length === 0) {
    const manifest: SubjectManifest = { subjectName, baseUrl, accounts: [], routeParamValues: {} };
    writeManifest(manifest);
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    process.stdout.write(`${BOLD}Starting field-by-field collection.${RESET} Press Ctrl+C to abort.\n`);

    // Collect accounts
    const accounts: SubjectManifest['accounts'] = [];
    for (let i = 0; i < ctx.guards.length; i++) {
      const gctx = ctx.guards[i];
      if (gctx !== undefined) {
        accounts.push(await promptAccount(rl, i, gctx));
      }
    }

    // Collect authSetup (only if at least one non-NoAuth guard exists)
    const needsAuthSetup = ctx.guards.some((g) => !g.isNoAuth);
    let authSetup: SubjectManifest['authSetup'] | undefined;
    if (needsAuthSetup) {
      authSetup = await promptAuthSetup(rl, ctx.guardedWorkflowCount);
    }

    // Collect route params (entity-family aware)
    const { routeParamValues, routeParamOverrides } = await collectRouteParams(rl);

    // Assemble manifest
    const manifest: SubjectManifest = { subjectName, baseUrl, accounts, routeParamValues };
    if (authSetup !== undefined) manifest.authSetup = authSetup;
    if (Object.keys(routeParamOverrides).length > 0) manifest.routeParamOverrides = routeParamOverrides;

    // Summary
    header('Manifest Complete');
    process.stdout.write('\n');
    info('subjectName',          manifest.subjectName);
    info('baseUrl',              manifest.baseUrl);
    info('accounts',             String(manifest.accounts.length));
    info('routeParamValues',
      Object.entries(manifest.routeParamValues).map(([k, v]) => `${k}=${v}`).join(', ') || '(none)',
    );
    if (manifest.routeParamOverrides && Object.keys(manifest.routeParamOverrides).length > 0) {
      info('routeParamOverrides', `${Object.keys(manifest.routeParamOverrides).length} template(s)`);
    }
    if (manifest.authSetup !== undefined) {
      info('authSetup.loginRoute', manifest.authSetup.loginRoute);
    }
    process.stdout.write('\n');

    writeManifest(manifest);
  } finally {
    rl.close();
  }
}

function writeManifest(manifest: SubjectManifest): void {
  const json = JSON.stringify(manifest, null, 2) + '\n';

  if (outPath !== undefined) {
    const resolved = path.resolve(outPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, json, 'utf-8');
    process.stdout.write(`\n${GREEN}✓ Manifest written to: ${resolved}${RESET}\n`);
    process.stderr.write(`\nIMPORTANT: Run "npm run b0:validate" to confirm the manifest passes validation.\n`);
  } else {
    process.stdout.write('\n--- Generated manifest ---\n');
    process.stdout.write(json);
    process.stdout.write('--- End manifest ---\n');
    process.stderr.write('\nIMPORTANT: Pipe this output to subjects/<subject>/subject-manifest.json, then run "npm run b0:validate".\n');
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

runWizard().catch((err: unknown) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
