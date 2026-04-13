#!/usr/bin/env node
/**
 * b1-plan-cli.ts
 * Command-line entry point for Phase B1.2: ActionPlan generation.
 *
 * Reads b1-intents.json + subject manifests, generates ActionPlans,
 * validates against Phase B GT, and writes b1-plans.json.
 *
 * Usage:
 *   npx tsx src/b1-plan-cli.ts [--output-dir <path>] [--subjects-dir <path>] [--gt-dir <path>]
 *
 * Phase isolation: imports only from src/phase-b/b1/.
 */

import * as path from 'node:path';
import { runB1PlanGeneration } from './phase-b/b1/b1-runner.js';
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
const gtDir = getArg('--gt-dir') ?? path.join(repoRoot, 'docs', 'analysis', 'phase-b', 'gt');
const logsDir = path.join(repoRoot, 'logs');

console.log('B1.2 plan generation starting…');
console.log(`  output dir   : ${outputDir}`);
console.log(`  subjects dir : ${subjectsDir}`);
console.log(`  gt dir       : ${gtDir}`);
console.log('');

const t0 = Date.now();
const plog = new PipelineLogger('B1', 'plan-generation');
plog.info('pipeline-start', 'B1.2 plan generation starting');

try {
  const summary = runB1PlanGeneration({ outputDir, subjectsDir, logsDir, gtDir });
  const elapsed = Date.now() - t0;

  // Print summary table
  console.log('Subject                        Status  Plans  Skipped  GT Match  GT Mismatch  GT Missing');
  console.log('─'.repeat(100));
  for (const s of summary.subjects) {
    const name = s.subject.padEnd(30);
    const status = s.status.padEnd(7);
    const plans = String(s.planCount).padStart(6);
    const skipped = String(s.skipped).padStart(8);
    const matched = String(s.gtMatched).padStart(9);
    const mismatches = String(s.gtMismatches).padStart(12);
    const missing = String(s.gtMissing).padStart(11);
    console.log(`${name} ${status} ${plans} ${skipped} ${matched} ${mismatches} ${missing}`);
  }
  console.log('');

  const totalPlans = summary.subjects.reduce((s, x) => s + x.planCount, 0);
  const totalGtMatch = summary.subjects.reduce((s, x) => s + x.gtMatched, 0);
  const totalGtMismatch = summary.subjects.reduce((s, x) => s + x.gtMismatches, 0);
  const totalGtMissing = summary.subjects.reduce((s, x) => s + x.gtMissing, 0);
  const hasErrors = summary.subjects.some(s => s.status === 'ERROR');

  console.log(`B1.2 complete — ${totalPlans} plans generated`);
  console.log(`  GT: ${totalGtMatch} matched, ${totalGtMismatch} mismatches, ${totalGtMissing} missing`);
  console.log(`  elapsed : ${elapsed} ms`);
  console.log(`  log     : logs/b1-plan-validation.log`);
  console.log(`  summary : logs/b1-plan-summary.json`);

  plog.info('pipeline-complete', `B1.2 complete: ${totalPlans} plans`, { duration: elapsed, outcome: hasErrors ? 'partial' : 'success',
    context: { plans: totalPlans, gtMatch: totalGtMatch, gtMismatch: totalGtMismatch } });
  plog.flush(path.join(logsDir, 'b1-plan-pipeline.jsonl'));
  process.exit(hasErrors ? 1 : 0);
} catch (err) {
  const elapsed = Date.now() - t0;
  console.error(`B1.2 FAILED after ${elapsed} ms`);
  console.error(err instanceof Error ? err.message : String(err));
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  plog.error('pipeline-failed', 'B1.2 failed', { duration: elapsed, error: err instanceof Error ? err.message : String(err) });
  plog.flush(path.join(logsDir, 'b1-plan-pipeline.jsonl'));
  process.exit(1);
}
