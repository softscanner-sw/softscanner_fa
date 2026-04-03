/**
 * b3-runner.test.ts
 * Unit tests for B3 execution control: test selection, resume, failed-only.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { selectTests } from '../b3-runner.js';
import type { B3Config, B3ResultSet, B3Progress, ExecutionResult } from '../b3-types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<B3Config> = {}): B3Config {
  return {
    subjectName: 'test-subject',
    baseUrl: 'http://localhost:4200',
    outputDir: '',  // set per test
    testsDir: '',
    screenshotDir: '',
    maxRetries: 3,
    readinessTimeoutMs: 30000,
    testTimeoutMs: 60000,
    ...overrides,
  };
}

function makeResult(testFile: string, outcome: 'PASS' | 'FAIL_TIMEOUT' = 'PASS'): ExecutionResult {
  return {
    workflowId: `wf-${testFile}`,
    testFile,
    outcome,
    attempts: 1,
    durationMs: 100,
    attemptDetails: [],
    screenshots: [],
  };
}

const tests = [
  { workflowId: 'wf-a', fileName: 'a.test.ts' },
  { workflowId: 'wf-b', fileName: 'b.test.ts' },
  { workflowId: 'wf-c', fileName: 'c.test.ts' },
  { workflowId: 'wf-d', fileName: 'd.test.ts' },
  { workflowId: 'wf-e', fileName: 'e.test.ts' },
];

// ---------------------------------------------------------------------------
// Test selection (pure logic, no filesystem)
// ---------------------------------------------------------------------------

describe('selectTests', () => {
  test('full mode returns all tests', () => {
    const config = makeConfig();
    const { toRun, resumed } = selectTests(tests, config);
    expect(toRun).toHaveLength(5);
    expect(resumed).toHaveLength(0);
  });

  test('skipWorkflows filters out specified workflows', () => {
    const config = makeConfig({ skipWorkflows: ['wf-b', 'wf-d'] });
    const { toRun } = selectTests(tests, config);
    expect(toRun.map(t => t.workflowId)).toEqual(['wf-a', 'wf-c', 'wf-e']);
  });

  test('onlyWorkflows restricts to specified workflows', () => {
    const config = makeConfig({ onlyWorkflows: ['wf-a', 'wf-c'] });
    const { toRun } = selectTests(tests, config);
    expect(toRun.map(t => t.workflowId)).toEqual(['wf-a', 'wf-c']);
  });

  test('onlyWorkflows + skipWorkflows: skip takes precedence', () => {
    const config = makeConfig({ onlyWorkflows: ['wf-a', 'wf-b'], skipWorkflows: ['wf-b'] });
    const { toRun } = selectTests(tests, config);
    expect(toRun.map(t => t.workflowId)).toEqual(['wf-a']);
  });
});

// ---------------------------------------------------------------------------
// Failed-only selection (requires filesystem for prior results)
// ---------------------------------------------------------------------------

describe('selectTests --failed-only', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'b3-test-'));
    fs.mkdirSync(path.join(tmpDir, 'json'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('runs only failed tests from prior results', () => {
    // Prior: a=PASS, b=FAIL, c=PASS, d=FAIL, e=PASS
    const prior: B3ResultSet = {
      subject: 'test-subject',
      baseUrl: 'http://localhost:4200',
      runTimestamp: '2026-01-01T00:00:00Z',
      readinessCheck: { passed: true, durationMs: 100 },
      results: [
        makeResult('a.test.ts', 'PASS'),
        makeResult('b.test.ts', 'FAIL_TIMEOUT'),
        makeResult('c.test.ts', 'PASS'),
        makeResult('d.test.ts', 'FAIL_TIMEOUT'),
        makeResult('e.test.ts', 'PASS'),
      ],
      stats: { total: 5, passed: 3, failed: 2, skipped: 0, appNotReady: 0, totalDurationMs: 500 },
    };
    fs.writeFileSync(path.join(tmpDir, 'json', 'b3-results.json'), JSON.stringify(prior));

    const config = makeConfig({ outputDir: tmpDir, failedOnly: true });
    const { toRun, resumed } = selectTests(tests, config);

    // Should run only b and d (the failed ones)
    expect(toRun.map(t => t.fileName)).toEqual(['b.test.ts', 'd.test.ts']);
    // Should carry forward the 3 passing results
    expect(resumed).toHaveLength(3);
    expect(resumed.map(r => r.testFile)).toEqual(['a.test.ts', 'c.test.ts', 'e.test.ts']);
  });

  test('failed-only with no prior results runs nothing', () => {
    const config = makeConfig({ outputDir: tmpDir, failedOnly: true });
    // No b3-results.json exists
    const { toRun, resumed } = selectTests(tests, config);
    expect(toRun).toHaveLength(5); // falls through to full run
    expect(resumed).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Resume selection (requires filesystem for progress file)
// ---------------------------------------------------------------------------

describe('selectTests --resume', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'b3-test-'));
    fs.mkdirSync(path.join(tmpDir, 'json'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('resumes from progress file, skipping completed tests', () => {
    // Progress: a and b completed
    const progress: B3Progress = {
      subject: 'test-subject',
      startedAt: '2026-01-01T00:00:00Z',
      completed: [
        makeResult('a.test.ts', 'PASS'),
        makeResult('b.test.ts', 'FAIL_TIMEOUT'),
      ],
      remaining: ['c.test.ts', 'd.test.ts', 'e.test.ts'],
    };
    fs.writeFileSync(path.join(tmpDir, 'json', 'b3-progress.json'), JSON.stringify(progress));

    const config = makeConfig({ outputDir: tmpDir, resume: true });
    const { toRun, resumed } = selectTests(tests, config);

    // Should run c, d, e (the remaining ones)
    expect(toRun.map(t => t.fileName)).toEqual(['c.test.ts', 'd.test.ts', 'e.test.ts']);
    // Should carry forward the 2 completed results
    expect(resumed).toHaveLength(2);
  });

  test('resume with no progress file runs all tests', () => {
    const config = makeConfig({ outputDir: tmpDir, resume: true });
    const { toRun, resumed } = selectTests(tests, config);
    expect(toRun).toHaveLength(5);
    expect(resumed).toHaveLength(0);
  });

  test('resume with all tests completed runs nothing new', () => {
    const progress: B3Progress = {
      subject: 'test-subject',
      startedAt: '2026-01-01T00:00:00Z',
      completed: tests.map(t => makeResult(t.fileName, 'PASS')),
      remaining: [],
    };
    fs.writeFileSync(path.join(tmpDir, 'json', 'b3-progress.json'), JSON.stringify(progress));

    const config = makeConfig({ outputDir: tmpDir, resume: true });
    const { toRun, resumed } = selectTests(tests, config);
    expect(toRun).toHaveLength(0);
    expect(resumed).toHaveLength(5);
  });
});
