#!/usr/bin/env node
/**
 * b1-intent-cli.ts
 * Command-line entry point for Phase B1.1: RealizationIntent derivation.
 *
 * Derives one RealizationIntent per non-PRUNED workflow from A1+A2 artifacts,
 * validates against Phase B GT, and writes outputs.
 *
 * Usage:
 *   npx tsx src/b1-intent-cli.ts [--output-dir <path>] [--gt-dir <path>]
 *
 * Phase isolation: imports only from src/phase-b/b1/.
 */

import * as path from 'node:path';
import { runB1IntentDerivation } from './phase-b/b1/b1-runner.js';
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
const gtDir = getArg('--gt-dir') ?? path.join(repoRoot, 'docs', 'analysis', 'phase-b', 'gt');
const logsDir = path.join(repoRoot, 'logs');

console.log('B1.1 intent derivation starting…');
console.log(`  output dir : ${outputDir}`);
console.log(`  gt dir     : ${gtDir}`);
console.log('');

const t0 = Date.now();
const plog = new PipelineLogger('B1', 'intent-derivation');
plog.info('pipeline-start', 'B1.1 intent derivation starting');

try {
  const summary = runB1IntentDerivation({ outputDir, logsDir, gtDir });
  const elapsed = Date.now() - t0;

  // Print summary table
  console.log('Subject                        Status  Intents  Feasible  Conditional  Pruned  GT Match  GT Mismatch  GT Missing');
  console.log('─'.repeat(115));
  for (const s of summary.subjects) {
    const name = s.subject.padEnd(30);
    const status = s.status.padEnd(7);
    const intents = String(s.intentCount).padStart(7);
    const feasible = String(s.feasibleCount).padStart(9);
    const conditional = String(s.conditionalCount).padStart(12);
    const pruned = String(s.prunedCount).padStart(7);
    const matched = String(s.gtMatched).padStart(9);
    const mismatches = String(s.gtMismatches).padStart(12);
    const missing = String(s.gtMissing).padStart(11);
    console.log(`${name} ${status} ${intents} ${feasible} ${conditional} ${pruned} ${matched} ${mismatches} ${missing}`);
  }
  console.log('');

  const totalIntents = summary.subjects.reduce((s, x) => s + x.intentCount, 0);
  const totalGtMatch = summary.subjects.reduce((s, x) => s + x.gtMatched, 0);
  const totalGtMismatch = summary.subjects.reduce((s, x) => s + x.gtMismatches, 0);
  const totalGtMissing = summary.subjects.reduce((s, x) => s + x.gtMissing, 0);
  const hasErrors = summary.subjects.some(s => s.status === 'ERROR');

  console.log(`B1.1 complete — ${totalIntents} intents derived`);
  console.log(`  GT: ${totalGtMatch} matched, ${totalGtMismatch} mismatches, ${totalGtMissing} missing`);
  console.log(`  elapsed : ${elapsed} ms`);
  console.log(`  log     : logs/b1-intent-validation.log`);
  console.log(`  summary : logs/b1-intent-summary.json`);

  plog.info('pipeline-complete', `B1.1 complete: ${totalIntents} intents`, { duration: elapsed, outcome: hasErrors ? 'partial' : 'success',
    context: { intents: totalIntents, gtMatch: totalGtMatch, gtMismatch: totalGtMismatch } });
  plog.flush(path.join(logsDir, 'b1-intent-pipeline.jsonl'));
  process.exit(hasErrors ? 1 : 0);
} catch (err) {
  const elapsed = Date.now() - t0;
  console.error(`B1.1 FAILED after ${elapsed} ms`);
  console.error(err instanceof Error ? err.message : String(err));
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  plog.error('pipeline-failed', 'B1.1 failed', { duration: elapsed, error: err instanceof Error ? err.message : String(err) });
  plog.flush(path.join(logsDir, 'b1-intent-pipeline.jsonl'));
  process.exit(1);
}
