#!/usr/bin/env node
/**
 * cli.ts
 * Command-line entry point for Phase 1 static extraction.
 *
 * Usage:
 *   npx tsx src/cli.ts <projectRoot> <tsConfigPath> [outputDir] [--debug]
 *
 * Arguments:
 *   projectRoot   Absolute path to the Angular project root.
 *   tsConfigPath  Absolute path to the tsconfig used for analysis
 *                 (e.g. tsconfig.app.json or tsconfig.json).
 *   outputDir     Directory to write phase1-bundle.json and debug artifacts.
 *                 Defaults to output/<basename(projectRoot)> relative to CWD.
 *
 * Exit codes:
 *   0  Success
 *   1  Missing arguments or runtime error
 */

import * as path from 'node:path';
import type { AnalyzerConfig } from './models/analyzer-config.js';
import { Phase1Orchestrator } from './orchestrator/phase1-orchestrator.js';
import { ConsoleLogger } from './services/logger.js';

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const rawArgs = process.argv.slice(2);

// Extract --debug flag; remaining positional args are projectRoot, tsConfigPath, outputDir
// Note: --verbose is intercepted by npm itself; use --debug instead.
const verbose = rawArgs.includes('--debug');
const positional = rawArgs.filter((a) => !a.startsWith('--'));
const [projectRoot, tsConfigPath, rawOutputDir] = positional;

if (!projectRoot || !tsConfigPath) {
  console.error('Usage: tsx src/cli.ts <projectRoot> <tsConfigPath> [outputDir] [--debug]');
  console.error('');
  console.error('  projectRoot   — absolute path to the Angular project root');
  console.error('  tsConfigPath  — absolute path to the tsconfig file');
  console.error('  outputDir     — (optional) directory to write JSON output');
  console.error('                  defaults to output/<project-name> relative to CWD');
  console.error('  --debug       — emit debug-level pipeline logs to stdout');
  process.exit(1);
}

// Apply default output directory when none is supplied.
// Default: output/<basename(projectRoot)> relative to the current working directory.
const outputDir = rawOutputDir ?? path.join('output', path.basename(path.resolve(projectRoot)));

const cfg: AnalyzerConfig = {
  projectRoot: path.resolve(projectRoot),
  tsConfigPath: path.resolve(tsConfigPath),
  framework: 'Angular',
  backendGranularity: 'None',
};

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const resolvedOutput = path.resolve(outputDir);

console.log('Phase 1 static extraction starting…');
console.log(`  projectRoot : ${cfg.projectRoot}`);
console.log(`  tsConfigPath: ${cfg.tsConfigPath}`);
console.log(`  outputDir   : ${resolvedOutput}`);
if (rawOutputDir === undefined) {
  console.log('                (default — no outputDir argument supplied)');
}
if (verbose) {
  console.log('  debug       : on');
}

const t0 = Date.now();

try {
  const logger = verbose ? new ConsoleLogger('debug') : undefined;

  const orchestratorOptions = {
    outputPath: path.join(resolvedOutput, 'phase1-bundle.json'),
    debugOutputDir: resolvedOutput,
    ...(logger !== undefined && { logger }),
  };

  const bundle = new Phase1Orchestrator(cfg, orchestratorOptions).run();
  const elapsed = Date.now() - t0;

  const stats = bundle.stats;
  console.log('');
  console.log('Phase 1 complete ✓');
  console.log(`  modules    : ${stats?.modules ?? '?'}`);
  console.log(`  routes     : ${stats?.routes ?? '?'}`);
  console.log(`  components : ${stats?.components ?? '?'}`);
  console.log(`  widgets    : ${stats?.widgets ?? '?'}`);
  console.log(`  edges      : ${stats?.edges ?? '?'}`);
  console.log(`  transitions: ${stats?.transitions ?? '?'}`);
  console.log(`  elapsed    : ${elapsed} ms`);
  console.log(`  output     : ${resolvedOutput}`);

  process.exit(0);
} catch (err) {
  const elapsed = Date.now() - t0;
  console.error('');
  console.error(`Phase 1 FAILED after ${elapsed} ms`);
  console.error(err instanceof Error ? err.message : String(err));
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
}
