#!/usr/bin/env node
/**
 * subject-stats.mjs
 * Comprehensive per-subject statistics extraction from A1+A2 output artifacts.
 * Reads from output/<subject>/json/ and produces a JSON summary.
 *
 * Usage:
 *   node scripts/analysis/subject-stats.mjs [subjectName...]
 *   node scripts/analysis/subject-stats.mjs          # all subjects
 *   node scripts/analysis/subject-stats.mjs ever-traduora heroes-angular
 *
 * Output: docs/analysis/_artifacts/v2/subject-stats.json
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import * as path from 'path';

const OUTPUT_DIR = 'output';
const ARTIFACT_DIR = 'docs/analysis/_artifacts/v2';

const STRUCTURAL_KINDS = new Set([
  'MODULE_DECLARES_COMPONENT','MODULE_DECLARES_ROUTE','MODULE_IMPORTS_MODULE',
  'MODULE_EXPORTS_MODULE','MODULE_PROVIDES_SERVICE','ROUTE_HAS_CHILD',
  'ROUTE_ACTIVATES_COMPONENT','COMPONENT_CONTAINS_WIDGET','COMPONENT_COMPOSES_COMPONENT'
]);

const EXECUTABLE_KINDS = new Set([
  'ROUTE_REDIRECTS_TO_ROUTE','WIDGET_NAVIGATES_ROUTE','WIDGET_NAVIGATES_EXTERNAL',
  'WIDGET_TRIGGERS_HANDLER','WIDGET_SUBMITS_FORM',
  'COMPONENT_CALLS_SERVICE','COMPONENT_NAVIGATES_ROUTE'
]);

const WIDGET_ORIGIN_KINDS = new Set([
  'WIDGET_NAVIGATES_ROUTE','WIDGET_NAVIGATES_EXTERNAL',
  'WIDGET_TRIGGERS_HANDLER','WIDGET_SUBMITS_FORM'
]);

function analyzeSubject(name) {
  const jsonDir = path.join(OUTPUT_DIR, name, 'json');
  const bundlePath = path.join(jsonDir, 'a1-multigraph.json');
  const rawPath = path.join(jsonDir, 'phaseA2-workflows.raw.json');
  const finalPath = path.join(jsonDir, 'phaseA2-workflows.final.json');
  const summaryPath = path.join(jsonDir, 'phaseA2.summary.json');

  if (!existsSync(bundlePath)) {
    return { name, error: `Missing ${bundlePath}` };
  }

  const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
  const { nodes, edges } = bundle.multigraph;

  // ── A1 Analysis ──

  // Node counts by kind
  const nodeCounts = {};
  for (const n of nodes) {
    nodeCounts[n.kind] = (nodeCounts[n.kind] || 0) + 1;
  }

  // Edge counts by kind
  const edgeCounts = {};
  const structuralCounts = {};
  const executableCounts = {};
  for (const e of edges) {
    edgeCounts[e.kind] = (edgeCounts[e.kind] || 0) + 1;
    if (STRUCTURAL_KINDS.has(e.kind)) {
      structuralCounts[e.kind] = (structuralCounts[e.kind] || 0) + 1;
    }
    if (EXECUTABLE_KINDS.has(e.kind)) {
      executableCounts[e.kind] = (executableCounts[e.kind] || 0) + 1;
    }
  }

  // Route analysis
  const routeNodes = nodes.filter(n => n.kind === 'Route');
  const entryRoutes = routeNodes.filter(n => n.meta?.isEntry);
  const nonEntryTopLevel = routeNodes.filter(n => !n.meta?.isEntry && !n.meta?.isWildcard);
  const routesWithComponent = edges.filter(e => e.kind === 'ROUTE_ACTIVATES_COMPONENT');
  const routesWithRedirect = edges.filter(e => e.kind === 'ROUTE_REDIRECTS_TO_ROUTE');
  const routeHasChild = edges.filter(e => e.kind === 'ROUTE_HAS_CHILD');

  // Entry route details
  const entryRouteDetails = entryRoutes.map(r => ({
    fullPath: r.meta.fullPath,
    isTopLevel: r.meta.isTopLevel,
    hasComponent: routesWithComponent.some(e => e.from === r.id),
    hasRedirect: routesWithRedirect.some(e => e.from === r.id),
    routeType: r.meta.routeType || 'undefined',
  }));

  // Widget analysis
  const widgetNodes = nodes.filter(n => n.kind === 'Widget');
  const widgetsWithEvents = widgetNodes.filter(w => w.meta?.eventNames?.length > 0);
  const widgetsWithRouterLink = widgetNodes.filter(w => w.meta?.routerLinkText);
  const widgetsWithHref = widgetNodes.filter(w => w.meta?.staticHref);

  // Widget-origin edge distribution
  const woEdgesByKind = {};
  const woDistinctWidgets = {};
  for (const kind of WIDGET_ORIGIN_KINDS) {
    const es = edges.filter(e => e.kind === kind);
    woEdgesByKind[kind] = es.length;
    woDistinctWidgets[kind] = new Set(es.map(e => e.from)).size;
  }

  // Component-origin edges
  const ccsEdges = edges.filter(e => e.kind === 'COMPONENT_CALLS_SERVICE');
  const cnrEdges = edges.filter(e => e.kind === 'COMPONENT_NAVIGATES_ROUTE');

  // Missing fields check (schema conformance)
  const routesMissingRouteType = routeNodes.filter(r => r.meta.routeType === undefined).length;

  // Check for route parents that don't have activation
  const routeIdsWithActivation = new Set(routesWithComponent.map(e => e.from));
  const entryRoutesWithoutActivation = entryRoutes.filter(r => !routeIdsWithActivation.has(r.id));

  // ── A2 Analysis ──
  let a2Stats = null;
  if (existsSync(rawPath) && existsSync(finalPath)) {
    const raw = JSON.parse(readFileSync(rawPath, 'utf8'));
    const final = JSON.parse(readFileSync(finalPath, 'utf8'));

    // Collapse group analysis
    const collapseGroups = final.workflows.map(w => ({
      id: w.id,
      collapsedCount: w.meta.collapsedIds.length,
      collapsedIds: w.meta.collapsedIds,
    }));
    collapseGroups.sort((a, b) => b.collapsedCount - a.collapsedCount);

    // Start route distribution in raw
    const rawStartRoutes = {};
    for (const w of raw.workflows) {
      rawStartRoutes[w.startRouteId] = (rawStartRoutes[w.startRouteId] || 0) + 1;
    }

    // Start route distribution in final
    const finalStartRoutes = {};
    for (const w of final.workflows) {
      finalStartRoutes[w.startRouteId] = (finalStartRoutes[w.startRouteId] || 0) + 1;
    }

    // Verdict distribution
    const verdictDist = { FEASIBLE: 0, CONDITIONAL: 0, PRUNED: 0 };
    for (const w of final.workflows) {
      verdictDist[w.verdict] = (verdictDist[w.verdict] || 0) + 1;
    }

    // Edge-kind participation rates in final workflows
    const kindParticipation = {};
    for (const w of final.workflows) {
      const kindsInWf = new Set();
      for (const stepId of w.steps) {
        const e = edges.find(ed => ed.id === stepId);
        if (e) kindsInWf.add(e.kind);
      }
      for (const k of kindsInWf) {
        kindParticipation[k] = (kindParticipation[k] || 0) + 1;
      }
    }
    // Convert to percentages
    const wfCount = final.workflows.length;
    const kindParticipationPct = {};
    for (const [k, v] of Object.entries(kindParticipation)) {
      kindParticipationPct[k] = Math.round((v / wfCount) * 1000) / 10;
    }

    // Step count distribution
    const stepCounts = final.workflows.map(w => w.steps.length);
    stepCounts.sort((a, b) => a - b);
    const stepCountDist = {};
    for (const sc of stepCounts) {
      stepCountDist[sc] = (stepCountDist[sc] || 0) + 1;
    }

    // Workflows starting with RR (redirect)
    let wfStartingWithRR = 0;
    for (const w of raw.workflows) {
      if (w.steps.length > 0) {
        const firstEdge = edges.find(e => e.id === w.steps[0]);
        if (firstEdge && firstEdge.kind === 'ROUTE_REDIRECTS_TO_ROUTE') {
          wfStartingWithRR++;
        }
      }
    }

    a2Stats = {
      rawCount: raw.stats.workflowCount,
      statesExpanded: raw.stats.statesExpanded,
      finalCount: final.stats.workflowCount,
      verdictDist,
      signatureCount: final.stats.signatureCount,
      dedupRatio: Math.round((raw.stats.workflowCount / Math.max(1, final.stats.workflowCount)) * 10) / 10,
      collapseGroupTop10: collapseGroups.slice(0, 10),
      rawStartRoutes,
      finalStartRoutes,
      kindParticipationPct,
      stepCountDist,
      wfStartingWithRR,
      wfStartingWithRRPct: Math.round((wfStartingWithRR / Math.max(1, raw.stats.workflowCount)) * 1000) / 10,
    };
  }

  return {
    name,
    a1: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      structuralCount: bundle.stats.structuralEdgeCount,
      executableCount: bundle.stats.executableEdgeCount,
      nodeCounts,
      structuralCounts,
      executableCounts,
      routeCount: routeNodes.length,
      entryRouteCount: entryRoutes.length,
      entryRouteDetails,
      entryRoutesWithoutActivation: entryRoutesWithoutActivation.map(r => r.meta.fullPath),
      routeHasChildCount: routeHasChild.length,
      routesMissingRouteType,
      widgetCount: widgetNodes.length,
      widgetsWithEvents: widgetsWithEvents.length,
      widgetsWithRouterLink: widgetsWithRouterLink.length,
      widgetsWithHref: widgetsWithHref.length,
      woEdgesByKind,
      woDistinctWidgets,
      ccsEdgeCount: ccsEdges.length,
      cnrEdgeCount: cnrEdges.length,
    },
    a2: a2Stats,
  };
}

// Discover subjects
const requestedSubjects = process.argv.slice(2);
let subjects;
if (requestedSubjects.length > 0) {
  subjects = requestedSubjects;
} else {
  subjects = readdirSync(OUTPUT_DIR).filter(name => {
    const jsonDir = path.join(OUTPUT_DIR, name, 'json');
    return existsSync(path.join(jsonDir, 'a1-multigraph.json'));
  }).sort();
}

const results = subjects.map(s => analyzeSubject(s));

// Output
if (!existsSync(ARTIFACT_DIR)) mkdirSync(ARTIFACT_DIR, { recursive: true });
writeFileSync(path.join(ARTIFACT_DIR, 'subject-stats.json'), JSON.stringify(results, null, 2));

// Console summary
console.log('=== Subject Statistics Summary ===\n');
for (const r of results) {
  if (r.error) {
    console.log(`${r.name}: ERROR — ${r.error}`);
    continue;
  }
  console.log(`--- ${r.name} ---`);
  console.log(`  A1: ${r.a1.nodeCount} nodes, ${r.a1.edgeCount} edges (${r.a1.structuralCount}s/${r.a1.executableCount}e)`);
  console.log(`  Routes: ${r.a1.routeCount} total, ${r.a1.entryRouteCount} entry, ${r.a1.routeHasChildCount} parent-child`);
  console.log(`  Entry routes: ${r.a1.entryRouteDetails.map(d => `${d.fullPath}(comp=${d.hasComponent},redir=${d.hasRedirect})`).join(', ')}`);
  if (r.a1.entryRoutesWithoutActivation.length > 0) {
    console.log(`  ⚠ Entry routes WITHOUT component activation: ${r.a1.entryRoutesWithoutActivation.join(', ')}`);
  }
  if (r.a1.routesMissingRouteType > 0) {
    console.log(`  ⚠ Routes missing routeType: ${r.a1.routesMissingRouteType}/${r.a1.routeCount}`);
  }
  console.log(`  Widgets: ${r.a1.widgetCount} total, ${r.a1.widgetsWithEvents} with events, ${r.a1.widgetsWithRouterLink} with routerLink`);
  if (r.a2) {
    console.log(`  A2: raw=${r.a2.rawCount} final=${r.a2.finalCount} (${r.a2.dedupRatio}x dedup) states=${r.a2.statesExpanded}`);
    console.log(`  Verdict: F=${r.a2.verdictDist.FEASIBLE} C=${r.a2.verdictDist.CONDITIONAL} P=${r.a2.verdictDist.PRUNED}`);
    console.log(`  RR-start: ${r.a2.wfStartingWithRR}/${r.a2.rawCount} (${r.a2.wfStartingWithRRPct}%)`);
    if (r.a2.collapseGroupTop10.length > 0 && r.a2.collapseGroupTop10[0].collapsedCount > 1) {
      console.log(`  Top collapse groups: ${r.a2.collapseGroupTop10.filter(g => g.collapsedCount > 1).map(g => g.collapsedCount).join(', ')}`);
    }
  }
  console.log('');
}

console.log(`\nFull results: ${path.join(ARTIFACT_DIR, 'subject-stats.json')}`);
