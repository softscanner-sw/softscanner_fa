/**
 * analysis-exporter.ts
 * Serialize a Phase1AnalysisBundle to deterministic JSON.
 *
 * Constraints:
 * - JSON output must be stable: same bundle → identical bytes.
 * - Object keys are sorted recursively before stringification.
 * - Indentation: 2 spaces.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Phase1AnalysisBundle } from '../models/analysis-bundle.js';

export class AnalysisExporter {
  /**
   * Serialize a bundle to a deterministic JSON string.
   * Object keys are sorted recursively; arrays are preserved in their
   * existing order (callers are responsible for ordering arrays per the
   * Phase 1 ordering rules before calling this).
   */
  static toJson(bundle: Phase1AnalysisBundle): string {
    return JSON.stringify(bundle, AnalysisExporter._stableSortReplacer(), 2);
  }

  /**
   * Write the serialized bundle to a file, creating parent directories
   * as needed.
   */
  static writeToFile(bundle: Phase1AnalysisBundle, outPath: string): void {
    const resolved = path.resolve(outPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, AnalysisExporter.toJson(bundle), 'utf-8');
  }

  /**
   * Write individual JSON artifacts split by section for easier debugging.
   * Creates: modules.json, routes.json, components.json, widgetEventMaps.json, graph.json
   */
  static writeDebugArtifacts(bundle: Phase1AnalysisBundle, outDir: string): void {
    const resolved = path.resolve(outDir);
    fs.mkdirSync(resolved, { recursive: true });

    const write = (name: string, data: unknown): void => {
      fs.writeFileSync(
        path.join(resolved, name),
        JSON.stringify(data, AnalysisExporter._stableSortReplacer(), 2),
        'utf-8',
      );
    };

    write('modules.json', bundle.moduleRegistry);
    write('routes.json', bundle.routeMap);
    write('components.json', bundle.componentRegistry);
    write('widgetEventMaps.json', bundle.widgetEventMaps);
    write('graph.json', bundle.navigation);
    write('config.json', bundle.config);
    if (bundle.stats !== undefined) write('stats.json', bundle.stats);
  }

  // ---------------------------------------------------------------------------
  // Stable sort replacer
  // ---------------------------------------------------------------------------

  /**
   * JSON.stringify replacer that sorts object keys alphabetically.
   * Arrays are untouched (their ordering is controlled by Phase 1 rules).
   */
  private static _stableSortReplacer(): (key: string, value: unknown) => unknown {
    return (_key: string, value: unknown): unknown => {
      if (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value)
      ) {
        const sorted: Record<string, unknown> = {};
        for (const k of Object.keys(value as object).sort()) {
          sorted[k] = (value as Record<string, unknown>)[k];
        }
        return sorted;
      }
      return value;
    };
  }
}
