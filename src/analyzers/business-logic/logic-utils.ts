/**
 * logic-utils.ts
 * Pure utility functions for handler analysis and call-context extraction.
 * Used by LogicAnalyzer; no side effects, no file I/O.
 */

import type { ClassDeclaration, MethodDeclaration } from 'ts-morph';
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
  ngsubmit: 'submit',
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
 * Check if a method body contains only diagnostic calls (console.*) and no
 * external state mutations. Such handlers produce no observable effects and
 * should not emit executable edges (including WTH trigger edges).
 */
export function isDiagnosticOnly(method: MethodDeclaration): boolean {
  const allCalls = method.getDescendantsOfKind(SyntaxKind.CallExpression);
  if (allCalls.length === 0) return false;

  const allDiagnostic = allCalls.every(c =>
    c.getExpression().getText().trim().startsWith('console.'),
  );
  if (!allDiagnostic) return false;

  const hasStateUpdate = method.getDescendantsOfKind(SyntaxKind.BinaryExpression)
    .some(b => {
      const text = b.getText().trim();
      return text.startsWith('this.') && text.includes('=');
    });

  return !hasStateUpdate;
}

/**
 * Statically extract call contexts from a method declaration body.
 *
 * Detects (best-effort, bounded to 20 contexts):
 *   Navigate    — router.navigate / navigateByUrl / window.location / window.open
 *   ServiceCall — this.<service>.<method>(…)
 *   DialogOpen  — this.<dialog>.open(Component)
 *   StateUpdate — this.<property> = …
 *
 * When classDecl is provided, bounded same-class transitive call following
 * is enabled: single-dot `this.<method>(…)` calls that resolve to methods
 * in the same class are recursively inspected (max depth 1, cycle-safe).
 *
 * Does NOT perform symbolic execution or satisfiability checking.
 */
export function extractCallContexts(
  method: MethodDeclaration,
  maxLen: number,
  classDecl?: ClassDeclaration,
): EventHandlerCallContext[] {
  // Diagnostic-only handler filter: if the body contains exclusively console.*
  // calls (no other call expressions, no assignments to external state), the
  // handler is log-only and produces no call contexts or executable edges.
  const allCalls = method.getDescendantsOfKind(SyntaxKind.CallExpression);
  if (allCalls.length > 0) {
    const allDiagnostic = allCalls.every(c =>
      c.getExpression().getText().trim().startsWith('console.'),
    );
    if (allDiagnostic) {
      // Check for external state assignments (this.<prop> = …)
      const hasStateUpdate = method.getDescendantsOfKind(SyntaxKind.BinaryExpression)
        .some(b => {
          const text = b.getText().trim();
          return text.startsWith('this.') && text.includes('=');
        });
      if (!hasStateUpdate) return [];
    }
  }

  const contexts: EventHandlerCallContext[] = [];
  const visited = new Set<string>([method.getName()]);
  _extractFromMethod(method, maxLen, classDecl, contexts, visited, 0);
  return contexts;
}

/**
 * Extract call contexts from a single method body. Shared by the top-level
 * handler and any transitively-followed same-class callees.
 *
 * @param depth  0 = handler body, 1 = one-level callee (max)
 */
function _extractFromMethod(
  method: MethodDeclaration,
  maxLen: number,
  classDecl: ClassDeclaration | undefined,
  contexts: EventHandlerCallContext[],
  visited: Set<string>,
  depth: number,
): void {
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

    // ── DialogOpen — this.dialog.open(Component) / this.modalService.open(templateRef)
    if (exprText.endsWith('.open')) {
      const dialogMatch = exprText.match(
        /^(?:this\.)?([A-Za-z_$][A-Za-z0-9_$]*)\.open$/,
      );
      if (dialogMatch !== null) {
        const args = TsAstUtils.getCallExpressionArgs(callExpr, maxLen);
        const firstArg = args[0];
        if (firstArg !== undefined) {
          // PascalCase → component class name (e.g., EditUserComponent)
          if (/^[A-Z][A-Za-z0-9_$]*$/.test(firstArg)) {
            contexts.push({
              kind: 'DialogOpen',
              target: { componentClassName: firstArg },
              args,
              origin: TsAstUtils.getOrigin(callExpr),
            });
            continue;
          }
          // camelCase identifier → template reference variable (e.g., content, contentSecret)
          if (/^[a-z][A-Za-z0-9_$]*$/.test(firstArg)) {
            contexts.push({
              kind: 'DialogOpen',
              target: { templateRef: firstArg },
              args,
              origin: TsAstUtils.getOrigin(callExpr),
            });
            continue;
          }
        }
      }
    }

    // ── ServiceCall — this.<service>.<method>(…) ───────────────────────────
    // Require `this.` prefix to avoid matching single-dot `this.<name>` as
    // service="this", method="<name>" (which would preempt transitive following).
    const serviceMatch = exprText.match(
      /^this\.([A-Za-z_$][A-Za-z0-9_$]*)\.([A-Za-z_$][A-Za-z0-9_$]*)$/,
    );
    if (serviceMatch !== null) {
      const servicePart = serviceMatch[1]!;
      const methodPart = serviceMatch[2]!;
      // Resolve field's TypeScript type from constructor parameter if available
      const resolvedName = classDecl !== undefined
        ? _resolveFieldTypeName(classDecl, servicePart) ?? servicePart
        : servicePart;
      const args = TsAstUtils.getCallExpressionArgs(callExpr, maxLen);
      contexts.push({
        kind: 'ServiceCall',
        target: { serviceMethod: `${resolvedName}.${methodPart}` },
        args,
        origin: TsAstUtils.getOrigin(callExpr),
      });

      // F1: Bounded Router-service tracing.
      // When the service class name matches a Router/Navigation pattern,
      // trace ONE level into the called method to find Navigate calls.
      // This resolves thin Router wrappers like RouterService.routeToX()
      // → this.router.navigate(['path']).
      if (/router|navigation/i.test(resolvedName) && classDecl !== undefined && depth < 1) {
        const fieldDecl = classDecl.getConstructors()[0]
          ?.getParameters()
          .find(p => p.getName() === servicePart);
        const fieldType = fieldDecl?.getType();
        const symbol = fieldType?.getSymbol() ?? fieldType?.getAliasSymbol();
        const serviceClassDecl = symbol?.getDeclarations()?.[0]?.asKind?.(SyntaxKind.ClassDeclaration);
        if (serviceClassDecl !== undefined) {
          const serviceMethod = serviceClassDecl.getMethod(methodPart);
          if (serviceMethod !== undefined && !visited.has(`${resolvedName}.${methodPart}`)) {
            visited.add(`${resolvedName}.${methodPart}`);
            _extractFromMethod(serviceMethod, maxLen, serviceClassDecl, contexts, visited, depth + 1);
          }
        }
      }

      continue;
    }

    // ── Bounded same-class transitive following ────────────────────────────
    // Single-dot this.<name>(…) — may be a same-class method call.
    // Follow at most depth 1, cycle-safe.
    if (depth < 1 && classDecl !== undefined) {
      const sameClassMatch = exprText.match(
        /^this\.([A-Za-z_$][A-Za-z0-9_$]*)$/,
      );
      if (sameClassMatch !== null) {
        const calleeName = sameClassMatch[1]!;
        if (!visited.has(calleeName)) {
          const calleeMethod = classDecl.getMethod(calleeName);
          if (calleeMethod !== undefined) {
            visited.add(calleeName);
            _extractFromMethod(
              calleeMethod, maxLen, classDecl, contexts, visited, depth + 1,
            );
          }
        }
      }
    }

    // ── Subscribe callback capture ───────────────────────────────────────
    // Detect .subscribe(callback) on this.<expr> chains and inspect the
    // callback body for Navigate, ServiceCall, DialogOpen, StateUpdate.
    // Spec: approach.md "Subscribe callback capture (normative)".
    if (depth < 1) {
      _captureSubscribeCallbacks(callExpr, maxLen, classDecl, contexts, visited, depth);
    }
  }

  // ── StateUpdate — this.<prop> = … (only at depth 0) ───────────────────
  // Extract the mutated property name so downstream can match it against
  // *ngIf expressions / visibility gates on composed components/widgets.
  if (depth === 0) {
    for (const binaryExpr of method.getDescendantsOfKind(SyntaxKind.BinaryExpression)) {
      if (contexts.length >= 20) break;
      const text = binaryExpr.getText().trim();
      const propMatch = text.match(/^this\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/);
      if (propMatch !== null) {
        contexts.push({
          kind: 'StateUpdate',
          target: { mutatedProperty: propMatch[1]! },
          args: [TsAstUtils.truncateDeterministically(text, maxLen)],
          origin: methodOrigin,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Subscribe callback capture
// ---------------------------------------------------------------------------

/**
 * Detect `.subscribe(callback)` on `this.<expr>` chains and recursively
 * inspect the callback body for call contexts.
 *
 * Patterns captured:
 *   this.service.action().subscribe(result => { ... })
 *   this.service.action().subscribe((result) => { ... })
 *   this.dialogRef.afterClosed().subscribe(result => { ... })
 *   this.obs$.subscribe({ next: (val) => { ... } })
 *
 * Only the first argument (or `next` property of an object argument) is inspected.
 * Pipe operators are NOT followed — only the terminal .subscribe() callback.
 */
function _captureSubscribeCallbacks(
  callExpr: import('ts-morph').CallExpression,
  maxLen: number,
  classDecl: ClassDeclaration | undefined,
  contexts: EventHandlerCallContext[],
  visited: Set<string>,
  depth: number,
): void {
  // Must be a .subscribe() call
  const exprNode = callExpr.getExpression();
  if (exprNode.getKind() !== SyntaxKind.PropertyAccessExpression) return;
  const propAccess = exprNode as import('ts-morph').PropertyAccessExpression;
  if (propAccess.getName() !== 'subscribe') return;

  // The chain must originate from `this.` (to avoid capturing unrelated observables)
  const fullText = callExpr.getExpression().getText().trim();
  if (!fullText.startsWith('this.')) return;

  const args = callExpr.getArguments();
  if (args.length === 0) return;

  const firstArg = args[0]!;
  let callbackBody: import('ts-morph').Node | undefined;

  // Case 1: Arrow function or function expression as first argument
  if (firstArg.getKind() === SyntaxKind.ArrowFunction ||
      firstArg.getKind() === SyntaxKind.FunctionExpression) {
    callbackBody = firstArg;
  }
  // Case 2: Object literal with `next` property
  else if (firstArg.getKind() === SyntaxKind.ObjectLiteralExpression) {
    const objLit = firstArg as import('ts-morph').ObjectLiteralExpression;
    for (const prop of objLit.getProperties()) {
      if (prop.getKind() === SyntaxKind.PropertyAssignment) {
        const propAssign = prop as import('ts-morph').PropertyAssignment;
        if (propAssign.getName() === 'next') {
          const init = propAssign.getInitializer();
          if (init !== undefined &&
              (init.getKind() === SyntaxKind.ArrowFunction ||
               init.getKind() === SyntaxKind.FunctionExpression)) {
            callbackBody = init;
          }
        }
      }
    }
  }

  if (callbackBody === undefined) return;

  // Extract call contexts from the callback body's call expressions.
  // Reuse the same mechanism: scan for CallExpression descendants and process them.
  const callbackKey = `subscribe@${callExpr.getStart()}`;
  if (visited.has(callbackKey)) return;
  visited.add(callbackKey);

  const callExprs = callbackBody.getDescendantsOfKind(SyntaxKind.CallExpression);
  for (const innerCall of callExprs) {
    if (contexts.length >= 20) break;

    const innerExpr = innerCall.getExpression();
    const innerText = innerExpr.getText().trim();

    // Navigate patterns inside subscribe callback
    if (
      innerText.endsWith('.navigate') ||
      innerText.endsWith('.navigateByUrl') ||
      innerText === 'this.router.navigate' ||
      innerText.endsWith('.back') ||
      innerText.endsWith('.go')
    ) {
      const navArgs = innerCall.getArguments();
      const args = navArgs.map(a => TsAstUtils.truncateDeterministically(a.getText(), maxLen));
      const target: EventHandlerCallContext['target'] = {};
      if (args[0] !== undefined) target.route = args[0];
      contexts.push({
        kind: 'Navigate',
        target,
        args,
        origin: TsAstUtils.getOrigin(innerCall),
      });
      continue;
    }

    // Navigate (external URL) inside subscribe callback
    if (innerText.startsWith('window.location') || innerText.startsWith('window.open')) {
      const navArgs = innerCall.getArguments();
      const args = navArgs.map(a => TsAstUtils.truncateDeterministically(a.getText(), maxLen));
      const target: EventHandlerCallContext['target'] = {};
      if (args[0] !== undefined) target.url = args[0];
      contexts.push({
        kind: 'Navigate',
        target,
        args,
        origin: TsAstUtils.getOrigin(innerCall),
      });
      continue;
    }

    // DialogOpen inside subscribe callback
    if (innerText.endsWith('.open')) {
      const dialogArgs = innerCall.getArguments();
      if (dialogArgs.length > 0) {
        const firstArgText = dialogArgs[0]!.getText().trim();
        const args = dialogArgs.map(a => TsAstUtils.truncateDeterministically(a.getText(), maxLen));
        if (/^[A-Z]/.test(firstArgText)) {
          contexts.push({
            kind: 'DialogOpen',
            target: { componentClassName: firstArgText },
            args,
            origin: TsAstUtils.getOrigin(innerCall),
          });
          continue;
        } else if (/^[a-z]/.test(firstArgText)) {
          contexts.push({
            kind: 'DialogOpen',
            target: { templateRef: firstArgText },
            args,
            origin: TsAstUtils.getOrigin(innerCall),
          });
          continue;
        }
      }
    }

    // ServiceCall inside subscribe callback (this.<service>.<method>())
    const svcMatch = innerText.match(
      /^this\.([A-Za-z_$][A-Za-z0-9_$]*)\.([A-Za-z_$][A-Za-z0-9_$]*)$/,
    );
    if (svcMatch !== null) {
      const resolvedName = svcMatch[1]!;
      const methodPart = svcMatch[2]!;
      contexts.push({
        kind: 'ServiceCall',
        target: { serviceMethod: `${resolvedName}.${methodPart}` },
        args: innerCall.getArguments().map(a => TsAstUtils.truncateDeterministically(a.getText(), maxLen)),
        origin: TsAstUtils.getOrigin(innerCall),
      });
      continue;
    }

    // Same-class method call inside subscribe callback → follow transitively
    if (depth < 1 && classDecl !== undefined) {
      const sameClassMatch = innerText.match(/^this\.([A-Za-z_$][A-Za-z0-9_$]*)$/);
      if (sameClassMatch !== null) {
        const calleeName = sameClassMatch[1]!;
        if (!visited.has(calleeName)) {
          const calleeMethod = classDecl.getMethod(calleeName);
          if (calleeMethod !== undefined) {
            visited.add(calleeName);
            _extractFromMethod(calleeMethod, maxLen, classDecl, contexts, visited, depth + 1);
          }
        }
      }
    }
  }

  // StateUpdate inside subscribe callback (only at depth 0, matching _extractFromMethod behavior)
  if (depth === 0) {
    for (const binaryExpr of callbackBody.getDescendantsOfKind(SyntaxKind.BinaryExpression)) {
      if (contexts.length >= 20) break;
      const text = binaryExpr.getText().trim();
      const propMatch = text.match(/^this\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/);
      if (propMatch !== null) {
        contexts.push({
          kind: 'StateUpdate',
          target: { mutatedProperty: propMatch[1]! },
          args: [TsAstUtils.truncateDeterministically(text, maxLen)],
          origin: TsAstUtils.getOrigin(binaryExpr, propMatch[1]!),
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Service field type resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the TypeScript type name of a constructor parameter or class property.
 * Returns the bare type name (e.g., "AuthenticationServiceService") or undefined.
 */
function _resolveFieldTypeName(
  classDecl: ClassDeclaration,
  fieldName: string,
): string | undefined {
  // Check constructor parameters first (most common for DI)
  const ctor = classDecl.getConstructors()[0];
  if (ctor !== undefined) {
    for (const param of ctor.getParameters()) {
      if (param.getName() === fieldName) {
        const typeNode = param.getTypeNode();
        if (typeNode !== undefined) {
          // Get the bare type name (strip generics, etc.)
          const typeText = typeNode.getText().trim();
          const bareMatch = typeText.match(/^([A-Za-z_$][A-Za-z0-9_$]*)$/);
          if (bareMatch !== null) return bareMatch[1];
        }
        break;
      }
    }
  }
  return undefined;
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
