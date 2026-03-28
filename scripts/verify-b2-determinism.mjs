#!/usr/bin/env node
/**
 * verify-b2-determinism.mjs
 * Runs B2 code generation twice and diffs the b2-summary.json.
 * Exits 0 if identical; exits 1 on any diff.
 *
 * Usage:
 *   node scripts/verify-b2-determinism.mjs
 */

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const repoRoot = path.resolve('.');
const tsxPath = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');

function createWrapper(logsDir) {
  const wrapperContent = `
import * as path from 'node:path';
import { runB2CodeGeneration } from '${path.join(repoRoot, 'src', 'phase-b', 'b2', 'b2-runner.ts').replace(/\\/g, '/')}';
const config = {
  outputDir: path.join('${repoRoot.replace(/\\/g, '/')}', 'output'),
  subjectsDir: path.join('${repoRoot.replace(/\\/g, '/')}', 'subjects'),
  logsDir: '${logsDir.replace(/\\/g, '/')}',
};
runB2CodeGeneration(config);
`;
  const tmpFile = path.join(logsDir, '_b2_wrapper.ts');
  fs.writeFileSync(tmpFile, wrapperContent, 'utf-8');
  return tmpFile;
}

function runB2(logsDir, label) {
  fs.mkdirSync(logsDir, { recursive: true });
  const wrapper = createWrapper(logsDir);

  console.log(`[${label}] Running B2 code generation…`);
  const result = spawnSync(
    process.execPath,
    [tsxPath, wrapper],
    {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
    },
  );
  if (result.status !== 0) {
    console.error(`[${label}] B2 code generation failed:`);
    if (result.stderr) console.error(result.stderr.toString().slice(-500));
    process.exit(1);
  }
  console.log(`[${label}] Done.`);
}

// Create temp dirs
const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'b2-determinism-'));
const logsDir1 = path.join(tmpBase, 'run1');
const logsDir2 = path.join(tmpBase, 'run2');

// Run twice
runB2(logsDir1, 'Run 1');
runB2(logsDir2, 'Run 2');

// Compare b2-summary.json
const summaryPath1 = path.join(logsDir1, 'b2-summary.json');
const summaryPath2 = path.join(logsDir2, 'b2-summary.json');

if (!fs.existsSync(summaryPath1) || !fs.existsSync(summaryPath2)) {
  console.error('One or both runs did not produce b2-summary.json');
  process.exit(1);
}

const summary1 = fs.readFileSync(summaryPath1, 'utf-8');
const summary2 = fs.readFileSync(summaryPath2, 'utf-8');

if (summary1 !== summary2) {
  console.error('');
  console.error('B2 DETERMINISM FAILURE: b2-summary.json differs between runs.');
  process.exit(1);
}

console.log('');
console.log('B2 determinism verified: b2-summary.json is byte-identical across runs.');

// Clean up
fs.rmSync(tmpBase, { recursive: true, force: true });
process.exit(0);
