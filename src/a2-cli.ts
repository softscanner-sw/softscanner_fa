#!/usr/bin/env node
/**
 * a2-cli.ts
 * Command-line entry point for Phase A2 pipeline (TaskWorkflow mode).
 *
 * Consumes an A1Multigraph JSON artifact (serialized A1 output) and produces:
 *   - a2-workflows.json  (primary artifact: classified TaskWorkflows)
 *
 * Usage:
 *   npx tsx src/a2-cli.ts <a1BundlePath> [outputDir]
 *
 * Isolation: imports only from src/models/ and src/workflows/.
 * No access to AST, parsers, analyzers, builders, or orchestrator.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { A1Multigraph } from './models/multigraph.js';
import { runTaskWorkflowPipeline } from './workflows/pipeline.js';
import { PipelineLogger } from './services/logger.js';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const rawArgs = process.argv.slice(2);
const positional = rawArgs.filter((a) => !a.startsWith('--'));
const [bundlePath, rawOutputDir] = positional;

if (!bundlePath) {
  console.error('Usage: tsx src/a2-cli.ts <a1BundlePath> [outputDir]');
  console.error('');
  console.error('  a1BundlePath  — path to a1-multigraph.json (A1 output)');
  console.error('  outputDir     — (optional) output directory for A2 artifact');
  console.error('                  defaults to same directory as a1BundlePath');
  process.exit(1);
}

const resolvedBundlePath = path.resolve(bundlePath);
const outputDir = rawOutputDir
  ? path.resolve(rawOutputDir)
  : path.dirname(resolvedBundlePath);

console.log('A2 pipeline starting…');
console.log(`  input        : ${resolvedBundlePath}`);
console.log(`  outputDir    : ${outputDir}`);

const t0 = Date.now();
const subjectName = path.basename(path.dirname(path.dirname(resolvedBundlePath)));
const plog = new PipelineLogger('A2', 'enumeration');
plog.info('pipeline-start', 'A2 enumeration starting', { subject: subjectName });

try {
  // Read and parse the A1Multigraph
  const rawJson = fs.readFileSync(resolvedBundlePath, 'utf-8');
  const bundle: A1Multigraph = JSON.parse(rawJson) as A1Multigraph;

  const projectId = path.basename(path.dirname(path.dirname(resolvedBundlePath)));

  const taskResult = runTaskWorkflowPipeline(bundle);
  taskResult.input.projectId = projectId;

  const elapsed = Date.now() - t0;

  fs.mkdirSync(outputDir, { recursive: true });
  const taskPath = path.join(outputDir, 'a2-workflows.json');
  fs.writeFileSync(taskPath, JSON.stringify(taskResult, null, 2), 'utf-8');

  const ts = taskResult.stats;

  console.log('');
  console.log('A2 complete');
  console.log(`  task workflows : ${ts.workflowCount}`);
  console.log(`    FEASIBLE     : ${ts.feasibleCount}`);
  console.log(`    CONDITIONAL  : ${ts.conditionalCount}`);
  console.log(`    PRUNED       : ${ts.prunedCount}`);
  console.log(`  trigger edges  : ${ts.triggerEdgeCount}`);
  console.log(`  enum routes    : ${ts.enumeratedRouteCount}`);
  console.log(`  elapsed        : ${elapsed} ms`);
  console.log(`  output         : ${taskPath}`);

  plog.info('pipeline-complete', 'A2 enumeration complete', {
    subject: subjectName, duration: elapsed, outcome: 'success',
    context: { workflows: ts.workflowCount, feasible: ts.feasibleCount, conditional: ts.conditionalCount },
  });
  plog.flush(path.resolve('logs', 'a2-pipeline.jsonl'));
  process.exit(0);
} catch (err) {
  const elapsed = Date.now() - t0;
  console.error('');
  console.error(`A2 FAILED after ${elapsed} ms`);
  console.error(err instanceof Error ? err.message : String(err));
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  plog.error('pipeline-failed', 'A2 enumeration failed', {
    subject: subjectName, duration: elapsed, error: err instanceof Error ? err.message : String(err),
  });
  plog.flush(path.resolve('logs', 'a2-pipeline.jsonl'));
  process.exit(1);
}
