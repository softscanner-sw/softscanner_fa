/**
 * workflows/index.ts
 * Barrel export for Phase A2 workflow module.
 *
 * Isolation: this module imports only types from src/models/.
 * It must NOT import from src/parsers, src/analyzers, src/builders,
 * src/orchestrator, ts-morph, or @angular/compiler.
 */

export { mergeConstraints } from './classifier.js';
export { runTaskWorkflowPipeline } from './pipeline.js';
export { enumerateTaskWorkflows } from './task-enumerator.js';
export { buildGraphIndex, computeActiveComponentIds, computeActiveWidgetIds, computeInputRef } from './graph-index.js';
export type { GraphIndex } from './graph-index.js';
