import * as fs from 'node:fs';
import * as path from 'node:path';

const r = JSON.parse(fs.readFileSync('output/ever-traduora/json/b3-results.json','utf8'));
const byOutcome = {};
for (const x of r.results||[]) byOutcome[x.outcome]=(byOutcome[x.outcome]||0)+1;
console.log('Outcomes:', JSON.stringify(byOutcome));

console.log('\nPASSING workflows:');
for (const x of r.results||[]) {
  if (x.outcome === 'PASS') {
    const short = x.workflowId.replace(/\\/g,'/').split('/src/app/')[1]?.split('|').slice(0,2).join(' | ').slice(0,100);
    console.log('  PASS:', short);
  }
}

// Check failing step distribution
const dir = 'output/ever-traduora/logs';
const byFailStep = {};
let authFails = 0;
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.log.json')) continue;
  const log = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  if (log.outcome === 'PASS') continue;
  const step = log.failedStepId ?? '?';
  byFailStep[step] = (byFailStep[step]||0)+1;
  if (step === 'pre-0' || step === 'pre-1') authFails++;
}
console.log('\nFailing step distribution:', JSON.stringify(byFailStep));
console.log('Auth-precondition failures (pre-0/pre-1):', authFails);

// Sample a few auth failures
console.log('\nSample auth failures:');
let shown = 0;
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.log.json') || shown >= 3) continue;
  const log = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  if (log.outcome === 'PASS') continue;
  if (log.failedStepId !== 'pre-0' && log.failedStepId !== 'pre-1') continue;
  const failStep = log.steps?.find(s => s.stepId === log.failedStepId);
  console.log(`  [${f.slice(0,20)}] step=${log.failedStepId} kind=${log.failureKind} err="${(failStep?.evidence?.error || failStep?.error || '').slice(0,150)}"`);
  shown++;
}
