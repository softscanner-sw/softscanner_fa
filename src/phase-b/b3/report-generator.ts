/**
 * report-generator.ts
 * Generates structured human-readable markdown report for a B3/B4 subject run.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { B3ResultSet } from './b3-types.js';
import type { B4CoverageReport } from '../b4/b4-types.js';

/**
 * Generate a markdown execution report for a single subject.
 */
export function generateReport(
  b3: B3ResultSet,
  b4: B4CoverageReport,
  outputDir: string,
): string {
  const lines: string[] = [];

  // --- Header ---
  lines.push(`# B3/B4 Execution Report — ${b3.subject}`);
  lines.push('');
  lines.push(`**Run timestamp:** ${b3.runTimestamp}`);
  lines.push(`**Base URL:** ${b3.baseUrl}`);
  lines.push('');

  // --- Executive Summary ---
  lines.push('## Executive Summary');
  lines.push('');
  const { stats } = b3;
  lines.push(`| Metric | Value |`);
  lines.push(`|---|---|`);
  lines.push(`| Total tests | ${stats.total} |`);
  lines.push(`| Passed | ${stats.passed} |`);
  lines.push(`| Failed | ${stats.failed} |`);
  lines.push(`| Skipped | ${stats.skipped} |`);
  lines.push(`| App not ready | ${stats.appNotReady} |`);
  lines.push(`| Duration | ${(stats.totalDurationMs / 1000).toFixed(1)}s |`);
  lines.push('');

  // --- Readiness Check ---
  lines.push('## Readiness Check');
  lines.push('');
  lines.push(`- **Passed:** ${b3.readinessCheck.passed}`);
  lines.push(`- **Duration:** ${b3.readinessCheck.durationMs}ms`);
  if (b3.readinessCheck.error) {
    lines.push(`- **Error:** ${b3.readinessCheck.error}`);
  }
  lines.push('');

  // --- Coverage Summary ---
  lines.push('## Coverage Summary');
  lines.push('');
  lines.push(`| Tier | Coverage | Fraction |`);
  lines.push(`|---|---|---|`);
  lines.push(`| C1 (Plan) | ${(b4.summary.c1 * 100).toFixed(1)}% | ${countWithPlan(b4)}/${b4.summary.totalWorkflows - b4.summary.prunedCount} |`);
  lines.push(`| C2 (Code) | ${(b4.summary.c2 * 100).toFixed(1)}% | ${countWithCode(b4)}/${b4.summary.totalWorkflows - b4.summary.prunedCount} |`);
  const c3Denom = b4.summary.totalWorkflows - b4.summary.prunedCount - b4.summary.appNotReadyCount - b4.summary.skippedCount;
  const c3Num = b4.workflows.filter(w => w.executionOutcome === 'PASS').length;
  lines.push(`| C3 (Execution) | ${(b4.summary.c3 * 100).toFixed(1)}% | ${c3Num}/${c3Denom} |`);
  lines.push('');

  // --- CDP / Network Evidence Summary ---
  const logsDir = path.join(outputDir, 'logs');
  const logCache = new Map<string, Record<string, unknown>>();
  if (fs.existsSync(logsDir)) {
    for (const lf of fs.readdirSync(logsDir).filter(f => f.endsWith('.log.json'))) {
      try { logCache.set(lf, JSON.parse(fs.readFileSync(path.join(logsDir, lf), 'utf-8'))); } catch { /* skip */ }
    }
  }

  // Check if any test has network evidence
  let totalNetworkRequests = 0;
  const statusCounts = new Map<number, number>();
  const methodCounts = new Map<string, number>();
  for (const [, log] of logCache) {
    const steps = (log as { steps?: Array<{ networkEvidence?: Array<{ method: string; status: number }> }> }).steps ?? [];
    for (const step of steps) {
      for (const ne of step.networkEvidence ?? []) {
        totalNetworkRequests++;
        methodCounts.set(ne.method, (methodCounts.get(ne.method) ?? 0) + 1);
        statusCounts.set(ne.status, (statusCounts.get(ne.status) ?? 0) + 1);
      }
    }
  }

  const cdpEnabled = totalNetworkRequests > 0;
  // Add CDP info to executive summary
  lines.push(`| CDP network evidence | ${cdpEnabled ? 'enabled' : 'disabled'} |`);
  if (cdpEnabled) {
    lines.push(`| Network requests captured | ${totalNetworkRequests} |`);
  }
  lines.push('');

  if (cdpEnabled && totalNetworkRequests > 0) {
    lines.push('## Network Evidence Summary');
    lines.push('');
    lines.push('### Request Methods');
    lines.push('');
    for (const [method, count] of [...methodCounts.entries()].sort()) {
      lines.push(`- **${method}**: ${count}`);
    }
    lines.push('');
    lines.push('### Response Status Codes');
    lines.push('');
    for (const [status, count] of [...statusCounts.entries()].sort((a, b) => a[0] - b[0])) {
      lines.push(`- **${status}**: ${count}`);
    }
    lines.push('');
  }

  // --- Per-Test Breakdown (enriched with CDP evidence) ---
  lines.push('## Per-Test Breakdown');
  lines.push('');
  if (cdpEnabled) {
    lines.push(`| # | Test File | Outcome | Duration | Failure Kind | Net Reqs | HTTP Status | Error |`);
    lines.push(`|---|---|---|---|---|---|---|---|`);
  } else {
    lines.push(`| # | Test File | Outcome | Duration | Failure Kind | Error |`);
    lines.push(`|---|---|---|---|---|---|`);
  }
  for (let i = 0; i < b3.results.length; i++) {
    const r = b3.results[i]!;
    const shortFile = r.testFile.replace(/\.test\.ts$/, '');
    const errorSnippet = r.error ? r.error.slice(0, 60).replace(/\|/g, '\\|').replace(/\n/g, ' ') : '';
    const logFile = r.testFile.replace(/\.test\.ts$/, '.log.json');
    const log = logCache.get(logFile) as { failureKind?: string; steps?: Array<{ networkEvidence?: Array<{ method: string; status: number }> }> } | undefined;
    const failureKind = log?.failureKind ?? '';

    if (cdpEnabled) {
      // Aggregate network evidence for this test
      let testNetReqs = 0;
      const testStatuses = new Map<number, number>();
      for (const step of log?.steps ?? []) {
        for (const ne of step.networkEvidence ?? []) {
          testNetReqs++;
          testStatuses.set(ne.status, (testStatuses.get(ne.status) ?? 0) + 1);
        }
      }
      const statusStr = [...testStatuses.entries()].map(([s, c]) => `${s}×${c}`).join(' ') || '-';
      lines.push(`| ${i + 1} | ${shortFile} | ${r.outcome} | ${r.durationMs}ms | ${failureKind} | ${testNetReqs} | ${statusStr} | ${errorSnippet} |`);
    } else {
      lines.push(`| ${i + 1} | ${shortFile} | ${r.outcome} | ${r.durationMs}ms | ${failureKind} | ${errorSnippet} |`);
    }
  }
  lines.push('');

  // --- Failure Classification ---
  const failures = b3.results.filter(r => r.outcome !== 'PASS');
  if (failures.length > 0) {
    lines.push('## Failure Classification');
    lines.push('');
    const byOutcome = new Map<string, number>();
    for (const f of failures) {
      byOutcome.set(f.outcome, (byOutcome.get(f.outcome) ?? 0) + 1);
    }
    for (const [outcome, count] of [...byOutcome.entries()].sort()) {
      lines.push(`- **${outcome}**: ${count}`);
    }
    lines.push('');

    // B5.0 failureKind breakdown (from cached per-test logs)
    const byKind = new Map<string, number>();
    for (const [, log] of logCache) {
      const l = log as { outcome?: string; failureKind?: string };
      if (l.outcome === 'FAIL' && l.failureKind) {
        byKind.set(l.failureKind, (byKind.get(l.failureKind) ?? 0) + 1);
      }
    }
    if (byKind.size > 0) {
      lines.push('### B5.0 Failure Kind Breakdown');
      lines.push('');
      for (const [kind, count] of [...byKind.entries()].sort()) {
        lines.push(`- **${kind}**: ${count}`);
      }
      lines.push('');
    }
  }

  // --- Failure Family Summary (inferred from B5.0 logs) ---
  if (failures.length > 0 && logCache.size > 0) {
    lines.push('### Inferred Failure Families');
    lines.push('');
    const families = new Map<string, number>();
    for (const f of failures) {
      const logFile = f.testFile.replace(/\.test\.ts$/, '.log.json');
      const log = logCache.get(logFile) as {
        failureKind?: string; failedStepId?: string;
        steps?: Array<{ stepId?: string; stepType?: string; networkEvidence?: Array<{ status: number }> }>;
      } | undefined;
      let family = 'unknown';
      const stepId = log?.failedStepId ?? '';
      const failureKind = log?.failureKind ?? '';
      const failedStep = (log?.steps ?? []).find(s => s.stepId === stepId);
      const hasBackendReject = (failedStep?.networkEvidence ?? []).some(n => n.status >= 400);
      const hasBackendSuccess = (failedStep?.networkEvidence ?? []).some(n => n.status >= 200 && n.status < 300);

      if (stepId.startsWith('post-') && hasBackendReject) family = 'backend-rejection';
      else if (stepId.startsWith('post-') && hasBackendSuccess) family = 'postcondition-oracle';
      else if (stepId.startsWith('post-')) family = 'postcondition-timeout';
      else if (stepId.startsWith('pre-')) family = 'precondition-failure';
      else if (failureKind === 'interaction-failed') family = 'interaction-blocked';
      else if (failureKind === 'locator-not-found') family = 'element-not-found';
      else if (failureKind === 'timeout') family = 'wait-timeout';
      else if (failureKind === 'assertion-failed') family = 'assertion-failed';
      families.set(family, (families.get(family) ?? 0) + 1);
    }
    lines.push(`| Family | Count |`);
    lines.push(`|---|---|`);
    for (const [fam, count] of [...families.entries()].sort((a, b) => b[1] - a[1])) {
      lines.push(`| ${fam} | ${count} |`);
    }
    lines.push('');
  }

  // --- Retry History ---
  const retried = b3.results.filter(r => r.attempts > 1);
  if (retried.length > 0) {
    lines.push('## Retry History');
    lines.push('');
    for (const r of retried) {
      lines.push(`### ${r.testFile}`);
      for (const a of r.attemptDetails) {
        lines.push(`- Attempt ${a.attemptNumber}: ${a.outcome} (${a.durationMs}ms)`);
        if (a.error) lines.push(`  - Error: ${a.error.slice(0, 200)}`);
        if (a.screenshots.length > 0) {
          lines.push(`  - Screenshots: ${a.screenshots.length}`);
        }
      }
      lines.push('');
    }
  }

  // --- Screenshots ---
  const allScreenshots = b3.results.flatMap(r => r.screenshots);
  if (allScreenshots.length > 0) {
    lines.push('## Screenshots');
    lines.push('');
    lines.push(`Total screenshots captured: ${allScreenshots.length}`);
    lines.push('');
    for (const r of b3.results) {
      if (r.screenshots.length > 0) {
        lines.push(`### ${r.testFile}`);
        for (const s of r.screenshots) {
          const relPath = path.relative(outputDir, s).replace(/\\/g, '/');
          lines.push(`- \`${relPath}\``);
        }
        lines.push('');
      }
    }
  }

  // --- Passed Tests ---
  const passed = b3.results.filter(r => r.outcome === 'PASS');
  if (passed.length > 0) {
    lines.push('## Passed Tests');
    lines.push('');
    for (const r of passed) {
      lines.push(`- ${r.testFile} (${r.durationMs}ms)`);
    }
    lines.push('');
  }

  // Write report
  const reportContent = lines.join('\n');
  const reportPath = path.join(outputDir, 'b3-b4-report.md');
  fs.writeFileSync(reportPath, reportContent);

  return reportPath;
}

function countWithPlan(b4: B4CoverageReport): number {
  return b4.workflows.filter(w => w.verdict !== 'PRUNED' && w.hasPlan).length;
}

function countWithCode(b4: B4CoverageReport): number {
  return b4.workflows.filter(w => w.verdict !== 'PRUNED' && w.hasCode).length;
}

/**
 * Generate PDF from the markdown report using pandoc (if available).
 * PDF generation is best-effort — failure does not affect B3/B4 correctness.
 */
/**
 * Generate PDF from the markdown report using pandoc (if available).
 * Uses HTML intermediate to avoid LaTeX escaping issues with Windows paths.
 * PDF generation is best-effort — failure does not affect B3/B4 correctness.
 */
/**
 * Generate PDF from the markdown report using pandoc + Chrome headless.
 * Uses HTML intermediate to avoid LaTeX escaping issues with Windows paths.
 * PDF generation is best-effort — failure does not affect B3/B4 correctness.
 */
export function generatePdf(mdPath: string): string | undefined {
  const absMdPath = path.resolve(mdPath);
  const pdfPath = absMdPath.replace(/\.md$/, '.pdf');
  const htmlPath = absMdPath.replace(/\.md$/, '.html');
  try {
    // Step 1: markdown → standalone HTML
    execFileSync('pandoc', [
      absMdPath,
      '-o', htmlPath,
      '--standalone',
      '--metadata', 'title=B3/B4 Execution Report',
    ], { timeout: 30_000, stdio: 'pipe' });

    // Step 2: HTML → PDF via Chrome headless print-to-pdf
    const chromePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'google-chrome',
      'chromium',
    ];
    for (const chromePath of chromePaths) {
      try {
        execFileSync(chromePath, [
          '--headless',
          '--disable-gpu',
          `--print-to-pdf=${pdfPath}`,
          '--no-margins',
          htmlPath,
        ], { timeout: 30_000, stdio: 'pipe' });
        return pdfPath;
      } catch { continue; }
    }
    return undefined;
  } catch {
    return undefined;
  }
}
