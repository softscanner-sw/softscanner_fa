/**
 * b0-runner.ts
 * Orchestrates B0 manifest validation for all discovered subjects.
 *
 * Phase isolation: imports only manifest-schema, manifest-loader,
 * manifest-validator, and A2 model types.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { A2WorkflowSet } from '../../models/workflow.js';
import { discoverSubjects, loadManifest, ManifestLoadError } from './manifest-loader.js';
import type { ManifestValidationResult, ValidationIssue } from './manifest-validator.js';
import { validateManifest } from './manifest-validator.js';

// ---------------------------------------------------------------------------
// B0 summary types
// ---------------------------------------------------------------------------

export interface B0SubjectSummary {
  subject: string;
  status: 'VALID' | 'INVALID' | 'LOAD_ERROR' | 'MISSING_A2';
  accounts: number;
  paramBindings: number;
  errors: number;
  warnings: number;
}

export interface B0Summary {
  subjects: B0SubjectSummary[];
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export interface B0RunnerConfig {
  /** Root directory containing subject folders (default: <repoRoot>/subjects). */
  subjectsDir: string;
  /** Root directory containing A2 output (default: <repoRoot>/output). */
  outputDir: string;
  /** Directory for logs (default: <repoRoot>/logs). */
  logsDir: string;
}

/**
 * Run B0 validation for all discovered subjects.
 * Returns the B0Summary and writes logs.
 */
export function runB0Validation(config: B0RunnerConfig): B0Summary {
  const subjects = discoverSubjects(config.subjectsDir);
  const logLines: string[] = [];
  const summaries: B0SubjectSummary[] = [];

  logLines.push(`B0 Manifest Validation — ${new Date().toISOString()}`);
  logLines.push(`Subjects directory: ${config.subjectsDir}`);
  logLines.push(`Output directory: ${config.outputDir}`);
  logLines.push(`Discovered ${subjects.length} subject(s): ${subjects.join(', ')}`);
  logLines.push('');

  for (const subjectName of subjects) {
    logLines.push(`--- ${subjectName} ---`);

    // Load manifest
    let result: ManifestValidationResult;
    try {
      const manifest = loadManifest(config.subjectsDir, subjectName);

      // Load A2 artifact
      const a2Path = path.join(config.outputDir, subjectName, 'json', 'a2-workflows.json');
      if (!fs.existsSync(a2Path)) {
        logLines.push(`  ERROR: A2 artifact not found at ${a2Path}`);
        logLines.push('');
        summaries.push({
          subject: subjectName,
          status: 'MISSING_A2',
          accounts: 0,
          paramBindings: 0,
          errors: 1,
          warnings: 0,
        });
        continue;
      }
      const a2Raw = fs.readFileSync(a2Path, 'utf-8');
      const a2: A2WorkflowSet = JSON.parse(a2Raw) as A2WorkflowSet;

      // Validate
      result = validateManifest(manifest, a2, subjectName);
    } catch (err) {
      const msg = err instanceof ManifestLoadError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
      logLines.push(`  LOAD ERROR: ${msg}`);
      logLines.push('');
      summaries.push({
        subject: subjectName,
        status: 'LOAD_ERROR',
        accounts: 0,
        paramBindings: 0,
        errors: 1,
        warnings: 0,
      });
      continue;
    }

    // Log issues
    logLines.push(`  Status: ${result.status}`);
    logLines.push(`  Accounts: ${result.accounts}`);
    logLines.push(`  Param bindings: ${result.paramBindings}`);
    if (result.issues.length > 0) {
      for (const issue of result.issues) {
        logLines.push(`  [${issue.severity.toUpperCase()}] ${issue.message}`);
      }
    } else {
      logLines.push('  No issues.');
    }
    logLines.push('');

    const errorCount = result.issues.filter((i: ValidationIssue) => i.severity === 'error').length;
    const warningCount = result.issues.filter((i: ValidationIssue) => i.severity === 'warning').length;

    summaries.push({
      subject: subjectName,
      status: result.status,
      accounts: result.accounts,
      paramBindings: result.paramBindings,
      errors: errorCount,
      warnings: warningCount,
    });
  }

  // Write log
  fs.mkdirSync(config.logsDir, { recursive: true });
  const logPath = path.join(config.logsDir, 'b0-manifest-validation.log');
  fs.writeFileSync(logPath, logLines.join('\n') + '\n', 'utf-8');

  // Write summary JSON
  const summary: B0Summary = { subjects: summaries };
  const summaryPath = path.join(config.logsDir, 'b0-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n', 'utf-8');

  return summary;
}
