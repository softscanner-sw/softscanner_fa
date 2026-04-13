#!/usr/bin/env node
/**
 * verify-b0-determinism.mjs
 * Runs B0 manifest validation twice and diffs the b0-summary.json outputs.
 * Exits 0 if both runs produce identical output; exits 1 on any difference.
 *
 * Usage:
 *   node scripts/verify-b0-determinism.mjs
 *
 * Prerequisites:
 *   - Subject manifests must exist under subjects/<subject>/subject-manifest.json
 *   - A2 outputs must exist under output/<subject>/json/a2-workflows.json
 */

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const repoRoot = path.resolve('.');
const tsxPath = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const b0Cli = path.join(repoRoot, 'src', 'b0-cli.ts');

// Create a small wrapper script that overrides the logs dir
function createWrapper(logsDir) {
  const wrapperContent = `
import * as path from 'node:path';
import { runB0Validation } from '${path.join(repoRoot, 'src', 'phase-b', 'b0', 'b0-runner.ts').replace(/\\/g, '/')}';
const config = {
  subjectsDir: path.join('${repoRoot.replace(/\\/g, '/')}', 'subjects'),
  outputDir: path.join('${repoRoot.replace(/\\/g, '/')}', 'output'),
  logsDir: '${logsDir.replace(/\\/g, '/')}',
};
runB0Validation(config);
`;
  const tmpFile = path.join(logsDir, '_b0_wrapper.ts');
  fs.writeFileSync(tmpFile, wrapperContent, 'utf-8');
  return tmpFile;
}

function runB0(logsDir, label) {
  fs.mkdirSync(logsDir, { recursive: true });
  const wrapper = createWrapper(logsDir);

  console.log(`[${label}] Running B0 validation…`);
  const result = spawnSync(
    process.execPath,
    [tsxPath, wrapper],
    {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
    },
  );
  if (result.status !== 0) {
    console.error(`[${label}] B0 validation failed:`);
    if (result.stderr) console.error(result.stderr.toString().slice(-500));
    process.exit(1);
  }
  console.log(`[${label}] Done.`);
}

// Create temp dirs
const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'b0-determinism-'));
const logsDir1 = path.join(tmpBase, 'run1');
const logsDir2 = path.join(tmpBase, 'run2');

// Run twice
runB0(logsDir1, 'Run 1');
runB0(logsDir2, 'Run 2');

// Compare b0-summary.json
const summaryPath1 = path.join(logsDir1, 'b0-summary.json');
const summaryPath2 = path.join(logsDir2, 'b0-summary.json');

if (!fs.existsSync(summaryPath1)) {
  console.error('Run 1 did not produce b0-summary.json');
  process.exit(1);
}
if (!fs.existsSync(summaryPath2)) {
  console.error('Run 2 did not produce b0-summary.json');
  process.exit(1);
}

const summary1 = fs.readFileSync(summaryPath1, 'utf-8');
const summary2 = fs.readFileSync(summaryPath2, 'utf-8');

if (summary1 === summary2) {
  console.log('');
  console.log('B0 determinism verified: b0-summary.json is byte-identical across runs.');
  // Clean up
  fs.rmSync(tmpBase, { recursive: true, force: true });
  process.exit(0);
} else {
  console.error('');
  console.error('B0 DETERMINISM FAILURE: b0-summary.json differs between runs.');
  console.error(`  Run 1: ${summaryPath1}`);
  console.error(`  Run 2: ${summaryPath2}`);
  process.exit(1);
}
