/**
 * template-utils.ts
 * Stateless helper functions for template resolution, AST parsing, widget
 * extraction, and nested component discovery.
 *
 * Acts as the glue layer between parsers and TemplateAnalyzer.
 * All functions are deterministic and side-effect-free (except resolveTemplate
 * which reads from disk via DecoratorParser).
 */

import type { Decorator } from 'ts-morph';
import type { TemplateAstNode } from '../../parsers/angular/template-parser.js';
import { AngularTemplateParser } from '../../parsers/angular/template-parser.js';
import { TemplateAstUtils } from '../../parsers/angular/template-ast-utils.js';
import { DecoratorParser } from '../../parsers/angular/decorator-parser.js';
import type { AnalyzerConfig } from '../../models/analyzer-config.js';
import type { WidgetInfo } from '../../models/widgets.js';
import { WidgetProcessor } from './widgets/widget-processor.js';

// ---------------------------------------------------------------------------
// Template resolution
// ---------------------------------------------------------------------------

/**
 * Extract and resolve the template text for a component decorator.
 * Returns null when neither inline nor external template can be found.
 *
 * Precedence: inline template > templateUrl.
 */
export async function extractTemplate(
  decorator: Decorator,
  cfg: AnalyzerConfig,
): Promise<string | null> {
  const meta = DecoratorParser.extractComponentMeta(decorator, cfg);
  return DecoratorParser.resolveTemplateText(meta, cfg.projectRoot);
}

// ---------------------------------------------------------------------------
// AST parsing
// ---------------------------------------------------------------------------

/**
 * Parse a template string into a TemplateAstNode tree.
 * Never throws — returns [] on parse failure.
 */
export function parseTemplateToAst(
  template: string,
  cfg: AnalyzerConfig,
): TemplateAstNode[] {
  return AngularTemplateParser.parse(template, cfg);
}

// ---------------------------------------------------------------------------
// Widget extraction
// ---------------------------------------------------------------------------

/**
 * Extract all widgets from a parsed template AST.
 *
 * @param componentId    - Stable ComponentInfo.id.
 * @param templateFile   - Absolute path to the template file (or component file for inline).
 * @param templateText   - Raw template string (used for span → line/col mapping).
 * @param ast            - Parsed TemplateAstNode tree.
 * @param cfg            - Analyzer configuration.
 */
export function extractWidgetsFromAst(
  componentId: string,
  templateFile: string,
  templateText: string,
  ast: TemplateAstNode[],
  cfg: AnalyzerConfig,
): WidgetInfo[] {
  const processor = new WidgetProcessor(componentId, templateFile, templateText, cfg);
  return processor.process(ast);
}

/**
 * Flatten a nested widget tree into a sorted flat list.
 * (Widgets from WidgetProcessor are already flat; this is a no-op passthrough
 *  included for API completeness.)
 */
export function flattenWidgets(widgets: WidgetInfo[]): WidgetInfo[] {
  return [...widgets];
}

// ---------------------------------------------------------------------------
// Nested component discovery
// ---------------------------------------------------------------------------

/**
 * Extract selector strings of nested Angular components from the template AST.
 * Uses the project's selector prefix (e.g. "app-") to distinguish custom
 * components from native HTML elements.
 *
 * Returns sorted, unique selector strings.
 */
export function extractNestedComponentsFromAst(
  ast: TemplateAstNode[],
  selectorPrefix = 'app-',
): string[] {
  return TemplateAstUtils.extractNestedComponentSelectors(ast, selectorPrefix);
}
