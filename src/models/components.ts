/**
 * components.ts
 * Component metadata extracted from source declarations and templates.
 *
 * ID convention: ComponentInfo.id === symbol.canonicalName === "<file>#<className>"
 * Ordering: sorted by id (canonicalName) lexicographically.
 */

import type { Origin } from './origin.js';

// ---------------------------------------------------------------------------
// Symbol
// ---------------------------------------------------------------------------

/**
 * Stable symbol descriptor for a component class.
 * `canonicalName` is the primary stable key used as `ComponentInfo.id`.
 */
export interface ComponentSymbol {
  /** Angular component class name, e.g. "AdminUsersComponent". */
  className: string;
  /** Absolute or project-relative source file path. */
  file: string;
  /**
   * Stable canonical key combining file and class name.
   * Format: "<file>#<className>"
   * Example: "src/app/admin/users/admin-users.component.ts#AdminUsersComponent"
   */
  canonicalName: string;
}

// ---------------------------------------------------------------------------
// ComponentInfo
// ---------------------------------------------------------------------------

/**
 * Full metadata for a single Angular component (or equivalent).
 *
 * Validation rule: every ComponentRoute.componentId must reference a valid
 * ComponentInfo.id in the ComponentRegistry.
 */
export interface ComponentInfo {
  /** Equals symbol.canonicalName. */
  id: string;
  symbol: ComponentSymbol;

  /** Angular element selector if available, e.g. "app-admin-users". */
  selector?: string;
  /**
   * Path to an external template file, or the inline sentinel value
   * "__inline__" when the template is defined in the component decorator.
   */
  templateUrl?: string;
  /** Paths to external style files. */
  styleUrls?: string[];

  /** Origin of the class declaration. */
  origin: Origin;
  /** Origin of the template file (populated when templateUrl is external). */
  templateOrigin?: Origin;

  /** IDs of modules that declare this component (sorted, unique). */
  declaredInModuleIds: string[];
  /** ComponentInfo.id values of components used/rendered by this one (sorted, unique). */
  usesComponentIds: string[];

  /**
   * WidgetInfo.id list for all widgets extracted from this component's template.
   * Sorted by: origin.file → origin.startLine → origin.startCol → stableIndex.
   */
  widgets: string[];
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Flat registry of all components discovered during Phase 1.
 * `components` is sorted by `id` lexicographically.
 * `byId` provides O(1) lookup.
 */
export interface ComponentRegistry {
  components: ComponentInfo[];
  byId: Record<string, ComponentInfo>;
}
