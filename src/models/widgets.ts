/**
 * widgets.ts
 * Interactive UI element (widget) metadata extracted from component templates.
 *
 * ID convention: stable string from (componentId + templateOriginSpan + widgetKind + stableIndex).
 * Ordering: by origin.file → origin.startLine → origin.startCol → stableIndex.
 */

import type { Origin } from './origin.js';
import type { Predicate } from './constraints.js';

// ---------------------------------------------------------------------------
// WidgetKind
// ---------------------------------------------------------------------------

/**
 * Semantic classification of an interactive template element.
 * Use 'Unknown' when the element does not match any recognized kind.
 */
export type WidgetKind =
  | 'Button'
  | 'Link'
  | 'Input'
  | 'Select'
  | 'Option'
  | 'Textarea'
  | 'Form'
  | 'Checkbox'
  | 'RadioGroup'
  | 'Radio'
  | 'MenuItem'
  | 'Unknown';

// ---------------------------------------------------------------------------
// WidgetPathInfo
// ---------------------------------------------------------------------------

/**
 * Human-readable stable address of a widget within its component template.
 * Used for diagnostics and graph labelling.
 *
 * Example path: "AppComponent>Header>Nav>Link[2]"
 */
export interface WidgetPathInfo {
  componentId: string;
  /** Dot/chevron-separated path from the component root to the widget. */
  path: string;
}

// ---------------------------------------------------------------------------
// WidgetBinding
// ---------------------------------------------------------------------------

/**
 * A single Angular (or framework) binding extracted from the widget element.
 * Examples: `[routerLink]`, `href`, `(click)`, `(submit)`, `formControlName`.
 */
export interface WidgetBinding {
  /** Template AST node kind: 'attr' (static), 'boundAttr' ([prop]), 'event' ((event)). */
  kind: 'attr' | 'boundAttr' | 'event';
  /** Binding name as written, e.g. "routerLink", "click", "formControlName". */
  name: string;
  /** Raw binding expression or literal value. */
  value?: string;
  origin: Origin;
}

// ---------------------------------------------------------------------------
// WidgetInfo
// ---------------------------------------------------------------------------

/**
 * Full metadata for one interactive element extracted from a template.
 *
 * Validation rule: every WidgetEvent.widgetId must reference an id that
 * appears in the owning ComponentInfo.widgets list.
 */
export interface WidgetInfo {
  /** Stable id from (componentId + origin span + kind + stableIndex). */
  id: string;
  componentId: string;
  /** ID of the parent widget if this widget is nested inside another (e.g. input inside form). */
  parentWidgetId?: string;
  kind: WidgetKind;
  /** DOM tag name from the template element (e.g. 'button', 'a', 'form'). */
  tagName?: string;

  /** Template element origin. */
  origin: Origin;
  path: WidgetPathInfo;

  /**
   * Visible text label of the widget, trimmed and bounded to
   * AnalyzerConfig.maxTemplateSnippetLength (default 200 chars).
   */
  text?: string;

  /**
   * Relevant HTML attributes (id, class, name, type, aria-label, etc.).
   * Values are bounded in length. Keys and values are stored as-is.
   */
  attributes: Record<string, string>;

  /**
   * Framework and HTML bindings relevant to navigation or interaction.
   * E.g. routerLink, href, (click), (submit), formControlName.
   */
  bindings: WidgetBinding[];

  /**
   * Validation constraints extracted from template validators or directives.
   * Populated for Input, Textarea, Select, Checkbox, Radio, and Form widgets.
   */
  validators?: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    /** Raw pattern string (regexp source). */
    pattern?: string;
  };

  /**
   * Predicates that control whether this widget is visible.
   * Sourced from *ngIf, [hidden], etc. on the element or an ancestor.
   */
  visibilityPredicates: Predicate[];

  /**
   * Predicates that control whether this widget is interactive.
   * Sourced from [disabled], permission directives, etc.
   */
  enablementPredicates: Predicate[];

  /**
   * True when this widget originates inside an `<ng-template>` subtree.
   * Template-backed widgets are not in the DOM until the template is instantiated
   * (e.g., ng-bootstrap modals, structural directives with lazy rendering).
   * B1 uses this flag to determine whether an opener precondition is needed.
   */
  isTemplateContent?: boolean;

  /**
   * Template region ID: the reference variable name of the enclosing `<ng-template>`.
   * E.g., `<ng-template #content>` → `"content"`.
   * Used by B1 to compute per-region positional locators inside modals.
   */
  templateRegionId?: string;
}
