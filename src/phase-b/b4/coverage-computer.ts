/**
 * coverage-computer.ts
 * Aggregates B1/B2/B3 artifacts into B4 coverage report.
 * Spec: §B4 — tiered coverage metrics with denominator rules.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { B4CoverageReport, B4Summary, B4WorkflowEntry } from './b4-types.js';
import type { B3ResultSet } from '../b3/b3-types.js';
import type { PhaseAInputRef, WorkflowVerdict } from '../../models/workflow.js';

interface A2Workflow {
  id: string;
  verdict: WorkflowVerdict;
}

interface B2TestEntry {
  workflowId: string;
  fileName: string;
}

/**
 * Compute B4 coverage report from B3 results + B1/B2/A2 artifacts.
 */
export function computeCoverage(
  subjectName: string,
  outputDir: string,
  skipWorkflows: string[] = [],
): B4CoverageReport {
  // Load A2 workflows
  const a2Path = path.join(outputDir, 'json', 'a2-workflows.json');
  const a2 = JSON.parse(fs.readFileSync(a2Path, 'utf-8'));
  const a2Workflows: A2Workflow[] = a2.workflows.map((w: { id: string; verdict: string }) => ({
    id: w.id,
    verdict: w.verdict as WorkflowVerdict,
  }));

  // Load B1 plans
  const b1Path = path.join(outputDir, 'json', 'b1-plans.json');
  const b1Exists = fs.existsSync(b1Path);
  const b1Plans: Set<string> = new Set();
  if (b1Exists) {
    const b1 = JSON.parse(fs.readFileSync(b1Path, 'utf-8'));
    for (const p of b1.plans) {
      b1Plans.add(p.workflowId);
    }
  }

  // Load B2 tests
  const b2Path = path.join(outputDir, 'json', 'b2-tests.json');
  const b2Exists = fs.existsSync(b2Path);
  const b2Tests: Set<string> = new Set();
  if (b2Exists) {
    const b2 = JSON.parse(fs.readFileSync(b2Path, 'utf-8'));
    for (const t of (b2.tests as B2TestEntry[])) {
      b2Tests.add(t.workflowId);
    }
  }

  // Load B3 results
  const b3Path = path.join(outputDir, 'json', 'b3-results.json');
  const b3Exists = fs.existsSync(b3Path);
  const b3Results = new Map<string, B3ResultSet['results'][number]>();
  if (b3Exists) {
    const b3: B3ResultSet = JSON.parse(fs.readFileSync(b3Path, 'utf-8'));
    for (const r of b3.results) {
      b3Results.set(r.workflowId, r);
    }
  }

  // Build input ref
  const inputRef: PhaseAInputRef = {
    projectId: a2.input?.projectId ?? '',
    multigraphHash: a2.input?.multigraphHash ?? '',
  };

  // Compute per-workflow entries
  const skipSet = new Set(skipWorkflows);
  const workflows: B4WorkflowEntry[] = [];

  let prunedCount = 0;
  let appNotReadyCount = 0;
  let skippedCount = 0;
  let c1Numerator = 0;
  let c2Numerator = 0;
  let c3Numerator = 0;

  for (const wf of a2Workflows) {
    const hasPlan = b1Plans.has(wf.id);
    const hasCode = b2Tests.has(wf.id);
    const b3Result = b3Results.get(wf.id);

    const entry: B4WorkflowEntry = {
      workflowId: wf.id,
      verdict: wf.verdict,
      hasPlan,
      hasCode,
      ...(b3Result?.outcome !== undefined ? { executionOutcome: b3Result.outcome } : {}),
      ...(b3Result?.attempts !== undefined ? { attempts: b3Result.attempts } : {}),
      ...(b3Result?.durationMs !== undefined ? { durationMs: b3Result.durationMs } : {}),
      ...(b3Result?.error !== undefined ? { error: b3Result.error } : {}),
    };
    workflows.push(entry);

    if (wf.verdict === 'PRUNED') {
      prunedCount++;
      continue;
    }

    if (hasPlan) c1Numerator++;
    if (hasCode) c2Numerator++;

    if (b3Result?.outcome === 'FAIL_APP_NOT_READY') {
      appNotReadyCount++;
    } else if (skipSet.has(wf.id)) {
      skippedCount++;
    } else if (b3Result?.outcome === 'PASS') {
      c3Numerator++;
    }
  }

  const total = a2Workflows.length;
  const c1c2Denom = total - prunedCount;
  const c3Denom = total - prunedCount - appNotReadyCount - skippedCount;

  const summary: B4Summary = {
    subject: subjectName,
    totalWorkflows: total,
    prunedCount,
    appNotReadyCount,
    skippedCount,
    c1: c1c2Denom > 0 ? c1Numerator / c1c2Denom : 0,
    c2: c1c2Denom > 0 ? c2Numerator / c1c2Denom : 0,
    c3: c3Denom > 0 ? c3Numerator / c3Denom : 0,
    c4: 0,  // Deferred
  };

  const report: B4CoverageReport = { input: inputRef, workflows, summary };

  // Write output
  const jsonDir = path.join(outputDir, 'json');
  fs.mkdirSync(jsonDir, { recursive: true });
  fs.writeFileSync(
    path.join(jsonDir, 'b4-coverage.json'),
    JSON.stringify(report, null, 2),
  );

  return report;
}
