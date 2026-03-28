/**
 * b3-cli.ts
 * CLI for B3 execution + B4 coverage reporting.
 * Usage: npx tsx src/b3-cli.ts <subjectName>
 *
 * Assumes the application is already running at the manifest's baseUrl.
 */

import fs from 'node:fs';
import path from 'node:path';
import { runB3 } from './phase-b/b3/b3-runner.js';
import { computeCoverage } from './phase-b/b4/coverage-computer.js';
import { generateReport, generatePdf } from './phase-b/b3/report-generator.js';
import type { B3Config } from './phase-b/b3/b3-types.js';
import { PipelineLogger } from './services/logger.js';

const subjectName = process.argv[2];
if (!subjectName) {
  console.error('Usage: npx tsx src/b3-cli.ts <subjectName>');
  console.error('Example: npx tsx src/b3-cli.ts posts-users-ui-ng');
  process.exit(1);
}

const projectRoot = process.cwd();
const manifestPath = path.join(projectRoot, 'subjects', subjectName, 'subject-manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error(`Manifest not found: ${manifestPath}`);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
const outputDir = path.join(projectRoot, 'output', subjectName);
const testsDir = path.join(outputDir, 'tests');
const screenshotDir = path.join(outputDir, 'screenshots');

if (!fs.existsSync(testsDir)) {
  console.error(`Tests directory not found: ${testsDir}`);
  console.error('Run B2 code generation first: npm run b2:codegen');
  process.exit(1);
}

// Clean previous screenshots (tests will create their own subdirectories)
if (fs.existsSync(screenshotDir)) {
  fs.rmSync(screenshotDir, { recursive: true, force: true });
}

const config: B3Config = {
  subjectName,
  baseUrl: manifest.baseUrl,
  outputDir,
  testsDir,
  screenshotDir,
  maxRetries: 3,
  readinessTimeoutMs: 30_000,
  testTimeoutMs: 60_000,
  skipWorkflows: manifest.skipWorkflows,
  ...(manifest.executionConfig?.preAttemptCommand
    ? { preAttemptCommand: manifest.executionConfig.preAttemptCommand }
    : {}),
};

const plog = new PipelineLogger('B3', 'execution');
plog.info('pipeline-start', `B3/B4 starting for ${subjectName}`, { subject: subjectName, context: { baseUrl: config.baseUrl } });

console.log(`B3/B4 pilot for ${subjectName}`);
console.log(`  baseUrl: ${config.baseUrl}`);
console.log(`  tests: ${testsDir}`);
console.log('');

// Top-level await — node --import tsx/esm properly awaits this.
try {
  // --- B3: Execution ---
  const b3 = await runB3(config);
  console.log('');
  console.log('B3 Results:');
  console.log(`  Total: ${b3.stats.total}`);
  console.log(`  Passed: ${b3.stats.passed}`);
  console.log(`  Failed: ${b3.stats.failed}`);
  console.log(`  Skipped: ${b3.stats.skipped}`);
  console.log(`  App not ready: ${b3.stats.appNotReady}`);
  console.log(`  Duration: ${(b3.stats.totalDurationMs / 1000).toFixed(1)}s`);
  console.log(`  Results: ${path.join(outputDir, 'json', 'b3-results.json')}`);

  // --- B4: Coverage ---
  const b4 = computeCoverage(subjectName, outputDir, manifest.skipWorkflows);
  console.log('');
  console.log('B4 Coverage:');
  console.log(`  C1 (Plan):      ${(b4.summary.c1 * 100).toFixed(1)}%`);
  console.log(`  C2 (Code):      ${(b4.summary.c2 * 100).toFixed(1)}%`);
  console.log(`  C3 (Execution): ${(b4.summary.c3 * 100).toFixed(1)}%`);
  console.log(`  Coverage: ${path.join(outputDir, 'json', 'b4-coverage.json')}`);

  // --- Report ---
  const reportPath = generateReport(b3, b4, outputDir);
  console.log('');
  console.log(`Report: ${reportPath}`);

  // --- PDF (optional, best-effort) ---
  const pdfPath = generatePdf(reportPath);
  if (pdfPath !== undefined) {
    console.log(`PDF:    ${pdfPath}`);
  }

  // Log per-test outcomes
  for (const r of b3.results) {
    plog.log(r.outcome === 'PASS' ? 'info' : 'warn', 'test-result', `${r.testFile}: ${r.outcome}`, {
      subject: subjectName, testFile: r.testFile, outcome: r.outcome, duration: r.durationMs,
    });
  }

  plog.info('pipeline-complete', `B3/B4 complete: ${b3.stats.passed}/${b3.stats.total} passed`, {
    subject: subjectName, duration: b3.stats.totalDurationMs,
    outcome: b3.stats.failed > 0 ? 'partial' : 'success',
    context: { passed: b3.stats.passed, failed: b3.stats.failed, c3: b4.summary.c3 },
  });
  plog.flush(path.join(projectRoot, 'logs', 'b3-pipeline.jsonl'));

  // Exit with appropriate code
  if (b3.stats.appNotReady > 0) {
    console.log('');
    console.log('WARNING: Application was not ready. Start the application and retry.');
    process.exit(2);
  }
  if (b3.stats.failed > 0) {
    process.exit(1);
  }
} catch (err) {
  plog.error('pipeline-failed', 'B3/B4 failed', {
    subject: subjectName, error: err instanceof Error ? err.message : String(err),
  });
  plog.flush(path.join(projectRoot, 'logs', 'b3-pipeline.jsonl'));
  console.error('B3/B4 runner failed:', err);
  process.exit(1);
}
