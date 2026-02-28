/**
 * analysis-exporter.ts
 * Serialize Phase1Bundle and debug artifacts to deterministic JSON.
 *
 * Constraints:
 * - JSON output must be stable: same bundle → identical bytes.
 * - Object keys are sorted recursively before stringification.
 * - Indentation: 2 spaces.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Phase1Bundle } from '../models/multigraph.js';
import type { A1InternalBundle } from '../models/analysis-bundle.js';

export class AnalysisExporter {
  /**
   * Serialize a Phase1Bundle to a deterministic JSON string.
   */
  static toJson(bundle: Phase1Bundle): string {
    return JSON.stringify(bundle, AnalysisExporter._stableSortReplacer(), 2);
  }

  /**
   * Write the spec-compliant Phase1Bundle to a file.
   */
  static writeBundle(bundle: Phase1Bundle, outPath: string): void {
    const resolved = path.resolve(outPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, AnalysisExporter.toJson(bundle), 'utf-8');
  }

  /**
   * Write debug artifacts: individual JSON files for internal registries + multigraph.
   */
  static writeDebugArtifacts(
    internal: A1InternalBundle,
    bundle: Phase1Bundle,
    outDir: string,
  ): void {
    const resolved = path.resolve(outDir);
    fs.mkdirSync(resolved, { recursive: true });

    const write = (name: string, data: unknown): void => {
      fs.writeFileSync(
        path.join(resolved, name),
        JSON.stringify(data, AnalysisExporter._stableSortReplacer(), 2),
        'utf-8',
      );
    };

    write('modules.json', internal.moduleRegistry);
    write('routes.json', internal.routeMap);
    write('components.json', internal.componentRegistry);
    write('widgetEventMaps.json', internal.widgetEventMaps);
    write('graph.json', bundle.multigraph);
    write('config.json', internal.config);
    write('stats.json', bundle.stats);
  }

  // ---------------------------------------------------------------------------
  // Stable sort replacer
  // ---------------------------------------------------------------------------

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
