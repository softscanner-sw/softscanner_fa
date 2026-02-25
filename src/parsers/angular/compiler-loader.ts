/**
 * compiler-loader.ts
 * Loads @angular/compiler (ESM-only since v15) via a top-level dynamic import.
 *
 * Top-level `await` ensures the compiler is fully resolved before any importing
 * module runs, so template-parser.ts can call parseTemplate synchronously.
 *
 * If the package is absent or fails to load, `parseTemplate` is exported as
 * `null` and the template parser falls back to returning an empty AST.
 */

export type ParseTemplateFn = (
  template: string,
  url: string,
  options?: Record<string, unknown>,
) => { nodes: unknown[] };

let _parseTemplate: ParseTemplateFn | null = null;

try {
  const mod = await import('@angular/compiler');
  // @angular/compiler exports parseTemplate as a named export
  const fn = (mod as unknown as Record<string, unknown>)['parseTemplate'];
  if (typeof fn === 'function') {
    _parseTemplate = fn as ParseTemplateFn;
  }
} catch {
  // Package unavailable or failed to load — parser will return empty trees
}

export const parseTemplate: ParseTemplateFn | null = _parseTemplate;
