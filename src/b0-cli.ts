#!/usr/bin/env node
/**
 * b0-cli.ts
 * Command-line entry point for Phase B0: subject manifest validation.
 *
 * Validates all subject manifests under subjects/<subject>/subject-manifest.json
 * and cross-checks against their A2 workflow artifacts.
 *
 * Usage:
 *   npx tsx src/b0-cli.ts [--subjects-dir <path>] [--output-dir <path>]
 *
 * Phase isolation: imports only from src/phase-b/b0/.
 * No access to AST, parsers, analyzers, builders, or orchestrator.
 */

import * as path from 'node:path';
import { runB0Validation } from './phase-b/b0/b0-runner.js';
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
const subjectsDir = getArg('--subjects-dir') ?? path.join(repoRoot, 'subjects');
const outputDir = getArg('--output-dir') ?? path.join(repoRoot, 'output');
const logsDir = path.join(repoRoot, 'logs');

console.log('B0 manifest validation starting…');
console.log(`  subjects dir : ${subjectsDir}`);
console.log(`  output dir   : ${outputDir}`);
console.log('');

const t0 = Date.now();
const plog = new PipelineLogger('B0', 'validation');
plog.info('pipeline-start', 'B0 manifest validation starting');

try {
  const summary = runB0Validation({ subjectsDir, outputDir, logsDir });
  const elapsed = Date.now() - t0;

  // Print summary table
  console.log('Subject                        Status       Accounts  Params  Errors  Warnings');
  console.log('─'.repeat(85));
  for (const s of summary.subjects) {
    const name = s.subject.padEnd(30);
    const status = s.status.padEnd(12);
    const accts = String(s.accounts).padStart(8);
    const params = String(s.paramBindings).padStart(7);
    const errs = String(s.errors).padStart(7);
    const warns = String(s.warnings).padStart(9);
    console.log(`${name} ${status} ${accts} ${params} ${errs} ${warns}`);
  }
  console.log('');

  const totalValid = summary.subjects.filter((s) => s.status === 'VALID').length;
  const totalInvalid = summary.subjects.filter((s) => s.status !== 'VALID').length;

  console.log(`B0 complete — ${totalValid} VALID, ${totalInvalid} not valid`);
  console.log(`  elapsed : ${elapsed} ms`);
  console.log(`  log     : logs/b0-manifest-validation.log`);
  console.log(`  summary : logs/b0-summary.json`);

  for (const s of summary.subjects) {
    plog.log(s.status === 'VALID' ? 'info' : 'warn', 'subject-validated', `${s.subject}: ${s.status}`, {
      subject: s.subject, outcome: s.status === 'VALID' ? 'success' : 'failure',
      context: { errors: s.errors, warnings: s.warnings },
    });
  }
  plog.info('pipeline-complete', `B0 complete: ${totalValid} VALID`, { duration: elapsed, outcome: totalInvalid > 0 ? 'partial' : 'success' });
  plog.flush(path.join(logsDir, 'b0-pipeline.jsonl'));

  // Exit 1 if any subject has errors
  const hasErrors = summary.subjects.some((s) => s.status === 'INVALID' || s.status === 'LOAD_ERROR');
  process.exit(hasErrors ? 1 : 0);
} catch (err) {
  const elapsed = Date.now() - t0;
  console.error(`B0 FAILED after ${elapsed} ms`);
  console.error(err instanceof Error ? err.message : String(err));
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  plog.error('pipeline-failed', 'B0 validation failed', { duration: elapsed, error: err instanceof Error ? err.message : String(err) });
  plog.flush(path.join(logsDir, 'b0-pipeline.jsonl'));
  process.exit(1);
}
