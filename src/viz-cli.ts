/**
 * viz-cli.ts
 * CLI entry: reads phase1-bundle.json and A2 task workflow artifact
 * from json/ and writes visualization files to vis/ under the same output directory.
 *
 * Output layout:
 *   <outputDir>/vis/data.js                   — VizData JSON blob
 *   <outputDir>/vis/a1-graph.html             — interactive navigation graph
 *   <outputDir>/vis/a2-task-workflows.html    — A2 task workflow explorer
 *
 * Usage:
 *   npm run viz -- <outputDir>
 *
 * Example:
 *   npm run viz -- output/heroes-angular
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';
import type { Phase1Bundle } from './models/multigraph.js';
import { extractVizData } from './visualization/data-extractor.js';
import {
  generateA1GraphHtml,
  generateA2TaskWorkflowsHtml,
} from './visualization/generators.js';

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const baseDir = args[0];

if (baseDir === undefined || baseDir === '') {
  console.error('Usage: npm run viz -- <outputDir>');
  console.error('Example: npm run viz -- output/heroes-angular');
  console.error('');
  console.error('  Reads:  <outputDir>/json/phase1-bundle.json');
  console.error('          <outputDir>/json/phaseA2-taskworkflows.final.json (optional)');
  console.error('  Writes: <outputDir>/vis/data.js + 2 HTML files');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

const resolvedBase = path.resolve(baseDir);
const bundlePath = path.join(resolvedBase, 'json', 'phase1-bundle.json');
const taskPath = path.join(resolvedBase, 'json', 'phaseA2-taskworkflows.final.json');
const visDir = path.join(resolvedBase, 'vis');

// Read Phase1Bundle
console.log(`[viz] Reading bundle: ${bundlePath}`);
const raw = readFileSync(bundlePath, 'utf-8');
const bundle = JSON.parse(raw) as Phase1Bundle;

// Extract VizData
const vizData = extractVizData(bundle);

console.log(
  `[viz] Stats: ${vizData.stats.nodeCount} nodes (${vizData.stats.routeNodes} routes, ${vizData.stats.componentNodes} components, ` +
  `${vizData.stats.widgetNodes} widgets, ${vizData.stats.serviceNodes} services), ` +
  `${vizData.stats.edgeCount} edges (${vizData.stats.structuralEdgeCount} structural, ${vizData.stats.executableEdgeCount} executable)`,
);

// Optionally read A2 task artifact
let taskJson = '{}';
if (existsSync(taskPath)) {
  console.log(`[viz] Reading A2 task artifact: ${taskPath}`);
  taskJson = readFileSync(taskPath, 'utf-8');
} else {
  console.log(`[viz] No A2 task artifact found at ${taskPath}, A2 task page will be empty.`);
}

// ---------------------------------------------------------------------------
// Write output files
// ---------------------------------------------------------------------------

mkdirSync(visDir, { recursive: true });

const dataJs = path.join(visDir, 'data.js');
const a1Html = path.join(visDir, 'a1-graph.html');
const a2TaskHtml = path.join(visDir, 'a2-task-workflows.html');

writeFileSync(dataJs, 'var VIZ_DATA = ' + JSON.stringify(vizData, null, 2) + ';\n', 'utf-8');
writeFileSync(a1Html, generateA1GraphHtml(vizData), 'utf-8');
writeFileSync(a2TaskHtml, generateA2TaskWorkflowsHtml(vizData, taskJson), 'utf-8');

console.log(`[viz] Written to ${visDir}:`);
console.log(`  data.js`);
console.log(`  a1-graph.html`);
console.log(`  a2-task-workflows.html`);
