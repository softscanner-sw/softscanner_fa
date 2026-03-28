/**
 * analysis-exporter.ts
 * Serialize A1Multigraph and debug artifacts to deterministic JSON.
 *
 * Constraints:
 * - JSON output must be stable: same bundle → identical bytes.
 * - Object keys are sorted recursively before stringification.
 * - Indentation: 2 spaces.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { A1Multigraph } from '../models/multigraph.js';
import type { A1InternalBundle } from '../models/analysis-bundle.js';

export class AnalysisExporter {
  /**
   * Serialize a A1Multigraph to a deterministic JSON string.
   */
  static toJson(bundle: A1Multigraph): string {
    return JSON.stringify(bundle, AnalysisExporter._stableSortReplacer(), 2);
  }

  /**
   * Write the spec-compliant A1Multigraph to a file.
   */
  static writeBundle(bundle: A1Multigraph, outPath: string): void {
    const resolved = path.resolve(outPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, AnalysisExporter.toJson(bundle), 'utf-8');
  }

  /**
   * Write debug artifacts: individual JSON files for internal registries + multigraph.
   */
  static writeDebugArtifacts(
    internal: A1InternalBundle,
    bundle: A1Multigraph,
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
