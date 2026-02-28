/**
 * origin.ts
 * Provenance pointer to map extracted objects to source code.
 *
 * Design invariant: every Route, ComponentInfo, WidgetInfo, and GraphTransition
 * MUST carry an Origin (or a reference that includes Origin).
 */

export interface Origin {
  /** Absolute or project-relative path to the source file. */
  file: string;
  /** 1-based start line. */
  startLine?: number;
  /** 1-based start column. */
  startCol?: number;
  /** 1-based end line. */
  endLine?: number;
  /** 1-based end column. */
  endCol?: number;
  /** Inclusive start character offset (for SourceRef conversion). */
  start?: number;
  /** Exclusive end character offset (for SourceRef conversion). */
  end?: number;
  /** Handler/guard/class/etc symbol name if available. */
  symbol?: string;
  /** Optional short snippet; bounded to <200 chars. */
  snippet?: string;
}
