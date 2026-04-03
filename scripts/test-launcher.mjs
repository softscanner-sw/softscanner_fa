#!/usr/bin/env node
/**
 * test-launcher.mjs
 * Canonical B3 test execution launcher.
 *
 * ARCHITECTURE NOTE:
 * npm's process lifecycle management on Windows kills subprocess event loops
 * before async work (WebDriver/Chrome) completes. This affects ANY subprocess
 * spawned from an npm lifecycle script that performs async operations.
 *
 * Therefore, B3 MUST be invoked outside of npm's process tree.
 * The canonical invocation is:
 *
 *   node node_modules/tsx/dist/cli.mjs src/b3-cli.ts <subjectName> [flags]
 *
 * The npm script "b3" in package.json uses this exact invocation.
 * For individual test execution:
 *
 *   node node_modules/tsx/dist/cli.mjs <path-to-test.ts>
 *
 * This file serves as documentation of the execution contract.
 * B3's test-executor.ts spawns test subprocesses using:
 *
 *   spawn(process.execPath, [tsxCliPath, testFilePath], { ... })
 *
 * where tsxCliPath = node_modules/tsx/dist/cli.mjs
 *
 * This works correctly when B3 itself was NOT launched via `npm run`.
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

const testFilePath = process.argv[2];
if (!testFilePath) {
  console.error('Usage: node scripts/test-launcher.mjs <path-to-test.ts>');
  console.error('  Or use the canonical B3 CLI:');
  console.error('  node node_modules/tsx/dist/cli.mjs src/b3-cli.ts <subject> [--max-retries N] [--batch-size N]');
  process.exit(2);
}

// Register tsx and run the test
import('tsx/esm').catch(() => {});
const resolved = path.resolve(testFilePath);
import(pathToFileURL(resolved).href).catch((err) => {
  console.error(`test-launcher: ${err}`);
  process.exit(2);
});
