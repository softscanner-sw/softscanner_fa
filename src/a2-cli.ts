#!/usr/bin/env node
/**
 * a2-cli.ts
 * Command-line entry point for Phase A2 pipeline (TaskWorkflow mode).
 *
 * Consumes a Phase1Bundle JSON artifact (serialized A1 output) and produces:
 *   - phaseA2-taskworkflows.final.json  (primary artifact: classified TaskWorkflows)
 *
 * Usage:
 *   npx tsx src/a2-cli.ts <phase1BundlePath> [outputDir]
 *
 * Isolation: imports only from src/models/ and src/workflows/.
 * No access to AST, parsers, analyzers, builders, or orchestrator.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Phase1Bundle } from './models/multigraph.js';
import { runTaskWorkflowPipeline } from './workflows/pipeline.js';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const rawArgs = process.argv.slice(2);
const positional = rawArgs.filter((a) => !a.startsWith('--'));
const [bundlePath, rawOutputDir] = positional;

if (!bundlePath) {
  console.error('Usage: tsx src/a2-cli.ts <phase1BundlePath> [outputDir]');
  console.error('');
  console.error('  phase1BundlePath  — path to phase1-bundle.json (A1 output)');
  console.error('  outputDir         — (optional) output directory for A2 artifact');
  console.error('                      defaults to same directory as phase1BundlePath');
  process.exit(1);
}

const resolvedBundlePath = path.resolve(bundlePath);
const outputDir = rawOutputDir
  ? path.resolve(rawOutputDir)
  : path.dirname(resolvedBundlePath);

console.log('Phase A2 pipeline starting\u2026');
console.log(`  input        : ${resolvedBundlePath}`);
console.log(`  outputDir    : ${outputDir}`);

const t0 = Date.now();

try {
  // Read and parse the Phase1Bundle
  const rawJson = fs.readFileSync(resolvedBundlePath, 'utf-8');
  const bundle: Phase1Bundle = JSON.parse(rawJson) as Phase1Bundle;

  const projectId = path.basename(path.dirname(path.dirname(resolvedBundlePath)));

  const taskResult = runTaskWorkflowPipeline(bundle);
  taskResult.input.projectId = projectId;

  const elapsed = Date.now() - t0;

  fs.mkdirSync(outputDir, { recursive: true });
  const taskPath = path.join(outputDir, 'phaseA2-taskworkflows.final.json');
  fs.writeFileSync(taskPath, JSON.stringify(taskResult, null, 2), 'utf-8');

  const ts = taskResult.stats;

  console.log('');
  console.log('Phase A2 complete');
  console.log(`  task workflows : ${ts.workflowCount}`);
  console.log(`    FEASIBLE     : ${ts.feasibleCount}`);
  console.log(`    CONDITIONAL  : ${ts.conditionalCount}`);
  console.log(`    PRUNED       : ${ts.prunedCount}`);
  console.log(`  trigger edges  : ${ts.triggerEdgeCount}`);
  console.log(`  enum routes    : ${ts.enumeratedRouteCount}`);
  console.log(`  elapsed        : ${elapsed} ms`);
  console.log(`  output         : ${taskPath}`);

  process.exit(0);
} catch (err) {
  const elapsed = Date.now() - t0;
  console.error('');
  console.error(`Phase A2 FAILED after ${elapsed} ms`);
  console.error(err instanceof Error ? err.message : String(err));
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
}
