/**
 * logic-utils.ts
 * Pure utility functions for handler analysis and call-context extraction.
 * Used by LogicAnalyzer; no side effects, no file I/O.
 */

import type { MethodDeclaration } from 'ts-morph';
import { SyntaxKind } from 'ts-morph';
import type { EventHandlerCallContext, UserEventType } from '../../models/events.js';
import { TsAstUtils } from '../../parsers/ts/ts-ast-utils.js';

// ---------------------------------------------------------------------------
// Event type normalisation
// ---------------------------------------------------------------------------

const EVENT_NAME_MAP: Record<string, UserEventType> = {
  click: 'click',
  input: 'input',
  change: 'change',
  submit: 'submit',
  keydown: 'keydown',
  keyup: 'keyup',
  routerlink: 'navigation',
  href: 'navigation',
};

/**
 * Normalise a raw Angular event-binding name to a UserEventType.
 * e.g. "(click)" → "click", "routerLink" → "navigation".
 */
export function normalizeEventType(rawName: string): UserEventType {
  const stripped = rawName.replace(/[()]/g, '').toLowerCase();
  return EVENT_NAME_MAP[stripped] ?? 'unknown';
}

// ---------------------------------------------------------------------------
// Handler name extraction
// ---------------------------------------------------------------------------

/**
 * Extract the bare method name from a handler expression.
 * e.g. "onSave($event)" → "onSave", "this.save()" → "save".
 * Returns undefined when the expression cannot be parsed to a simple name.
 */
export function extractHandlerName(handlerExpr: string): string | undefined {
  const match = handlerExpr
    .trim()
    .match(/^(?:this\.)?([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/);
  return match?.[1];
}

// ---------------------------------------------------------------------------
// Call-context extraction
// ---------------------------------------------------------------------------


/**
 * Statically extract call contexts from a method declaration body.
 *
 * Detects (best-effort, bounded to 20 contexts):
 *   Navigate    — router.navigate / navigateByUrl / window.location / window.open
 *   ServiceCall — this.<service>.<method>(…)
 *   StateUpdate — this.<property> = …
 *
 * Does NOT perform symbolic execution or satisfiability checking.
 */
export function extractCallContexts(
  method: MethodDeclaration,
  maxLen: number,
): EventHandlerCallContext[] {
  const contexts: EventHandlerCallContext[] = [];
  const methodOrigin = TsAstUtils.getOrigin(method, method.getName());

  for (const callExpr of method.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (contexts.length >= 20) break;

    const exprText = callExpr.getExpression().getText().trim();

    // ── Navigate (router) ──────────────────────────────────────────────────
    if (
      exprText === 'this.router.navigate' ||
      exprText === 'router.navigate' ||
      exprText.endsWith('.navigate') ||
      exprText.endsWith('.navigateByUrl')
    ) {
      const args = TsAstUtils.getCallExpressionArgs(callExpr, maxLen);
      const routeArg = args[0];
      const target: EventHandlerCallContext['target'] = {};
      if (routeArg !== undefined) target.route = routeArg;
      contexts.push({ kind: 'Navigate', target, args, origin: TsAstUtils.getOrigin(callExpr) });
      continue;
    }

    // ── Navigate (external URL) ────────────────────────────────────────────
    if (
      exprText.startsWith('window.location') ||
      exprText.startsWith('window.open')
    ) {
      const args = TsAstUtils.getCallExpressionArgs(callExpr, maxLen);
      const urlArg = args[0];
      const target: EventHandlerCallContext['target'] = {};
      if (urlArg !== undefined) target.url = urlArg;
      contexts.push({ kind: 'Navigate', target, args, origin: TsAstUtils.getOrigin(callExpr) });
      continue;
    }

    // ── ServiceCall — this.<service>.<method>(…) ───────────────────────────
    const serviceMatch = exprText.match(
      /^(?:this\.)?([A-Za-z_$][A-Za-z0-9_$]*)\.([A-Za-z_$][A-Za-z0-9_$]*)$/,
    );
    if (serviceMatch !== null) {
      const servicePart = serviceMatch[1]!;
      const methodPart = serviceMatch[2]!;
      const args = TsAstUtils.getCallExpressionArgs(callExpr, maxLen);
      contexts.push({
        kind: 'ServiceCall',
        target: { serviceMethod: `${servicePart}.${methodPart}` },
        args,
        origin: TsAstUtils.getOrigin(callExpr),
      });
      continue;
    }
  }

  // ── StateUpdate — this.<prop> = … ─────────────────────────────────────
  for (const binaryExpr of method.getDescendantsOfKind(SyntaxKind.BinaryExpression)) {
    if (contexts.length >= 20) break;
    const text = binaryExpr.getText().trim();
    if (text.startsWith('this.') && text.includes('=')) {
      contexts.push({
        kind: 'StateUpdate',
        target: {},
        args: [TsAstUtils.truncateDeterministically(text, maxLen)],
        origin: methodOrigin,
      });
    }
  }

  return contexts;
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

/**
 * Sort widget events deterministically: widgetId asc, then eventType asc.
 */
export function sortWidgetEvents<T extends { widgetId: string; eventType: string }>(
  events: T[],
): T[] {
  return [...events].sort((a, b) => {
    const cmp = a.widgetId.localeCompare(b.widgetId);
    return cmp !== 0 ? cmp : a.eventType.localeCompare(b.eventType);
  });
}
