/**
 * analysis-cache.ts
 * In-memory memoization of expensive parsing results.
 *
 * Constraints:
 * - In-memory only (Phase 1).
 * - Cache keys must be stable: use file path + symbol + purpose as the key.
 * - Never persists across process invocations.
 *
 * Usage:
 *   const cache = new AnalysisCache();
 *   const key = `template:${filePath}`;
 *   const cached = cache.get<TemplateAstNode[]>(key);
 *   if (cached !== undefined) return cached;
 *   const result = expensive();
 *   cache.set(key, result);
 *   return result;
 */

export class AnalysisCache {
  private readonly _store = new Map<string, unknown>();

  /**
   * Retrieve a cached value by key.
   * Returns undefined on cache miss.
   */
  get<T>(key: string): T | undefined {
    return this._store.get(key) as T | undefined;
  }

  /**
   * Store a value under a stable key.
   */
  set<T>(key: string, value: T): void {
    this._store.set(key, value);
  }

  /**
   * Return the number of cached entries (for diagnostics).
   */
  get size(): number {
    return this._store.size;
  }

  /**
   * Clear all cached entries.
   */
  clear(): void {
    this._store.clear();
  }
}
