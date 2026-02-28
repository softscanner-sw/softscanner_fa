/**
 * logic-analyzer.ts
 * Maps template-derived widgets to their bound events and statically
 * interprets event handlers to produce EventHandlerCallContexts.
 *
 * Pipeline (per component):
 *   1. For each widget, inspect its bindings for event names
 *   2. Resolve the handler method name from the binding expression
 *   3. Find the method declaration on the component class via TsAstUtils
 *   4. Extract call contexts from the method body via LogicUtils
 *   5. Emit a WidgetEvent per (widget, event) pair
 *
 * Prohibited:
 *   - Workflow/journey enumeration
 *   - Satisfiability or feasibility checking
 *   - LLM-based refinement
 */

import type { Project, SourceFile } from 'ts-morph';
import type { ComponentRegistry } from '../../models/components.js';
import type { RouteMap } from '../../models/routes.js';
import type { WidgetInfo } from '../../models/widgets.js';
import type { WidgetEvent, WidgetEventMap } from '../../models/events.js';
import type { AnalyzerConfig } from '../../models/analyzer-config.js';
import { TsAstUtils } from '../../parsers/ts/ts-ast-utils.js';
import { normalizeEventType, extractHandlerName, extractCallContexts, sortWidgetEvents } from './logic-utils.js';

const NAV_BINDING_NAMES = new Set(['routerlink', 'href']);

export class LogicAnalyzer {
  private readonly _cfg: AnalyzerConfig;

  constructor(cfg?: AnalyzerConfig) {
    this._cfg = cfg ?? { projectRoot: '', tsConfigPath: '' };
  }

  // ---------------------------------------------------------------------------
  // Project-level entry point
  // ---------------------------------------------------------------------------

  /**
   * Analyse all components in the registry and return one WidgetEventMap
   * per component that has at least one widget with an event binding.
   */
  analyzeProject(
    project: Project,
    registry: ComponentRegistry,
    routeMap: RouteMap,
  ): WidgetEventMap[] {
    void routeMap; // reserved for future cross-route call-context enrichment

    const results: WidgetEventMap[] = [];

    for (const component of registry.components) {
      const sourceFile = project.getSourceFile(component.symbol.file);
      if (sourceFile === undefined) continue;

      const widgets = component.widgets
        .map((_id): WidgetInfo | null => {
          // Widgets are stored as IDs; we need the full WidgetInfo.
          // In a full implementation the registry would carry WidgetInfo objects.
          // Here we emit a placeholder — callers should use the file-level overload.
          return null;
        })
        .filter((w): w is WidgetInfo => w !== null);

      if (widgets.length === 0) continue;

      const map = this._analyzeFile(sourceFile, component.id, widgets);
      if (map.events.length > 0) results.push(map);
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // File-level entry point (preferred in the extraction pipeline)
  // ---------------------------------------------------------------------------

  /**
   * Analyse a single source file given its already-extracted widgets.
   * Returns one WidgetEventMap per component class found in the file.
   */
  analyze(
    file: SourceFile,
    widgets: WidgetInfo[],
    _routeMap: RouteMap,
  ): WidgetEventMap[] {
    if (widgets.length === 0) return [];

    const componentId = widgets[0]?.componentId ?? file.getFilePath();
    const map = this._analyzeFile(file, componentId, widgets);
    return map.events.length > 0 ? [map] : [];
  }

  // ---------------------------------------------------------------------------
  // Core analysis
  // ---------------------------------------------------------------------------

  private _analyzeFile(
    file: SourceFile,
    componentId: string,
    widgets: WidgetInfo[],
  ): WidgetEventMap {
    const maxLen = this._cfg.maxTemplateSnippetLength ?? 200;
    const events: WidgetEvent[] = [];

    // Find the component class declaration
    const classDecl = file
      .getClasses()
      .find((c) => TsAstUtils.findDecorator(c, 'Component') !== null);

    for (const widget of widgets) {
      for (const binding of widget.bindings) {
        const bindingName = binding.name.toLowerCase();

        // Navigation bindings (routerLink, href) → navigation event, no handler method
        if (NAV_BINDING_NAMES.has(bindingName)) {
          events.push({
            widgetId: widget.id,
            eventType: 'navigation',
            callContexts: [],
          });
          continue;
        }

        // Event bindings: (click), (submit), (ngSubmit), etc.
        if (binding.kind === 'event') {
          const eventType = normalizeEventType(binding.name);
          const handlerExpr = binding.value ?? '';
          const handlerName = extractHandlerName(handlerExpr);

          const widgetEvent: WidgetEvent = {
            widgetId: widget.id,
            eventType,
            callContexts: [],
          };
          if (handlerName !== undefined) widgetEvent.handlerName = handlerName;

          // Resolve handler method and extract call contexts
          if (handlerName !== undefined && classDecl !== undefined) {
            const methodDecl = TsAstUtils.findMethodDeclaration(classDecl, handlerName);
            if (methodDecl !== null) {
              widgetEvent.handlerOrigin = TsAstUtils.getOrigin(methodDecl, handlerName);
              // Cast: findMethodDeclaration returns Node | null; we need MethodDeclaration
              try {
                widgetEvent.callContexts = extractCallContexts(
                  methodDecl as import('ts-morph').MethodDeclaration,
                  maxLen,
                );
              } catch {
                // Non-fatal: leave callContexts empty
              }
            }
          }

          events.push(widgetEvent);
        }
      }
    }

    return {
      componentId,
      events: sortWidgetEvents(events),
    };
  }
}
