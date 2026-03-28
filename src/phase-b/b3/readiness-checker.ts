/**
 * readiness-checker.ts
 * HTTP GET readiness check per spec §B3.
 * If readiness fails, all workflows → FAIL_APP_NOT_READY.
 */

import http from 'node:http';
import https from 'node:https';

export interface ReadinessResult {
  passed: boolean;
  durationMs: number;
  error?: string;
}

/**
 * Check if the application is running by performing an HTTP GET to the given URL.
 * Retries with backoff until timeout.
 */
export async function checkReadiness(
  url: string,
  timeoutMs: number = 30_000,
): Promise<ReadinessResult> {
  const start = Date.now();
  const deadline = start + timeoutMs;
  let lastError: string | undefined;

  while (Date.now() < deadline) {
    try {
      await httpGet(url, 5_000);
      return { passed: true, durationMs: Date.now() - start };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      // Wait 1s before retry
      const remaining = deadline - Date.now();
      if (remaining > 0) {
        await sleep(Math.min(1_000, remaining));
      }
    }
  }

  return {
    passed: false,
    durationMs: Date.now() - start,
    error: `Readiness check failed after ${timeoutMs}ms: ${lastError}`,
  };
}

function httpGet(url: string, timeoutMs: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: timeoutMs }, (res) => {
      // Consume response body to free socket
      res.resume();
      const status = res.statusCode ?? 0;
      if (status >= 200 && status < 500) {
        resolve(status);
      } else {
        reject(new Error(`HTTP ${status}`));
      }
    });
    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Connection timed out'));
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
