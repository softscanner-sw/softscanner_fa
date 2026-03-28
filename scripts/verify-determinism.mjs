#!/usr/bin/env node
/**
 * verify-determinism.mjs
 * Runs A1 extraction twice AND A2 (task mode) enumeration twice
 * on the same target and diffs all JSON outputs byte-for-byte.
 * Exits 0 if all runs produce identical output; exits 1 on any difference.
 *
 * Usage:
 *   node scripts/verify-determinism.mjs <projectRoot> <tsConfigPath>
 *
 * Prerequisites:
 *   npm install && npm run build   (or: npx tsx src/a1-cli.ts directly)
 */

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const rawArgs = process.argv.slice(2);
const positional = rawArgs.filter((a) => !a.startsWith('--'));
const [projectRoot, rawTsConfigPath] = positional;

if (!projectRoot || !rawTsConfigPath) {
  console.error('Usage: node scripts/verify-determinism.mjs <projectRoot> <tsConfigPath>');
  process.exit(1);
}

/**
 * Resolve tsconfig path flexibly.
 * Accepts absolute, subject-relative ("tsconfig.json"), or
 * repo-relative ("tests/fixtures/minimal-ng/tsconfig.json") paths.
 */
function resolveTsconfigPath(subjectRoot, tsconfigField) {
  if (path.isAbsolute(tsconfigField)) {
    return tsconfigField;
  }
  // Candidate A: subject-relative (e.g. "tsconfig.json", "src/tsconfig.app.json")
  const candidateA = path.resolve(subjectRoot, tsconfigField);
  if (fs.existsSync(candidateA)) {
    return candidateA;
  }
  // Candidate B: repo-relative / CWD-relative (e.g. "tests/fixtures/minimal-ng/tsconfig.json")
  const candidateB = path.resolve(tsconfigField);
  if (fs.existsSync(candidateB)) {
    return candidateB;
  }
  console.error(`Cannot find tsconfig at either of:`);
  console.error(`  subject-relative: ${candidateA}`);
  console.error(`  repo-relative:    ${candidateB}`);
  process.exit(1);
}

/**
 * Compare two files byte-for-byte.
 * Returns true if identical, false otherwise (prints first diff line).
 */
function compareFiles(path1, path2, label) {
  if (!fs.existsSync(path1)) {
    console.error(`  ${label}: MISSING from Run 1 (${path1})`);
    return false;
  }
  if (!fs.existsSync(path2)) {
    console.error(`  ${label}: MISSING from Run 2 (${path2})`);
    return false;
  }

  const content1 = fs.readFileSync(path1, 'utf8');
  const content2 = fs.readFileSync(path2, 'utf8');

  if (content1 === content2) {
    console.log(`  ${label}: PASS`);
    return true;
  }

  console.error(`  ${label}: FAIL`);
  const lines1 = content1.split('\n');
  const lines2 = content2.split('\n');
  const maxLines = Math.max(lines1.length, lines2.length);
  for (let i = 0; i < maxLines; i++) {
    if (lines1[i] !== lines2[i]) {
      console.error(`    First difference at line ${i + 1}:`);
      console.error(`      Run1: ${lines1[i] ?? '<missing>'}`);
      console.error(`      Run2: ${lines2[i] ?? '<missing>'}`);
      break;
    }
  }
  return false;
}

const tsConfigPath = resolveTsconfigPath(projectRoot, rawTsConfigPath);

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'softscanner-det-'));
const out1 = path.join(tmpDir, 'run1');
const out2 = path.join(tmpDir, 'run2');
fs.mkdirSync(out1);
fs.mkdirSync(out2);

const cliPath = path.resolve('src/a1-cli.ts');
const a2CliPath = path.resolve('src/a2-cli.ts');
const tsxJsPath = path.resolve('node_modules/tsx/dist/cli.mjs');

// ── A1 Determinism ─────────────────────────────────────────────────────────

function runA1(outputDir, runLabel) {
  console.log(`Running A1 ${runLabel}…`);
  const result = spawnSync(
    process.execPath,
    [tsxJsPath, cliPath, projectRoot, tsConfigPath, outputDir],
    { encoding: 'utf8', stdio: 'pipe' },
  );
  if (result.status !== 0) {
    console.error(`A1 ${runLabel} failed:`);
    console.error(result.stderr || result.stdout);
    process.exit(1);
  }
  console.log(`  A1 ${runLabel} OK`);
}

console.log('--- A1 Determinism Check ---');
runA1(out1, 'Run 1');
runA1(out2, 'Run 2');

const bundle1Path = path.join(out1, 'json', 'a1-multigraph.json');
const bundle2Path = path.join(out2, 'json', 'a1-multigraph.json');

const a1Pass = compareFiles(bundle1Path, bundle2Path, 'a1-multigraph.json');

if (!a1Pass) {
  console.error('');
  console.error('✗ A1 determinism check FAILED');
  console.error(`  Temp files kept at: ${tmpDir}`);
  process.exit(1);
}

// ── A2 Task-mode Determinism ─────────────────────────────────────────────

console.log('');
console.log('--- A2 Task-mode Determinism Check ---');

const taskOut1 = path.join(tmpDir, 'task-run1');
const taskOut2 = path.join(tmpDir, 'task-run2');
fs.mkdirSync(taskOut1);
fs.mkdirSync(taskOut2);

function runA2(inputBundle, outputDir, runLabel) {
  console.log(`Running A2 ${runLabel}…`);
  const result = spawnSync(
    process.execPath,
    [tsxJsPath, a2CliPath, inputBundle, outputDir],
    { encoding: 'utf8', stdio: 'pipe' },
  );
  if (result.status !== 0) {
    console.error(`A2 ${runLabel} failed:`);
    console.error(result.stderr || result.stdout);
    process.exit(1);
  }
  console.log(`  A2 ${runLabel} OK`);
}

runA2(bundle1Path, taskOut1, 'Run 1');
runA2(bundle1Path, taskOut2, 'Run 2');

const taskFile = 'a2-workflows.json';
const taskPass = compareFiles(
  path.join(taskOut1, taskFile),
  path.join(taskOut2, taskFile),
  taskFile,
);

if (!taskPass) {
  console.error('');
  console.error('✗ A2 (task) determinism check FAILED');
  console.error(`  Temp files kept at: ${tmpDir}`);
  process.exit(1);
}

// ── All passed ──────────────────────────────────────────────────────────────

console.log('');
console.log('✓ A1 + A2 (task) determinism check PASSED — all runs produced identical output.');
fs.rmSync(tmpDir, { recursive: true, force: true });
process.exit(0);
