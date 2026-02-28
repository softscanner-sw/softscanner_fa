/**
 * viz-cli.ts
 * CLI entry: reads a phase1-bundle.json from json/ and writes visualization
 * files to vis/ under the same output directory.
 *
 * Output layout:
 *   <outputDir>/vis/data.js                — VizData JSON blob
 *   <outputDir>/vis/a1-graph.html          — interactive navigation graph
 *   <outputDir>/vis/a2-mock-workflows.html — exemplar workflow cards
 *   <outputDir>/vis/a3-mock-pruning.html   — pruning decision view
 *
 * Usage:
 *   npm run viz -- <outputDir>
 *
 * Example:
 *   npm run viz -- output/heroes-angular
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import type { Phase1Bundle } from './models/multigraph.js';
import { extractVizData } from './visualization/data-extractor.js';
import { findExemplarPaths } from './visualization/path-finder.js';
import { applyPruningPolicy } from './visualization/pruning-policy.js';
import {
  generateA1GraphHtml,
  generateA2WorkflowsHtml,
  generateA3PruningHtml,
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
  console.error('  Writes: <outputDir>/vis/data.js + 3 HTML files');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

const resolvedBase = path.resolve(baseDir);
const bundlePath = path.join(resolvedBase, 'json', 'phase1-bundle.json');
const visDir = path.join(resolvedBase, 'vis');

console.log(`[viz] Reading bundle: ${bundlePath}`);
const raw = readFileSync(bundlePath, 'utf-8');
const bundle = JSON.parse(raw) as Phase1Bundle;

// Pass 1: extract nodes/edges for path-finding (no exemplar paths yet)
const partial = extractVizData(bundle, []);

// Find exemplar paths via bounded DFS
const rawPaths = findExemplarPaths(partial.nodes, partial.edges, partial.entryNodeIds);

// Apply demo pruning policy
const paths = applyPruningPolicy(rawPaths);

// Pass 2: extract final VizData with exemplar paths + complete stats
const vizData = extractVizData(bundle, paths);

console.log(
  `[viz] Stats: ${vizData.stats.nodeCount} nodes (${vizData.stats.routeNodes} routes, ${vizData.stats.componentNodes} components, ` +
  `${vizData.stats.widgetNodes} widgets, ${vizData.stats.serviceNodes} services), ` +
  `${vizData.stats.edgeCount} edges (${vizData.stats.structuralEdgeCount} structural, ${vizData.stats.executableEdgeCount} executable), ` +
  `${vizData.stats.exemplarPaths} exemplar paths ` +
  `(${vizData.stats.feasible} feasible, ${vizData.stats.conditional} conditional, ${vizData.stats.pruned} pruned)`,
);

// ---------------------------------------------------------------------------
// Write output files
// ---------------------------------------------------------------------------

mkdirSync(visDir, { recursive: true });

const dataJs = path.join(visDir, 'data.js');
const a1Html = path.join(visDir, 'a1-graph.html');
const a2Html = path.join(visDir, 'a2-mock-workflows.html');
const a3Html = path.join(visDir, 'a3-mock-pruning.html');

writeFileSync(dataJs, 'var VIZ_DATA = ' + JSON.stringify(vizData, null, 2) + ';\n', 'utf-8');
writeFileSync(a1Html, generateA1GraphHtml(vizData), 'utf-8');
writeFileSync(a2Html, generateA2WorkflowsHtml(vizData), 'utf-8');
writeFileSync(a3Html, generateA3PruningHtml(vizData), 'utf-8');

console.log(`[viz] Written to ${visDir}:`);
console.log(`  data.js`);
console.log(`  a1-graph.html`);
console.log(`  a2-mock-workflows.html`);
console.log(`  a3-mock-pruning.html`);
