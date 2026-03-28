import { readFileSync } from 'fs';

const bundle = JSON.parse(readFileSync('output/softscanner-cqa-frontend/json/a1-multigraph.json', 'utf8'));
const tw = JSON.parse(readFileSync('output/softscanner-cqa-frontend/json/a2-workflows.json', 'utf8'));
const gtFile = JSON.parse(readFileSync('docs/analysis/task-workflow-ground-truth.json', 'utf8'));
const cqaGT = gtFile.subjects['softscanner-cqa-frontend'].gt;

// Build edge index from A1 bundle
const edgeById = new Map();
for (const e of bundle.multigraph.edges) {
  edgeById.set(e.id, e);
}

// Build node index
const nodeById = new Map();
for (const n of bundle.multigraph.nodes) {
  nodeById.set(n.id, n);
}

console.log('=== softscanner-cqa-frontend: Post-Patch-7 Reconciliation ===');
console.log('GT entries: ' + cqaGT.length);
console.log('TaskWorkflows: ' + tw.workflows.length);
console.log('');

// ---- Summarize each TaskWorkflow ----
console.log('=== TaskWorkflow Summary ===');
const twSummaries = tw.workflows.map((wf, i) => {
  const trigEdge = edgeById.get(wf.triggerEdgeId);
  if (!trigEdge) {
    console.log('TW[' + i + '] MISSING trigger edge in A1!');
    return null;
  }

  const compClass = trigEdge.to ? trigEdge.to.match(/#(\w+)$/)?.[1] : '?';
  const widgetId = trigEdge.from;
  const widgetParts = widgetId.split('|');
  const tag = widgetParts[2] || '?';
  const handler = trigEdge.handler ? trigEdge.handler.methodName : null;
  const kind = trigEdge.kind;

  // Collect all step edges
  const stepEdgeIds = wf.steps.map(s => s.edgeId);
  const stepEdges = stepEdgeIds.map(eid => edgeById.get(eid)).filter(Boolean);

  // Get service calls
  const ccsEdges = stepEdges.filter(e => e.kind === 'COMPONENT_CALLS_SERVICE');
  const cnrEdges = stepEdges.filter(e => e.kind === 'COMPONENT_NAVIGATES_ROUTE');

  const svcCalls = ccsEdges.map(e => {
    const svcMatch = e.to ? e.to.match(/#(\w+)$/) : null;
    return { serviceClass: svcMatch ? svcMatch[1] : '?', method: e.handler ? e.handler.methodName : '?' };
  });

  const navTargets = cnrEdges.map(e => e.to || 'unknown');

  // UI atoms
  const atoms = wf.constraints?.uiAtoms || [];
  const params = wf.constraints?.requiredParams || [];
  const guards = wf.constraints?.guards || [];

  const summary = {
    index: i,
    compClass,
    tag,
    handler,
    edgeKind: kind,
    verdict: wf.verdict,
    svcCalls,
    cnrEdges: navTargets,
    atoms,
    params,
    guards,
    startRouteIds: wf.startRouteIds,
  };

  console.log(`TW[${i}] comp=${compClass} tag=${tag} handler=${handler} edgeKind=${kind} verdict=${wf.verdict}`);
  if (svcCalls.length) console.log(`  serviceCalls: ${svcCalls.map(s => s.serviceClass + '.' + s.method).join(', ')}`);
  if (cnrEdges.length) console.log(`  navigation: ${navTargets.join(', ')}`);
  if (atoms.length) console.log(`  uiAtoms: ${atoms.map(a => a.kind + ':' + (a.literalValue !== undefined ? a.literalValue : a.exprText || '')).join(', ')}`);
  if (params.length) console.log(`  requiredParams: ${params.join(', ')}`);
  if (guards.length) console.log(`  guards: ${guards.join(', ')}`);
  console.log('');

  return summary;
}).filter(Boolean);

// ---- Match GT -> TW ----
console.log('=== GT -> TW Matching ===');
let matched = 0;
let missing = 0;
let wrongClosure = 0;
let wrongConstraint = 0;
const usedTWs = new Set();

for (const gt of cqaGT) {
  const gtComp = gt.trigger.componentClass;
  const gtHandler = gt.trigger.handler?.method || null;
  const gtEvent = gt.trigger.event;
  const gtTag = gt.trigger.widgetTag;

  // Find matching TW by component + handler + event type mapping
  // Map GT event to edge kind: submit -> WIDGET_SUBMITS_FORM, click/change/input/etc -> WIDGET_TRIGGERS_HANDLER
  const isSubmit = gtEvent === 'submit';
  const isRouterLink = gtEvent === 'routerLink' || gtEvent === 'href';
  const expectedKind = isSubmit ? 'WIDGET_SUBMITS_FORM' : isRouterLink ? 'WIDGET_NAVIGATES_ROUTE' : 'WIDGET_TRIGGERS_HANDLER';

  // Try to match
  let candidates = twSummaries.filter(tw =>
    tw.compClass === gtComp &&
    tw.edgeKind === expectedKind &&
    !usedTWs.has(tw.index)
  );

  // Further filter by handler if provided
  if (gtHandler) {
    const handlerMatches = candidates.filter(tw => tw.handler === gtHandler);
    if (handlerMatches.length > 0) candidates = handlerMatches;
  }

  // Further filter by tag if useful
  if (candidates.length > 1) {
    const tagNorm = gtTag.toLowerCase();
    const tagMatches = candidates.filter(tw => tw.tag.toLowerCase() === tagNorm);
    if (tagMatches.length > 0) candidates = tagMatches;
  }

  if (candidates.length === 0) {
    console.log(`${gt.gtId}: MISSING - no TW for comp=${gtComp} handler=${gtHandler} event=${gtEvent} tag=${gtTag}`);
    missing++;
    continue;
  }

  // Take first candidate
  const tw = candidates[0];
  usedTWs.add(tw.index);

  // ---- Check closure ----
  let closureOk = true;
  let closureIssues = [];

  // Check service calls
  const gtSvcs = gt.closure?.serviceCalls || [];
  if (gtSvcs.length !== tw.svcCalls.length) {
    closureOk = false;
    closureIssues.push(`svcCalls: GT=${gtSvcs.length} TW=${tw.svcCalls.length} (GT: ${gtSvcs.map(s => s.serviceClass + '.' + s.method).join(',')} vs TW: ${tw.svcCalls.map(s => s.serviceClass + '.' + s.method).join(',')})`);
  } else {
    // Check each service call matches
    for (const gtSvc of gtSvcs) {
      const found = tw.svcCalls.some(ts => ts.serviceClass === gtSvc.serviceClass && ts.method === gtSvc.method);
      if (!found) {
        closureOk = false;
        closureIssues.push(`svcCall missing: ${gtSvc.serviceClass}.${gtSvc.method}`);
      }
    }
  }

  // Check navigation
  const gtNav = gt.closure?.navigation;
  if (gtNav && gtNav.kind !== 'none' && gtNav.kind !== 'routerLink') {
    // Expect CNR edges
    if (tw.cnrEdges.length === 0) {
      closureOk = false;
      closureIssues.push('navigation missing: expected ' + gtNav.kind + ' -> ' + gtNav.target);
    }
  }

  // ---- Check constraints ----
  let constraintOk = true;
  let constraintIssues = [];

  const gtConstraints = gt.constraints || {};
  // Check verdict
  const gtHasConditions = (gtConstraints.uiGates?.length > 0) ||
                          (gtConstraints.guards?.length > 0) ||
                          (gtConstraints.roles?.length > 0) ||
                          (gtConstraints.requiredParams?.length > 0) ||
                          gtConstraints.formValid;
  const expectedVerdict = gtHasConditions ? 'CONDITIONAL' : 'FEASIBLE';

  if (tw.verdict !== expectedVerdict) {
    constraintOk = false;
    constraintIssues.push(`verdict: GT expects ${expectedVerdict}, TW has ${tw.verdict}`);
  }

  if (closureOk && constraintOk) {
    console.log(`${gt.gtId}: MATCHED -> TW[${tw.index}] comp=${tw.compClass} handler=${tw.handler} verdict=${tw.verdict}`);
    matched++;
  } else if (!closureOk) {
    console.log(`${gt.gtId}: WRONG-CLOSURE -> TW[${tw.index}] comp=${tw.compClass} handler=${tw.handler}`);
    closureIssues.forEach(iss => console.log('  ' + iss));
    wrongClosure++;
  } else {
    console.log(`${gt.gtId}: WRONG-CONSTRAINT -> TW[${tw.index}] comp=${tw.compClass} handler=${tw.handler}`);
    constraintIssues.forEach(iss => console.log('  ' + iss));
    wrongConstraint++;
  }
}

// Check for spurious TWs
const spurious = twSummaries.filter((_, i) => !usedTWs.has(i));
console.log('');
if (spurious.length > 0) {
  console.log('=== SPURIOUS TaskWorkflows (no GT match) ===');
  spurious.forEach(tw => {
    console.log(`  TW[${tw.index}] comp=${tw.compClass} tag=${tw.tag} handler=${tw.handler} verdict=${tw.verdict}`);
  });
}

console.log('');
console.log('=== RECONCILIATION SUMMARY ===');
console.log(`GT entries:       ${cqaGT.length}`);
console.log(`TaskWorkflows:    ${tw.workflows.length}`);
console.log(`Matched:          ${matched}`);
console.log(`Missing:          ${missing}`);
console.log(`Spurious:         ${spurious.length}`);
console.log(`Wrong-closure:    ${wrongClosure}`);
console.log(`Wrong-constraint: ${wrongConstraint}`);

// Specifically check GT-07 (toggleAssessment)
console.log('');
console.log('=== GT-07 (toggleAssessment) Deep Check ===');
const gt07 = cqaGT.find(g => g.gtId === 'GT-07');
const gt07Comp = gt07.trigger.componentClass;
const gt07Handler = gt07.trigger.handler?.method;
const gt07TW = twSummaries.find(tw => tw.compClass === gt07Comp && tw.handler === gt07Handler);
if (gt07TW) {
  console.log(`Found: TW[${gt07TW.index}] comp=${gt07TW.compClass} handler=${gt07TW.handler} verdict=${gt07TW.verdict}`);
  console.log(`  Service calls: ${gt07TW.svcCalls.map(s => s.serviceClass + '.' + s.method).join(', ') || 'none'}`);
  console.log(`  GT expects: ApiService.startAssessment`);
  const hasCCS = gt07TW.svcCalls.some(s => s.serviceClass === 'ApiService' && s.method === 'startAssessment');
  console.log(`  CCS match: ${hasCCS ? 'YES (FIXED)' : 'NO (still wrong)'}`);
} else {
  console.log('NOT FOUND in TaskWorkflows');
}
