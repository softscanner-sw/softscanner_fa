/**
 * route-parser.ts
 * Extracts Angular route declarations from TypeScript source files into
 * normalized ParsedRouteRecord objects for consumption by RouteAnalyzer.
 *
 * Handles:
 * - `const routes: Routes = [...]`
 * - `RouterModule.forRoot([...])`
 * - `RouterModule.forChild([...])`
 * - Exported `routes` array variables
 *
 * Does NOT:
 * - Evaluate code (all values are string-serialized)
 * - Perform normalization (fullPath, dedup) — that is RouteAnalyzer's job
 * - Recurse into lazy modules — that is RouteAnalyzer's job
 */

import type { SourceFile, Node } from 'ts-morph';
import { SyntaxKind } from 'ts-morph';
import type { Origin } from '../../models/origin.js';
import type { AnalyzerConfig } from '../../models/analyzer-config.js';
import { TsAstUtils } from '../ts/ts-ast-utils.js';

// ---------------------------------------------------------------------------
// Intermediate record
// ---------------------------------------------------------------------------

export interface ParsedRouteRecord {
  /** Raw `path` value as written (e.g. "users/:id", "**", ""). */
  path: string;
  /** Component class name if present. */
  componentName?: string;
  /** Hint for resolving the component import (module specifier). */
  componentImportPathHint?: string;

  /** Raw redirectTo string. */
  redirectTo?: string;
  pathMatch?: 'full' | 'prefix';

  /** Raw loadChildren() expression text (lazy module). */
  loadChildrenExpr?: string;
  /** Raw loadComponent() expression text (standalone lazy component). */
  loadComponentExpr?: string;
  /**
   * Module specifier extracted from the `import(...)` call inside
   * loadComponent (e.g. "./features/settings/settings.component").
   * Consumed by RouteAnalyzer for lazy-component resolution.
   */
  loadComponentImportSpecifier?: string;
  /**
   * Exported class name hinted by `.then(m => m.X)` on loadComponent.
   * Undefined when the expression uses the implicit default-export form
   * `() => import("./x.component")`. Consumed by RouteAnalyzer.
   */
  loadComponentExportHint?: string;
  /** Inline children route array (parsed recursively). */
  children?: ParsedRouteRecord[];

  guards: Array<{ kind: string; guardName: string; origin: Origin }>;
  resolvers: Array<{ key: string; resolverName: string; origin: Origin }>;
  data: Array<{ key: string; value: string; origin: Origin }>;

  /** Origin of the route object literal. */
  origin: Origin;
}

// ---------------------------------------------------------------------------
// Guard kind keywords
// ---------------------------------------------------------------------------

const GUARD_KINDS = new Set(['canActivate', 'canLoad', 'canActivateChild', 'canDeactivate']);

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export class RouteParser {
  /**
   * Extract all route declarations from a source file.
   * Returns an empty array if no route arrays are detected.
   */
  static extractRoutesFromSourceFile(
    file: SourceFile,
    cfg: AnalyzerConfig,
  ): ParsedRouteRecord[] {
    const routeArrayNodes = RouteParser.findRoutesArrays(file);
    const results: ParsedRouteRecord[] = [];

    for (const arrayNode of routeArrayNodes) {
      for (const element of RouteParser._getArrayElements(arrayNode)) {
        const record = RouteParser._parseRouteObject(element, cfg);
        if (record !== null) results.push(record);
      }
    }

    return results;
  }

  /**
   * Find all array literal nodes that represent Angular Routes arrays.
   * Looks for:
   *   - Variables typed as `Routes` or `Route[]`
   *   - RouterModule.forRoot([...]) / forChild([...]) call arguments
   *   - Exported `routes` variable declarations
   */
  static findRoutesArrays(file: SourceFile): Node[] {
    const found: Node[] = [];

    // 1. Variable declarations: `const routes: Routes = [...]`
    for (const varDecl of file.getVariableDeclarations()) {
      const typeText = varDecl.getTypeNode()?.getText() ?? '';
      const name = varDecl.getName();
      if (
        typeText.includes('Routes') ||
        typeText.includes('Route[]') ||
        name === 'routes'
      ) {
        const initializer = varDecl.getInitializer();
        if (initializer?.getKindName() === 'ArrayLiteralExpression') {
          found.push(initializer);
        }
      }
    }

    // 2. RouterModule.forRoot([...]) / forChild([...])
    for (const callExpr of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expr = callExpr.getExpression().getText();
      if (
        expr === 'RouterModule.forRoot' ||
        expr === 'RouterModule.forChild'
      ) {
        const firstArg = callExpr.getArguments().at(0);
        if (firstArg === undefined) continue;

        if (firstArg.isKind(SyntaxKind.ArrayLiteralExpression)) {
          found.push(firstArg);
        } else {
          // Resolve identifier (possibly cross-file) to its array literal.
          // Handles: forRoot(routes), forRoot(routes as Routes), forRoot(routes satisfies Routes)
          const resolved = RouteParser._resolveArgToArray(firstArg);
          if (resolved !== null) found.push(resolved);
        }
      }
    }

    // Deduplicate by (filePath, startPosition) — guards against cross-file position collisions
    const seen = new Set<string>();
    return found.filter((n) => {
      const key = `${n.getSourceFile().getFilePath()}::${n.getStart()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private static _getArrayElements(arrayNode: Node): Node[] {
    const elements: Node[] = [];
    for (const child of arrayNode.getChildren()) {
      for (const el of child.getChildren()) {
        if (el.getKindName() === 'ObjectLiteralExpression') {
          elements.push(el);
        }
      }
    }
    return elements;
  }

  /**
   * Count ArrowFunction / FunctionExpression elements in an ArrayLiteralExpression.
   * Used to detect inline functional guards (CanActivateFn) without resolving them.
   */
  private static _countInlineFunctionElements(arrayNode: Node): number {
    let count = 0;
    for (const child of arrayNode.getChildren()) {
      for (const el of child.getChildren()) {
        const kind = el.getKindName();
        if (kind === 'ArrowFunction' || kind === 'FunctionExpression') {
          count++;
        }
      }
    }
    return count;
  }

  private static _parseRouteObject(node: Node, cfg: AnalyzerConfig): ParsedRouteRecord | null {
    const maxLen = cfg.maxTemplateSnippetLength ?? 200;
    const origin = TsAstUtils.getOrigin(node);

    let path = '';
    let componentName: string | undefined;
    let componentImportPathHint: string | undefined;
    let redirectTo: string | undefined;
    let pathMatch: 'full' | 'prefix' | undefined;
    let loadChildrenExpr: string | undefined;
    let loadComponentExpr: string | undefined;
    let loadComponentImportSpecifier: string | undefined;
    let loadComponentExportHint: string | undefined;
    let children: ParsedRouteRecord[] | undefined;

    const guards: ParsedRouteRecord['guards'] = [];
    const resolvers: ParsedRouteRecord['resolvers'] = [];
    const data: ParsedRouteRecord['data'] = [];

    for (const prop of node.getChildren().flatMap((c: Node) => c.getChildren())) {
      const propName = prop.getChildren().at(0)?.getText() ?? '';
      const valueNode = prop.getChildren().at(-1);
      if (valueNode === undefined) continue;
      const rawValue = valueNode.getText().trim();

      switch (propName) {
        case 'path':
          path = TsAstUtils.getStringLiteralValue(valueNode) ?? rawValue.replace(/['"]/g, '');
          break;
        case 'component':
          componentName = rawValue;
          componentImportPathHint = RouteParser._resolveComponentImportHint(
            node.getSourceFile(),
            rawValue,
          );
          break;
        case 'redirectTo':
          redirectTo = TsAstUtils.getStringLiteralValue(valueNode) ?? rawValue.replace(/['"]/g, '');
          break;
        case 'pathMatch':
          pathMatch = (TsAstUtils.getStringLiteralValue(valueNode) as 'full' | 'prefix') ?? undefined;
          break;
        case 'loadChildren':
          loadChildrenExpr = TsAstUtils.truncateDeterministically(rawValue, maxLen);
          break;
        case 'loadComponent':
          loadComponentExpr = TsAstUtils.truncateDeterministically(rawValue, maxLen);
          {
            // Extract the import specifier (covers both `import('x')` and `import("x")`
            // and optional whitespace around the argument).
            const specMatch = rawValue.match(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/);
            if (specMatch?.[1] !== undefined) loadComponentImportSpecifier = specMatch[1];
            // Extract the class-name hint from `.then(m => m.X)` when present.
            const hintMatch = rawValue.match(/\.then\s*\(\s*\(?\s*\w+\s*\)?\s*=>\s*\w+\s*\.\s*(\w+)\s*\)/);
            if (hintMatch?.[1] !== undefined) loadComponentExportHint = hintMatch[1];
          }
          break;
        case 'children':
          if (valueNode.getKindName() === 'ArrayLiteralExpression') {
            children = [];
            for (const el of RouteParser._getArrayElements(valueNode)) {
              const child = RouteParser._parseRouteObject(el, cfg);
              if (child !== null) children.push(child);
            }
          }
          break;
        default:
          // Guard arrays
          if (GUARD_KINDS.has(propName)) {
            for (const guardName of TsAstUtils.extractArrayOfIdentifiers(valueNode)) {
              guards.push({ kind: propName, guardName, origin: TsAstUtils.getOrigin(valueNode, guardName) });
            }
            // Inline functional guards (Angular v15+ CanActivateFn): presence-only
            // capture so the route is not silently classified as guard-free.
            // The synthetic name remains unresolvable downstream, keeping the
            // workflow CONDITIONAL instead of FEASIBLE.
            const inlineCount = RouteParser._countInlineFunctionElements(valueNode);
            for (let i = 0; i < inlineCount; i++) {
              const synthName = `__inline_${propName}_${i}__`;
              guards.push({ kind: propName, guardName: synthName, origin: TsAstUtils.getOrigin(valueNode) });
            }
          }
          // Resolve map
          if (propName === 'resolve') {
            for (const resolverProp of valueNode.getChildren().flatMap((c: Node) => c.getChildren())) {
              const key = resolverProp.getChildren().at(0)?.getText().replace(/['"]/g, '') ?? '';
              const resolverName = resolverProp.getChildren().at(-1)?.getText().trim() ?? '';
              if (key && resolverName) {
                resolvers.push({ key, resolverName, origin: TsAstUtils.getOrigin(resolverProp, resolverName) });
              }
            }
          }
          // Data map
          if (propName === 'data') {
            for (const dataProp of valueNode.getChildren().flatMap((c: Node) => c.getChildren())) {
              const key = dataProp.getChildren().at(0)?.getText().replace(/['"]/g, '') ?? '';
              const val = TsAstUtils.truncateDeterministically(
                dataProp.getChildren().at(-1)?.getText().trim() ?? '',
                maxLen,
              );
              if (key) {
                data.push({ key, value: val, origin: TsAstUtils.getOrigin(dataProp, key) });
              }
            }
          }
          break;
      }
    }

    // Require at least a path property to consider this a route object.
    // A path:"" is valid when paired with a component, loadComponent,
    // loadChildren, redirect, or children array (e.g., the root route in
    // standalone apps, or a grouping container for nested routes).
    if (
      path === '' &&
      componentName === undefined &&
      redirectTo === undefined &&
      loadChildrenExpr === undefined &&
      loadComponentExpr === undefined &&
      (children === undefined || children.length === 0)
    ) {
      return null;
    }

    // Build record omitting undefined optional fields (exactOptionalPropertyTypes safe)
    const record: ParsedRouteRecord = { path, guards, resolvers, data, origin };
    if (componentName !== undefined) record.componentName = componentName;
    if (componentImportPathHint !== undefined) record.componentImportPathHint = componentImportPathHint;
    if (redirectTo !== undefined) record.redirectTo = redirectTo;
    if (pathMatch !== undefined) record.pathMatch = pathMatch;
    if (loadChildrenExpr !== undefined) record.loadChildrenExpr = loadChildrenExpr;
    if (loadComponentExpr !== undefined) record.loadComponentExpr = loadComponentExpr;
    if (loadComponentImportSpecifier !== undefined) record.loadComponentImportSpecifier = loadComponentImportSpecifier;
    if (loadComponentExportHint !== undefined) record.loadComponentExportHint = loadComponentExportHint;
    if (children !== undefined && children.length > 0) record.children = children;
    return record;
  }

  /**
   * Recursively unwrap AsExpression / SatisfiesExpression type wrappers.
   * e.g. `routes as Routes` or `routes satisfies Routes[]` → the inner expression.
   */
  private static _unwrapTypeExpr(node: Node): Node {
    const kind = node.getKindName();
    if (kind === 'AsExpression' || kind === 'SatisfiesExpression') {
      // Both node kinds expose getExpression() in ts-morph.
      const inner = (node as unknown as { getExpression(): Node }).getExpression();
      return RouteParser._unwrapTypeExpr(inner);
    }
    return node;
  }

  /**
   * Resolve an identifier (or type-assertion-wrapped identifier) passed as the
   * first argument to RouterModule.forRoot/forChild to its ArrayLiteralExpression.
   *
   * Handles:
   *   - Same-file:   const routes: Routes = [...]; forRoot(routes)
   *   - Cross-file:  import { routes } from './router'; forRoot(routes)
   *   - Type-wrapped: forRoot(routes as Routes), forRoot(routes satisfies Routes)
   *
   * Returns null when the symbol cannot be resolved or its initializer is not a
   * literal array (e.g. a call expression).  Never throws.
   */
  private static _resolveArgToArray(arg: Node): Node | null {
    try {
      const inner = RouteParser._unwrapTypeExpr(arg);
      if (!inner.isKind(SyntaxKind.Identifier)) return null;

      const rawSymbol = inner.getSymbol();
      if (rawSymbol === undefined) return null;

      // Follow import aliases so cross-file resolution works transparently.
      const symbol = rawSymbol.getAliasedSymbol() ?? rawSymbol;

      for (const decl of symbol.getDeclarations()) {
        if (decl.isKind(SyntaxKind.VariableDeclaration)) {
          const initializer = decl.getInitializer();
          if (initializer === undefined) continue;

          const unwrapped = RouteParser._unwrapTypeExpr(initializer);
          if (unwrapped.isKind(SyntaxKind.ArrayLiteralExpression)) {
            return unwrapped;
          }
        }
      }
    } catch {
      // Symbol resolution can fail on incomplete projects; never propagate.
    }
    return null;
  }

  private static _resolveComponentImportHint(file: SourceFile, componentName: string): string | undefined {
    for (const importDecl of file.getImportDeclarations()) {
      for (const named of importDecl.getNamedImports()) {
        if (named.getName() === componentName) {
          return importDecl.getModuleSpecifierValue();
        }
      }
    }
    return undefined;
  }
}
