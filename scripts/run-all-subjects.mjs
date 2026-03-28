#!/usr/bin/env node
/**
 * run-all-subjects.mjs
 * Runs the A1 → A2 (task) → viz pipeline for all 6 validation subjects.
 *
 * Usage:
 *   node scripts/run-all-subjects.mjs [--skip-a1]
 *
 * Flags:
 *   --skip-a1           Skip A1 extraction (use existing bundles)
 */

import { spawnSync } from 'node:child_process';
import * as path from 'node:path';

const SUBJECTS = [
  {
    name: 'posts-users-ui-ng',
    projectRoot: 'C:/Users/basha/git/github/posts-users-ui-ng',
    tsConfig: 'tsconfig.json',
  },
  {
    name: 'spring-petclinic-angular',
    projectRoot: 'C:/Users/basha/git/github/autoe2e/benchmark/pet-clinic/spring-petclinic-angular',
    tsConfig: 'tsconfig.json',
  },
  {
    name: 'heroes-angular',
    projectRoot: 'C:/Users/basha/git/github/heroes-angular',
    tsConfig: 'src/tsconfig.app.json',
  },
  {
    name: 'softscanner-cqa-frontend',
    projectRoot: 'C:/Users/basha/git/softscanner/softscanner-continuous-quality-assessment-frontend',
    tsConfig: 'tsconfig.app.json',
  },
  {
    name: 'ever-traduora',
    projectRoot: 'C:/Users/basha/git/github/autoe2e/benchmark/ever-traduora/webapp',
    tsConfig: 'src/tsconfig.app.json',
  },
  {
    name: 'airbus-inventory',
    projectRoot: 'C:/Users/basha/git/github/Inventory-Management-System/AirbusInventory',
    tsConfig: 'tsconfig.app.json',
  },
];

// Parse flags
const rawArgs = process.argv.slice(2);
let skipA1 = rawArgs.includes('--skip-a1');

const tsxPath = path.resolve('node_modules/tsx/dist/cli.mjs');
const cliPath = path.resolve('src/a1-cli.ts');
const a2CliPath = path.resolve('src/a2-cli.ts');
const vizCliPath = path.resolve('src/viz-cli.ts');

function run(label, args) {
  console.log(`  ${label}...`);
  const result = spawnSync(process.execPath, args, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.status !== 0) {
    console.error(`  ${label} FAILED:`);
    console.error(result.stderr || result.stdout);
    process.exit(1);
  }
  // Print last few lines of stdout for summary
  const lines = (result.stdout || '').trim().split('\n');
  const tail = lines.slice(-3);
  for (const line of tail) {
    console.log(`    ${line}`);
  }
}

console.log('Pipeline: A1 → A2-task → viz');
if (skipA1) console.log('  (--skip-a1: reusing existing A1 bundles)');
console.log('');

for (const subject of SUBJECTS) {
  const outputDir = path.resolve('output', subject.name);
  const jsonDir = path.join(outputDir, 'json');
  const bundlePath = path.join(jsonDir, 'a1-multigraph.json');
  const tsConfigPath = path.resolve(subject.projectRoot, subject.tsConfig);

  console.log(`=== ${subject.name} ===`);

  // Step 1: A1 (always with --debug for log generation)
  if (!skipA1) {
    run('[A1]', [tsxPath, cliPath, subject.projectRoot, tsConfigPath, outputDir, '--debug']);
  } else {
    console.log('  [A1] skipped');
  }

  // Step 2: A2 task mode
  run('[A2-task]', [tsxPath, a2CliPath, bundlePath, jsonDir]);

  // Step 3: Viz
  run('[VIZ]', [tsxPath, vizCliPath, outputDir]);

  console.log('');
}

console.log('All subjects complete.');
