/**
 * b3-types.ts
 * Type definitions for B3 execution results.
 * Authority: docs/paper/approach.md — Phase B §B3 ExecutionResult schema.
 */

// ---------------------------------------------------------------------------
// Execution outcomes (spec §B3 lines 1766–1784)
// ---------------------------------------------------------------------------

export type ExecutionOutcome =
  | 'PASS'
  | 'FAIL_APP_NOT_READY'
  | 'FAIL_AUTH'
  | 'FAIL_ELEMENT_NOT_FOUND'
  | 'FAIL_ASSERTION'
  | 'FAIL_TIMEOUT'
  | 'FAIL_UNKNOWN';

export interface ExecutionAttempt {
  attemptNumber: number;
  outcome: ExecutionOutcome;
  durationMs: number;
  error?: string;
  stderr?: string;
  screenshots: string[];   // paths to screenshot files captured during this attempt
}

export interface ExecutionResult {
  workflowId: string;
  testFile: string;
  outcome: ExecutionOutcome;     // final outcome after all attempts
  attempts: number;              // 1–3
  durationMs: number;            // total across all attempts
  error?: string;                // final error message if not PASS
  attemptDetails: ExecutionAttempt[];
  screenshots: string[];         // all screenshot paths across attempts
}

// ---------------------------------------------------------------------------
// B3 result set
// ---------------------------------------------------------------------------

export interface B3ResultSet {
  subject: string;
  baseUrl: string;
  runTimestamp: string;           // ISO 8601
  readinessCheck: {
    passed: boolean;
    durationMs: number;
    error?: string;
  };
  results: ExecutionResult[];
  stats: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    appNotReady: number;
    totalDurationMs: number;
  };
}

// ---------------------------------------------------------------------------
// B3 configuration
// ---------------------------------------------------------------------------

export interface B3Config {
  subjectName: string;
  baseUrl: string;
  outputDir: string;             // where b3-results.json goes
  testsDir: string;              // where B2 test files are
  screenshotDir: string;         // where screenshots go
  maxRetries: number;            // default 3
  readinessTimeoutMs: number;    // default 30000
  testTimeoutMs: number;         // default 60000
  skipWorkflows?: string[];      // from manifest
  preAttemptCommand?: string;    // from manifest executionConfig
}
