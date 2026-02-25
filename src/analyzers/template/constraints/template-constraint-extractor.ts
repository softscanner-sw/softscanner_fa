/**
 * template-constraint-extractor.ts
 * Attaches UI executability constraints (visibility + enablement predicates)
 * to WidgetInfo objects by inspecting the parsed template AST.
 *
 * Sources of predicates:
 *   Visibility  — *ngIf / [hidden] on the widget element or its ancestors
 *   Enablement  — [disabled] / permission directives on the widget element
 *
 * This is a post-pass: it receives widgets already extracted by WidgetProcessor
 * and returns an enriched copy with predicates populated.
 *
 * No symbolic evaluation is performed — expressions are stored as raw,
 * bounded strings.
 */

import type { TemplateAstNode } from '../../../parsers/angular/template-parser.js';
import { TemplateAstUtils } from '../../../parsers/angular/template-ast-utils.js';
import { TsAstUtils } from '../../../parsers/ts/ts-ast-utils.js';
import type { WidgetInfo } from '../../../models/widgets.js';
import type { Predicate, PredicateKind } from '../../../models/constraints.js';
import type { AnalyzerConfig } from '../../../models/analyzer-config.js';

// ---------------------------------------------------------------------------
// Known enablement directives (permission / feature-flag patterns)
// ---------------------------------------------------------------------------

const ENABLEMENT_ATTR_NAMES = new Set([
  'disabled',
  'ng-disabled',
  // common permission directive patterns
  'appHasPermission', 'hasPermission', 'appDisabledIf',
  'disabledIf', 'featureFlag', 'appFeatureFlag',
]);

const VISIBILITY_ATTR_NAMES = new Set([
  'hidden',
  // common permission directive patterns
  'appShowFor', 'showFor', 'appHideFor', 'hideFor',
  'appIfPermission', 'ifPermission',
]);

// ---------------------------------------------------------------------------
// Extractor
// ---------------------------------------------------------------------------

export class TemplateConstraintExtractor {
  private readonly _cfg: AnalyzerConfig;

  constructor(cfg?: AnalyzerConfig) {
    this._cfg = cfg ?? { projectRoot: '', tsConfigPath: '' };
  }

  /**
   * Enrich each widget in `widgets` with visibility and enablement predicates
   * derived from the template AST.
   *
   * Returns a new array of WidgetInfo with predicates populated.
   * Input widgets are not mutated.
   *
   * @param componentId   - ComponentInfo.id (used for Origin references).
   * @param widgets       - Widgets extracted by WidgetProcessor.
   * @param templateAst   - Full parsed template AST.
   * @param templateText  - Raw template string (for span → line/col mapping).
   * @param templateFile  - Absolute path of the template file (for Origin).
   */
  extract(
    componentId: string,
    widgets: WidgetInfo[],
    templateAst: TemplateAstNode[],
    templateText: string,
    templateFile?: string,
  ): WidgetInfo[] {
    void componentId; // reserved for future use (per-component predicate scoping)

    const resolvedTemplateFile = templateFile ?? '';

    // Build a span-indexed map of all predicates in the AST so we can
    // attach them to widgets by position overlap.
    const visibilityPredicates = this._collectVisibilityPredicates(
      templateAst, templateText, resolvedTemplateFile,
    );
    const enablementPredicates = this._collectEnablementPredicates(
      templateAst, templateText, resolvedTemplateFile,
    );

    return widgets.map((widget) => ({
      ...widget,
      visibilityPredicates: this._matchPredicates(widget, visibilityPredicates),
      enablementPredicates: this._matchPredicates(widget, enablementPredicates),
    }));
  }

  // ---------------------------------------------------------------------------
  // Collection helpers
  // ---------------------------------------------------------------------------

  private _collectVisibilityPredicates(
    ast: TemplateAstNode[],
    templateText: string,
    templateFile: string,
  ): PredicateWithSpan[] {
    const results: PredicateWithSpan[] = [];
    const maxLen = this._cfg.maxTemplateSnippetLength ?? 200;

    // Structural directives: *ngIf, *ngSwitchCase
    for (const dir of TemplateAstUtils.extractStructuralDirectives(ast)) {
      const kind = this._structuralDirectiveToKind(dir.directive);
      const predicate: Predicate = {
        kind,
        expr: TsAstUtils.truncateDeterministically(dir.expr, maxLen),
        origin: TemplateAstUtils.originFromSpan(templateFile, templateText, dir.span, dir.directive),
      };
      const refs = this._extractRefs(dir.expr);
      if (refs !== undefined) predicate.refs = refs;
      const visItem: PredicateWithSpan = { predicate };
      if (dir.span !== undefined) visItem.span = dir.span;
      results.push(visItem);
    }

    // Property bindings: [hidden], custom visibility directives
    for (const binding of TemplateAstUtils.extractPropertyBindings(ast)) {
      if (binding.name === 'hidden' || VISIBILITY_ATTR_NAMES.has(binding.name)) {
        const kind: PredicateKind = binding.name === 'hidden' ? 'hidden' : 'permissionDirective';
        const predicate: Predicate = {
          kind,
          expr: TsAstUtils.truncateDeterministically(binding.expr, maxLen),
          origin: TemplateAstUtils.originFromSpan(templateFile, templateText, binding.span, binding.name),
        };
        const refs = this._extractRefs(binding.expr);
        if (refs !== undefined) predicate.refs = refs;
        const bindItem: PredicateWithSpan = { predicate };
        if (binding.span !== undefined) bindItem.span = binding.span;
        results.push(bindItem);
      }
    }

    return results;
  }

  private _collectEnablementPredicates(
    ast: TemplateAstNode[],
    templateText: string,
    templateFile: string,
  ): PredicateWithSpan[] {
    const results: PredicateWithSpan[] = [];
    const maxLen = this._cfg.maxTemplateSnippetLength ?? 200;

    for (const binding of TemplateAstUtils.extractPropertyBindings(ast)) {
      if (binding.name === 'disabled' || ENABLEMENT_ATTR_NAMES.has(binding.name)) {
        const kind: PredicateKind =
          binding.name === 'disabled' ? 'disabled' : 'permissionDirective';
        const predicate: Predicate = {
          kind,
          expr: TsAstUtils.truncateDeterministically(binding.expr, maxLen),
          origin: TemplateAstUtils.originFromSpan(templateFile, templateText, binding.span, binding.name),
        };
        const refs = this._extractRefs(binding.expr);
        if (refs !== undefined) predicate.refs = refs;
        const enabItem: PredicateWithSpan = { predicate };
        if (binding.span !== undefined) enabItem.span = binding.span;
        results.push(enabItem);
      }
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Matching: attach predicates to a widget by position
  // ---------------------------------------------------------------------------

  private _matchPredicates(widget: WidgetInfo, predicates: PredicateWithSpan[]): Predicate[] {
    const widgetStart = this._positionToOffset(widget.origin.startLine, widget.origin.startCol);
    const widgetEnd = this._positionToOffset(widget.origin.endLine, widget.origin.startCol);

    return predicates
      .filter((p) => {
        if (p.span === undefined) return true; // no span: attach to all widgets (conservative)
        // The predicate applies to this widget if the predicate span begins before
        // the widget ends (ancestor or same-element predicates).
        return p.span.start <= (widgetEnd ?? widgetStart);
      })
      .map((p) => p.predicate);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private _structuralDirectiveToKind(directive: string): PredicateKind {
    switch (directive) {
      case 'ngIf': return 'ngIf';
      case 'ngSwitchCase': return 'ngSwitchCase';
      default: return 'customDirective';
    }
  }

  private _extractRefs(expr: string): string[] | undefined {
    // Extract simple identifiers from the expression (best-effort, heuristic).
    const identifiers = [...expr.matchAll(/\b([A-Za-z_$][A-Za-z0-9_$.]*)\b/g)]
      .map((m) => m[1]!)
      .filter((id) => !ANGULAR_KEYWORDS.has(id));
    if (identifiers.length === 0) return undefined;
    return [...new Set(identifiers)].sort();
  }

  private _positionToOffset(line?: number, col?: number): number {
    // Approximate: used only for ordering/filtering; not required to be exact.
    return ((line ?? 0) * 10_000) + (col ?? 0);
  }
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface PredicateWithSpan {
  predicate: Predicate;
  span?: { start: number; end: number };
}

// Angular template expression keywords to exclude from refs
const ANGULAR_KEYWORDS = new Set([
  'true', 'false', 'null', 'undefined', 'typeof', 'instanceof',
  'let', 'const', 'var', 'if', 'else', 'return', 'of', 'as',
]);
