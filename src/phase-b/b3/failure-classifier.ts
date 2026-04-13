/**
 * failure-classifier.ts
 * Classifies execution failures per spec §B3 ordered rules (lines 1805–1816).
 */

import type { ExecutionOutcome } from './b3-types.js';

/**
 * Classify a test execution failure from its error output.
 * Rules applied in spec-defined order.
 */
export function classifyFailure(stderr: string, stdout: string): ExecutionOutcome {
  const combined = `${stderr}\n${stdout}`;

  // Rule 3: Element not found or interaction not possible
  if (combined.includes('NoSuchElementError') ||
      combined.includes('StaleElementReferenceError') ||
      combined.includes('InvalidArgumentError') ||
      combined.includes('ElementNotInteractableError') ||
      combined.includes('invalid element state')) {
    return 'FAIL_ELEMENT_NOT_FOUND';
  }

  // Rule 4: Assertion failure
  if (combined.includes('AssertionError') ||
      combined.includes('AssertionError') ||
      (combined.includes('assert') && combined.includes('Expected URL'))) {
    return 'FAIL_ASSERTION';
  }

  // Rule 5: Timeout
  if (combined.includes('TimeoutError') ||
      combined.includes('Waiting for') ||
      combined.includes('timed out') ||
      combined.includes('ETIMEDOUT')) {
    return 'FAIL_TIMEOUT';
  }

  // Rule 6: Auth failure (detectable from auth-setup context)
  if (combined.includes('auth-setup') ||
      combined.includes('Auth setup') ||
      (combined.includes('/login') && combined.includes('NoSuchElementError'))) {
    return 'FAIL_AUTH';
  }

  // Rule 7: Unknown
  return 'FAIL_UNKNOWN';
}
