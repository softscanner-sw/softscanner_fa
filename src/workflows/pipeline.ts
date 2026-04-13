/**
 * pipeline.ts
 * Phase A2 pipeline: task-mode workflow enumeration.
 *
 * Produces a A2WorkflowSet from a A1Multigraph input.
 *
 * Authority: docs/paper/approach.md §A2 (normative).
 * Isolation: imports only types from src/models/ and local workflow modules.
 */

import type { A1Multigraph } from '../models/multigraph.js';
import type { A2WorkflowSet } from '../models/workflow.js';
import { enumerateTaskWorkflows } from './task-enumerator.js';

/**
 * Run the A2 pipeline: single-trigger task enumeration.
 * Returns a A2WorkflowSet directly.
 */
export function runTaskWorkflowPipeline(bundle: A1Multigraph): A2WorkflowSet {
  return enumerateTaskWorkflows(bundle);
}
