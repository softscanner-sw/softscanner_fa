/**
 * component-registry-builder.ts
 * Builds ComponentRegistry by scanning source files for @Component classes
 * and running the full template extraction pipeline per component.
 *
 * Deterministic order: sorted by file path then class name.
 *
 * After calling build(), use getWidgetsByComponentId() to retrieve the full
 * WidgetInfo objects — these are threaded by the orchestrator to builders
 * that need them (WidgetEventMapBuilder, NavigationGraphBuilder).
 *
 * Prohibited:
 *   - Route classification
 *   - Graph building
 *   - Any reference to journeys / scenarios / workflow results
 */

import * as path from 'node:path';
import type { Project, ClassDeclaration } from 'ts-morph';
import type { AnalyzerConfig } from '../models/analyzer-config.js';
import type { ComponentInfo, ComponentRegistry } from '../models/components.js';
import type { WidgetInfo } from '../models/widgets.js';
import { DecoratorParser } from '../parsers/angular/decorator-parser.js';
import { AngularTemplateParser } from '../parsers/angular/template-parser.js';
import { TsAstUtils } from '../parsers/ts/ts-ast-utils.js';
import { WidgetProcessor } from '../analyzers/template/widgets/widget-processor.js';
import { TemplateConstraintExtractor } from '../analyzers/template/constraints/template-constraint-extractor.js';
import { extractNestedComponentsFromAst } from '../analyzers/template/template-utils.js';
import { AnalysisCache } from '../services/analysis-cache.js';
import { SilentLogger } from '../services/logger.js';
import type { Logger } from '../services/logger.js';

export class ComponentRegistryBuilder {
  private readonly _cfg: AnalyzerConfig;
  private readonly _log: Logger;
  private readonly _cache = new AnalysisCache();
  private _widgetsByComponentId = new Map<string, WidgetInfo[]>();
  private _constraintExtractor: TemplateConstraintExtractor;

  constructor(cfg: AnalyzerConfig, logger?: Logger) {
    this._cfg = cfg;
    this._log = logger ?? new SilentLogger();
    this._constraintExtractor = new TemplateConstraintExtractor(cfg);
  }

  /**
   * Scan the project for @Component classes and build the registry.
   * Resets internal widget map on each call.
   */
  build(project: Project): ComponentRegistry {
    this._widgetsByComponentId = new Map();

    // Collect all @Component classes, sorted by file then class name
    const candidates = this._collectComponents(project);

    const componentInfos: ComponentInfo[] = [];

    for (const { classDecl, decorator, filePath } of candidates) {
      const info = this._buildComponentInfo(classDecl, decorator, filePath);
      if (info !== null) componentInfos.push(info);
    }

    // Sort by id (canonicalName)
    componentInfos.sort((a, b) => a.id.localeCompare(b.id));

    const byId: Record<string, ComponentInfo> = {};
    for (const info of componentInfos) byId[info.id] = info;

    return { components: componentInfos, byId };
  }

  /**
   * Retrieve the full WidgetInfo objects produced during the last build().
   * Keyed by componentId.
   */
  getWidgetsByComponentId(): Map<string, WidgetInfo[]> {
    return this._widgetsByComponentId;
  }

  // ---------------------------------------------------------------------------
  // Discovery
  // ---------------------------------------------------------------------------

  private _collectComponents(
    project: Project,
  ): Array<{ classDecl: ClassDeclaration; decorator: import('ts-morph').Decorator; filePath: string }> {
    const results: Array<{ classDecl: ClassDeclaration; decorator: import('ts-morph').Decorator; filePath: string }> = [];

    const sourceFiles = [...project.getSourceFiles()].sort((a, b) =>
      a.getFilePath().localeCompare(b.getFilePath()),
    );

    for (const sourceFile of sourceFiles) {
      const filePath = sourceFile.getFilePath();

      // Exclude test-only files: spec files, stubs, and test/testing directories.
      // Use forward-slash checks — ts-morph normalises paths on all platforms.
      if (
        filePath.endsWith('.spec.ts') ||
        filePath.endsWith('.stub.ts') ||
        filePath.includes('/testing/') ||
        filePath.includes('/test/') ||
        filePath.includes('/__tests__/')
      ) continue;

      const classes = [...sourceFile.getClasses()].sort((a, b) =>
        (a.getName() ?? '').localeCompare(b.getName() ?? ''),
      );

      for (const classDecl of classes) {
        const decorator = TsAstUtils.findDecorator(classDecl, 'Component');
        if (decorator === null) continue;
        results.push({ classDecl, decorator, filePath });
      }
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Per-component pipeline
  // ---------------------------------------------------------------------------

  private _buildComponentInfo(
    classDecl: ClassDeclaration,
    decorator: import('ts-morph').Decorator,
    filePath: string,
  ): ComponentInfo | null {
    const className = classDecl.getName() ?? 'Unknown';
    const canonicalName = `${filePath}#${className}`;

    // Check cache
    const cached = this._cache.get<ComponentInfo>(canonicalName);
    if (cached !== undefined) return cached;

    const meta = DecoratorParser.extractComponentMeta(decorator, this._cfg);

    // Phase 1 invariant: selector required
    if (meta.selector === null || meta.selector.trim() === '') {
      this._log.warn('Skipping component — no selector', { class: className, file: filePath });
      return null;
    }

    // Resolve template text
    const templateText = DecoratorParser.resolveTemplateText(meta, this._cfg.projectRoot);

    // Determine template file path
    const templateFile =
      meta.templateUrl !== null
        ? path.resolve(path.dirname(filePath), meta.templateUrl)
        : filePath;

    if (templateText === null) {
      this._log.warn('Template not resolved — widgets will be empty', {
        class: className,
        templateUrl: meta.templateUrl ?? '(inline)',
      });
    }

    // Parse template to AST
    const ast = templateText !== null
      ? AngularTemplateParser.parse(templateText, this._cfg)
      : [];

    if (templateText !== null && ast.length === 0) {
      this._log.warn('Template parsed to empty AST — check @angular/compiler compatibility', {
        class: className,
        templateFile,
        templateLength: templateText.length,
      });
    }

    // Extract widgets
    const rawWidgets = templateText !== null
      ? new WidgetProcessor(canonicalName, templateFile, templateText, this._cfg).process(ast)
      : [];

    this._log.debug('Component processed', {
      class: className,
      selector: meta.selector.trim(),
      astNodes: ast.length,
      widgets: rawWidgets.length,
    });

    // Attach visibility/enablement predicates
    const enrichedWidgets = this._constraintExtractor.extract(
      canonicalName,
      rawWidgets,
      ast,
      templateText ?? '',
      templateFile,
    );

    // Store full WidgetInfo objects for downstream builders
    this._widgetsByComponentId.set(canonicalName, enrichedWidgets);

    // Extract nested component selectors
    const nestedSelectors = extractNestedComponentsFromAst(ast);

    // Build stable symbol
    const symbol = {
      className,
      file: filePath,
      canonicalName,
    };

    const info: ComponentInfo = {
      id: canonicalName,
      symbol,
      selector: meta.selector.trim(),
      styleUrls: meta.styleUrls,
      origin: meta.origin,
      declaredInModuleIds: [],    // populated post-hoc by ModuleRegistryBuilder if needed
      usesComponentIds: nestedSelectors, // best-effort via selectors (resolved later)
      widgets: enrichedWidgets.map((w) => w.id),
    };
    if (meta.templateUrl !== null) info.templateUrl = meta.templateUrl;
    if (meta.templateOrigin !== undefined) info.templateOrigin = meta.templateOrigin;

    this._cache.set(canonicalName, info);
    return info;
  }
}
