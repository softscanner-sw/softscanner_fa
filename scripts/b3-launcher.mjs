#!/usr/bin/env node
/**
 * b3-launcher.mjs
 *
 * B3 CANNOT be launched via `npm run` on Windows.
 *
 * npm's Windows process lifecycle management kills grandchild subprocess
 * event loops (WebDriver/Chrome) before async work completes. This affects
 * ALL spawn strategies (execFile, spawn, detached, shell, spawnSync) when
 * the ancestor process tree includes npm lifecycle management.
 *
 * This launcher prints the canonical direct invocation command and exits.
 * Copy and run the printed command directly.
 *
 * Canonical invocation:
 *   node node_modules/tsx/dist/cli.mjs src/b3-cli.ts <subject> [flags]
 */

import path from 'node:path';

const args = process.argv.slice(2);
const projectRoot = process.cwd();
const tsxCli = path.join('node_modules', 'tsx', 'dist', 'cli.mjs');

if (args.length === 0) {
  console.log('B3 Test Execution CLI');
  console.log('');
  console.log('NOTE: B3 must be invoked directly, not via npm run.');
  console.log('      npm lifecycle management on Windows kills Selenium subprocesses.');
  console.log('');
  console.log('Usage:');
  console.log(`  node ${tsxCli} src/b3-cli.ts <subject> [flags]`);
  console.log('');
  console.log('Examples:');
  console.log(`  node ${tsxCli} src/b3-cli.ts posts-users-ui-ng --max-retries 1`);
  console.log(`  node ${tsxCli} src/b3-cli.ts ever-traduora --max-retries 1 --batch-size 10`);
  console.log(`  node ${tsxCli} src/b3-cli.ts heroes-angular --failed-only`);
  process.exit(0);
}

// If args were provided, print the exact command to run
const cmd = `node ${tsxCli} src/b3-cli.ts ${args.join(' ')}`;
console.error('ERROR: B3 cannot run under npm lifecycle on Windows.');
console.error('Run this command directly instead:');
console.error('');
console.error(`  ${cmd}`);
console.error('');
process.exit(1);
