/**
 * route-utils.ts
 * Pure utility functions for route normalization, deduplication, and
 * fullPath construction. Used exclusively by RouteAnalyzer.
 *
 * All functions are deterministic and side-effect-free.
 */

import type { ParsedRouteRecord } from '../../parsers/angular/route-parser.js';

// ---------------------------------------------------------------------------
// Path normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a route path segment:
 * - Trim leading/trailing whitespace.
 * - Never add a leading "/"; the caller builds fullPath hierarchically.
 * - Treat undefined/null as empty string.
 */
export function normalizeSegment(segment: string | undefined | null): string {
  return (segment ?? '').trim();
}

/**
 * Build a normalized absolute fullPath by joining a parent fullPath with a
 * child segment.
 *
 * Rules:
 * - Parent is always "/" for root-level routes.
 * - Empty child segment ("") appended to "/" stays "/".
 * - Trailing slashes are stripped except for root "/".
 * - "**" wildcards are preserved as-is.
 */
export function buildFullPath(parentFullPath: string, childSegment: string): string {
  const parent = parentFullPath === '/' ? '' : parentFullPath.replace(/\/+$/, '');
  const child = normalizeSegment(childSegment);

  if (child === '') return parent === '' ? '/' : parent;
  if (child === '**') return `${parent}/**`;

  return `${parent}/${child}`;
}

/**
 * Normalize a redirectTo value into an absolute fullPath.
 * If redirectTo starts with "/" it is treated as already absolute.
 * Otherwise it is resolved relative to the parent fullPath.
 */
export function normalizeRedirectTarget(redirectTo: string, parentFullPath: string): string {
  if (redirectTo.startsWith('/')) return redirectTo.replace(/\/+$/, '') || '/';
  return buildFullPath(parentFullPath, redirectTo);
}

/**
 * Extract named route parameter names from a fullPath.
 * e.g. "/users/:userId/posts/:postId" → ["postId", "userId"] (sorted)
 */
export function extractRouteParams(fullPath: string): string[] {
  const params: string[] = [];
  for (const segment of fullPath.split('/')) {
    if (segment.startsWith(':')) {
      params.push(segment.slice(1));
    }
  }
  return [...new Set(params)].sort();
}

// ---------------------------------------------------------------------------
// Route kind detection
// ---------------------------------------------------------------------------

export function isRedirect(record: ParsedRouteRecord): boolean {
  return record.redirectTo !== undefined;
}

export function isWildcard(record: ParsedRouteRecord): boolean {
  return record.path === '**';
}

export function isLazy(record: ParsedRouteRecord): boolean {
  return (
    record.loadChildrenExpr !== undefined ||
    record.loadComponentExpr !== undefined
  );
}

// ---------------------------------------------------------------------------
// Stable ID generation
// ---------------------------------------------------------------------------

/**
 * Generate a stable, deterministic route ID.
 * Format: "<normalizedFullPath>@<moduleId>"
 * Spaces, colons, and slashes in moduleId are kept as-is for readability.
 */
export function makeRouteId(fullPath: string, moduleId: string): string {
  return `${fullPath}@${moduleId}`;
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

/**
 * Deduplicate an array of route IDs, preserving first occurrence.
 */
export function deduplicateIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

/**
 * Sort and deduplicate a string array (used for childrenIds, routeParams, etc.).
 */
export function sortUnique(arr: string[]): string[] {
  return [...new Set(arr)].sort();
}
