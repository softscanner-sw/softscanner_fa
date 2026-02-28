/**
 * module-registry-builder.ts
 * Builds the ModuleRegistry by scanning all source files for @NgModule classes.
 *
 * Two-pass discovery:
 *   Pass 1 — collect all @NgModule classes + their raw imports/declarations/exports.
 *   Pass 2 — determine roles (Root/GlobalShared/Feature/LazyFeature/Dead/Unknown)
 *             and lazy boundaries.
 *
 * Prohibited:
 *   - Route role classification (RouteMapBuilder's job)
 *   - Graph building
 */

import type { Project, ClassDeclaration, Decorator } from 'ts-morph';
import { SyntaxKind } from 'ts-morph';
import type { AnalyzerConfig } from '../models/analyzer-config.js';
import type { ModuleInfo, ModuleRegistry, ModuleRole } from '../models/module.js';
import type { Origin } from '../models/origin.js';
import { TsAstUtils } from '../parsers/ts/ts-ast-utils.js';
import { SilentLogger } from '../services/logger.js';
import type { Logger } from '../services/logger.js';

const SHARED_MODULE_PATTERNS = /^(Shared|Core|Common|Global)Module$/i;
const ROOT_MODULE_PATTERNS = /^App(Root)?Module$/i;

export class ModuleRegistryBuilder {
  private readonly _log: Logger;

  constructor(_cfg: AnalyzerConfig, logger?: Logger) {
    this._log = logger ?? new SilentLogger();
  }

  build(project: Project): ModuleRegistry {
    // Pass 1: discover all @NgModule classes
    const rawModules = this._discoverModules(project);
    this._log.debug('NgModule classes found', { count: rawModules.length });

    // Pass 2: determine roles and lazy boundaries
    const lazyModuleFiles = this._collectLazyModuleFiles(project);
    const importedByMap = this._buildImportedByMap(rawModules);

    const modules: ModuleInfo[] = rawModules
      .map((raw) => this._finalizeModule(raw, lazyModuleFiles, importedByMap))
      .sort((a, b) => a.id.localeCompare(b.id));

    return { modules };
  }

  // ---------------------------------------------------------------------------
  // Pass 1
  // ---------------------------------------------------------------------------

  private _discoverModules(project: Project): RawModule[] {
    const raw: RawModule[] = [];

    const sourceFiles = [...project.getSourceFiles()].sort((a, b) =>
      a.getFilePath().localeCompare(b.getFilePath()),
    );

    for (const sourceFile of sourceFiles) {
      for (const classDecl of sourceFile.getClasses()) {
        const decorator = TsAstUtils.findDecorator(classDecl, 'NgModule');
        if (decorator === null) continue;

        raw.push(this._extractRawModule(classDecl, decorator, sourceFile.getFilePath()));
      }
    }

    return raw;
  }

  private _extractRawModule(
    classDecl: ClassDeclaration,
    decorator: Decorator,
    filePath: string,
  ): RawModule {
    const className = classDecl.getName() ?? 'UnknownModule';
    const origin = TsAstUtils.getOrigin(classDecl, className);

    const args = decorator.getArguments();
    const configArg = args.at(0);

    let imports: string[] = [];
    let declarations: string[] = [];
    let providers: string[] = [];
    let exports: string[] = [];
    let importEntries: Array<{ name: string; origin: Origin }> = [];
    let exportEntries: Array<{ name: string; origin: Origin }> = [];
    let hasBootstrap = false;

    if (configArg !== undefined) {
      for (const child of configArg.getChildren()) {
        for (const prop of child.getChildren()) {
          const propText = prop.getText();
          if (propText.startsWith('imports')) {
            const val = prop.getChildren().at(-1);
            if (val !== undefined) {
              imports = TsAstUtils.extractArrayOfIdentifiers(val);
              importEntries = TsAstUtils.extractArrayOfIdentifiersWithOrigin(val);
            }
          } else if (propText.startsWith('declarations')) {
            const val = prop.getChildren().at(-1);
            if (val !== undefined) declarations = TsAstUtils.extractArrayOfIdentifiers(val);
          } else if (propText.startsWith('providers')) {
            const val = prop.getChildren().at(-1);
            if (val !== undefined) providers = TsAstUtils.extractArrayOfIdentifiers(val);
          } else if (propText.startsWith('exports')) {
            const val = prop.getChildren().at(-1);
            if (val !== undefined) {
              exports = TsAstUtils.extractArrayOfIdentifiers(val);
              exportEntries = TsAstUtils.extractArrayOfIdentifiersWithOrigin(val);
            }
          } else if (propText.startsWith('bootstrap')) {
            hasBootstrap = true;
          }
        }
      }
    }

    return { id: filePath, name: className, filePath, imports, declarations, providers, exports, importEntries, exportEntries, hasBootstrap, origin };
  }

  // ---------------------------------------------------------------------------
  // Pass 2
  // ---------------------------------------------------------------------------

  private _finalizeModule(
    raw: RawModule,
    lazyModuleFiles: Set<string>,
    importedByMap: Map<string, string[]>,
  ): ModuleInfo {
    const role = this._determineRole(raw, lazyModuleFiles, importedByMap);
    const isLazy = lazyModuleFiles.has(raw.filePath);

    // Build per-element origin maps for edge ref generation
    const importOrigins: Record<string, Origin> = {};
    for (const entry of raw.importEntries) importOrigins[entry.name] = entry.origin;
    const exportOrigins: Record<string, Origin> = {};
    for (const entry of raw.exportEntries) exportOrigins[entry.name] = entry.origin;

    const info: ModuleInfo = {
      id: raw.id,
      name: raw.name,
      role,
      origin: raw.origin,
      imports: raw.imports,
      declarations: raw.declarations,
      providers: raw.providers,
      exports: raw.exports,
      routesOwned: [],  // populated post-hoc by orchestrator
      importOrigins,
      exportOrigins,
    };
    if (isLazy) info.lazyBoundary = { isLazy: true };

    this._log.debug('Module finalized', { name: raw.name, role, isLazy });
    return info;
  }

  private _determineRole(
    raw: RawModule,
    lazyModuleFiles: Set<string>,
    importedByMap: Map<string, string[]>,
  ): ModuleRole {
    if (raw.hasBootstrap || ROOT_MODULE_PATTERNS.test(raw.name)) return 'Root';
    if (SHARED_MODULE_PATTERNS.test(raw.name)) return 'GlobalShared';
    if (lazyModuleFiles.has(raw.filePath)) return 'LazyFeature';

    const importedBy = importedByMap.get(raw.id) ?? [];
    if (importedBy.length === 0 && raw.declarations.length > 0) return 'DeadOrUnreachable';
    if (raw.declarations.length > 0) return 'Feature';

    return 'Unknown';
  }

  /** Collect file paths of modules referenced in loadChildren expressions. */
  private _collectLazyModuleFiles(project: Project): Set<string> {
    const lazyFiles = new Set<string>();

    for (const sourceFile of project.getSourceFiles()) {
      for (const callExpr of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
        const exprText = callExpr.getExpression().getText();
        if (exprText !== 'import') continue;

        const firstArg = callExpr.getArguments().at(0);
        if (firstArg === undefined) continue;

        const specifier = TsAstUtils.getStringLiteralValue(firstArg);
        if (specifier === null) continue;

        const resolved = TsAstUtils.resolveImportTarget(sourceFile, specifier);
        if (resolved !== null) lazyFiles.add(resolved);
      }
    }

    return lazyFiles;
  }

  /** Build a map from module id → list of module ids that import it. */
  private _buildImportedByMap(rawModules: RawModule[]): Map<string, string[]> {
    const nameToId = new Map<string, string>();
    for (const m of rawModules) nameToId.set(m.name, m.id);

    const importedBy = new Map<string, string[]>();

    for (const m of rawModules) {
      for (const importedName of m.imports) {
        const importedId = nameToId.get(importedName);
        if (importedId === undefined) continue;
        const list = importedBy.get(importedId) ?? [];
        list.push(m.id);
        importedBy.set(importedId, list);
      }
    }

    return importedBy;
  }
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

interface RawModule {
  id: string;
  name: string;
  filePath: string;
  imports: string[];
  declarations: string[];
  providers: string[];
  exports: string[];
  importEntries: Array<{ name: string; origin: import('../models/origin.js').Origin }>;
  exportEntries: Array<{ name: string; origin: import('../models/origin.js').Origin }>;
  hasBootstrap: boolean;
  origin: import('../models/origin.js').Origin;
}
