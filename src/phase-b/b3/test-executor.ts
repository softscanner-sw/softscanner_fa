/**
 * test-executor.ts
 * Per-test subprocess execution with bounded retry.
 * Spec: §B3 — isolated subprocess, sequential, max 3 attempts.
 */

import { execFile } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import type { ExecutionAttempt, ExecutionResult } from './b3-types.js';
import { classifyFailure } from './failure-classifier.js';

export interface TestExecutionConfig {
  testFilePath: string;
  workflowId: string;
  testFileName: string;
  screenshotDir: string;
  maxRetries: number;
  testTimeoutMs: number;
  /** Optional shell command to run before each test attempt (e.g., reset auth lockout). */
  preAttemptCommand?: string;
}

/**
 * Execute a single test file with bounded retry.
 * Each attempt runs the test as a subprocess via tsx.
 */
export async function executeTest(config: TestExecutionConfig): Promise<ExecutionResult> {
  const attempts: ExecutionAttempt[] = [];
  const allScreenshots: string[] = [];
  const totalStart = Date.now();

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    // Run pre-attempt command if configured (e.g., reset auth lockout counters)
    if (config.preAttemptCommand) {
      try {
        const { execSync } = await import('node:child_process');
        execSync(config.preAttemptCommand, { stdio: 'pipe', timeout: 10000, shell: process.env['SHELL'] ?? 'cmd.exe' });
      } catch (hookErr) {
        // Log but don't block — the test should still run
        console.error(`  [WARN] preAttemptCommand failed: ${(hookErr as Error).message?.slice(0, 100)}`);
      }
    }

    const attemptStart = Date.now();
    const result = await runTestSubprocess(
      config.testFilePath,
      config.testTimeoutMs,
    );
    const attemptDuration = Date.now() - attemptStart;

    // Allow filesystem to sync on Windows before collecting screenshots
    await new Promise(r => setTimeout(r, 200));
    // Collect screenshots written by the test to output/<subject>/screenshots/<testName>/
    const screenshots = collectScreenshots(config.screenshotDir);
    allScreenshots.push(...screenshots);

    if (result.exitCode === 0) {
      const attemptResult: ExecutionAttempt = {
        attemptNumber: attempt,
        outcome: 'PASS',
        durationMs: attemptDuration,
        screenshots,
        ...(result.stderr.trim() ? { stderr: result.stderr.slice(0, 2000) } : {}),
      };
      attempts.push(attemptResult);

      return {
        workflowId: config.workflowId,
        testFile: config.testFileName,
        outcome: 'PASS',
        attempts: attempt,
        durationMs: Date.now() - totalStart,
        attemptDetails: attempts,
        screenshots: allScreenshots,
      };
    }

    // Classify failure
    const outcome = classifyFailure(result.stderr, result.stdout);
    const attemptResult: ExecutionAttempt = {
      attemptNumber: attempt,
      outcome,
      durationMs: attemptDuration,
      error: result.stderr.trim() || result.stdout.trim() || `Exit code ${result.exitCode}`,
      stderr: result.stderr.slice(0, 2000),
      screenshots,
    };
    attempts.push(attemptResult);

    // Don't retry on certain failures
    if (outcome === 'FAIL_APP_NOT_READY') break;
  }

  const lastAttempt = attempts[attempts.length - 1]!;
  return {
    workflowId: config.workflowId,
    testFile: config.testFileName,
    outcome: lastAttempt.outcome,
    attempts: attempts.length,
    durationMs: Date.now() - totalStart,
    ...(lastAttempt.error !== undefined ? { error: lastAttempt.error } : {}),
    attemptDetails: attempts,
    screenshots: allScreenshots,
  };
}

// ---------------------------------------------------------------------------
// Subprocess execution
// ---------------------------------------------------------------------------

interface SubprocessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runTestSubprocess(
  testFilePath: string,
  timeoutMs: number,
): Promise<SubprocessResult> {
  return new Promise((resolve) => {
    // Use tsx CLI entry point via execFile.
    // Strip npm lifecycle env vars — npm sets variables that can interfere with
    // subprocess Chrome/chromedriver spawning on Windows.
    const tsxCliPath = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
    // Build clean env: remove npm lifecycle vars and restore original PATH
    // (npm prepends node_modules/.bin to PATH which can interfere with subprocess behavior).
    const cleanEnv: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (v === undefined) continue;
      if (k.startsWith('npm_')) continue;
      if (k === 'Path' || k === 'PATH') {
        // Remove node_modules/.bin entries from PATH
        const sep = process.platform === 'win32' ? ';' : ':';
        const filtered = v.split(sep).filter(p => !p.includes('node_modules'));
        cleanEnv[k] = filtered.join(sep);
        continue;
      }
      cleanEnv[k] = v;
    }
    execFile(
      process.execPath,
      [tsxCliPath, testFilePath],
      {
        cwd: process.cwd(),
        env: cleanEnv,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        const exitCode = error?.code !== undefined
          ? (typeof error.code === 'number' ? error.code : 1)
          : 0;
        resolve({
          exitCode,
          stdout: stdout ?? '',
          stderr: stderr ?? '',
        });
      },
    );
  });
}

// ---------------------------------------------------------------------------
// Screenshot collection
// ---------------------------------------------------------------------------

function collectScreenshots(dir: string): string[] {
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.png'))
      .sort()
      .map(f => path.join(dir, f));
  } catch {
    return [];
  }
}
