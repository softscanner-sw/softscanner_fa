/**
 * pipeline.ts
 * Phase A2 pipeline: task-mode workflow enumeration.
 *
 * Produces a TaskWorkflowBundle from a Phase1Bundle input.
 *
 * Authority: docs/paper/approach.md §A2 (normative).
 * Isolation: imports only types from src/models/ and local workflow modules.
 */

import type { Phase1Bundle } from '../models/multigraph.js';
import type { TaskWorkflowBundle } from '../models/workflow.js';
import { enumerateTaskWorkflows } from './task-enumerator.js';

/**
 * Run the A2 pipeline: single-trigger task enumeration.
 * Returns a TaskWorkflowBundle directly.
 */
export function runTaskWorkflowPipeline(bundle: Phase1Bundle): TaskWorkflowBundle {
  return enumerateTaskWorkflows(bundle);
}
