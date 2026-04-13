/**
 * b3-runner.ts
 * Main B3 runner: readiness check + sequential test execution + result aggregation.
 * Spec: §B3 — sequential per subject, bounded retry, strict failure classification.
 *
 * Supports: batching, resume, failed-only rerun, selective workflow execution,
 * and guaranteed Chrome/temp cleanup after each test.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import type { B3Config, B3Progress, B3ResultSet, ExecutionResult } from './b3-types.js';
import { checkReadiness } from './readiness-checker.js';
import { executeTest } from './test-executor.js';

interface B2TestEntry {
  workflowId: string;
  fileName: string;
}

/** Minimal plan metadata needed for adaptive timeout computation. */
interface PlanMetadata {
  workflowId: string;
  hasAuth: boolean;
  preConditionCount: number;
  stepCount: number;
  postConditionCount: number;
}

/**
 * Compute per-test timeout from plan structural characteristics.
 * Budget: authWait + (steps × implicitWait) + (navEvents × navigationWait) + buffer
 */
function computeTestTimeout(meta: PlanMetadata | undefined, config: B3Config): number {
  if (meta === undefined) return config.testTimeoutMs; // fallback to global
  const implicitWait = 5000;   // matches B2 emitter default
  const navigationWait = 10000; // matches B2 emitter default
  const authWait = 15000;       // matches B2 emitter default
  const bufferMs = 15000;       // Chrome startup + misc overhead

  const authBudget = meta.hasAuth ? authWait : 0;
  const stepBudget = meta.stepCount * implicitWait;
  const navBudget = (meta.preConditionCount + meta.postConditionCount) * navigationWait;

  return authBudget + stepBudget + navBudget + bufferMs;
}

// ---------------------------------------------------------------------------
// Chrome / temp-profile cleanup
// ---------------------------------------------------------------------------

/**
 * Kill orphaned chrome.exe and chromedriver.exe processes and remove
 * fresh scoped_dir* temp profiles. Called after each test to prevent
 * accumulation during long suites.
 */
function cleanupChromeProcesses(): void {
  if (process.platform !== 'win32') return;
  try {
    // Kill chromedriver first, then chrome
    try { execSync('taskkill //IM chromedriver.exe //F //T', { stdio: 'pipe', timeout: 15000 }); } catch { /* none running */ }
    try { execSync('taskkill //IM chrome.exe //F //T', { stdio: 'pipe', timeout: 15000 }); } catch { /* none running */ }
  } catch { /* best effort */ }
}

/**
 * Remove scoped_dir* temp Chrome profiles that have accumulated.
 * Only deletes dirs created recently (within the last 30 minutes) to
 * avoid touching user's own Chrome profiles.
 */
function cleanupTempProfiles(): void {
  if (process.platform !== 'win32') return;
  const tempDir = process.env['LOCALAPPDATA'];
  if (tempDir === undefined) return;
  const tempPath = path.join(tempDir, 'Temp');
  try {
    const entries = fs.readdirSync(tempPath).filter(e => e.startsWith('scoped_dir'));
    // Batch delete — don't try to be selective, these are all test artifacts
    for (const entry of entries) {
      try { fs.rmSync(path.join(tempPath, entry), { recursive: true, force: true }); } catch { /* in use */ }
    }
  } catch { /* best effort */ }
}

/**
 * Full post-test cleanup: kill Chrome, clean temps.
 */
function postTestCleanup(): void {
  cleanupChromeProcesses();
  // Give OS a moment to release handles before cleaning dirs
  try { execSync('timeout /T 1 /NOBREAK >NUL 2>&1', { stdio: 'pipe', timeout: 3000 }); } catch { /* ok */ }
  cleanupTempProfiles();
}

// ---------------------------------------------------------------------------
// Test file provisioning
// ---------------------------------------------------------------------------

function provisionTestFile(): void {
  const candidates = ['/tmp/test-file.txt'];
  if (process.platform === 'win32') {
    candidates.push('C:\\tmp\\test-file.txt');
  }
  for (const filePath of candidates) {
    try {
      const dir = path.dirname(filePath);
      fs.mkdirSync(dir, { recursive: true });
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, 'test file content for B3 execution\n');
      }
    } catch { /* best effort */ }
  }
}

// ---------------------------------------------------------------------------
// Progress persistence (for resume)
// ---------------------------------------------------------------------------

function progressPath(outputDir: string): string {
  return path.join(outputDir, 'json', 'b3-progress.json');
}

function loadProgress(outputDir: string): B3Progress | undefined {
  const pp = progressPath(outputDir);
  if (!fs.existsSync(pp)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(pp, 'utf-8')) as B3Progress;
  } catch { return undefined; }
}

function saveProgress(outputDir: string, progress: B3Progress): void {
  const jsonDir = path.join(outputDir, 'json');
  fs.mkdirSync(jsonDir, { recursive: true });
  fs.writeFileSync(progressPath(outputDir), JSON.stringify(progress, null, 2));
}

function deleteProgress(outputDir: string): void {
  const pp = progressPath(outputDir);
  try { fs.unlinkSync(pp); } catch { /* ok */ }
}

// ---------------------------------------------------------------------------
// Test selection
// ---------------------------------------------------------------------------

/** @internal Exported for testing. */
export function selectTests(
  allTests: B2TestEntry[],
  config: B3Config,
): { toRun: B2TestEntry[]; resumed: ExecutionResult[] } {
  const skipSet = new Set(config.skipWorkflows ?? []);
  let eligible = allTests.filter(t => !skipSet.has(t.workflowId));
  let resumed: ExecutionResult[] = [];

  // --only: restrict to specific workflow IDs
  if (config.onlyWorkflows !== undefined && config.onlyWorkflows.length > 0) {
    const onlySet = new Set(config.onlyWorkflows);
    eligible = eligible.filter(t => onlySet.has(t.workflowId));
  }

  // --failed-only: restrict to tests that failed in prior b3-results.json
  if (config.failedOnly === true) {
    const resultsPath = path.join(config.outputDir, 'json', 'b3-results.json');
    if (fs.existsSync(resultsPath)) {
      const prior = JSON.parse(fs.readFileSync(resultsPath, 'utf-8')) as B3ResultSet;
      const failedFiles = new Set(
        prior.results.filter(r => r.outcome !== 'PASS').map(r => r.testFile),
      );
      // Keep prior passing results for merge
      resumed = prior.results.filter(r => r.outcome === 'PASS');
      eligible = eligible.filter(t => failedFiles.has(t.fileName));
    }
  }

  // --resume: skip already-completed tests from b3-progress.json
  if (config.resume === true) {
    const progress = loadProgress(config.outputDir);
    if (progress !== undefined) {
      const completedFiles = new Set(progress.completed.map(r => r.testFile));
      resumed = [...resumed, ...progress.completed];
      eligible = eligible.filter(t => !completedFiles.has(t.fileName));
    }
  }

  return { toRun: eligible, resumed };
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

export async function runB3(config: B3Config): Promise<B3ResultSet> {
  const runTimestamp = new Date().toISOString();
  const logLines: string[] = [];

  provisionTestFile();

  const mode = config.failedOnly ? 'failed-only'
    : config.resume ? 'resume'
    : config.onlyWorkflows?.length ? 'selective'
    : 'full';

  logLines.push(`B3 execution starting for ${config.subjectName} (mode: ${mode})`);
  logLines.push(`  baseUrl: ${config.baseUrl}`);
  logLines.push(`  testsDir: ${config.testsDir}`);
  logLines.push(`  maxRetries: ${config.maxRetries}`);
  if (config.batchSize) logLines.push(`  batchSize: ${config.batchSize}`);

  // --- Step 1: Readiness check ---
  logLines.push('');
  logLines.push('Readiness check…');
  const readiness = await checkReadiness(config.baseUrl, config.readinessTimeoutMs);
  logLines.push(`  passed: ${readiness.passed} (${readiness.durationMs}ms)`);
  if (readiness.error) logLines.push(`  error: ${readiness.error}`);

  if (!readiness.passed) {
    const b2Tests = loadB2Tests(config.outputDir);
    const results: ExecutionResult[] = b2Tests.map(t => ({
      workflowId: t.workflowId,
      testFile: t.fileName,
      outcome: 'FAIL_APP_NOT_READY' as const,
      attempts: 0,
      durationMs: 0,
      ...(readiness.error !== undefined ? { error: readiness.error } : {}),
      attemptDetails: [],
      screenshots: [],
    }));

    const resultSet: B3ResultSet = {
      subject: config.subjectName,
      baseUrl: config.baseUrl,
      runTimestamp,
      readinessCheck: readiness,
      results,
      stats: {
        total: results.length,
        passed: 0,
        failed: 0,
        skipped: 0,
        appNotReady: results.length,
        totalDurationMs: readiness.durationMs,
      },
    };

    writeResults(config.outputDir, resultSet, logLines);
    return resultSet;
  }

  // --- Step 2: Select tests ---
  const allTests = loadB2Tests(config.outputDir);
  const planMeta = loadPlanMetadata(config.outputDir);
  const { toRun, resumed } = selectTests(allTests, config);

  logLines.push('');
  logLines.push(`Tests total: ${allTests.length}, to run: ${toRun.length}, resumed: ${resumed.length}`);

  // --- Step 3: Execute tests sequentially with cleanup ---
  const results: ExecutionResult[] = [...resumed];
  let passCount = resumed.filter(r => r.outcome === 'PASS').length;
  let failCount = resumed.filter(r => r.outcome !== 'PASS').length;
  let skipCount = 0;
  const executionStart = Date.now();
  const batchSize = config.batchSize ?? 0;
  let batchCounter = 0;

  // Initialize progress for resume support
  const progress: B3Progress = {
    subject: config.subjectName,
    startedAt: runTimestamp,
    completed: [...resumed],
    remaining: toRun.map(t => t.fileName),
  };

  // Pre-run cleanup: Chrome processes + stale per-test logs/screenshots
  cleanupChromeProcesses();
  if (mode === 'full') {
    cleanStaleRunArtifacts(config.outputDir);
    logLines.push('Cleaned stale logs and screenshots for fresh run.');
  }

  for (const test of toRun) {
    const testFilePath = path.join(config.testsDir, test.fileName);
    if (!fs.existsSync(testFilePath)) {
      logLines.push(`  [MISSING] ${test.fileName}`);
      const missingResult: ExecutionResult = {
        workflowId: test.workflowId,
        testFile: test.fileName,
        outcome: 'FAIL_UNKNOWN',
        attempts: 0,
        durationMs: 0,
        error: `Test file not found: ${testFilePath}`,
        attemptDetails: [],
        screenshots: [],
      };
      results.push(missingResult);
      progress.completed.push(missingResult);
      progress.remaining = progress.remaining.filter(f => f !== test.fileName);
      saveProgress(config.outputDir, progress);
      failCount++;
      continue;
    }

    const testScreenDir = path.join(
      config.screenshotDir,
      test.fileName.replace(/\.test\.ts$/, ''),
    );

    const meta = planMeta.get(test.workflowId);
    const testTimeout = computeTestTimeout(meta, config);
    logLines.push(`  [RUN] ${test.fileName} (${results.length + 1 - resumed.length}/${toRun.length}) timeout=${testTimeout}ms`);
    const result = await executeTest({
      testFilePath,
      workflowId: test.workflowId,
      testFileName: test.fileName,
      screenshotDir: testScreenDir,
      maxRetries: config.maxRetries,
      testTimeoutMs: testTimeout,
      ...(config.preAttemptCommand ? { preAttemptCommand: config.preAttemptCommand } : {}),
    });

    // --- Integrity check: verify per-test log was written and agrees with exit code ---
    const verifiedResult = verifyTestIntegrity(result, config.outputDir, runTimestamp);
    results.push(verifiedResult);
    progress.completed.push(verifiedResult);
    progress.remaining = progress.remaining.filter(f => f !== test.fileName);

    if (verifiedResult.outcome === 'PASS') {
      passCount++;
      logLines.push(`    → PASS (${verifiedResult.durationMs}ms, ${verifiedResult.attempts} attempt(s))`);
    } else {
      failCount++;
      logLines.push(`    → ${verifiedResult.outcome} (${verifiedResult.durationMs}ms, ${verifiedResult.attempts} attempt(s))`);
      if (verifiedResult.error) logLines.push(`      error: ${verifiedResult.error.slice(0, 200)}`);
    }

    // Persist progress after each test (enables resume on interruption)
    saveProgress(config.outputDir, progress);

    // Post-test Chrome cleanup: guaranteed after every test
    postTestCleanup();
    batchCounter++;

    // Batch boundary: extra cleanup + optional reset command
    if (batchSize > 0 && batchCounter >= batchSize) {
      logLines.push(`  [BATCH] Completed batch of ${batchSize} tests, deep cleanup`);
      if (config.batchResetCommand) {
        logLines.push(`  [BATCH] Running batchResetCommand...`);
        try {
          execSync(config.batchResetCommand, { stdio: 'pipe', timeout: 60000, shell: process.env['SHELL'] ?? 'cmd.exe' });
          // Wait for service to recover after restart
          const readiness = await checkReadiness(config.baseUrl, config.readinessTimeoutMs);
          logLines.push(`  [BATCH] Reset complete, readiness: ${readiness.passed} (${readiness.durationMs}ms)`);
        } catch (resetErr) {
          logLines.push(`  [BATCH] batchResetCommand failed: ${(resetErr as Error).message?.slice(0, 100)}`);
        }
      }
      batchCounter = 0;
    }
  }

  // Count skipped from original list
  const skipSet = new Set(config.skipWorkflows ?? []);
  for (const test of allTests) {
    if (skipSet.has(test.workflowId)) skipCount++;
  }

  const totalDuration = Date.now() - executionStart + readiness.durationMs;

  // --- Step 4: Aggregate ---
  const resultSet: B3ResultSet = {
    subject: config.subjectName,
    baseUrl: config.baseUrl,
    runTimestamp,
    readinessCheck: readiness,
    results,
    stats: {
      total: allTests.length,
      passed: passCount,
      failed: failCount,
      skipped: skipCount,
      appNotReady: 0,
      totalDurationMs: totalDuration,
    },
  };

  logLines.push('');
  logLines.push(`B3 complete — ${passCount} passed, ${failCount} failed, ${skipCount} skipped`);
  logLines.push(`  total duration: ${totalDuration}ms`);

  writeResults(config.outputDir, resultSet, logLines);

  // Clean up progress file on successful completion
  deleteProgress(config.outputDir);

  return resultSet;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Clean stale per-test logs and screenshots from prior runs.
 * Called before full benchmark runs to prevent stale artifacts from
 * being mistaken for current-run evidence.
 */
function cleanStaleRunArtifacts(outputDir: string): void {
  const logsDir = path.join(outputDir, 'logs');
  if (fs.existsSync(logsDir)) {
    fs.rmSync(logsDir, { recursive: true, force: true });
  }
  fs.mkdirSync(logsDir, { recursive: true });

  const screenshotsDir = path.join(outputDir, 'screenshots');
  if (fs.existsSync(screenshotsDir)) {
    fs.rmSync(screenshotsDir, { recursive: true, force: true });
  }
}

/**
 * Verify execution integrity: per-test log must exist, be fresh, and agree
 * with the subprocess exit code. Downgrades PASS to FAIL_INTEGRITY if evidence
 * chain is broken.
 */
function verifyTestIntegrity(
  result: ExecutionResult,
  outputDir: string,
  runTimestamp: string,
): ExecutionResult {
  if (result.outcome !== 'PASS') return result; // only verify passes

  const logFileName = result.testFile.replace(/\.test\.ts$/, '.log.json');
  const logPath = path.join(outputDir, 'logs', logFileName);

  // Check 1: Log file must exist
  if (!fs.existsSync(logPath)) {
    return {
      ...result,
      outcome: 'FAIL_INTEGRITY',
      error: `Integrity: per-test log missing (${logFileName}). Exit code 0 but no log written.`,
    };
  }

  // Check 2: Log must be from current run (within 60s of run start)
  const logStat = fs.statSync(logPath);
  const runStart = new Date(runTimestamp).getTime();
  const logTime = logStat.mtimeMs;
  if (logTime < runStart - 5000) {
    return {
      ...result,
      outcome: 'FAIL_INTEGRITY',
      error: `Integrity: per-test log is stale (log: ${new Date(logTime).toISOString()}, run: ${runTimestamp}).`,
    };
  }

  // Check 3: Log outcome must agree with exit code
  try {
    const log = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
    if (log.outcome !== 'PASS') {
      return {
        ...result,
        outcome: 'FAIL_INTEGRITY',
        error: `Integrity: exit code 0 but log says ${log.outcome}. Log failedStepId: ${log.failedStepId ?? 'none'}.`,
      };
    }
    // Check 4: Log must have at least one step recorded
    if (!Array.isArray(log.steps) || log.steps.length === 0) {
      return {
        ...result,
        outcome: 'FAIL_INTEGRITY',
        error: 'Integrity: log has no steps recorded. Test may not have executed.',
      };
    }
  } catch (parseErr) {
    return {
      ...result,
      outcome: 'FAIL_INTEGRITY',
      error: `Integrity: per-test log is not valid JSON: ${(parseErr as Error).message?.slice(0, 100)}.`,
    };
  }

  return result; // all checks passed
}

function loadPlanMetadata(outputDir: string): Map<string, PlanMetadata> {
  const result = new Map<string, PlanMetadata>();
  const plansPath = path.join(outputDir, 'json', 'b1-plans.json');
  if (!fs.existsSync(plansPath)) return result;
  try {
    const plans = JSON.parse(fs.readFileSync(plansPath, 'utf-8'));
    const planList = Array.isArray(plans) ? plans : (plans.plans ?? []);
    for (const plan of planList) {
      const hasAuth = (plan.preConditions ?? []).some(
        (p: { type: string }) => p.type === 'auth-setup',
      );
      result.set(plan.workflowId, {
        workflowId: plan.workflowId,
        hasAuth,
        preConditionCount: (plan.preConditions ?? []).length,
        stepCount: (plan.steps ?? []).length,
        postConditionCount: (plan.postConditions ?? []).length,
      });
    }
  } catch { /* best effort — fall back to global timeout */ }
  return result;
}

function loadB2Tests(outputDir: string): B2TestEntry[] {
  const b2Path = path.join(outputDir, 'json', 'b2-tests.json');
  const b2 = JSON.parse(fs.readFileSync(b2Path, 'utf-8'));
  return b2.tests.map((t: { workflowId: string; fileName: string }) => ({
    workflowId: t.workflowId,
    fileName: t.fileName,
  }));
}

function writeResults(outputDir: string, resultSet: B3ResultSet, logLines: string[]): void {
  const jsonDir = path.join(outputDir, 'json');
  fs.mkdirSync(jsonDir, { recursive: true });
  fs.writeFileSync(
    path.join(jsonDir, 'b3-results.json'),
    JSON.stringify(resultSet, null, 2),
  );

  const logsDir = path.resolve('logs');
  fs.mkdirSync(logsDir, { recursive: true });
  fs.writeFileSync(
    path.join(logsDir, 'b3-execution.log'),
    logLines.join('\n') + '\n',
  );
}
