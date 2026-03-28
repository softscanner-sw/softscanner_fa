/**
 * b4-types.ts
 * Type definitions for B4 coverage reporting.
 * Authority: docs/paper/approach.md — Phase B §B4 Output Artifact Schema.
 */

import type { PhaseAInputRef, WorkflowVerdict } from '../../models/workflow.js';
import type { ExecutionOutcome } from '../b3/b3-types.js';

export interface B4WorkflowEntry {
  workflowId: string;
  verdict: WorkflowVerdict;
  hasPlan: boolean;
  hasCode: boolean;
  executionOutcome?: ExecutionOutcome;
  attempts?: number;
  durationMs?: number;
  error?: string;
}

export interface B4Summary {
  subject: string;
  totalWorkflows: number;
  prunedCount: number;
  appNotReadyCount: number;
  skippedCount: number;
  c1: number;
  c2: number;
  c3: number;
  c4: number;
}

export interface B4CoverageReport {
  input: PhaseAInputRef;
  workflows: B4WorkflowEntry[];
  summary: B4Summary;
}
