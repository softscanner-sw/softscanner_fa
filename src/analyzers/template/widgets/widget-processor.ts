/**
 * widget-processor.ts
 * Traverses a TemplateAstNode tree and produces the ordered list of
 * WidgetInfo objects for a given component.
 *
 * Ordering: by origin.file → origin.startLine → origin.startCol → stableIndex
 * (matches ComponentInfo.widgets ordering contract).
 */

import type { TemplateAstNode } from '../../../parsers/angular/template-parser.js';
import { TemplateAstUtils } from '../../../parsers/angular/template-ast-utils.js';
import type { WidgetInfo, WidgetKind, WidgetBinding } from '../../../models/widgets.js';
import type { Origin } from '../../../models/origin.js';
import type { AnalyzerConfig } from '../../../models/analyzer-config.js';
import {
  classifyWidget,
  extractBoundedAttributes,
  extractTextLabel,
  makeWidgetId,
  buildWidgetPath,
} from './widget-utils.js';

// ---------------------------------------------------------------------------
// Processor
// ---------------------------------------------------------------------------

export class WidgetProcessor {
  private readonly _componentId: string;
  private readonly _templateFile: string;
  private readonly _templateText: string;
  private readonly _cfg: AnalyzerConfig;

  constructor(
    componentId: string,
    templateFile: string,
    templateText: string,
    cfg: AnalyzerConfig,
  ) {
    this._componentId = componentId;
    this._templateFile = templateFile;
    this._templateText = templateText;
    this._cfg = cfg;
  }

  /**
   * Extract all widgets from the AST.
   * Returns widgets sorted by origin.file → startLine → startCol → stableIndex.
   */
  process(ast: TemplateAstNode[]): WidgetInfo[] {
    const widgets: WidgetInfo[] = [];
    const kindCounters = new Map<WidgetKind, number>();

    this._walk(ast, [], widgets, kindCounters);

    // Sort by origin position then stableIndex (already in document order from walk)
    widgets.sort((a, b) => {
      const lineDiff = (a.origin.startLine ?? 0) - (b.origin.startLine ?? 0);
      if (lineDiff !== 0) return lineDiff;
      const colDiff = (a.origin.startCol ?? 0) - (b.origin.startCol ?? 0);
      if (colDiff !== 0) return colDiff;
      return a.id.localeCompare(b.id);
    });

    return widgets;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private _walk(
    nodes: TemplateAstNode[],
    ancestorNames: string[],
    out: WidgetInfo[],
    kindCounters: Map<WidgetKind, number>,
  ): void {
    for (const node of nodes) {
      const kind = classifyWidget(node);

      if (kind !== null) {
        const count = kindCounters.get(kind) ?? 0;
        kindCounters.set(kind, count + 1);

        const origin = TemplateAstUtils.originFromSpan(
          this._templateFile,
          this._templateText,
          node.span,
          node.name,
        );

        const widgetId = makeWidgetId(
          this._componentId,
          this._templateFile,
          origin.startLine,
          origin.startCol,
          kind,
          count,
        );

        const pathStr = buildWidgetPath(ancestorNames, kind, count);
        const maxLen = this._cfg.maxTemplateSnippetLength ?? 200;

        const bindings = this._extractBindings(node, origin);

        const widget: WidgetInfo = {
          id: widgetId,
          componentId: this._componentId,
          kind,
          ...(node.name != null ? { tagName: node.name } : {}),
          origin,
          path: { componentId: this._componentId, path: pathStr },
          attributes: extractBoundedAttributes(node, maxLen),
          bindings,
          visibilityPredicates: [],   // filled by TemplateConstraintExtractor
          enablementPredicates: [],   // filled by TemplateConstraintExtractor
        };
        const textLabel = extractTextLabel(node, maxLen);
        if (textLabel !== undefined) widget.text = textLabel;
        const validators = this._extractValidators(node);
        if (validators !== undefined) widget.validators = validators;

        out.push(widget);

        // Recurse with this element's tag as the new ancestor context
        this._walk(
          node.children ?? [],
          [...ancestorNames, node.name ?? kind],
          out,
          kindCounters,
        );
      } else {
        // Non-widget element: recurse without adding to ancestors (preserves path brevity)
        this._walk(
          node.children ?? [],
          [...ancestorNames, node.name ?? ''],
          out,
          kindCounters,
        );
      }
    }
  }

  private _extractBindings(node: TemplateAstNode, _origin: Origin): WidgetBinding[] {
    const BINDING_NAMES = new Set([
      // Navigation attributes
      'routerlink', 'href',
      // Form-model attributes
      'formcontrolname', 'formgroupname', 'ngmodel',
      // DOM event names captured for handler analysis
      'click', 'submit', 'ngsubmit', 'change', 'input',
    ]);
    const bindings: WidgetBinding[] = [];
    const maxLen = this._cfg.maxTemplateSnippetLength ?? 200;

    for (const child of node.children ?? []) {
      if (child.kind === 'attr' || child.kind === 'boundAttr' || child.kind === 'event') {
        const name = child.name ?? '';
        if (BINDING_NAMES.has(name.toLowerCase())) {
          const bindingOrigin = TemplateAstUtils.originFromSpan(
            this._templateFile,
            this._templateText,
            child.span,
            name,
          );
          const binding: WidgetBinding = { kind: child.kind as 'attr' | 'boundAttr' | 'event', name, origin: bindingOrigin };
          if (child.value !== undefined) binding.value = child.value.trim().slice(0, maxLen);
          bindings.push(binding);
        }
      }
    }

    return bindings;
  }

  private _extractValidators(node: TemplateAstNode): WidgetInfo['validators'] {
    const required = node.children?.some(
      (c) => c.kind === 'attr' && c.name === 'required',
    ) ?? false;

    const minLengthVal = this._getBoundAttr(node, 'minlength');
    const maxLengthVal = this._getBoundAttr(node, 'maxlength');
    const patternVal = this._getBoundAttr(node, 'pattern');

    const validators: WidgetInfo['validators'] = {};
    if (required) validators.required = true;
    if (minLengthVal !== undefined) { const n = parseInt(minLengthVal, 10); if (n > 0) validators.minLength = n; }
    if (maxLengthVal !== undefined) { const n = parseInt(maxLengthVal, 10); if (n > 0) validators.maxLength = n; }
    if (patternVal !== undefined) validators.pattern = patternVal;

    return Object.keys(validators).length > 0 ? validators : undefined;
  }

  private _getBoundAttr(node: TemplateAstNode, name: string): string | undefined {
    for (const child of node.children ?? []) {
      if ((child.kind === 'attr' || child.kind === 'boundAttr') &&
          child.name?.toLowerCase() === name) {
        return child.value;
      }
    }
    return undefined;
  }
}
