/**
 * ts-project-factory.ts
 * Creates and configures a ts-morph Project deterministically from a tsconfig.
 *
 * Rules:
 * - Always loads exactly the provided tsconfig; never auto-discovers others.
 * - Stable across runs: same config → same project graph.
 */

import { Project } from 'ts-morph';

export class TsProjectFactory {
  /**
   * Create a ts-morph Project from the given tsconfig path.
   *
   * @param tsConfigPath - Absolute or CWD-relative path to tsconfig.json.
   */
  static create(tsConfigPath: string): Project {
    return new Project({
      tsConfigFilePath: tsConfigPath,
      skipAddingFilesFromTsConfig: false,
      // Ensure compiler options from the tsconfig are respected as-is.
      skipFileDependencyResolution: false,
    });
  }
}
