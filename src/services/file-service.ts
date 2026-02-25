/**
 * file-service.ts
 * Deterministic, sandboxed file reading within projectRoot.
 *
 * Constraints:
 * - MUST NOT read any path outside projectRoot.
 * - All paths are normalized to absolute before I/O.
 * - Returns null for missing files rather than throwing.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export class FileService {
  private readonly _root: string;

  constructor(projectRoot: string) {
    this._root = path.resolve(projectRoot);
  }

  /**
   * Read a file as UTF-8 text.
   * Returns null if the file does not exist or is outside projectRoot.
   */
  readText(relOrAbsPath: string): string | null {
    const resolved = this._resolve(relOrAbsPath);
    if (resolved === null) return null;
    try {
      return fs.readFileSync(resolved, 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * Return true if the path exists within projectRoot.
   */
  exists(relOrAbsPath: string): boolean {
    const resolved = this._resolve(relOrAbsPath);
    if (resolved === null) return false;
    return fs.existsSync(resolved);
  }

  /**
   * Resolve a path that is relative to `fromFile` into a normalized
   * absolute path, enforcing the projectRoot sandbox.
   * Returns the resolved path string (may point outside root — callers
   * should use `readText`/`exists` to do sandboxed I/O).
   */
  resolveRelative(fromFile: string, relativePath: string): string {
    const fromDir = path.dirname(path.resolve(fromFile));
    return path.resolve(fromDir, relativePath);
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private _resolve(relOrAbsPath: string): string | null {
    const abs = path.isAbsolute(relOrAbsPath)
      ? path.normalize(relOrAbsPath)
      : path.resolve(this._root, relOrAbsPath);

    // Sandbox check
    if (!abs.startsWith(this._root + path.sep) && abs !== this._root) {
      return null;
    }

    return abs;
  }
}
