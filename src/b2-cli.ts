#!/usr/bin/env node
/**
 * b2-cli.ts
 * Command-line entry point for Phase B2: Code Generation.
 *
 * Reads b1-plans.json + subject manifests, generates Selenium WebDriver
 * TypeScript test files, computes generation coverage, writes outputs.
 *
 * Usage:
 *   npx tsx src/b2-cli.ts [--output-dir <path>] [--subjects-dir <path>]
 *
 * Phase isolation: imports only from src/phase-b/b2/.
 */

import * as path from 'node:path';
import { runB2CodeGeneration } from './phase-b/b2/b2-runner.js';
import { PipelineLogger } from './services/logger.js';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const rawArgs = process.argv.slice(2);

function getArg(flag: string): string | undefined {
  const idx = rawArgs.indexOf(flag);
  if (idx >= 0 && idx + 1 < rawArgs.length) {
    return rawArgs[idx + 1];
  }
  return undefined;
}

const repoRoot = path.resolve('.');
const outputDir = getArg('--output-dir') ?? path.join(repoRoot, 'output');
const subjectsDir = getArg('--subjects-dir') ?? path.join(repoRoot, 'subjects');
const logsDir = path.join(repoRoot, 'logs');

console.log('B2 code generation starting…');
console.log(`  output dir   : ${outputDir}`);
console.log(`  subjects dir : ${subjectsDir}`);
console.log('');

const t0 = Date.now();
const plog = new PipelineLogger('B2', 'codegen');
plog.info('pipeline-start', 'B2 code generation starting', { context: { outputDir, subjectsDir } });

try {
  const summary = runB2CodeGeneration({ outputDir, subjectsDir, logsDir });
  const elapsed = Date.now() - t0;

  // Print summary table
  console.log('Subject                        Status  Tests  Gen Rate  Upstream Rate');
  console.log('─'.repeat(75));
  for (const s of summary.subjects) {
    const name = s.subject.padEnd(30);
    const status = s.status.padEnd(7);
    const tests = String(s.testsGenerated).padStart(6);
    const genRate = `${(s.coverage.generationRate * 100).toFixed(1)}%`.padStart(9);
    const upRate = `${(s.coverage.upstreamRate * 100).toFixed(1)}%`.padStart(14);
    console.log(`${name} ${status} ${tests} ${genRate} ${upRate}`);
  }
  console.log('');

  const totalTests = summary.subjects.reduce((s, x) => s + x.testsGenerated, 0);
  const totalEligible = summary.subjects.reduce((s, x) => s + x.coverage.eligibleWorkflows, 0);
  const totalPlans = summary.subjects.reduce((s, x) => s + x.coverage.plansGenerated, 0);
  const hasErrors = summary.subjects.some(s => s.status === 'ERROR');

  for (const s of summary.subjects) {
    plog.info('subject-complete', `${s.subject}: ${s.testsGenerated} tests`, {
      subject: s.subject,
      outcome: s.status === 'OK' ? 'success' : 'failure',
      context: { testsGenerated: s.testsGenerated, generationRate: s.coverage.generationRate },
    });
  }

  console.log(`B2 complete — ${totalTests} tests generated`);
  console.log(`  Generation: ${totalTests}/${totalPlans} plans (${totalPlans > 0 ? ((totalTests / totalPlans) * 100).toFixed(1) : '0.0'}%)`);
  console.log(`  Upstream:   ${totalTests}/${totalEligible} eligible workflows (${totalEligible > 0 ? ((totalTests / totalEligible) * 100).toFixed(1) : '0.0'}%)`);
  console.log(`  elapsed : ${elapsed} ms`);
  console.log(`  log     : logs/b2-codegen.log`);
  console.log(`  summary : logs/b2-summary.json`);

  plog.info('pipeline-complete', `B2 complete: ${totalTests} tests`, { duration: elapsed, outcome: hasErrors ? 'partial' : 'success' });
  plog.flush(path.join(logsDir, 'b2-pipeline.jsonl'));

  process.exit(hasErrors ? 1 : 0);
} catch (err) {
  const elapsed = Date.now() - t0;
  console.error(`B2 FAILED after ${elapsed} ms`);
  console.error(err instanceof Error ? err.message : String(err));
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  plog.error('pipeline-failed', 'B2 failed', { duration: elapsed, error: err instanceof Error ? err.message : String(err) });
  plog.flush(path.join(logsDir, 'b2-pipeline.jsonl'));
  process.exit(1);
}
