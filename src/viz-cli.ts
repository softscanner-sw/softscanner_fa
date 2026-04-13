/**
 * viz-cli.ts
 * CLI entry: reads Phase A/B artifacts from json/ and writes visualization
 * files to vis/ under the same output directory.
 *
 * Output layout:
 *   <outputDir>/vis/data.js                   — VizData JSON blob
 *   <outputDir>/vis/a1-graph.html             — interactive navigation graph
 *   <outputDir>/vis/a2-task-workflows.html    — A2 task workflow explorer
 *   <outputDir>/vis/b3-execution.html         — Phase B execution dashboard (if B3 results exist)
 *
 * Usage:
 *   npm run viz -- <outputDir>
 *
 * Example:
 *   npm run viz -- output/heroes-angular
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import { PipelineLogger } from './services/logger.js';
import type { A1Multigraph } from './models/multigraph.js';
import { extractVizData } from './visualization/data-extractor.js';
import {
  generateA1GraphHtml,
  generateA2TaskWorkflowsHtml,
  generateB3ExecutionHtml,
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
  console.error('  Reads:  <outputDir>/json/a1-multigraph.json');
  console.error('          <outputDir>/json/a2-workflows.json (optional)');
  console.error('          <outputDir>/json/b3-results.json (optional)');
  console.error('          <outputDir>/json/b4-coverage.json (optional)');
  console.error('          <outputDir>/logs/*.log.json (optional)');
  console.error('  Writes: <outputDir>/vis/data.js + HTML files');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Pipeline — Phase A
// ---------------------------------------------------------------------------

const resolvedBase = path.resolve(baseDir);
const bundlePath = path.join(resolvedBase, 'json', 'a1-multigraph.json');
const taskPath = path.join(resolvedBase, 'json', 'a2-workflows.json');
const visDir = path.join(resolvedBase, 'vis');
const subjectName = path.basename(resolvedBase);

const plog = new PipelineLogger('VIZ', 'visualization');
plog.info('pipeline-start', `Visualization starting for ${subjectName}`, { subject: subjectName });

// Read A1Multigraph
console.log(`[viz] Reading bundle: ${bundlePath}`);
const raw = readFileSync(bundlePath, 'utf-8');
const bundle = JSON.parse(raw) as A1Multigraph;

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
  console.log(`[viz] Reading A2 workflow artifact: ${taskPath}`);
  taskJson = readFileSync(taskPath, 'utf-8');
} else {
  console.log(`[viz] No A2 workflow artifact found at ${taskPath}, A2 page will be empty.`);
}

// ---------------------------------------------------------------------------
// Pipeline — Phase B (optional, only if B3 results exist)
// ---------------------------------------------------------------------------

const b1PlansPath = path.join(resolvedBase, 'json', 'b1-plans.json');
const b2TestsPath = path.join(resolvedBase, 'json', 'b2-tests.json');
const b3Path = path.join(resolvedBase, 'json', 'b3-results.json');
const b4Path = path.join(resolvedBase, 'json', 'b4-coverage.json');
const logsDir = path.join(resolvedBase, 'logs');

// Determine manifest path from subjects/ directory
const manifestPath = path.join(path.dirname(path.dirname(resolvedBase)), 'subjects', subjectName, 'subject-manifest.json');

// Phase B visualization requires B2 tests (canonical source). B3/B4/logs are optional.
let hasPhaseB = false;
if (existsSync(b2TestsPath)) {
  hasPhaseB = true;
  console.log(`[viz] Reading B2 test set (canonical): ${b2TestsPath}`);
  const b1Json = existsSync(b1PlansPath) ? readFileSync(b1PlansPath, 'utf-8') : '{"plans":[]}';
  const b2Json = readFileSync(b2TestsPath, 'utf-8');
  const b3Json = existsSync(b3Path) ? readFileSync(b3Path, 'utf-8') : '{"results":[]}';
  const b4Json = existsSync(b4Path) ? readFileSync(b4Path, 'utf-8') : '{}';
  const manifestJson = existsSync(manifestPath) ? readFileSync(manifestPath, 'utf-8') : '{}';

  if (existsSync(b3Path)) console.log(`[viz] Reading B3 results: ${b3Path}`);
  if (existsSync(b4Path)) console.log(`[viz] Reading B4 coverage: ${b4Path}`);

  // Read B5.0 execution logs
  const logEntries: Array<{ testFile: string; logJson: string }> = [];
  if (existsSync(logsDir)) {
    const logFiles = readdirSync(logsDir).filter(f => f.endsWith('.log.json')).sort();
    for (const lf of logFiles) {
      const testFile = lf.replace('.log.json', '.test.ts');
      logEntries.push({
        testFile,
        logJson: readFileSync(path.join(logsDir, lf), 'utf-8'),
      });
    }
    console.log(`[viz] Read ${logEntries.length} B5.0 execution logs from ${logsDir}`);
  }

  if (existsSync(b1PlansPath)) console.log(`[viz] Reading B1 plans: ${b1PlansPath}`);
  const b3Html = generateB3ExecutionHtml(subjectName, b1Json, b2Json, b3Json, b4Json, manifestJson, logEntries);
  mkdirSync(visDir, { recursive: true });
  writeFileSync(path.join(visDir, 'b3-execution.html'), b3Html, 'utf-8');
} else {
  console.log(`[viz] No B2 test set found at ${b2TestsPath}, skipping Phase B visualization.`);
}

// ---------------------------------------------------------------------------
// Write Phase A output files
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
if (hasPhaseB) {
  console.log(`  b3-execution.html`);
}

plog.info('pipeline-complete', `Visualization complete for ${subjectName}`, {
  subject: subjectName, outcome: 'success',
  context: { hasPhaseB, files: hasPhaseB ? 4 : 3 },
});
plog.flush(path.resolve('logs', 'viz-pipeline.jsonl'));
