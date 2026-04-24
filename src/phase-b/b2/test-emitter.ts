/**
 * test-emitter.ts
 * Pure functions: ActionPlan → Selenium WebDriver TypeScript test code.
 *
 * Authority: docs/paper/approach.md — Phase B §B2.
 * Phase isolation: imports only from src/phase-b/b1/ types.
 * No I/O. Deterministic: same ActionPlan → same string output.
 */

import type {
  ActionPlan,
  ActionStep,
  Assignment,
  PostCondition,
  PreCondition,
  ScopedLocator,
} from '../b1/plan-types.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Emit a complete Selenium WebDriver TypeScript test file for one ActionPlan.
 */
/** B5.1: Subject-level timeout overrides from manifest executionConfig.timeoutProfile. */
export interface TimeoutProfile {
  implicitWait?: number;
  navigationWait?: number;
  authWait?: number;
}

export interface EmitOptions {
  timeoutProfile?: TimeoutProfile;
  enableNetworkEvidence?: boolean;
}

export function emitTest(plan: ActionPlan, baseUrl: string, opts?: EmitOptions): string {
  const lines: string[] = [];

  // Imports
  lines.push(`import { Builder, By, until, WebDriver } from 'selenium-webdriver';`);
  lines.push(`import chrome from 'selenium-webdriver/chrome';`);
  lines.push(`import assert from 'assert';`);
  lines.push(`import fs from 'node:fs';`);
  lines.push(`import path from 'node:path';`);
  lines.push(`import { fileURLToPath } from 'node:url';`);
  lines.push(``);

  // Test description
  lines.push(`/**`);
  lines.push(` * Auto-generated Selenium test for workflow: ${plan.workflowId}`);
  lines.push(` * Plan version: ${plan.planVersion}`);
  lines.push(` * Pre-conditions: ${plan.preConditions.length}`);
  lines.push(` * Steps: ${plan.steps.length}`);
  lines.push(` * Post-conditions: ${plan.postConditions.length}`);
  lines.push(` */`);
  lines.push(``);

  // Main test function
  lines.push(`const BASE_URL = ${quote(baseUrl)};`);
  const timeoutProfile = opts?.timeoutProfile;
  const enableNetworkEvidence = opts?.enableNetworkEvidence === true;
  const implicitWait = timeoutProfile?.implicitWait ?? 5000;
  const navigationWait = timeoutProfile?.navigationWait ?? 10000;
  const authWait = timeoutProfile?.authWait ?? 15000;
  lines.push(`const IMPLICIT_WAIT = ${implicitWait};`);
  lines.push(`const NAVIGATION_WAIT = ${navigationWait};`);
  lines.push(`const AUTH_WAIT = ${authWait};`);
  lines.push(``);
  lines.push(`const __testFile = fileURLToPath(import.meta.url);`);
  lines.push(`const SCREENSHOT_DIR = path.join(path.dirname(__testFile), '..', 'screenshots', path.basename(__testFile, '.test.ts'));`);
  lines.push(`const LOG_DIR = path.join(path.dirname(__testFile), '..', 'logs');`);
  lines.push(`fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });`);
  lines.push(`fs.mkdirSync(LOG_DIR, { recursive: true });`);
  lines.push(``);

  // Structured execution log infrastructure — unified observability contract
  lines.push(`// B5.0 Observability — unified execution log + screenshot contract`);
  lines.push(`type FailureKind = 'locator-not-found' | 'interaction-failed' | 'timeout' | 'assertion-failed' | 'navigation-failed' | 'unknown';`);
  lines.push(`interface StepLog {`);
  lines.push(`  stepId: string;`);
  lines.push(`  edgeId?: string;`);
  lines.push(`  stepType: string;`);
  lines.push(`  locator?: { strategy: string; value: string };`);
  lines.push(`  timestampStart: string;`);
  lines.push(`  timestampEnd: string;`);
  lines.push(`  success: boolean;`);
  lines.push(`  error?: string;`);
  lines.push(`  failureKind?: FailureKind;`);
  lines.push(`  routeBefore?: string;`);
  lines.push(`  routeAfter?: string;`);
  lines.push(`  elementFound?: boolean;`);
  lines.push(`  elementTagName?: string;`);
  lines.push(`  domEvidence?: string;`);
  lines.push(`  screenshotPath?: string;`);
  lines.push(`  networkEvidence?: NetworkEvidence[];`);
  lines.push(`}`);
  lines.push(`interface ExecutionLog {`);
  lines.push(`  workflowId: string;`);
  lines.push(`  testFile: string;`);
  lines.push(`  outcome: 'PASS' | 'FAIL';`);
  lines.push(`  failedStepId?: string;`);
  lines.push(`  failureKind?: FailureKind;`);
  lines.push(`  duration: number;`);
  lines.push(`  screenshots: string[];`);
  lines.push(`  steps: StepLog[];`);
  lines.push(`}`);
  lines.push(`const _stepLogs: StepLog[] = [];`);
  lines.push(`const _screenshots: string[] = [];`);
  lines.push(`const _testStart = Date.now();`);
  lines.push(``);
  lines.push(`function classifyError(err: any): { failureKind: FailureKind; elementFound: boolean } {`);
  lines.push(`  const name = err?.name ?? '';`);
  lines.push(`  const msg = err?.message ?? String(err);`);
  lines.push(`  if (name === 'NoSuchElementError' || msg.includes('no such element') || msg.includes('Unable to locate element')) {`);
  lines.push(`    return { failureKind: 'locator-not-found', elementFound: false };`);
  lines.push(`  }`);
  lines.push(`  if (name === 'ElementNotInteractableError' || name === 'ElementClickInterceptedError' || msg.includes('not interactable')) {`);
  lines.push(`    return { failureKind: 'interaction-failed', elementFound: true };`);
  lines.push(`  }`);
  lines.push(`  if (name === 'TimeoutError' || msg.includes('Wait timed out') || msg.includes('Timed out')) {`);
  lines.push(`    return { failureKind: 'timeout', elementFound: false };`);
  lines.push(`  }`);
  lines.push(`  if (name === 'AssertionError' || name === 'AssertionError [ERR_ASSERTION]' || msg.includes('AssertionError') || msg.includes('assert')) {`);
  lines.push(`    return { failureKind: 'assertion-failed', elementFound: true };`);
  lines.push(`  }`);
  lines.push(`  if (msg.includes('navigation') || msg.includes('net::ERR_')) {`);
  lines.push(`    return { failureKind: 'navigation-failed', elementFound: false };`);
  lines.push(`  }`);
  lines.push(`  return { failureKind: 'unknown', elementFound: false };`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`async function captureScreenshot(driver: WebDriver, label: string): Promise<string | undefined> {`);
  lines.push(`  try {`);
  lines.push(`    const data = await driver.takeScreenshot();`);
  lines.push(`    const file = path.join(SCREENSHOT_DIR, label + '.png');`);
  lines.push(`    fs.writeFileSync(file, data, 'base64');`);
  lines.push(`    _screenshots.push(file);`);
  lines.push(`    return file;`);
  lines.push(`  } catch { return undefined; }`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`async function logStep(`);
  lines.push(`  driver: WebDriver,`);
  lines.push(`  stepId: string,`);
  lines.push(`  stepType: string,`);
  lines.push(`  locator: { strategy: string; value: string } | undefined,`);
  lines.push(`  edgeId: string | undefined,`);
  lines.push(`  fn: () => Promise<{ elementFound?: boolean; elementTagName?: string; domEvidence?: string }>,`);
  lines.push(`): Promise<void> {`);
  lines.push(`  const timestampStart = new Date().toISOString();`);
  lines.push(`  let routeBefore: string | undefined;`);
  lines.push(`  try { routeBefore = await driver.getCurrentUrl(); } catch { /* pre-navigation */ }`);
  lines.push(`  let success = false;`);
  lines.push(`  let error: string | undefined;`);
  lines.push(`  let failureKind: FailureKind | undefined;`);
  lines.push(`  let elementFound: boolean | undefined;`);
  lines.push(`  let elementTagName: string | undefined;`);
  lines.push(`  let domEvidence: string | undefined;`);
  lines.push(`  let screenshotPath: string | undefined;`);
  lines.push(`  try {`);
  lines.push(`    const result = await fn();`);
  lines.push(`    elementFound = result.elementFound;`);
  lines.push(`    elementTagName = result.elementTagName;`);
  lines.push(`    domEvidence = result.domEvidence;`);
  lines.push(`    success = true;`);
  lines.push(`  } catch (err: any) {`);
  lines.push(`    error = err?.message ?? String(err);`);
  lines.push(`    const classified = classifyError(err);`);
  lines.push(`    failureKind = classified.failureKind;`);
  lines.push(`    elementFound = classified.elementFound;`);
  lines.push(`    screenshotPath = await captureScreenshot(driver, stepId + '_error');`);
  lines.push(`    throw err;`);
  lines.push(`  } finally {`);
  lines.push(`    const timestampEnd = new Date().toISOString();`);
  lines.push(`    let routeAfter: string | undefined;`);
  lines.push(`    try { routeAfter = await driver.getCurrentUrl(); } catch { /* post-quit */ }`);
  lines.push(`    _stepLogs.push({`);
  lines.push(`      stepId,`);
  lines.push(`      ...(edgeId !== undefined ? { edgeId } : {}),`);
  lines.push(`      stepType,`);
  lines.push(`      ...(locator !== undefined ? { locator } : {}),`);
  lines.push(`      timestampStart,`);
  lines.push(`      timestampEnd,`);
  lines.push(`      success,`);
  lines.push(`      ...(error !== undefined ? { error } : {}),`);
  lines.push(`      ...(failureKind !== undefined ? { failureKind } : {}),`);
  lines.push(`      ...(routeBefore !== undefined ? { routeBefore } : {}),`);
  lines.push(`      ...(routeAfter !== undefined ? { routeAfter } : {}),`);
  lines.push(`      ...(elementFound !== undefined ? { elementFound } : {}),`);
  lines.push(`      ...(elementTagName !== undefined ? { elementTagName } : {}),`);
  lines.push(`      ...(domEvidence !== undefined ? { domEvidence } : {}),`);
  lines.push(`      ...(screenshotPath !== undefined ? { screenshotPath } : {}),`);
  lines.push(`    });`);
  lines.push(`  }`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`function writeExecutionLog(outcome: 'PASS' | 'FAIL', failedStepId?: string): void {`);
  lines.push(`  const failedEntry = failedStepId !== undefined ? _stepLogs.find(s => s.stepId === failedStepId) : undefined;`);
  lines.push(`  const log: ExecutionLog = {`);
  lines.push(`    workflowId: ${quote(escapeString(plan.workflowId))},`);
  lines.push(`    testFile: path.basename(__testFile),`);
  lines.push(`    outcome,`);
  lines.push(`    ...(failedStepId !== undefined ? { failedStepId } : {}),`);
  lines.push(`    ...(failedEntry?.failureKind !== undefined ? { failureKind: failedEntry.failureKind } : {}),`);
  lines.push(`    duration: Date.now() - _testStart,`);
  lines.push(`    screenshots: _screenshots,`);
  lines.push(`    steps: _stepLogs,`);
  lines.push(`  };`);
  lines.push(`  const logFile = path.join(LOG_DIR, path.basename(__testFile, '.test.ts') + '.log.json');`);
  lines.push(`  fs.writeFileSync(logFile, JSON.stringify(log, null, 2));`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`async function getElementEvidence(driver: WebDriver, el: any): Promise<{ domEvidence?: string; elementTagName?: string }> {`);
  lines.push(`  try {`);
  lines.push(`    const info = await driver.executeScript(`);
  lines.push(`      'return { tag: arguments[0].tagName, html: arguments[0].outerHTML.substring(0, 200) }', el`);
  lines.push(`    ) as { tag?: string; html?: string } | null;`);
  lines.push(`    return {`);
  lines.push(`      domEvidence: typeof info?.html === 'string' ? info.html : undefined,`);
  lines.push(`      elementTagName: typeof info?.tag === 'string' ? info.tag.toLowerCase() : undefined,`);
  lines.push(`    };`);
  lines.push(`  } catch { return {}; }`);
  lines.push(`}`);
  lines.push(``);
  if (enableNetworkEvidence) {
    lines.push(`// CDP network evidence types (enabled via manifest enableNetworkEvidence)`);
    lines.push(`interface NetworkEvidence { url: string; method: string; status: number; timing: number; }`);
    lines.push(`let _pendingRequests = new Map<string, { url: string; method: string; start: number }>();`);
    lines.push(`let _allNetworkEvidence: NetworkEvidence[] = [];`);
    lines.push(`let drainNetworkLogs: () => Promise<void> = async () => {};`);
    lines.push(`function _attributeNetworkEvidence(): void {`);
    lines.push(`  if (_allNetworkEvidence.length === 0 || _stepLogs.length === 0) return;`);
    lines.push(`  // Attribute buffered evidence to steps by timestamp overlap`);
    lines.push(`  for (const step of _stepLogs) {`);
    lines.push(`    if (!step.timestampStart || !step.timestampEnd) continue;`);
    lines.push(`    const start = new Date(step.timestampStart).getTime() / 1000;`);
    lines.push(`    const end = new Date(step.timestampEnd).getTime() / 1000;`);
    lines.push(`    const stepEvidence = _allNetworkEvidence.filter(e => e.timing >= start && e.timing <= end);`);
    lines.push(`    if (stepEvidence.length > 0) step.networkEvidence = stepEvidence;`);
    lines.push(`  }`);
    lines.push(`  // Remaining unattributed evidence goes to last step`);
    lines.push(`  const attributed = new Set(_stepLogs.flatMap(s => s.networkEvidence ?? []));`);
    lines.push(`  const unattributed = _allNetworkEvidence.filter(e => !attributed.has(e));`);
    lines.push(`  if (unattributed.length > 0) {`);
    lines.push(`    const last = _stepLogs[_stepLogs.length - 1]!;`);
    lines.push(`    last.networkEvidence = [...(last.networkEvidence ?? []), ...unattributed];`);
    lines.push(`  }`);
    lines.push(`}`);
  } else {
    lines.push(`// CDP network evidence disabled (default)`);
    lines.push(`const drainNetworkLogs: () => Promise<void> = async () => {};`);
    lines.push(`function _attributeNetworkEvidence(): void { /* no-op */ }`);
  }
  lines.push(``);
  lines.push(`async function runTest(): Promise<void> {`);
  lines.push(`  const options = new chrome.Options();`);
  lines.push(`  options.addArguments('--headless');`);
  lines.push(`  options.addArguments('--no-sandbox');`);
  lines.push(`  options.addArguments('--disable-dev-shm-usage');`);
  lines.push(`  options.addArguments('--window-size=1920,1080');`);
  if (enableNetworkEvidence) {
    lines.push(`  // Enable performance logging for CDP network evidence`);
    lines.push(`  const loggingPrefs = new (await import('selenium-webdriver/lib/logging.js')).Preferences();`);
    lines.push(`  loggingPrefs.setLevel('performance', 'ALL');`);
    lines.push(`  options.setLoggingPrefs(loggingPrefs);`);
  }
  lines.push(``);
  lines.push(`  const driver: WebDriver = await new Builder()`);
  lines.push(`    .forBrowser('chrome')`);
  lines.push(`    .setChromeOptions(options)`);
  lines.push(`    .build();`);
  lines.push(``);
  lines.push(`  await driver.manage().setTimeouts({ implicit: IMPLICIT_WAIT });`);
  lines.push(``);
  if (enableNetworkEvidence) {
  lines.push(`  // Collect network evidence from Chrome performance logs`);
  lines.push(`  drainNetworkLogs = async function(): Promise<void> {`);
  lines.push(`    try {`);
  lines.push(`      const logs = await driver.manage().logs().get('performance');`);
  lines.push(`      for (const entry of logs) {`);
  lines.push(`        try {`);
  lines.push(`          const msg = JSON.parse(entry.message)?.message;`);
  lines.push(`          if (!msg) continue;`);
  lines.push(`          if (msg.method === 'Network.requestWillBeSent') {`);
  lines.push(`            const p = msg.params;`);
  lines.push(`            if (p?.request?.url && !p.request.url.startsWith('data:')) {`);
  lines.push(`              _pendingRequests.set(p.requestId, { url: p.request.url, method: p.request.method || 'GET', start: p.timestamp || 0 });`);
  lines.push(`            }`);
  lines.push(`          } else if (msg.method === 'Network.responseReceived') {`);
  lines.push(`            const p = msg.params;`);
  lines.push(`            const req = _pendingRequests.get(p?.requestId);`);
  lines.push(`            if (req && p?.response) {`);
  lines.push(`              _allNetworkEvidence.push({ url: req.url, method: req.method, status: p.response.status || 0, timing: ((p.timestamp || 0) - req.start) * 1000 });`);
  lines.push(`              _pendingRequests.delete(p.requestId);`);
  lines.push(`            }`);
  lines.push(`          }`);
  lines.push(`        } catch { /* ignore malformed log entries */ }`);
  lines.push(`      }`);
  lines.push(`    } catch { /* performance logging not available */ }`);
  lines.push(`  }`);
  } // end if (enableNetworkEvidence) — drainNetworkLogs assignment
  lines.push(``);
  lines.push(`  try {`);

  // Pre-conditions — each wrapped in logStep (no elementFound/domEvidence — not element-based)
  for (let pi = 0; pi < plan.preConditions.length; pi++) {
    const pre = plan.preConditions[pi]!;
    const stepId = `pre-${pi}`;
    const preLocator = _preConditionLocatorMeta(pre);
    lines.push(`    await logStep(driver, ${quote(stepId)}, ${quote(`precondition:${pre.type}`)}, ${preLocator}, undefined, async () => {`);
    const preLines = emitPreCondition(pre, plan.assignment, baseUrl);
    for (const l of preLines) {
      lines.push(`      ${l}`);
    }
    lines.push(`      return {};`);
    lines.push(`    });`);
    lines.push(``);
  }
  // Milestone screenshot: after all preconditions
  lines.push(`    await captureScreenshot(driver, 'milestone_after-preconditions');`);
  lines.push(``);

  // B5.2: Emit structurally-derived pre-action waits for visibility gates,
  // async/permission gates, and repeater/list readiness. These are L-layer
  // precondition-support mechanisms that ensure the target widget has
  // materialized before the first interaction step.
  const tc = plan.triggerContext;
  const gates = tc?.compositionGates ?? [];
  const hasAsyncGate = gates.some(g => /async|can:/i.test(g));
  const hasRepeater = tc?.insideNgFor !== undefined;
  const hasVisGate = gates.length > 0;
  // Contradictory-auth guardrail: skip pre-wait if the gate requires NOT
  // authenticated but the plan has an auth precondition (the element will
  // never render because auth contradicts the visibility predicate).
  const hasAuth = (plan.preConditions ?? []).some(pc => pc.type === 'auth-setup');
  const isContradictoryAuth = hasAuth && gates.some(g => /^!is(LoggedIn|Authenticated)/i.test(g.trim()));
  const shouldEmitPreWait = (hasAsyncGate || hasRepeater || hasVisGate) && !isContradictoryAuth;
  if (shouldEmitPreWait && plan.steps.length > 0) {
    const firstStep = plan.steps[0]!;
    const waitLocator = emitFindElement(firstStep.locator);
    const waitTimeout = `NAVIGATION_WAIT`;
    const waitReason = hasAsyncGate
      ? `async/permission gate: ${gates.join('; ').slice(0, 60)}`
      : hasRepeater
        ? `repeater data readiness: *ngFor="${tc?.insideNgFor}"`
        : `visibility gate: ${gates.join('; ').slice(0, 60)}`;
    const waitLabel = hasAsyncGate ? 'async/permission gate' : hasRepeater ? 'repeater data readiness' : 'visibility gate';
    lines.push(`    // B5.2: Pre-action wait for ${waitLabel}`);
    lines.push(`    await logStep(driver, 'pre-wait', 'wait-for-element', { strategy: 'b5.2', value: ${quote(waitReason)} }, undefined, async () => {`);
    lines.push(`      await driver.manage().setTimeouts({ implicit: 0 });`);
    lines.push(`      await driver.wait(async () => {`);
    lines.push(`        try { await ${waitLocator}; return true; } catch { return false; }`);
    lines.push(`      }, ${waitTimeout}, ${quote(`B5.2 wait: ${waitReason}`)});`);
    lines.push(`      await driver.manage().setTimeouts({ implicit: IMPLICIT_WAIT });`);
    lines.push(`      return {};`);
    lines.push(`    });`);
    lines.push(``);
  }

  // Steps — each wrapped in logStep with honest evidence capture
  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i]!;
    const stepId = `step-${i}`;
    const locMeta = `{ strategy: ${quote(step.locator.strategy)}, value: ${quote(step.locator.value)} }`;
    const edgeIdArg = step.edgeId !== undefined ? quote(step.edgeId) : 'undefined';
    lines.push(`    // Step ${i + 1}: ${step.description}`);
    lines.push(`    await logStep(driver, ${quote(stepId)}, ${quote(step.type)}, ${locMeta}, ${edgeIdArg}, async () => {`);

    const evidenceLines = emitStepWithEvidence(step);
    for (const l of evidenceLines) {
      lines.push(`      ${l}`);
    }
    lines.push(`    });`);
    lines.push(``);
  }
  // Milestone screenshot: after all action steps
  lines.push(`    await captureScreenshot(driver, 'milestone_after-steps');`);
  lines.push(``);

  // Post-conditions — each wrapped in logStep (no elementFound/domEvidence — assertion-based)
  for (let pi = 0; pi < plan.postConditions.length; pi++) {
    const post = plan.postConditions[pi]!;
    const stepId = `post-${pi}`;
    lines.push(`    await logStep(driver, ${quote(stepId)}, ${quote(`postcondition:${post.type}`)}, undefined, undefined, async () => {`);
    const postLines = emitPostCondition(post);
    for (const l of postLines) {
      lines.push(`      ${l}`);
    }
    lines.push(`      return {};`);
    lines.push(`    });`);
    lines.push(``);
  }

  // Drain CDP network logs once at test end and attribute to steps by timestamp
  lines.push(`    await drainNetworkLogs();`);
  lines.push(`    _attributeNetworkEvidence();`);
  // Milestone screenshot: test complete
  lines.push(`    await captureScreenshot(driver, 'milestone_final');`);
  lines.push(`    console.log('Test PASSED: ${escapeString(plan.workflowId)}');`);
  lines.push(`    writeExecutionLog('PASS');`);
  lines.push(`  } catch (testError: any) {`);
  lines.push(`    try { await drainNetworkLogs(); _attributeNetworkEvidence(); } catch { /* best effort */ }`);
  lines.push(`    await captureScreenshot(driver, 'milestone_error');`);
  lines.push(`    const failedStep = _stepLogs.length > 0 ? _stepLogs[_stepLogs.length - 1]?.stepId : undefined;`);
  lines.push(`    writeExecutionLog('FAIL', failedStep);`);
  lines.push(`    throw testError;`);
  lines.push(`  } finally {`);
  lines.push(`    await driver.quit();`);
  lines.push(`  }`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`(async () => {`);
  lines.push(`  try {`);
  lines.push(`    await runTest();`);
  lines.push(`  } catch (err) {`);
  lines.push(`    console.error('Test FAILED: ${escapeString(plan.workflowId)}', err);`);
  lines.push(`    process.exit(1);`);
  lines.push(`  }`);
  lines.push(`})();`);
  lines.push(``);

  return lines.join('\n');
}

/**
 * Extract locator metadata from a PreCondition for logging purposes.
 * Returns a JS expression string or 'undefined'.
 */
function _preConditionLocatorMeta(pre: PreCondition): string {
  switch (pre.type) {
    case 'auth-setup':
      return `{ strategy: 'css', value: ${quote(String(pre.config['submitButton'] ?? 'button[type="submit"]'))} }`;
    case 'navigate-to-route':
      return `{ strategy: 'url', value: ${quote(String(pre.config['url'] ?? '/'))} }`;
    case 'trigger-dialog-open':
      return `{ strategy: 'css', value: ${quote(String(pre.config['openerSelector'] ?? ''))} }`;
    default:
      return 'undefined';
  }
}

/**
 * Batch: emit tests for all plans. Returns workflowId → code map.
 */
export function emitTestSet(
  plans: ActionPlan[],
  baseUrl: string,
  opts?: EmitOptions,
): Map<string, string> {
  const result = new Map<string, string>();
  for (const plan of plans) {
    result.set(plan.workflowId, emitTest(plan, baseUrl, opts));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Locator emission
// ---------------------------------------------------------------------------

/**
 * Convert a ScopedLocator to a Selenium `By` expression string.
 */
export function emitLocator(loc: ScopedLocator): string {
  switch (loc.strategy) {
    case 'id':
      return `By.id(${quote(loc.value)})`;
    case 'name':
      return `By.name(${quote(loc.value)})`;
    case 'formcontrolname':
      return `By.css(${quote(`[formcontrolname="${loc.value}"]`)})`;
    case 'aria-label':
      return `By.css(${quote(`[aria-label="${loc.value}"]`)})`;
    case 'routerlink':
      return `By.css(${quote(`[routerlink="${loc.value}"]`)})`;
    case 'href':
      return `By.css(${quote(`[href="${loc.value}"]`)})`;
    case 'placeholder':
      return `By.css(${quote(`[placeholder="${loc.value}"]`)})`;
    case 'data-testid':
      return `By.css(${quote(`[data-testid="${loc.value}"]`)})`;
    case 'linktext':
      return `By.linkText(${quote(loc.value)})`;
    case 'tag-position': {
      const parsed = parseTagPosition(loc.value);
      return `By.css(${quote(`${parsed.tag}:nth-of-type(${parsed.position})`)})`;
    }
    case 'custom':
      return `By.css(${quote(loc.value)})`;
    default:
      return `By.css(${quote(loc.value)})`;
  }
}

/**
 * Emit a full findElement chain, including component/form scoping.
 */
export function emitFindElement(loc: ScopedLocator): string {
  const byExpr = emitLocator(loc);

  if (loc.componentSelector && loc.formSelector) {
    return `await driver.findElement(By.css(${quote(loc.componentSelector)})).findElement(By.css(${quote(loc.formSelector)})).findElement(${byExpr})`;
  }
  if (loc.componentSelector) {
    return `await driver.findElement(By.css(${quote(loc.componentSelector)})).findElement(${byExpr})`;
  }
  if (loc.formSelector) {
    return `await driver.findElement(By.css(${quote(loc.formSelector)})).findElement(${byExpr})`;
  }
  return `await driver.findElement(${byExpr})`;
}

// ---------------------------------------------------------------------------
// PreCondition emission
// ---------------------------------------------------------------------------

export function emitPreCondition(
  pre: PreCondition,
  assignment: Assignment,
  _baseUrl: string,
): string[] {
  const lines: string[] = [];

  switch (pre.type) {
    case 'auth-setup': {
      lines.push(`// PreCondition: auth-setup`);
      const loginRoute = pre.config['loginRoute'] ?? '/login';
      const usernameField = pre.config['usernameField'] ?? '#username';
      const passwordField = pre.config['passwordField'] ?? '#password';
      const submitButton = pre.config['submitButton'] ?? 'button[type="submit"]';
      const authSuccessSelector = pre.config['authSuccessSelector'] ?? '';
      const username = assignment.account?.username ?? '';
      const password = assignment.account?.password ?? '';

      lines.push(`await driver.get(BASE_URL + ${quote(loginRoute)});`);
      lines.push(`{`);
      lines.push(`  const usernameEl = await driver.findElement(By.css(${quote(usernameField)}));`);
      lines.push(`  await usernameEl.clear();`);
      lines.push(`  await usernameEl.sendKeys(${quote(username)});`);
      lines.push(`  const passwordEl = await driver.findElement(By.css(${quote(passwordField)}));`);
      lines.push(`  await passwordEl.clear();`);
      lines.push(`  await passwordEl.sendKeys(${quote(password)});`);
      lines.push(`  const submitEl = await driver.findElement(By.css(${quote(submitButton)}));`);
      lines.push(`  await submitEl.click();`);
      // Auth success verification: poll for the authSuccessSelector element.
      // This is the SOLE success signal — the auth precondition is PASS only when
      // this element appears in the DOM. URL change is not sufficient.
      // Zero implicit wait during polling to avoid 10s delay per iteration.
      if (authSuccessSelector) {
        lines.push(`  await driver.manage().setTimeouts({ implicit: 0 });`);
        lines.push(`  await driver.wait(async () => {`);
        lines.push(`    const els = await driver.findElements(By.css(${quote(authSuccessSelector)}));`);
        lines.push(`    return els.length > 0;`);
        lines.push(`  }, AUTH_WAIT, ${quote(`Auth success element not found: ${authSuccessSelector}`)});`);
        lines.push(`  await driver.manage().setTimeouts({ implicit: IMPLICIT_WAIT });`);
      }
      lines.push(`}`);
      break;
    }

    case 'navigate-to-route': {
      lines.push(`// PreCondition: navigate-to-route`);
      const url = pre.config['url'] ?? '/';
      lines.push(`await driver.get(BASE_URL + ${quote(url)});`);
      lines.push(`await driver.wait(until.elementLocated(By.css('body')), NAVIGATION_WAIT);`);
      break;
    }

    case 'trigger-dialog-open': {
      lines.push(`// PreCondition: trigger-dialog-open`);
      const openerSelector = pre.config['openerSelector'] ?? '';
      const dialogSelector = pre.config['dialogSelector'] ?? '';
      const openerWidgetSelector = pre.config['openerWidgetSelector'] as string | undefined;
      if (openerSelector) {
        lines.push(`{`);
        if (openerWidgetSelector !== undefined && openerWidgetSelector !== '') {
          // F4: Click the specific opener widget. Supports three locator forms:
          // - "text:Add" → XPath text match (structurally grounded in template text)
          // - "tag:N" → CSS nth-of-type
          // - CSS selector → direct CSS
          const textMatch = openerWidgetSelector.match(/^text:(.+)$/);
          const colonMatch = openerWidgetSelector.match(/^([a-zA-Z][a-zA-Z0-9-]*):(\d+)$/);
          if (textMatch) {
            const textContent = textMatch[1]!;
            lines.push(`  const openerWidget = await driver.findElement(By.css(${quote(openerSelector)})).findElement(By.xpath(${quote(`.//button[normalize-space()='${textContent}']`)}));`);
          } else if (colonMatch) {
            const resolvedOpenerSelector = `${colonMatch[1]}:nth-of-type(${colonMatch[2]})`;
            lines.push(`  const openerWidget = await driver.findElement(By.css(${quote(openerSelector)})).findElement(By.css(${quote(resolvedOpenerSelector)}));`);
          } else {
            lines.push(`  const openerWidget = await driver.findElement(By.css(${quote(openerSelector)})).findElement(By.css(${quote(openerWidgetSelector)}));`);
          }
          lines.push(`  await driver.executeScript('arguments[0].click()', openerWidget);`);
        } else {
          lines.push(`  const opener = await driver.findElement(By.css(${quote(openerSelector)}));`);
          lines.push(`  await driver.executeScript('arguments[0].click()', opener);`);
        }
        if (dialogSelector) {
          lines.push(`  await driver.wait(until.elementLocated(By.css(${quote(dialogSelector)})), IMPLICIT_WAIT);`);
        } else {
          lines.push(`  await driver.sleep(500);`);
        }
        lines.push(`}`);
      }
      break;
    }
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Step emission
// ---------------------------------------------------------------------------

export function emitStep(step: ActionStep): string[] {
  const lines: string[] = [];
  const findEl = emitFindElement(step.locator);

  switch (step.type) {
    case 'click':
      lines.push(`{`);
      lines.push(`  const el = ${findEl};`);
      if ((step.description ?? '').startsWith('Native-click')) {
        // Angular Material radio buttons require native DOM click to trigger
        // Zone.js event pipeline. JS executeScript synthetic clicks bypass Angular
        // change detection and don't update form controls.
        lines.push(`  await el.click();`);
      } else {
        lines.push(`  // Use JS click to bypass click-interception (e.g. Bootstrap custom checkboxes)`);
        lines.push(`  await driver.executeScript('arguments[0].click()', el);`);
      }
      lines.push(`}`);
      break;

    case 'type': {
      lines.push(`{`);
      lines.push(`  const el = ${findEl};`);
      const isFilePath = (step.value ?? '').startsWith('/') || (step.value ?? '').match(/^[A-Z]:\\/);
      // Native date/time inputs: use executeScript to set value directly.
      // Chrome's sendKeys interprets characters into MM/DD/YYYY segments, producing garbled dates.
      const isNativeDateInput = (step.description ?? '').startsWith('Set date') ||
                                (step.description ?? '').startsWith('Set time') ||
                                (step.description ?? '').startsWith('Set month') ||
                                (step.description ?? '').startsWith('Set week') ||
                                (step.description ?? '').startsWith('Set datetime');
      if (isFilePath) {
        lines.push(`  await el.sendKeys(path.resolve(${quote(step.value ?? '')}));`);
      } else if (isNativeDateInput) {
        lines.push(`  await driver.executeScript("arguments[0].value = arguments[1]; arguments[0].dispatchEvent(new Event('input', {bubbles:true})); arguments[0].dispatchEvent(new Event('change', {bubbles:true}));", el, ${quote(step.value ?? '')});`);
      } else {
        lines.push(`  await el.sendKeys(${quote(step.value ?? '')});`);
      }
      lines.push(`}`);
      break;
    }

    case 'clear-and-type': {
      lines.push(`{`);
      lines.push(`  const el = ${findEl};`);
      lines.push(`  try { await el.clear(); } catch { /* readonly/datepicker: skip clear */ }`);
      // For native <input type="date">, reformat ISO YYYY-MM-DD to MMDDYYYY.
      // Chrome's date input processes sendKeys per-character into MM/DD/YYYY segments.
      // Sending '2024-01-01' garbles the segments; '01012024' fills them correctly.
      const val = step.value ?? '';
      const isoDateMatch = val.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const isDateInput = step.locator.tagName === 'input' &&
        ((step.description ?? '').includes('date') || (step.description ?? '').includes('Date'));
      if (isoDateMatch && isDateInput) {
        const reformatted = `${isoDateMatch[2]}${isoDateMatch[3]}${isoDateMatch[1]}`;
        lines.push(`  await el.sendKeys(${quote(reformatted)});`);
      } else {
        lines.push(`  await el.sendKeys(${quote(val)});`);
      }
      lines.push(`}`);
      break;
    }

    case 'submit':
      // Try native click on the submit button (triggers Angular's ngSubmit correctly).
      // If click is intercepted by an overlay (e.g. Material ripple), fall back to
      // JS click which bypasses interception.
      lines.push(`{`);
      lines.push(`  const form = ${findEl};`);
      lines.push(`  const submitBtn = await form.findElement(By.css('button[type="submit"], input[type="submit"], button:not([type])'));`);
      lines.push(`  try { await submitBtn.click(); } catch { await driver.executeScript('arguments[0].click()', submitBtn); }`);
      lines.push(`}`);
      break;

    case 'select-option':
      if (step.locator.tagName === 'mat-select') {
        // Angular Material: click to open dropdown, wait for mat-option panel in overlay, click first option
        lines.push(`{`);
        lines.push(`  const matSelect = ${findEl};`);
        lines.push(`  await matSelect.click();`);
        lines.push(`  await driver.wait(until.elementLocated(By.css('mat-option')), IMPLICIT_WAIT);`);
        lines.push(`  const firstOption = await driver.findElement(By.css('mat-option'));`);
        lines.push(`  await firstOption.click();`);
        lines.push(`}`);
      } else {
        // Native HTML select: click to show options, select the first available option.
        // A1 captures option children as Widget nodes; index-based selection (first option)
        // is the deterministic safe default.
        lines.push(`{`);
        lines.push(`  const el = ${findEl};`);
        lines.push(`  await el.click();`);
        lines.push(`  const option = await el.findElement(By.css('option:nth-of-type(1)'));`);
        lines.push(`  await option.click();`);
        lines.push(`}`);
      }
      break;

    case 'navigate':
      lines.push(`await driver.get(BASE_URL + ${quote(step.value ?? '/')});`);
      break;

    case 'wait-for-navigation':
      lines.push(`await driver.wait(until.urlContains(${quote(step.value ?? '/')}), NAVIGATION_WAIT);`);
      break;

    case 'wait-for-dialog':
      lines.push(`{`);
      lines.push(`  const dialogLocator = ${emitLocator(step.locator)};`);
      lines.push(`  await driver.wait(until.elementLocated(dialogLocator), IMPLICIT_WAIT);`);
      lines.push(`}`);
      break;

    case 'wait-for-element':
      lines.push(`{`);
      lines.push(`  const elLocator = ${emitLocator(step.locator)};`);
      lines.push(`  await driver.wait(until.elementLocated(elLocator), IMPLICIT_WAIT);`);
      lines.push(`}`);
      break;
  }

  return lines;
}

/**
 * Emit step code with honest elementFound and real domEvidence capture.
 * Returns the step body lines including an explicit return statement.
 *
 * For element-based steps (click, type, clear-and-type, submit, select-option):
 *   - finds the element
 *   - captures outerHTML snippet via getDomEvidence()
 *   - performs the action
 *   - returns { elementFound: true, domEvidence }
 *
 * For non-element steps (navigate, wait-for-*):
 *   - performs the action
 *   - returns { elementFound: false } (no element was targeted)
 */
function emitStepWithEvidence(step: ActionStep): string[] {
  const lines: string[] = [];
  const findEl = emitFindElement(step.locator);

  switch (step.type) {
    case 'click': {
      lines.push(`const _el = ${findEl};`);
      lines.push(`const _ev = await getElementEvidence(driver, _el);`);
      if ((step.description ?? '').startsWith('Native-click')) {
        lines.push(`await _el.click();`);
      } else {
        lines.push(`await driver.executeScript('arguments[0].click()', _el);`);
      }
      lines.push(`return { elementFound: true, ..._ev };`);
      break;
    }

    case 'type': {
      lines.push(`const _el = ${findEl};`);
      lines.push(`const _ev = await getElementEvidence(driver, _el);`);
      const isFilePath = (step.value ?? '').startsWith('/') || (step.value ?? '').match(/^[A-Z]:\\/);
      const isNativeDateInput = (step.description ?? '').startsWith('Set date') ||
                                (step.description ?? '').startsWith('Set time') ||
                                (step.description ?? '').startsWith('Set month') ||
                                (step.description ?? '').startsWith('Set week') ||
                                (step.description ?? '').startsWith('Set datetime');
      if (isFilePath) {
        lines.push(`await _el.sendKeys(path.resolve(${quote(step.value ?? '')}));`);
      } else if (isNativeDateInput) {
        lines.push(`await driver.executeScript("arguments[0].value = arguments[1]; arguments[0].dispatchEvent(new Event('input', {bubbles:true})); arguments[0].dispatchEvent(new Event('change', {bubbles:true}));", _el, ${quote(step.value ?? '')});`);
      } else {
        lines.push(`await _el.sendKeys(${quote(step.value ?? '')});`);
      }
      lines.push(`return { elementFound: true, ..._ev };`);
      break;
    }

    case 'clear-and-type': {
      lines.push(`const _el = ${findEl};`);
      lines.push(`const _ev = await getElementEvidence(driver, _el);`);
      lines.push(`try { await _el.clear(); } catch { /* readonly/datepicker: skip clear */ }`);
      const val = step.value ?? '';
      const isoDateMatch = val.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const isDateInput = step.locator.tagName === 'input' &&
        ((step.description ?? '').includes('date') || (step.description ?? '').includes('Date'));
      if (isoDateMatch && isDateInput) {
        const reformatted = `${isoDateMatch[2]}${isoDateMatch[3]}${isoDateMatch[1]}`;
        lines.push(`await _el.sendKeys(${quote(reformatted)});`);
      } else {
        lines.push(`await _el.sendKeys(${quote(val)});`);
      }
      lines.push(`return { elementFound: true, ..._ev };`);
      break;
    }

    case 'submit':
      lines.push(`const _form = ${findEl};`);
      lines.push(`const _submitBtn = await _form.findElement(By.css('button[type="submit"], input[type="submit"], button:not([type])'));`);
      lines.push(`const _ev = await getElementEvidence(driver, _submitBtn);`);
      lines.push(`try { await _submitBtn.click(); } catch { await driver.executeScript('arguments[0].click()', _submitBtn); }`);
      lines.push(`return { elementFound: true, ..._ev };`);
      break;

    case 'select-option':
      if (step.locator.tagName === 'mat-select') {
        lines.push(`const _matSelect = ${findEl};`);
        lines.push(`const _ev = await getElementEvidence(driver, _matSelect);`);
        lines.push(`await _matSelect.click();`);
        lines.push(`await driver.wait(until.elementLocated(By.css('mat-option')), IMPLICIT_WAIT);`);
        lines.push(`const _firstOption = await driver.findElement(By.css('mat-option'));`);
        lines.push(`await _firstOption.click();`);
        lines.push(`return { elementFound: true, ..._ev };`);
      } else {
        lines.push(`const _el = ${findEl};`);
        lines.push(`const _ev = await getElementEvidence(driver, _el);`);
        lines.push(`await _el.click();`);
        lines.push(`const _option = await _el.findElement(By.css('option:nth-of-type(1)'));`);
        lines.push(`await _option.click();`);
        lines.push(`return { elementFound: true, ..._ev };`);
      }
      break;

    case 'navigate':
      lines.push(`await driver.get(BASE_URL + ${quote(step.value ?? '/')});`);
      lines.push(`return {};`);
      break;

    case 'wait-for-navigation':
      lines.push(`await driver.wait(until.urlContains(${quote(step.value ?? '/')}), NAVIGATION_WAIT);`);
      lines.push(`return {};`);
      break;

    case 'wait-for-dialog': {
      const dialogFindEl = emitFindElement(step.locator);
      lines.push(`await driver.wait(until.elementLocated(${emitLocator(step.locator)}), IMPLICIT_WAIT);`);
      lines.push(`const _found = ${dialogFindEl};`);
      lines.push(`const _ev = await getElementEvidence(driver, _found);`);
      lines.push(`return { elementFound: true, ..._ev };`);
      break;
    }

    case 'wait-for-element': {
      // Use the SAME scoped locator as the subsequent action step to prevent
      // wait/action semantic drift (UserSearch bug: wait found header button,
      // action scoped to form found nothing).
      const scopedFindEl = emitFindElement(step.locator);
      lines.push(`await driver.wait(async () => {`);
      lines.push(`  try { await (${scopedFindEl}); return true; } catch { return false; }`);
      lines.push(`}, IMPLICIT_WAIT);`);
      lines.push(`const _found = ${scopedFindEl};`);
      lines.push(`const _ev = await getElementEvidence(driver, _found);`);
      lines.push(`return { elementFound: true, ..._ev };`);
      break;
    }

    default:
      lines.push(`return {};`);
  }

  return lines;
}

// ---------------------------------------------------------------------------
// PostCondition emission
// ---------------------------------------------------------------------------

export function emitPostCondition(post: PostCondition): string[] {
  const lines: string[] = [];

  switch (post.type) {
    case 'assert-url-matches': {
      lines.push(`// PostCondition: assert-url-matches`);
      const expected = post.expected ?? '/';
      if (expected.startsWith('http://') || expected.startsWith('https://')) {
        // External URL — check exact match
        lines.push(`{`);
        lines.push(`  const currentUrl = await driver.getCurrentUrl();`);
        lines.push(`  assert.ok(`);
        lines.push(`    currentUrl.includes(${quote(expected)}),`);
        lines.push(`    \`Expected URL to contain ${escapeTemplate(expected)}, got \${currentUrl}\``);
        lines.push(`  );`);
        lines.push(`}`);
      } else if (expected.includes(':')) {
        // Route-template assertion — terminal URL has server-generated params.
        // Convert :param placeholders to regex wildcards for flexible matching.
        const pattern = expected.replace(/:[a-zA-Z_][a-zA-Z0-9_]*/g, '[^/]+');
        lines.push(`{`);
        lines.push(`  await driver.wait(async () => {`);
        lines.push(`    const url = await driver.getCurrentUrl();`);
        lines.push(`    return ${quote(pattern)} !== '' && new RegExp(${quote(pattern)}).test(url);`);
        lines.push(`  }, NAVIGATION_WAIT, ${quote(`Expected URL to match pattern ${expected}`)});`);
        lines.push(`}`);
      } else {
        // Internal route — check path suffix
        lines.push(`{`);
        lines.push(`  await driver.wait(async () => {`);
        lines.push(`    const url = await driver.getCurrentUrl();`);
        lines.push(`    return url.includes(${quote(expected)});`);
        lines.push(`  }, NAVIGATION_WAIT, ${quote(`Expected URL to contain ${expected}`)});`);
        lines.push(`}`);
      }
      break;
    }

    case 'assert-url-matches-or-unchanged': {
      lines.push(`// PostCondition: assert-url-matches-or-unchanged (conditional navigation)`);
      const expectedCond = post.expected ?? '/';
      const fallbackCond = post.fallback ?? '/';
      lines.push(`{`);
      lines.push(`  await driver.wait(async () => {`);
      lines.push(`    const url = await driver.getCurrentUrl();`);
      lines.push(`    return url.includes(${quote(expectedCond)}) || url.includes(${quote(fallbackCond)});`);
      lines.push(`  }, NAVIGATION_WAIT, ${quote(`Expected URL to contain ${expectedCond} or ${fallbackCond}`)});`);
      lines.push(`}`);
      break;
    }

    case 'assert-no-crash':
      lines.push(`// PostCondition: assert-no-crash`);
      lines.push(`{`);
      lines.push(`  const title = await driver.getTitle();`);
      lines.push(`  assert.ok(typeof title === 'string', 'Page should have a title (no crash)');`);
      lines.push(`  const body = await driver.findElement(By.css('body'));`);
      lines.push(`  assert.ok(body !== null, 'Page should have a body element (no crash)');`);
      lines.push(`}`);
      break;
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseTagPosition(value: string): { tag: string; position: number } {
  // Format: "tagName:N" e.g. "button:3" (from B1 stableIndex + 1)
  const colonMatch = value.match(/^([a-zA-Z][a-zA-Z0-9-]*):(\d+)$/);
  if (colonMatch) {
    return { tag: colonMatch[1]!, position: parseInt(colonMatch[2]!, 10) };
  }
  // Legacy format: "tagName[n]" e.g. "button[3]"
  const bracketMatch = value.match(/^([a-zA-Z][a-zA-Z0-9-]*)\[(\d+)\]$/);
  if (bracketMatch) {
    return { tag: bracketMatch[1]!, position: parseInt(bracketMatch[2]!, 10) };
  }
  // Fallback: treat as tag at position 1
  return { tag: value, position: 1 };
}

function quote(s: string): string {
  return `'${escapeString(s)}'`;
}

function escapeString(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

function escapeTemplate(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$');
}
