/**
 * analyzer-config.ts
 * Minimal configuration for the Phase 1 static extraction analyzer.
 */

/**
 * Controls how much detail is captured for backend API interactions.
 * - None: backend calls are not recorded.
 * - EndpointOnly: records the HTTP method + URL pattern.
 * - EndpointAndPayload: additionally records request/response shape summaries.
 */
export type BackendGranularity = 'None' | 'EndpointOnly' | 'EndpointAndPayload';

/**
 * Analyzer configuration passed to the Phase 1 orchestrator.
 * All paths should be absolute or resolvable from `projectRoot`.
 */
export interface AnalyzerConfig {
  /** Repository root directory. */
  projectRoot: string;
  /** Path to the tsconfig.json used by the TypeScript parser. */
  tsConfigPath: string;
  /** Application entry file (e.g., Angular's main.ts), if known. */
  entryFile?: string;
  /** Frontend framework detected or provided. */
  framework?: 'Angular' | 'React' | 'Vue' | 'Unknown';
  /** Granularity for capturing backend API call context. Defaults to 'None'. */
  backendGranularity?: BackendGranularity;
  /**
   * Maximum length (in characters) for template snippet strings stored in
   * `Origin.snippet` and `Predicate.expr`. Defaults to 200. Values beyond
   * this limit must be truncated with a deterministic suffix (e.g., '…').
   */
  maxTemplateSnippetLength?: number;
}
