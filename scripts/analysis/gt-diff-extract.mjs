#!/usr/bin/env node
// Extract task workflow details from all 6 subjects for GT comparison
import { readFileSync } from 'fs';
import { join } from 'path';

const OUTPUT_DIR = join(import.meta.dirname, '..', '..', 'output');
const SUBJECTS = [
  'posts-users-ui-ng',
  'heroes-angular',
  'softscanner-cqa-frontend',
  'airbus-inventory',
  'spring-petclinic-angular',
  'ever-traduora',
];

for (const subj of SUBJECTS) {
  const bundlePath = join(OUTPUT_DIR, subj, 'json', 'a1-multigraph.json');
  const taskPath = join(OUTPUT_DIR, subj, 'json', 'a2-workflows.json');

  let bundle, tasks;
  try {
    bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
    tasks = JSON.parse(readFileSync(taskPath, 'utf8'));
  } catch (e) {
    console.log(`\n=== ${subj} === SKIP (file not found)`);
    continue;
  }

  const edgeMap = new Map();
  for (const e of bundle.multigraph.edges) edgeMap.set(e.id, e);

  const nodeMap = new Map();
  for (const n of bundle.multigraph.nodes) nodeMap.set(n.id, n);

  console.log(`\n=== ${subj} === (${tasks.workflows.length} tasks)`);

  // Count edge kinds in multigraph
  const wnr = bundle.multigraph.edges.filter(e => e.kind === 'WIDGET_NAVIGATES_ROUTE');
  const wne = bundle.multigraph.edges.filter(e => e.kind === 'WIDGET_NAVIGATES_EXTERNAL');
  const wth = bundle.multigraph.edges.filter(e => e.kind === 'WIDGET_TRIGGERS_HANDLER');
  const wsf = bundle.multigraph.edges.filter(e => e.kind === 'WIDGET_SUBMITS_FORM');
  console.log(`A1 trigger edges: WNR=${wnr.length} WNE=${wne.length} WTH=${wth.length} WSF=${wsf.length} total=${wnr.length+wne.length+wth.length+wsf.length}`);
  console.log(`A2 tasks: ${tasks.workflows.length} (F=${tasks.stats.feasibleCount} C=${tasks.stats.conditionalCount} P=${tasks.stats.prunedCount})`);

  // List tasks
  for (let i = 0; i < tasks.workflows.length; i++) {
    const w = tasks.workflows[i];
    const te = edgeMap.get(w.triggerEdgeId);
    if (!te) {
      console.log(`  ${i+1}. MISSING EDGE: ${w.triggerEdgeId.substring(0, 80)}`);
      continue;
    }

    // Parse widget from node ID
    const fromNode = te.from || '';
    const pipeIdx = fromNode.indexOf('|');
    const compId = pipeIdx >= 0 ? fromNode.substring(0, pipeIdx) : fromNode;
    const widgetPart = pipeIdx >= 0 ? fromNode.substring(pipeIdx + 1) : '';

    // Extract component class name
    const hashIdx = compId.lastIndexOf('#');
    const compClass = hashIdx >= 0 ? compId.substring(hashIdx + 1) : compId.split('/').pop();

    // Extract template location from widget part
    const wParts = widgetPart.split('|');
    const templateLoc = wParts[0] || '';
    const widgetKind = wParts.length > 1 ? wParts[1] : '';

    // Target
    const target = te.to ? (te.to.startsWith('__ext__') ? 'EXTERNAL' : te.to.split('@')[0]) : 'null';

    const routes = w.startRouteIds.map(r => r.split('@')[0]).join(', ');
    const stepKinds = w.steps.map(s => s.kind).join(' → ');
    const handler = te.handler?.methodName || '';

    console.log(`  ${i+1}. ${te.kind} | ${compClass} | ${widgetKind} | handler:${handler} | target:${target} | routes:[${routes}] | steps:${stepKinds} | ${w.verdict}`);
  }

  // List WNR edges NOT in any task (missing triggers)
  const taskTriggerEdgeIds = new Set(tasks.workflows.map(w => w.triggerEdgeId));
  const missingWNR = wnr.filter(e => !taskTriggerEdgeIds.has(e.id));
  const missingWNE = wne.filter(e => !taskTriggerEdgeIds.has(e.id));
  const missingWTH = wth.filter(e => !taskTriggerEdgeIds.has(e.id));
  const missingWSF = wsf.filter(e => !taskTriggerEdgeIds.has(e.id));

  if (missingWNR.length + missingWNE.length + missingWTH.length + missingWSF.length > 0) {
    console.log(`\n  TRIGGER EDGES NOT IN A2 TASKS:`);
    for (const e of [...missingWNR, ...missingWNE, ...missingWTH, ...missingWSF]) {
      const fromNode = e.from || '';
      const pipeIdx = fromNode.indexOf('|');
      const compId = pipeIdx >= 0 ? fromNode.substring(0, pipeIdx) : fromNode;
      const hashIdx = compId.lastIndexOf('#');
      const compClass = hashIdx >= 0 ? compId.substring(hashIdx + 1) : compId.split('/').pop();
      const target = e.to ? (e.to.startsWith('__ext__') ? 'EXTERNAL' : e.to.split('@')[0]) : 'null';
      console.log(`    ${e.kind} | ${compClass} | handler:${e.handler?.methodName || ''} | target:${target}`);
    }
  }
}
