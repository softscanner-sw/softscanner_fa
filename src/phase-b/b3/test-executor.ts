/**
 * test-executor.ts
 * Per-test subprocess execution with bounded retry.
 * Spec: §B3 — isolated subprocess, sequential, max 3 attempts.
 */

import { spawn, execSync } from 'node:child_process';
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
    // Build clean env: remove ALL npm lifecycle vars (including non-prefixed ones
    // like INIT_CWD, COLOR, NODE, EDITOR that npm injects during `npm run`).
    // These can cause silent subprocess failures when passed to child processes.
    const NPM_LIFECYCLE_VARS = new Set([
      'INIT_CWD', 'COLOR', 'NODE', 'EDITOR', 'PROMPT',
    ]);
    const cleanEnv: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (v === undefined) continue;
      if (k.startsWith('npm_')) continue;
      if (NPM_LIFECYCLE_VARS.has(k)) continue;
      cleanEnv[k] = v;
    }
    // Ensure project node_modules/.bin is in PATH for chromedriver
    const projBin = path.join(process.cwd(), 'node_modules', '.bin');
    const pathKey = process.platform === 'win32' ? 'Path' : 'PATH';
    const currentPath = cleanEnv[pathKey] ?? '';
    if (!currentPath.includes(projBin)) {
      const sep = process.platform === 'win32' ? ';' : ':';
      cleanEnv[pathKey] = projBin + sep + currentPath;
    }
    // Spawn the test subprocess using tsx CLI entry point.
    // IMPORTANT: B3 must be invoked via `node node_modules/tsx/dist/cli.mjs
    // src/b3-cli.ts` (not via `npm run` with `--import tsx/esm`), because
    // npm's Windows process lifecycle kills subprocess event loops before
    // async work (WebDriver/Chrome) completes. The npm script "b3" in
    // package.json uses the tsx CLI path for this reason.
    const child = spawn(
      process.execPath,
      [tsxCliPath, testFilePath],
      {
        cwd: process.cwd(),
        env: cleanEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    // Enforce timeout manually
    const timer = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch { /* already dead */ }
      // On Windows, SIGTERM may not work; use taskkill as fallback
      if (process.platform === 'win32') {
        try {
          execSync(`taskkill //PID ${child.pid} //F //T`, { stdio: 'pipe', timeout: 5000 });
        } catch { /* already dead */ }
      }
    }, timeoutMs);

    child.on('close', (code: number | null, signal: string | null) => {
      clearTimeout(timer);
      const killedByTimeout = signal === 'SIGTERM' || (code === null && signal !== null);
      const exitCode = killedByTimeout ? -1 : (code ?? 1);
      resolve({
        exitCode,
        stdout,
        stderr: killedByTimeout
          ? `TimeoutError: Test process killed after ${timeoutMs}ms timeout\n${stderr}`
          : stderr,
      });
    });
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
