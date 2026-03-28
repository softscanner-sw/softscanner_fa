/**
 * b3-runner.ts
 * Main B3 runner: readiness check + sequential test execution + result aggregation.
 * Spec: §B3 — sequential per subject, bounded retry, strict failure classification.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { B3Config, B3ResultSet, ExecutionResult } from './b3-types.js';
import { checkReadiness } from './readiness-checker.js';
import { executeTest } from './test-executor.js';

interface B2TestEntry {
  workflowId: string;
  fileName: string;
}

/**
 * Provision a deterministic test file for file-input fields.
 * B1/B2 emit `/tmp/test-file.txt` as the placeholder path.
 * On Windows, /tmp doesn't exist — create it at B3 runtime.
 */
function provisionTestFile(): void {
  // B1/B2 emit '/tmp/test-file.txt' as the file-input placeholder.
  // Ensure this file exists on the current platform.
  const candidates = ['/tmp/test-file.txt'];
  if (process.platform === 'win32') {
    // On Windows, /tmp may not exist. Create under C:\tmp and also APPDATA\Temp.
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

/**
 * Run B3 execution for a single subject.
 */
export async function runB3(config: B3Config): Promise<B3ResultSet> {
  const runTimestamp = new Date().toISOString();
  const logLines: string[] = [];

  // Provision test file for file-input fields
  provisionTestFile();

  logLines.push(`B3 execution starting for ${config.subjectName}`);
  logLines.push(`  baseUrl: ${config.baseUrl}`);
  logLines.push(`  testsDir: ${config.testsDir}`);
  logLines.push(`  maxRetries: ${config.maxRetries}`);

  // --- Step 1: Readiness check ---
  logLines.push('');
  logLines.push('Readiness check…');
  const readiness = await checkReadiness(config.baseUrl, config.readinessTimeoutMs);
  logLines.push(`  passed: ${readiness.passed} (${readiness.durationMs}ms)`);
  if (readiness.error) logLines.push(`  error: ${readiness.error}`);

  if (!readiness.passed) {
    // All workflows → FAIL_APP_NOT_READY
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

  // --- Step 2: Load test manifest ---
  const b2Tests = loadB2Tests(config.outputDir);
  const skipSet = new Set(config.skipWorkflows ?? []);

  logLines.push('');
  logLines.push(`Tests to execute: ${b2Tests.length}`);
  if (skipSet.size > 0) logLines.push(`  skipWorkflows: ${skipSet.size}`);

  // --- Step 3: Execute tests sequentially ---
  const results: ExecutionResult[] = [];
  let passCount = 0;
  let failCount = 0;
  let skipCount = 0;
  const executionStart = Date.now();

  for (const test of b2Tests) {
    // Check skip list
    if (skipSet.has(test.workflowId)) {
      skipCount++;
      logLines.push(`  [SKIP] ${test.fileName}`);
      continue;
    }

    const testFilePath = path.join(config.testsDir, test.fileName);
    if (!fs.existsSync(testFilePath)) {
      logLines.push(`  [MISSING] ${test.fileName}`);
      results.push({
        workflowId: test.workflowId,
        testFile: test.fileName,
        outcome: 'FAIL_UNKNOWN',
        attempts: 0,
        durationMs: 0,
        error: `Test file not found: ${testFilePath}`,
        attemptDetails: [],
        screenshots: [],
      });
      failCount++;
      continue;
    }

    // Screenshots are written by the test itself to output/<subject>/screenshots/<testName>/
    const testScreenDir = path.join(
      config.screenshotDir,
      test.fileName.replace(/\.test\.ts$/, ''),
    );

    logLines.push(`  [RUN] ${test.fileName}`);
    const result = await executeTest({
      testFilePath,
      workflowId: test.workflowId,
      testFileName: test.fileName,
      screenshotDir: testScreenDir,
      maxRetries: config.maxRetries,
      testTimeoutMs: config.testTimeoutMs,
      ...(config.preAttemptCommand ? { preAttemptCommand: config.preAttemptCommand } : {}),
    });

    results.push(result);
    if (result.outcome === 'PASS') {
      passCount++;
      logLines.push(`    → PASS (${result.durationMs}ms, ${result.attempts} attempt(s))`);
    } else {
      failCount++;
      logLines.push(`    → ${result.outcome} (${result.durationMs}ms, ${result.attempts} attempt(s))`);
      if (result.error) logLines.push(`      error: ${result.error.slice(0, 200)}`);
    }
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
      total: b2Tests.length,
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
  return resultSet;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
