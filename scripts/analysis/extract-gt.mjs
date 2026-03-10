import { readFileSync } from 'fs';

const data = JSON.parse(readFileSync('output/spring-petclinic-angular/json/phaseA2-taskworkflows.final.json', 'utf8'));

console.log('Total workflows:', data.workflows.length);
console.log('Stats:', JSON.stringify(data.stats, null, 2));
console.log('---');

for (let i = 0; i < data.workflows.length; i++) {
  const w = data.workflows[i];
  const trigger = w.triggerEdgeId;
  const parts = trigger.split('::');
  const kind = parts[1]; // edge kind

  // Get component ID
  const compMatch = parts[0].match(/#(\w+)/);
  const comp = compMatch ? compMatch[1] : 'UNKNOWN';

  // Get widget info
  const widgetMatch = parts[0].match(/\.html:(\d+):(\d+)\|(\w+)\|(\d+)/);
  const widgetLoc = widgetMatch ? `${widgetMatch[1]}:${widgetMatch[2]}` : '';
  const widgetTag = widgetMatch ? widgetMatch[3] : '';
  const widgetIdx = widgetMatch ? widgetMatch[4] : '';

  // Handler from effectGroupId
  const handler = w.effectGroupId ? w.effectGroupId.split('::').pop() : '';

  // Effect edges (non-trigger, non-redirect)
  const effects = w.steps
    .filter(s => s.edgeId !== w.triggerEdgeId && s.kind !== 'ROUTE_REDIRECTS_TO_ROUTE')
    .map(s => s.kind);

  // All step kinds
  const allKinds = w.steps.map(s => s.kind);

  // Terminal route
  const terminal = w.terminalNodeId || '';
  const terminalShort = terminal.includes('@') ? terminal.split('@')[0] : terminal.split('#').pop();

  console.log(JSON.stringify({
    idx: i + 1,
    comp,
    widgetTag,
    widgetLoc,
    widgetIdx,
    triggerKind: kind,
    handler,
    verdict: w.verdict,
    stepCount: w.steps.length,
    effects,
    allKinds,
    explanation: w.explanation,
    terminalShort,
    startRouteCount: w.startRouteIds.length,
    meta: w.meta,
    hasRedirectClosure: w.meta?.redirectClosureStabilized || false,
    hasUnresolved: w.meta?.unresolvedTargets?.length > 0,
  }));
}
