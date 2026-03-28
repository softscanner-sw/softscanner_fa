/**
 * manifest-loader.ts
 * Loads and parses SubjectManifest from disk.
 *
 * Phase isolation: imports only manifest-schema types. No AST, parsers, or A1 internals.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SubjectManifest } from './manifest-schema.js';

/**
 * Load a SubjectManifest from `subjects/<subjectName>/subject-manifest.json`.
 * Throws if the file does not exist or is not valid JSON.
 */
export function loadManifest(subjectsDir: string, subjectName: string): SubjectManifest {
  const manifestPath = path.join(subjectsDir, subjectName, 'subject-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new ManifestLoadError(
      `Manifest not found: ${manifestPath}`,
    );
  }
  const raw = fs.readFileSync(manifestPath, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ManifestLoadError(
      `Invalid JSON in manifest: ${manifestPath}`,
    );
  }
  return parsed as SubjectManifest;
}

/**
 * Discover all subject names that have a subject-manifest.json file.
 * Returns sorted array of subject directory names.
 */
export function discoverSubjects(subjectsDir: string): string[] {
  if (!fs.existsSync(subjectsDir)) {
    return [];
  }
  const entries = fs.readdirSync(subjectsDir, { withFileTypes: true });
  const subjects: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const manifestPath = path.join(subjectsDir, entry.name, 'subject-manifest.json');
      if (fs.existsSync(manifestPath)) {
        subjects.push(entry.name);
      }
    }
  }
  return subjects.sort();
}

export class ManifestLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManifestLoadError';
  }
}
