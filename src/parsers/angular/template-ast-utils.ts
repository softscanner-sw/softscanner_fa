/**
 * template-ast-utils.ts
 * Deterministic traversal and extraction helpers over TemplateAstNode trees.
 *
 * Ordering contract:
 * - All returned arrays are ordered by span.start ascending, then by name
 *   lexicographically when spans are equal or absent.
 * - Expression strings are raw (as written), trimmed, and truncated via the
 *   global TsAstUtils.truncateDeterministically() policy.
 */

import type { TemplateAstNode } from './template-parser.js';
import type { Origin } from '../../models/origin.js';
import { TsAstUtils } from '../ts/ts-ast-utils.js';

// ---------------------------------------------------------------------------
// Structural directive result
// ---------------------------------------------------------------------------

export interface StructuralDirectiveResult {
  directive: 'ngIf' | 'ngSwitchCase' | string;
  expr: string;
  span?: { start: number; end: number };
}

// ---------------------------------------------------------------------------
// Property binding result
// ---------------------------------------------------------------------------

export interface PropertyBindingResult {
  /** e.g. "disabled", "hidden", "class.foo" */
  name: string;
  expr: string;
  span?: { start: number; end: number };
}

// ---------------------------------------------------------------------------
// Event binding result
// ---------------------------------------------------------------------------

export interface EventBindingResult {
  /** e.g. "click", "submit", "input" */
  event: string;
  handlerExpr: string;
  span?: { start: number; end: number };
}

// ---------------------------------------------------------------------------
// Structural directive names
// ---------------------------------------------------------------------------

const STRUCTURAL_DIRECTIVE_NAMES = new Set(['ngIf', 'ngFor', 'ngSwitch', 'ngSwitchCase', 'ngSwitchDefault']);

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

export class TemplateAstUtils {
  /**
   * Walk every node in the tree, calling `fn` on each visited node.
   * Pre-order traversal (parent before children).
   */
  static walk(ast: TemplateAstNode[], fn: (n: TemplateAstNode) => void): void {
    for (const node of ast) {
      fn(node);
      if (node.children !== undefined && node.children.length > 0) {
        TemplateAstUtils.walk(node.children, fn);
      }
    }
  }

  /**
   * Find all element-kind nodes (kind === "element") in the tree.
   * Returns in document order (pre-order).
   */
  static findElements(ast: TemplateAstNode[]): TemplateAstNode[] {
    const results: TemplateAstNode[] = [];
    TemplateAstUtils.walk(ast, (n) => {
      if (n.kind === 'element') results.push(n);
    });
    return results;
  }

  /**
   * Extract structural directives (*ngIf, *ngSwitchCase, etc.) from the tree.
   * Sorted by span.start then directive name.
   */
  static extractStructuralDirectives(ast: TemplateAstNode[]): StructuralDirectiveResult[] {
    const results: StructuralDirectiveResult[] = [];

    TemplateAstUtils.walk(ast, (n) => {
      // Structural directives appear as:
      //   - kind "structural" nodes (TmplAstTemplate)
      //   - kind "attr" or "boundAttr" nodes whose name is a structural directive
      if (n.kind === 'structural') {
        // Find the ngIf/ngSwitchCase input among children
        for (const child of n.children ?? []) {
          if (child.kind === 'boundAttr' && child.name !== undefined) {
            const directive = TemplateAstUtils._normalizeStructuralName(child.name);
            if (directive !== null) {
              const item: StructuralDirectiveResult = {
                directive,
                expr: TsAstUtils.truncateDeterministically(child.value?.trim() ?? '', 200),
              };
              if (child.span !== undefined) item.span = child.span;
              results.push(item);
            }
          }
        }
      }

      if ((n.kind === 'attr' || n.kind === 'boundAttr') && n.name !== undefined) {
        const directive = TemplateAstUtils._normalizeStructuralName(n.name);
        if (directive !== null && n.value !== undefined) {
          const item: StructuralDirectiveResult = {
            directive,
            expr: TsAstUtils.truncateDeterministically(n.value.trim(), 200),
          };
          if (n.span !== undefined) item.span = n.span;
          results.push(item);
        }
      }
    });

    return TemplateAstUtils._sortBySpanThenName(results, (r) => r.span, (r) => r.directive);
  }

  /**
   * Extract property bindings relevant to visibility/enablement.
   * Looks for [disabled], [hidden], [class.*], [attr.*] on elements.
   * Sorted by span.start then name.
   */
  static extractPropertyBindings(ast: TemplateAstNode[]): PropertyBindingResult[] {
    const results: PropertyBindingResult[] = [];

    TemplateAstUtils.walk(ast, (n) => {
      if (n.kind === 'boundAttr' && n.name !== undefined && n.value !== undefined) {
        const item: PropertyBindingResult = {
          name: n.name,
          expr: TsAstUtils.truncateDeterministically(n.value.trim(), 200),
        };
        if (n.span !== undefined) item.span = n.span;
        results.push(item);
      }
    });

    return TemplateAstUtils._sortBySpanThenName(results, (r) => r.span, (r) => r.name);
  }

  /**
   * Extract event bindings (click, submit, input, etc.) from the tree.
   * Sorted by span.start then event name.
   */
  static extractEventBindings(ast: TemplateAstNode[]): EventBindingResult[] {
    const results: EventBindingResult[] = [];

    TemplateAstUtils.walk(ast, (n) => {
      if (n.kind === 'event' && n.name !== undefined && n.value !== undefined) {
        const item: EventBindingResult = {
          event: n.name,
          handlerExpr: TsAstUtils.truncateDeterministically(n.value.trim(), 200),
        };
        if (n.span !== undefined) item.span = n.span;
        results.push(item);
      }
    });

    return TemplateAstUtils._sortBySpanThenName(results, (r) => r.span, (r) => r.event);
  }

  /**
   * Extract the value of a named attribute from a single node (not recursive).
   * Returns null if the attribute is not present.
   */
  static extractAttribute(node: TemplateAstNode, name: string): string | null {
    for (const child of node.children ?? []) {
      if ((child.kind === 'attr' || child.kind === 'boundAttr') && child.name === name) {
        return child.value ?? null;
      }
    }
    return null;
  }

  /**
   * Extract all nested custom-component selectors from the tree.
   * `selectorPrefix` is used to distinguish framework elements (e.g. "app-")
   * from native HTML elements. Pass an empty string to collect all non-HTML elements.
   *
   * Returns sorted, unique selector strings.
   */
  static extractNestedComponentSelectors(ast: TemplateAstNode[], selectorPrefix: string): string[] {
    const HTML_ELEMENTS = new Set([
      'a', 'abbr', 'address', 'area', 'article', 'aside', 'audio', 'b', 'base', 'bdi', 'bdo',
      'blockquote', 'body', 'br', 'button', 'canvas', 'caption', 'cite', 'code', 'col', 'colgroup',
      'data', 'datalist', 'dd', 'del', 'details', 'dfn', 'dialog', 'div', 'dl', 'dt', 'em',
      'embed', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4',
      'h5', 'h6', 'head', 'header', 'hr', 'html', 'i', 'iframe', 'img', 'input', 'ins', 'kbd',
      'label', 'legend', 'li', 'link', 'main', 'map', 'mark', 'menu', 'meta', 'meter', 'nav',
      'noscript', 'object', 'ol', 'optgroup', 'option', 'output', 'p', 'picture', 'pre',
      'progress', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'script', 'section', 'select', 'small',
      'source', 'span', 'strong', 'style', 'sub', 'summary', 'sup', 'table', 'tbody', 'td',
      'template', 'textarea', 'tfoot', 'th', 'thead', 'time', 'title', 'tr', 'track', 'u', 'ul',
      'var', 'video', 'wbr', 'ng-container', 'ng-content', 'ng-template',
    ]);

    const selectors = new Set<string>();

    TemplateAstUtils.walk(ast, (n) => {
      if (n.kind === 'element' && n.name !== undefined) {
        const name = n.name.toLowerCase();
        if (
          !HTML_ELEMENTS.has(name) &&
          (selectorPrefix === '' || name.startsWith(selectorPrefix))
        ) {
          selectors.add(n.name);
        }
      }
    });

    return [...selectors].sort();
  }

  /**
   * Map a template character span to an Origin.
   * Line/column are computed from the template text if provided.
   *
   * @param templateFile  - Absolute file path of the template.
   * @param templateText  - Full template text (used to compute line/col).
   * @param span          - Character-offset span from the AST.
   * @param symbolHint    - Optional symbol name for the Origin.
   */
  static originFromSpan(
    templateFile: string,
    templateText: string,
    span?: { start: number; end: number },
    symbolHint?: string,
  ): Origin {
    if (span === undefined) {
      const origin: Origin = { file: templateFile };
      if (symbolHint !== undefined) origin.symbol = symbolHint;
      return origin;
    }

    const { line: startLine, col: startCol } = TemplateAstUtils._offsetToLineCol(templateText, span.start);
    const { line: endLine } = TemplateAstUtils._offsetToLineCol(templateText, span.end);

    const origin: Origin = {
      file: templateFile,
      startLine,
      startCol,
      endLine,
    };
    if (symbolHint !== undefined) origin.symbol = symbolHint;
    return origin;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private static _normalizeStructuralName(name: string): string | null {
    // Strip leading * if present
    const stripped = name.startsWith('*') ? name.slice(1) : name;
    if (STRUCTURAL_DIRECTIVE_NAMES.has(stripped)) return stripped;
    // Treat any remaining *xyz as a custom structural directive
    if (name.startsWith('*')) return stripped;
    return null;
  }

  private static _offsetToLineCol(text: string, offset: number): { line: number; col: number } {
    const bounded = Math.min(offset, text.length);
    let line = 1;
    let col = 1;
    for (let i = 0; i < bounded; i++) {
      if (text[i] === '\n') {
        line++;
        col = 1;
      } else {
        col++;
      }
    }
    return { line, col };
  }

  private static _sortBySpanThenName<T>(
    items: T[],
    getSpan: (item: T) => { start: number; end: number } | undefined,
    getName: (item: T) => string,
  ): T[] {
    return [...items].sort((a, b) => {
      const aSpan = getSpan(a);
      const bSpan = getSpan(b);
      const aStart = aSpan?.start ?? Infinity;
      const bStart = bSpan?.start ?? Infinity;
      if (aStart !== bStart) return aStart - bStart;
      return getName(a).localeCompare(getName(b));
    });
  }
}
