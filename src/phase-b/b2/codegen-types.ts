/**
 * codegen-types.ts
 * B2 Code Generation output types.
 *
 * Authority: docs/paper/approach.md — Phase B §B2.
 * Phase isolation: imports only from src/models/ (types only).
 */

import type { PhaseAInputRef } from '../../models/workflow.js';

// ---------------------------------------------------------------------------
// B2TestEntry — metadata for one generated test file
// ---------------------------------------------------------------------------

export interface B2TestEntry {
  workflowId: string;
  fileName: string;
  preConditionCount: number;
  stepCount: number;
  postConditionCount: number;
}

// ---------------------------------------------------------------------------
// B2TestSet — output artifact written to b2-tests.json
// ---------------------------------------------------------------------------

export interface B2TestSet {
  input: PhaseAInputRef;
  tests: B2TestEntry[];
  stats: {
    generated: number;
    skipped: number;
  };
}

// ---------------------------------------------------------------------------
// B2CoverageReport — pre-execution generation coverage
// ---------------------------------------------------------------------------

export interface B2CoverageReport {
  eligibleWorkflows: number;
  plansGenerated: number;
  testsGenerated: number;
  generationRate: number;
  upstreamRate: number;
}
