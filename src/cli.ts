#!/usr/bin/env node
/**
 * cli.ts
 * Command-line entry point for Phase 1 static extraction.
 *
 * Output layout:
 *   <outputDir>/json/phase1-bundle.json   — spec-compliant Phase1Bundle
 *   <outputDir>/json/graph.json           — multigraph (debug)
 *   <outputDir>/json/routes.json          — route map (debug)
 *   <outputDir>/json/components.json      — component registry (debug)
 *   <outputDir>/json/modules.json         — module registry (debug)
 *   <outputDir>/json/widgetEventMaps.json — widget event maps (debug)
 *   <outputDir>/json/config.json          — analyzer config (debug)
 *   <outputDir>/json/stats.json           — stats (debug)
 *
 * Usage:
 *   npx tsx src/cli.ts <projectRoot> <tsConfigPath> [outputDir] [--debug]
 */

import * as path from 'node:path';
import type { AnalyzerConfig } from './models/analyzer-config.js';
import { Phase1Orchestrator } from './orchestrator/phase1-orchestrator.js';
import { TeeLogger } from './services/logger.js';

const rawArgs = process.argv.slice(2);
const verbose = rawArgs.includes('--debug');
const positional = rawArgs.filter((a) => !a.startsWith('--'));
const [projectRoot, tsConfigPath, rawOutputDir] = positional;

if (!projectRoot || !tsConfigPath) {
  console.error('Usage: tsx src/cli.ts <projectRoot> <tsConfigPath> [outputDir] [--debug]');
  console.error('');
  console.error('  projectRoot   — absolute path to the Angular project root');
  console.error('  tsConfigPath  — absolute path to the tsconfig file');
  console.error('  outputDir     — (optional) base output directory');
  console.error('                  defaults to output/<project-name> relative to CWD');
  console.error('                  JSON artifacts written to <outputDir>/json/');
  console.error('  --debug       — emit debug-level pipeline logs to stdout');
  process.exit(1);
}

const outputDir = rawOutputDir ?? path.join('output', path.basename(path.resolve(projectRoot)));

const resolvedProjectRoot = path.resolve(projectRoot);
const resolvedTsConfigPath = path.isAbsolute(tsConfigPath)
  ? tsConfigPath
  : path.resolve(resolvedProjectRoot, tsConfigPath);

const cfg: AnalyzerConfig = {
  projectRoot: resolvedProjectRoot,
  tsConfigPath: resolvedTsConfigPath,
  framework: 'Angular',
  backendGranularity: 'None',
};

const resolvedOutput = path.resolve(outputDir);
const jsonDir = path.join(resolvedOutput, 'json');

console.log('Phase 1 static extraction starting…');
console.log(`  projectRoot : ${cfg.projectRoot}`);
console.log(`  tsConfigPath: ${cfg.tsConfigPath}`);
console.log(`  outputDir   : ${resolvedOutput}`);
console.log(`  jsonDir     : ${jsonDir}`);
if (rawOutputDir === undefined) {
  console.log('                (default — no outputDir argument supplied)');
}
if (verbose) {
  console.log('  debug       : on');
}

const t0 = Date.now();

try {
  const logger = verbose ? new TeeLogger('debug') : undefined;

  const orchestratorOptions = {
    outputPath: path.join(jsonDir, 'phase1-bundle.json'),
    debugOutputDir: jsonDir,
    ...(logger !== undefined && { logger }),
  };

  const bundle = new Phase1Orchestrator(cfg, orchestratorOptions).run();
  const elapsed = Date.now() - t0;

  const { stats } = bundle;
  console.log('');
  console.log('Phase 1 complete ✓');
  console.log(`  nodes      : ${stats.nodeCount}`);
  console.log(`  edges      : ${stats.edgeCount}`);
  console.log(`  structural : ${stats.structuralEdgeCount}`);
  console.log(`  executable : ${stats.executableEdgeCount}`);
  console.log(`  elapsed    : ${elapsed} ms`);
  console.log(`  output     : ${jsonDir}`);

  // Write log file when --debug is used
  if (verbose && logger !== undefined) {
    const subjectName = path.basename(resolvedProjectRoot);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const logPath = path.join('logs', subjectName, timestamp, 'phase1.log');
    logger.flush(path.resolve(logPath));
    console.log(`  log        : ${logPath}`);
  }

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
