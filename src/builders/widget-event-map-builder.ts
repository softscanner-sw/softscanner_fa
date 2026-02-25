/**
 * widget-event-map-builder.ts
 * Runs LogicAnalyzer across the project to produce WidgetEventMap[].
 *
 * Receives full WidgetInfo objects via an optional widgetsByComponentId map
 * (threaded from ComponentRegistryBuilder by the orchestrator) so that
 * handler call-context extraction has concrete widget bindings to work from.
 */

import type { Project } from 'ts-morph';
import type { AnalyzerConfig } from '../models/analyzer-config.js';
import type { ComponentRegistry } from '../models/components.js';
import type { RouteMap } from '../models/routes.js';
import type { WidgetInfo } from '../models/widgets.js';
import type { WidgetEventMap } from '../models/events.js';
import { LogicAnalyzer } from '../analyzers/business-logic/logic-analyzer.js';
import { SilentLogger } from '../services/logger.js';
import type { Logger } from '../services/logger.js';

export class WidgetEventMapBuilder {
  private readonly _cfg: AnalyzerConfig;
  private readonly _log: Logger;

  constructor(cfg: AnalyzerConfig, logger?: Logger) {
    this._cfg = cfg;
    this._log = logger ?? new SilentLogger();
  }

  /**
   * Build WidgetEventMaps for the entire project.
   *
   * @param project            - ts-morph Project.
   * @param componentRegistry  - ComponentRegistry with widget ID lists.
   * @param routeMap           - RouteMap (reserved for cross-route enrichment).
   * @param widgetsByComponentId - Full WidgetInfo objects keyed by componentId.
   *                              Provided by ComponentRegistryBuilder via the orchestrator.
   */
  build(
    project: Project,
    componentRegistry: ComponentRegistry,
    routeMap: RouteMap,
    widgetsByComponentId?: Map<string, WidgetInfo[]>,
  ): WidgetEventMap[] {
    const analyzer = new LogicAnalyzer(this._cfg);
    const results: WidgetEventMap[] = [];

    for (const component of componentRegistry.components) {
      const sourceFile = project.getSourceFile(component.symbol.file);
      if (sourceFile === undefined) continue;

      const widgets = widgetsByComponentId?.get(component.id) ?? [];
      if (widgets.length === 0) {
        this._log.debug('Skipping event map — no widgets', { component: component.id });
        continue;
      }

      const maps = analyzer.analyze(sourceFile, widgets, routeMap);
      this._log.debug('Event map built', { component: component.id, events: maps.reduce((s, m) => s + m.events.length, 0) });
      results.push(...maps);
    }

    // Sort by componentId for determinism
    results.sort((a, b) => a.componentId.localeCompare(b.componentId));

    return results;
  }
}
