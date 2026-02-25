/**
 * ts-project-builder.ts
 * Creates the ts-morph Project deterministically from AnalyzerConfig.
 * Thin wrapper over TsProjectFactory; included as a builder for pipeline
 * uniformity.
 */

import type { Project } from 'ts-morph';
import type { AnalyzerConfig } from '../models/analyzer-config.js';
import { TsProjectFactory } from '../parsers/ts/ts-project-factory.js';

export class TsProjectBuilder {
  /**
   * Build a ts-morph Project from the tsconfig path in `cfg`.
   * Always deterministic: same tsconfig → same Project graph.
   */
  static build(cfg: AnalyzerConfig): Project {
    return TsProjectFactory.create(cfg.tsConfigPath);
  }
}
