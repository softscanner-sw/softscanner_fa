/**
 * template-parser.ts
 * Stable adapter around an Angular template parser that yields a uniform
 * TemplateAstNode tree consumed by all template analyzers.
 *
 * The concrete parser backend is @angular/compiler's `parseTemplate`.
 * Spans are preserved when the underlying parser provides them.
 *
 * Rules:
 * - No template execution.
 * - If the underlying parser throws, returns an empty node array (fail-safe).
 * - Span offsets are character positions within the template text (0-based).
 */

import { parseTemplate as _parseTemplate } from './compiler-loader.js';
import type { AnalyzerConfig } from '../../models/analyzer-config.js';

// ---------------------------------------------------------------------------
// Uniform AST node
// ---------------------------------------------------------------------------

/**
 * Framework-agnostic template AST node produced by AngularTemplateParser.
 * All consumers (TemplateAstUtils, WidgetProcessor, TemplateConstraintExtractor)
 * operate on this type exclusively — never on @angular/compiler internals.
 */
export interface TemplateAstNode {
  /**
   * Node kind discriminator.
   * Common values: "element", "text", "boundText", "attr", "boundAttr",
   * "structural", "reference", "variable", "icu", "comment".
   */
  kind: string;
  /** Tag name (elements) or attribute/directive name (attrs). */
  name?: string;
  /** Raw expression or text value. */
  value?: string;
  children?: TemplateAstNode[];
  /** Character offsets into the original template text (0-based). */
  span?: { start: number; end: number };
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export class AngularTemplateParser {
  /**
   * Parse an Angular template string into a TemplateAstNode tree.
   *
   * @param templateText  - Full template content as a string.
   * @param cfg           - Analyzer config (used for max snippet lengths etc.).
   * @returns             Root-level TemplateAstNode array (never throws).
   */
  static parse(templateText: string, cfg: AnalyzerConfig): TemplateAstNode[] {
    void cfg; // reserved for future config-driven options

    if (_parseTemplate === null) return [];

    try {
      const result = _parseTemplate(templateText, 'template.html', {
        preserveWhitespaces: false,
        leadingTriviaChars: [],
      });

      return AngularTemplateParser._convertNodes(result.nodes);
    } catch {
      // Fail-safe: return empty tree so analyzers get a valid (empty) result.
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Conversion from @angular/compiler AST → TemplateAstNode
  // ---------------------------------------------------------------------------

  private static _convertNodes(nodes: unknown[]): TemplateAstNode[] {
    return nodes.flatMap((node) => AngularTemplateParser._convertNode(node));
  }

  private static _convertNode(node: unknown): TemplateAstNode[] {
    if (node === null || typeof node !== 'object') return [];
    const n = node as Record<string, unknown>;

    // Element (TmplAstElement) — Angular v15+ uses 'name', not 'tagName'.
    // Exclude TmplAstTemplate ('templateAttrs' in n) and text nodes ('value' in n).
    if ('name' in n && typeof n['name'] === 'string' && !('templateAttrs' in n) && !('value' in n)) {
      const element: TemplateAstNode = { kind: 'element', name: n['name'] as string, children: [] };
      const span = AngularTemplateParser._extractSpan(n);
      if (span !== undefined) element.span = span;

      const children: TemplateAstNode[] = [];
      for (const attr of (n['attributes'] as unknown[] | undefined) ?? []) {
        children.push(...AngularTemplateParser._convertAttr(attr));
      }
      for (const input of (n['inputs'] as unknown[] | undefined) ?? []) {
        children.push(...AngularTemplateParser._convertInput(input));
      }
      for (const output of (n['outputs'] as unknown[] | undefined) ?? []) {
        children.push(...AngularTemplateParser._convertOutput(output));
      }
      for (const dir of (n['directives'] as unknown[] | undefined) ?? []) {
        children.push(...AngularTemplateParser._convertDirective(dir));
      }
      for (const child of (n['children'] as unknown[] | undefined) ?? []) {
        children.push(...AngularTemplateParser._convertNode(child));
      }
      element.children = children;
      return [element];
    }

    // Text (TmplAstText)
    if ('value' in n && typeof n['value'] === 'string' && !('ast' in n)) {
      const text: TemplateAstNode = { kind: 'text', value: n['value'] };
      const span = AngularTemplateParser._extractSpan(n);
      if (span !== undefined) text.span = span;
      return [text];
    }

    // BoundText (TmplAstBoundText)
    if ('value' in n && typeof n['value'] === 'object') {
      const bound: TemplateAstNode = { kind: 'boundText' };
      const val = AngularTemplateParser._astToString(n['value']);
      if (val !== undefined) bound.value = val;
      const span = AngularTemplateParser._extractSpan(n);
      if (span !== undefined) bound.span = span;
      return [bound];
    }

    // Structural (TmplAstTemplate)
    if ('templateAttrs' in n) {
      const structural: TemplateAstNode = { kind: 'structural', children: [] };
      const tagName = n['tagName'] as string | undefined;
      if (tagName !== undefined) structural.name = tagName;
      const span = AngularTemplateParser._extractSpan(n);
      if (span !== undefined) structural.span = span;

      const children: TemplateAstNode[] = [];
      for (const attr of (n['templateAttrs'] as unknown[] | undefined) ?? []) {
        children.push(...AngularTemplateParser._convertAttr(attr));
      }
      for (const input of (n['inputs'] as unknown[] | undefined) ?? []) {
        children.push(...AngularTemplateParser._convertInput(input));
      }
      for (const child of (n['children'] as unknown[] | undefined) ?? []) {
        children.push(...AngularTemplateParser._convertNode(child));
      }
      structural.children = children;
      return [structural];
    }

    return [];
  }

  private static _convertAttr(attr: unknown): TemplateAstNode[] {
    if (attr === null || typeof attr !== 'object') return [];
    const a = attr as Record<string, unknown>;
    const node: TemplateAstNode = { kind: 'attr' };
    if (typeof a['name'] === 'string') node.name = a['name'];
    if (typeof a['value'] === 'string') node.value = a['value'];
    const span = AngularTemplateParser._extractSpan(a);
    if (span !== undefined) node.span = span;
    return [node];
  }

  private static _convertInput(input: unknown): TemplateAstNode[] {
    if (input === null || typeof input !== 'object') return [];
    const i = input as Record<string, unknown>;
    const node: TemplateAstNode = { kind: 'boundAttr' };
    if (typeof i['name'] === 'string') node.name = i['name'];
    const val = AngularTemplateParser._astToString(i['value']);
    if (val !== undefined) node.value = val;
    const span = AngularTemplateParser._extractSpan(i);
    if (span !== undefined) node.span = span;
    return [node];
  }

  private static _convertOutput(output: unknown): TemplateAstNode[] {
    if (output === null || typeof output !== 'object') return [];
    const o = output as Record<string, unknown>;
    const node: TemplateAstNode = { kind: 'event' };
    if (typeof o['name'] === 'string') node.name = o['name'];
    const val = AngularTemplateParser._astToString(o['handler']);
    if (val !== undefined) node.value = val;
    const span = AngularTemplateParser._extractSpan(o);
    if (span !== undefined) node.span = span;
    return [node];
  }

  private static _convertDirective(dir: unknown): TemplateAstNode[] {
    if (dir === null || typeof dir !== 'object') return [];
    const d = dir as Record<string, unknown>;
    const node: TemplateAstNode = { kind: 'directive' };
    if (typeof d['name'] === 'string') node.name = d['name'];
    const span = AngularTemplateParser._extractSpan(d);
    if (span !== undefined) node.span = span;
    return [node];
  }

  private static _extractSpan(n: Record<string, unknown>): { start: number; end: number } | undefined {
    const span = n['sourceSpan'] ?? n['span'];
    if (span !== null && typeof span === 'object') {
      const s = span as Record<string, unknown>;
      if (typeof s['start'] === 'number' && typeof s['end'] === 'number') {
        return { start: s['start'] as number, end: s['end'] as number };
      }
      // @angular/compiler uses ParseSourceSpan with start.offset / end.offset
      const start = s['start'] as Record<string, unknown> | undefined;
      const end = s['end'] as Record<string, unknown> | undefined;
      if (typeof start?.['offset'] === 'number' && typeof end?.['offset'] === 'number') {
        return { start: start['offset'] as number, end: end['offset'] as number };
      }
    }
    return undefined;
  }

  private static _astToString(ast: unknown): string | undefined {
    if (ast === null || ast === undefined) return undefined;
    if (typeof ast === 'string') return ast;
    if (typeof ast === 'object') {
      const a = ast as Record<string, unknown>;
      // ASTWithSource has a `source` property
      if (typeof a['source'] === 'string') return a['source'];
    }
    return undefined;
  }

}
