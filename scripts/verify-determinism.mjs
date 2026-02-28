#!/usr/bin/env node
/**
 * verify-determinism.mjs
 * Runs Phase 1 extraction twice on the same target and diffs the JSON output.
 * Exits 0 if both runs produce identical output; exits 1 on any difference.
 *
 * Usage:
 *   node scripts/verify-determinism.mjs <projectRoot> <tsConfigPath>
 *
 * Prerequisites:
 *   npm install && npm run build   (or: npx tsx src/cli.ts directly)
 */

import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const [, , projectRoot, rawTsConfigPath] = process.argv;

if (!projectRoot || !rawTsConfigPath) {
  console.error('Usage: node scripts/verify-determinism.mjs <projectRoot> <tsConfigPath>');
  process.exit(1);
}

// Resolve tsConfigPath relative to projectRoot (not CWD)
const tsConfigPath = path.isAbsolute(rawTsConfigPath)
  ? rawTsConfigPath
  : path.resolve(projectRoot, rawTsConfigPath);

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'softscanner-det-'));
const out1 = path.join(tmpDir, 'run1');
const out2 = path.join(tmpDir, 'run2');
fs.mkdirSync(out1);
fs.mkdirSync(out2);

const cliPath = path.resolve('src/cli.ts');
const tsxJsPath = path.resolve('node_modules/tsx/dist/cli.mjs');

function runExtraction(outputDir, runLabel) {
  console.log(`Running ${runLabel}…`);
  const result = spawnSync(
    process.execPath,
    [tsxJsPath, cliPath, projectRoot, tsConfigPath, outputDir],
    { encoding: 'utf8', stdio: 'pipe' },
  );
  if (result.status !== 0) {
    console.error(`${runLabel} failed:`);
    console.error(result.stderr || result.stdout);
    process.exit(1);
  }
  console.log(`  ${runLabel} OK`);
}

runExtraction(out1, 'Run 1');
runExtraction(out2, 'Run 2');

// Compare the two bundle files (cli.ts writes to json/ subdirectory)
const bundle1Path = path.join(out1, 'json', 'phase1-bundle.json');
const bundle2Path = path.join(out2, 'json', 'phase1-bundle.json');

const bundle1 = fs.readFileSync(bundle1Path, 'utf8');
const bundle2 = fs.readFileSync(bundle2Path, 'utf8');

if (bundle1 === bundle2) {
  console.log('');
  console.log('✓ Determinism check PASSED — both runs produced identical JSON output.');
  fs.rmSync(tmpDir, { recursive: true, force: true });
  process.exit(0);
} else {
  console.error('');
  console.error('✗ Determinism check FAILED — runs produced different output.');
  console.error(`  Run 1: ${bundle1Path}`);
  console.error(`  Run 2: ${bundle2Path}`);
  console.error('');

  // Find the first differing line for a quick hint
  const lines1 = bundle1.split('\n');
  const lines2 = bundle2.split('\n');
  const maxLines = Math.max(lines1.length, lines2.length);
  for (let i = 0; i < maxLines; i++) {
    if (lines1[i] !== lines2[i]) {
      console.error(`  First difference at line ${i + 1}:`);
      console.error(`    Run1: ${lines1[i] ?? '<missing>'}`);
      console.error(`    Run2: ${lines2[i] ?? '<missing>'}`);
      break;
    }
  }

  console.error('');
  console.error(`  Temp files kept at: ${tmpDir}`);
  process.exit(1);
}
