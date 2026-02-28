/**
 * widget-utils.ts
 * Pure utility functions for widget classification, ID generation, and
 * path building. No side effects; no file I/O.
 */

import type { TemplateAstNode } from '../../../parsers/angular/template-parser.js';
import type { WidgetKind } from '../../../models/widgets.js';

// ---------------------------------------------------------------------------
// Widget kind detection
// ---------------------------------------------------------------------------

/** HTML tag → WidgetKind mapping (lower-case keys). */
const TAG_TO_KIND: Record<string, WidgetKind> = {
  button: 'Button',
  a: 'Link',
  input: 'Input',
  select: 'Select',
  textarea: 'Textarea',
  form: 'Form',
  'mat-menu-item': 'MenuItem',
  'p-menuitem': 'MenuItem',
};

const INPUT_TYPE_TO_KIND: Record<string, WidgetKind> = {
  button: 'Button',
  submit: 'Button',
  reset: 'Button',
  checkbox: 'Checkbox',
  radio: 'Radio',
};

/**
 * Classify a template element node into a WidgetKind.
 * Returns null for non-interactive elements.
 */
export function classifyWidget(node: TemplateAstNode): WidgetKind | null {
  if (node.kind !== 'element' || node.name === undefined) return null;

  const tag = node.name.toLowerCase();
  const typeAttr = getAttrValue(node, 'type')?.toLowerCase();

  if (tag === 'input' && typeAttr !== undefined) {
    const specialized = INPUT_TYPE_TO_KIND[typeAttr];
    if (specialized !== undefined) return specialized;
  }

  const fromTag = TAG_TO_KIND[tag];
  if (fromTag !== undefined) return fromTag;

  // Angular Material / PrimeNG button directives on non-button elements
  if (hasAttr(node, 'mat-button') || hasAttr(node, 'mat-raised-button') ||
      hasAttr(node, 'mat-icon-button') || hasAttr(node, 'matButton')) {
    return 'Button';
  }

  // mat-menu-item attribute form
  if (hasAttr(node, 'mat-menu-item')) return 'MenuItem';

  // Elements with routerLink / href qualify as Links
  if (hasNavBinding(node)) return 'Link';

  return null;
}

/**
 * True if the node carries a router navigation binding (routerLink or href).
 */
export function hasNavBinding(node: TemplateAstNode): boolean {
  for (const child of node.children ?? []) {
    if (child.kind === 'attr' || child.kind === 'boundAttr') {
      const name = child.name?.toLowerCase() ?? '';
      if (name === 'routerlink' || name === 'href') return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Attribute helpers
// ---------------------------------------------------------------------------

export function getAttrValue(node: TemplateAstNode, attrName: string): string | undefined {
  for (const child of node.children ?? []) {
    if ((child.kind === 'attr' || child.kind === 'boundAttr') &&
        child.name?.toLowerCase() === attrName.toLowerCase()) {
      return child.value;
    }
  }
  return undefined;
}

export function hasAttr(node: TemplateAstNode, attrName: string): boolean {
  return getAttrValue(node, attrName) !== undefined;
}

/**
 * Collect a bounded set of meaningful HTML attributes:
 * id, class, name, type, aria-label, data-testid, role, formcontrolname, placeholder.
 */
export function extractBoundedAttributes(node: TemplateAstNode, maxLen = 200): Record<string, string> {
  const INTERESTING = new Set([
    'id', 'class', 'name', 'type', 'aria-label', 'data-testid',
    'role', 'formcontrolname', 'placeholder', 'title',
  ]);
  const result: Record<string, string> = {};

  for (const child of node.children ?? []) {
    if (child.kind === 'attr' || child.kind === 'boundAttr') {
      const key = child.name?.toLowerCase() ?? '';
      if (INTERESTING.has(key) && child.value !== undefined) {
        const value = child.value.trim().slice(0, maxLen);
        if (value.length > 0) result[key] = value;
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Text label extraction
// ---------------------------------------------------------------------------

/**
 * Extract visible text label from a widget node (direct text children only).
 * Returns undefined when no text is found.
 */
export function extractTextLabel(node: TemplateAstNode, maxLen = 200): string | undefined {
  const parts: string[] = [];
  for (const child of node.children ?? []) {
    if (child.kind === 'text' && child.value !== undefined) {
      parts.push(child.value.trim());
    } else if (child.kind === 'boundText' && child.value !== undefined) {
      parts.push(`{{${child.value.trim()}}}`);
    }
  }
  const label = parts.join(' ').trim();
  return label.length > 0 ? label.slice(0, maxLen) : undefined;
}

// ---------------------------------------------------------------------------
// Stable widget ID
// ---------------------------------------------------------------------------

/**
 * Generate a stable widget ID.
 * Format: "<componentId>|<file>:<startLine>:<startCol>|<kind>|<stableIndex>"
 */
export function makeWidgetId(
  componentId: string,
  file: string,
  startLine: number | undefined,
  startCol: number | undefined,
  kind: WidgetKind,
  stableIndex: number,
): string {
  return `${componentId}|${file}:${startLine ?? 0}:${startCol ?? 0}|${kind}|${stableIndex}`;
}

// ---------------------------------------------------------------------------
// Path building
// ---------------------------------------------------------------------------

/**
 * Build a human-readable widget path string.
 * e.g. "AppComponent>Header>Nav>Link[2]"
 */
export function buildWidgetPath(
  ancestorNames: string[],
  kind: WidgetKind,
  indexAmongSiblings: number,
): string {
  const suffix = indexAmongSiblings > 0 ? `${kind}[${indexAmongSiblings}]` : kind;
  return [...ancestorNames, suffix].join('>');
}
