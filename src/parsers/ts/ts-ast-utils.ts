/**
 * ts-ast-utils.ts
 * Low-level, deterministic TypeScript AST utilities used by all analyzers
 * and parsers. No project-level orchestration; no non-deterministic heuristics.
 *
 * Determinism rules:
 * - All extracted arrays are returned sorted + deduplicated.
 * - All string truncation uses a single global policy:
 *     head (maxLen - 1 chars) + "…"
 *   Applied via truncateDeterministically().
 */

import type {
  Node,
  SourceFile,
  ClassDeclaration,
  Decorator,
} from 'ts-morph';
import { Project, SyntaxKind } from 'ts-morph';
import type { Origin } from '../../models/origin.js';

/** Tail sentinel appended when a string is truncated. */
const TRUNCATION_SENTINEL = '…';

export class TsAstUtils {
  // ---------------------------------------------------------------------------
  // Origin
  // ---------------------------------------------------------------------------

  /**
   * Derive an Origin from a ts-morph Node.
   * Falls back to file-only if position information is unavailable.
   *
   * @param node        - Any ts-morph Node.
   * @param symbolHint  - Optional symbol name to attach (e.g. class/method name).
   */
  static getOrigin(node: Node, symbolHint?: string): Origin {
    const sourceFile = node.getSourceFile();
    const startPos = node.getStart();
    const endPos = node.getEnd();
    const { line: startLine0, character: startChar0 } =
      sourceFile.compilerNode.getLineAndCharacterOfPosition(startPos);
    const { line: endLine0 } =
      sourceFile.compilerNode.getLineAndCharacterOfPosition(endPos);

    const origin: Origin = {
      file: sourceFile.getFilePath(),
      startLine: startLine0 + 1,    // convert 0-based → 1-based
      startCol: startChar0 + 1,     // convert 0-based → 1-based
      endLine: endLine0 + 1,
    };
    if (symbolHint !== undefined) {
      origin.symbol = symbolHint;
    }
    return origin;
  }

  // ---------------------------------------------------------------------------
  // Import resolution
  // ---------------------------------------------------------------------------

  /**
   * Resolve an import specifier from a given source file to an absolute path.
   * Returns null if the specifier cannot be resolved (e.g. node_modules).
   */
  static resolveImportTarget(fromFile: SourceFile, specifier: string): string | null {
    const importDecl = fromFile.getImportDeclaration(specifier);
    if (importDecl === undefined) return null;

    const resolved = importDecl.getModuleSpecifierSourceFile();
    return resolved?.getFilePath() ?? null;
  }

  // ---------------------------------------------------------------------------
  // Symbol resolution
  // ---------------------------------------------------------------------------

  /**
   * Resolve a symbol name to its declaration node within the project.
   * Performs a best-effort search across all source files.
   * Returns null if not found.
   */
  static resolveSymbolToDeclaration(project: Project, symbolName: string): Node | null {
    for (const sourceFile of project.getSourceFiles()) {
      const match = sourceFile
        .getExportedDeclarations()
        .get(symbolName)
        ?.at(0);
      if (match !== undefined) return match;
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Decorator helpers
  // ---------------------------------------------------------------------------

  /**
   * Find a named decorator on a class declaration.
   * Returns null if not found.
   */
  static findDecorator(classDecl: ClassDeclaration, decoratorName: string): Decorator | null {
    return (
      classDecl.getDecorator(decoratorName) ?? null
    );
  }

  // ---------------------------------------------------------------------------
  // Literal extraction
  // ---------------------------------------------------------------------------

  /**
   * Extract the string value from a StringLiteral or NoSubstitutionTemplateLiteral node.
   * Returns null for any other node kind.
   */
  static getStringLiteralValue(node: Node): string | null {
    if (
      node.isKind(SyntaxKind.StringLiteral) ||
      node.isKind(SyntaxKind.NoSubstitutionTemplateLiteral)
    ) {
      return (node as unknown as { getLiteralValue(): string }).getLiteralValue();
    }
    return null;
  }

  /**
   * Extract identifiers from an ArrayLiteralExpression node.
   * Returns a sorted, deduplicated array of identifier texts.
   */
  static extractArrayOfIdentifiers(node: Node): string[] {
    const results: string[] = [];
    for (const child of node.getChildren()) {
      const text = child.getText().trim();
      if (text.length > 0 && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(text)) {
        results.push(text);
      }
    }
    return TsAstUtils._sortUnique(results);
  }

  /**
   * Extract string literal values from an ArrayLiteralExpression node.
   * Returns a sorted, deduplicated array.
   */
  static extractArrayOfStringLiterals(node: Node): string[] {
    const results: string[] = [];
    for (const child of node.getChildren()) {
      const value = TsAstUtils.getStringLiteralValue(child);
      if (value !== null) results.push(value);
    }
    return TsAstUtils._sortUnique(results);
  }

  // ---------------------------------------------------------------------------
  // Handler / method helpers
  // ---------------------------------------------------------------------------

  /**
   * Find a method declaration by name on a class.
   * Returns null if not found.
   */
  static findMethodDeclaration(classDecl: ClassDeclaration, methodName: string): Node | null {
    return classDecl.getMethod(methodName) ?? null;
  }

  /**
   * Find all method/property names declared on a class (sorted, unique).
   */
  static findClassMembers(classDecl: ClassDeclaration): string[] {
    const names: string[] = [];
    for (const member of classDecl.getMembers()) {
      const name = (member as unknown as { getName?: () => string }).getName?.();
      if (name !== undefined) names.push(name);
    }
    return TsAstUtils._sortUnique(names);
  }

  /**
   * Extract string arguments from a call expression node (bounded, best-effort).
   * Returns up to 10 raw argument text strings, each truncated.
   */
  static getCallExpressionArgs(node: Node, maxLen = 200): string[] {
    const args: string[] = [];
    for (const child of node.getChildren()) {
      if (child.getKindName() === 'SyntaxList') {
        for (const arg of child.getChildren()) {
          const text = arg.getText().trim();
          if (text.length > 0 && text !== ',') {
            args.push(TsAstUtils.truncateDeterministically(text, maxLen));
            if (args.length >= 10) break;
          }
        }
      }
    }
    return args;
  }

  // ---------------------------------------------------------------------------
  // Bounded string utilities
  // ---------------------------------------------------------------------------

  /**
   * Truncate a string deterministically to at most `maxLen` characters.
   * If the string exceeds `maxLen`, returns the first `maxLen - 1` characters
   * followed by the TRUNCATION_SENTINEL ("…").
   *
   * Same input always yields the same output.
   */
  static truncateDeterministically(s: string, maxLen: number): string {
    if (s.length <= maxLen) return s;
    return s.slice(0, maxLen - 1) + TRUNCATION_SENTINEL;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private static _sortUnique(arr: string[]): string[] {
    return [...new Set(arr)].sort();
  }
}
