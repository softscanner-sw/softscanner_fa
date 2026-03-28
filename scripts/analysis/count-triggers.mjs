import { readFileSync } from 'fs';

const data = JSON.parse(readFileSync('output/spring-petclinic-angular/json/a1-multigraph.json', 'utf8'));

const routes = data.multigraph.nodes.filter(n => n.kind === 'Route');
const entryRoutes = new Set(routes.filter(r => r.meta.isEntry).map(r => r.id));

const racEdges = data.multigraph.edges.filter(e => e.kind === 'ROUTE_ACTIVATES_COMPONENT');

// Get components reachable from entry routes
const entryComponents = new Set();
racEdges.forEach(e => {
  if (entryRoutes.has(e.from)) entryComponents.add(e.to);
});

// Also add components reachable via COMPONENT_COMPOSES_COMPONENT from entry components
const ccc = data.multigraph.edges.filter(e => e.kind === 'COMPONENT_COMPOSES_COMPONENT');
let changed = true;
while (changed) {
  changed = false;
  ccc.forEach(e => {
    if (entryComponents.has(e.from) && !entryComponents.has(e.to)) {
      entryComponents.add(e.to);
      changed = true;
    }
  });
}

console.log('Entry-reachable components:');
[...entryComponents].sort().forEach(c => console.log(' ', c.split('#').pop()));
console.log('Count:', entryComponents.size);

// Count all trigger edges
const triggerKinds = ['WIDGET_NAVIGATES_ROUTE','WIDGET_NAVIGATES_EXTERNAL','WIDGET_TRIGGERS_HANDLER','WIDGET_SUBMITS_FORM'];
const allTriggers = data.multigraph.edges.filter(e => triggerKinds.includes(e.kind));
console.log('\nTotal trigger edges in A1:', allTriggers.length);

// Group by component
const byComp = {};
allTriggers.forEach(e => {
  const compMatch = e.id.match(/#(\w+)/);
  const comp = compMatch ? compMatch[1] : 'UNKNOWN';
  if (!byComp[comp]) byComp[comp] = [];
  byComp[comp].push(e);
});

for (const [comp, edges] of Object.entries(byComp).sort(([a], [b]) => a.localeCompare(b))) {
  const onEntry = edges.filter(e => {
    const compId = e.id.split('|')[0];
    return entryComponents.has(compId);
  });
  console.log(`${comp}: ${edges.length} total, ${onEntry.length} entry-reachable`);
}
