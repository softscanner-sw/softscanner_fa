/**
 * module.ts
 * Angular NgModule (or equivalent) metadata extracted during Phase 1.
 */

import type { Origin } from './origin.js';

/**
 * Classifies the role of a module within the application graph.
 * - Root: the AppModule / bootstrapped root.
 * - GlobalShared: SharedModule, CoreModule — imported everywhere.
 * - Feature: eagerly loaded feature module.
 * - LazyFeature: lazily loaded via loadChildren.
 * - DeadOrUnreachable: detected but never imported/routed to.
 * - Unknown: could not be determined.
 */
export type ModuleRole =
  | 'Root'
  | 'GlobalShared'
  | 'Feature'
  | 'LazyFeature'
  | 'DeadOrUnreachable'
  | 'Unknown';

/**
 * Metadata for a single Angular module (NgModule, standalone module, or
 * equivalent framework construct).
 *
 * ID convention: canonical module file path (absolute or project-relative).
 */
export interface ModuleInfo {
  /** Stable module id — the canonical file path of the module. */
  id: string;
  /** NgModule class name if available. */
  name: string;
  role: ModuleRole;

  origin: Origin;

  /** IDs of modules imported by this module (sorted, unique). */
  imports: string[];
  /** ComponentInfo.id values declared in this module (sorted, unique). */
  declarations: string[];
  /** Service class names provided by this module (sorted, unique). */
  providers: string[];
  /** Module class names exported by this module (sorted, unique). */
  exports: string[];
  /** Route IDs whose definition belongs to this module (sorted, unique). */
  routesOwned: string[];

  /** Per-import-name origin for edge ref generation (internal; not part of Phase1Bundle). */
  importOrigins?: Record<string, Origin>;
  /** Per-export-name origin for edge ref generation (internal; not part of Phase1Bundle). */
  exportOrigins?: Record<string, Origin>;

  /** Present when the module is lazily loaded via the router. */
  lazyBoundary?: {
    isLazy: boolean;
    /** Raw loadChildren expression as written in source. */
    loadChildrenExpr?: string;
    origin?: Origin;
  };
}

/**
 * Flat registry of all modules discovered during Phase 1 extraction.
 * `modules` is sorted by `id` lexicographically.
 */
export interface ModuleRegistry {
  modules: ModuleInfo[];
}
