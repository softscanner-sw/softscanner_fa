/**
 * template-analyzer.ts
 * For each @Component decorator:
 *   1. Resolves the template (inline or templateUrl)
 *   2. Parses it to the uniform TemplateAstNode tree
 *   3. Extracts WidgetInfo[] and nested component selectors
 *
 * Does NOT attach visibility/enablement predicates — that is
 * TemplateConstraintExtractor's responsibility.
 *
 * Public API is async because templateUrl resolution is I/O.
 */

import { resolve, dirname } from 'node:path';
import type { Decorator } from 'ts-morph';
import type { WidgetInfo } from '../../models/widgets.js';
import type { AnalyzerConfig } from '../../models/analyzer-config.js';
import { DecoratorParser } from '../../parsers/angular/decorator-parser.js';
import {
  extractTemplate,
  parseTemplateToAst,
  extractWidgetsFromAst,
  extractNestedComponentsFromAst,
} from './template-utils.js';

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export interface TemplateAnalysisResult {
  /** Angular element selector (e.g. "app-user-list"). */
  selector: string;
  /** Component class name. */
  name: string;
  /** Widgets extracted from the template, sorted by origin position. */
  widgets: WidgetInfo[];
  /** Selectors of nested custom components found in the template. */
  nestedComponents: string[];
}

// ---------------------------------------------------------------------------
// Analyzer
// ---------------------------------------------------------------------------

export class TemplateAnalyzer {
  private readonly _decorator: Decorator;
  private readonly _cfg: AnalyzerConfig;

  /**
   * @param decorator - The @Component ts-morph Decorator node.
   * @param cfg       - Analyzer configuration (projectRoot, maxSnippetLength, etc.).
   */
  constructor(decorator: Decorator, cfg: AnalyzerConfig) {
    this._decorator = decorator;
    this._cfg = cfg;
  }

  /**
   * Run the full template analysis pipeline for this component.
   *
   * Phase 1 invariant: if the component has no selector, this method throws.
   * A missing selector means the component cannot be referenced in any
   * template, making it unreachable — a hard extraction error.
   *
   * @param componentId - Stable ComponentInfo.id for this component.
   */
  async analyze(componentId: string): Promise<TemplateAnalysisResult> {
    const meta = DecoratorParser.extractComponentMeta(this._decorator, this._cfg);

    // Hard invariant: selector must exist
    if (meta.selector === null || meta.selector.trim() === '') {
      throw new Error(
        `Phase 1 invariant violation: @Component at ${meta.origin.file}:${meta.origin.startLine} ` +
        `has no selector. Every component must have a selector for template graph extraction.`,
      );
    }

    const selector = meta.selector.trim();
    const className =
      this._decorator.getParent()?.getSymbol()?.getName() ?? selector;

    // Resolve template text
    const templateText = await extractTemplate(this._decorator, this._cfg);
    if (templateText === null) {
      // No template available: return empty result
      return { selector, name: className, widgets: [], nestedComponents: [] };
    }

    // Determine the file path to attribute Origin entries
    const templateFile =
      meta.templateUrl !== null
        ? resolve(dirname(meta.origin.file), meta.templateUrl)
        : meta.origin.file;

    // Parse to AST
    const ast = parseTemplateToAst(templateText, this._cfg);

    // Extract widgets
    const widgets = extractWidgetsFromAst(
      componentId,
      templateFile,
      templateText,
      ast,
      this._cfg,
    );

    // Extract nested component selectors
    const nestedComponents = extractNestedComponentsFromAst(ast);

    return { selector, name: className, widgets, nestedComponents };
  }
}
