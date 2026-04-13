/**
 * plan-deriver.test.ts
 * Unit tests for B1.2 ActionPlan derivation.
 */

import type { A1Multigraph } from '../../../models/multigraph.js';
import type { SubjectManifest } from '../../b0/manifest-schema.js';
import type { B1IntentSet, RealizationIntent, IntentFormField } from '../intent-types.js';
import { derivePlans, resolveWidgetLocator, resolveFieldLocator } from '../plan-deriver.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMinimalA1(): A1Multigraph {
  return {
    multigraph: {
      nodes: [
        {
          id: 'route-1',
          kind: 'Route',
          label: '/',
          refs: [],
          meta: {
            fullPath: '/',
            pathSegment: '',
            componentId: 'comp-1',
            guards: [],
            isEntry: true,
            params: [],
          },
        },
        {
          id: 'route-guarded',
          kind: 'Route',
          label: '/admin',
          refs: [],
          meta: {
            fullPath: '/admin',
            pathSegment: 'admin',
            componentId: 'comp-admin',
            guards: ['AuthGuard'],
            isEntry: false,
            params: [],
          },
        },
        {
          id: 'route-params',
          kind: 'Route',
          label: '/items/:id',
          refs: [],
          meta: {
            fullPath: '/items/:id',
            pathSegment: ':id',
            componentId: 'comp-item',
            guards: [],
            isEntry: false,
            params: ['id'],
          },
        },
        {
          id: 'route-wildcard',
          kind: 'Route',
          label: '/**',
          refs: [],
          meta: {
            fullPath: '/**',
            pathSegment: '**',
            componentId: 'comp-shared',
            guards: [],
            isEntry: false,
            params: [],
          },
        },
        {
          id: 'comp-1',
          kind: 'Component',
          label: 'HomeComponent',
          refs: [],
          meta: { selector: 'app-home', filePath: 'home.ts', className: 'HomeComponent' },
        },
        {
          id: 'widget-btn',
          kind: 'Widget',
          label: 'button',
          refs: [],
          meta: {
            widgetKind: 'Button',
            tagName: 'button',
            subtype: undefined,
            attributes: { id: 'submit-btn' },
            ui: {},
            containingFormId: undefined,
            parentWidgetId: undefined,
            componentId: 'comp-1',
          },
        },
        {
          id: 'widget-link',
          kind: 'Widget',
          label: 'a',
          refs: [],
          meta: {
            widgetKind: 'Link',
            tagName: 'a',
            subtype: undefined,
            attributes: { href: 'https://example.com' },
            ui: {},
            containingFormId: undefined,
            parentWidgetId: undefined,
            componentId: 'comp-1',
          },
        },
        {
          id: 'widget-router',
          kind: 'Widget',
          label: 'a[routerLink]',
          refs: [],
          meta: {
            widgetKind: 'Link',
            tagName: 'a',
            subtype: undefined,
            attributes: {},
            routerLinkText: '/items/42',
            ui: {},
            containingFormId: undefined,
            parentWidgetId: undefined,
            componentId: 'comp-1',
          },
        },
        {
          id: 'widget-form-btn',
          kind: 'Widget',
          label: 'button[type=submit]',
          refs: [],
          meta: {
            widgetKind: 'Button',
            tagName: 'button',
            subtype: 'submit',
            attributes: { type: 'submit' },
            ui: {},
            containingFormId: 'form-1',
            parentWidgetId: undefined,
            componentId: 'comp-1',
          },
        },
        {
          id: 'widget-visible',
          kind: 'Widget',
          label: 'button',
          refs: [],
          meta: {
            widgetKind: 'Button',
            tagName: 'button',
            subtype: undefined,
            attributes: { 'data-testid': 'save-btn' },
            ui: { visibleExprText: 'isEditing' },
            containingFormId: undefined,
            parentWidgetId: undefined,
            componentId: 'comp-1',
          },
        },
        {
          id: 'ext-1',
          kind: 'External',
          label: 'https://example.com',
          refs: [],
          meta: { url: 'https://example.com' },
        },
      ],
      edges: [],
    },
    stats: { nodeCount: 11, edgeCount: 0, structuralEdgeCount: 0, executableEdgeCount: 0 },
  } as unknown as A1Multigraph;
}

function makeManifest(overrides?: Partial<SubjectManifest>): SubjectManifest {
  return {
    subjectName: 'test-subject',
    baseUrl: 'http://localhost:4200',
    accounts: [
      {
        username: 'admin@test.com',
        password: 'pass123',
        roles: ['admin'],
        guardSatisfies: ['AuthGuard'],
      },
    ],
    routeParamValues: { id: '42' },
    authSetup: {
      loginRoute: '/login',
      usernameField: 'input[name=user]',
      passwordField: 'input[name=pass]',
      submitButton: 'button[type=submit]', authSuccessSelector: 'app-bar',
    },
    ...overrides,
  };
}

function makeIntent(overrides?: Partial<RealizationIntent>): RealizationIntent {
  return {
    workflowId: 'wf-1',
    triggerKind: 'WIDGET_TRIGGERS_HANDLER',
    triggerEvent: 'click',
    triggerWidget: {
      nodeId: 'widget-btn',
      tagName: 'button',
      widgetKind: 'Button',
      attributes: { id: 'submit-btn' },
    },
    startRoutes: [{ routeId: 'route-1', fullPath: '/', requiredParams: [] }],
    guardNames: [],
    requiresParams: false,
    effectSteps: [{ edgeId: 'edge-1', edgeKind: 'WIDGET_TRIGGERS_HANDLER' }],
    terminalNodeId: 'comp-1',
    ...overrides,
  } as RealizationIntent;
}

function makeIntentSet(intents: RealizationIntent[]): B1IntentSet {
  return {
    input: { projectId: 'test', multigraphHash: 'abc123' },
    intents,
    stats: {
      totalCount: intents.length,
      feasibleCount: intents.length,
      conditionalCount: 0,
      prunedCount: 0,
    },
  };
}

function makeField(overrides: Partial<IntentFormField> & { fieldNodeId: string; tagName: string }): IntentFormField {
  return {
    widgetKind: 'Input',
    required: false,
    ...overrides,
  } as IntentFormField;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('derivePlans', () => {
  const a1 = makeMinimalA1();

  test('generates one plan per intent', () => {
    const intentSet = makeIntentSet([makeIntent(), makeIntent({ workflowId: 'wf-2' })]);
    const manifest = makeManifest();
    const result = derivePlans(intentSet, manifest, a1);
    expect(result.plans).toHaveLength(2);
    expect(result.stats.totalPlanned).toBe(2);
    expect(result.stats.skipped).toBe(0);
  });

  test('skips workflows in manifest.skipWorkflows', () => {
    const intentSet = makeIntentSet([
      makeIntent({ workflowId: 'wf-1' }),
      makeIntent({ workflowId: 'wf-skip' }),
    ]);
    const manifest = makeManifest({ skipWorkflows: ['wf-skip'] });
    const result = derivePlans(intentSet, manifest, a1);
    expect(result.plans).toHaveLength(1);
    expect(result.stats.skipped).toBe(1);
    expect(result.plans[0]!.workflowId).toBe('wf-1');
  });

  test('sets planVersion to 1', () => {
    const intentSet = makeIntentSet([makeIntent()]);
    const result = derivePlans(intentSet, makeManifest(), a1);
    expect(result.plans[0]!.planVersion).toBe(1);
  });
});

describe('assignment resolution', () => {
  const a1 = makeMinimalA1();

  test('selects account when route has auth guards', () => {
    const intent = makeIntent({
      startRoutes: [{ routeId: 'route-guarded', fullPath: '/admin', requiredParams: [] }],
    });
    const intentSet = makeIntentSet([intent]);
    const manifest = makeManifest();
    const result = derivePlans(intentSet, manifest, a1);
    const plan = result.plans[0]!;
    expect(plan.assignment.account).toBeDefined();
    expect(plan.assignment.account!.username).toBe('admin@test.com');
  });

  test('no account when route has no guards', () => {
    const intent = makeIntent({
      startRoutes: [{ routeId: 'route-1', fullPath: '/', requiredParams: [] }],
    });
    const intentSet = makeIntentSet([intent]);
    const manifest = makeManifest();
    const result = derivePlans(intentSet, manifest, a1);
    expect(result.plans[0]!.assignment.account).toBeUndefined();
  });

  test('binds route params from manifest', () => {
    const intent = makeIntent({
      startRoutes: [{ routeId: 'route-params', fullPath: '/items/:id', requiredParams: ['id'] }],
    });
    const intentSet = makeIntentSet([intent]);
    const manifest = makeManifest();
    const result = derivePlans(intentSet, manifest, a1);
    expect(result.plans[0]!.assignment.routeParams).toEqual({ id: '42' });
  });

  test('binds terminal route params from manifest', () => {
    const intent = makeIntent({
      startRoutes: [{ routeId: 'route-1', fullPath: '/', requiredParams: [] }],
      terminalRoutePath: '/items/:id',
    });
    const intentSet = makeIntentSet([intent]);
    const manifest = makeManifest();
    const result = derivePlans(intentSet, manifest, a1);
    expect(result.plans[0]!.assignment.routeParams).toEqual({ id: '42' });
  });

  test('uses placeholder when manifest lacks param value', () => {
    const intent = makeIntent({
      startRoutes: [{ routeId: 'route-params', fullPath: '/items/:id', requiredParams: ['id'] }],
    });
    const intentSet = makeIntentSet([intent]);
    const manifest = makeManifest({ routeParamValues: {} });
    const result = derivePlans(intentSet, manifest, a1);
    expect(result.plans[0]!.assignment.routeParams).toEqual({ id: '<id>' });
  });

  test('routeParamOverrides terminal path takes precedence over global routeParamValues', () => {
    const intent = makeIntent({
      startRoutes: [{ routeId: 'route-1', fullPath: '/', requiredParams: [] }],
      terminalRoutePath: '/pets/:id/edit',
    });
    const intentSet = makeIntentSet([intent]);
    const manifest = makeManifest({
      routeParamValues: { id: '1' },
      routeParamOverrides: { '/pets/:id/edit': { id: '99' } },
    });
    const result = derivePlans(intentSet, manifest, a1);
    expect(result.plans[0]!.assignment.routeParams).toEqual({ id: '99' });
  });

  test('routeParamOverrides start path used when terminal path not in overrides', () => {
    const intent = makeIntent({
      startRoutes: [{ routeId: 'route-params', fullPath: '/items/:id', requiredParams: ['id'] }],
      terminalRoutePath: '/items/:id',
    });
    const intentSet = makeIntentSet([intent]);
    const manifest = makeManifest({
      routeParamValues: { id: '1' },
      routeParamOverrides: { '/items/:id': { id: '77' } },
    });
    const result = derivePlans(intentSet, manifest, a1);
    // terminal path '/items/:id' is in overrides → value 77
    expect(result.plans[0]!.assignment.routeParams).toEqual({ id: '77' });
  });

  test('falls back to routeParamValues when no override matches', () => {
    const intent = makeIntent({
      startRoutes: [{ routeId: 'route-1', fullPath: '/', requiredParams: [] }],
      terminalRoutePath: '/owners/:id',
    });
    const intentSet = makeIntentSet([intent]);
    const manifest = makeManifest({
      routeParamValues: { id: '42' },
      routeParamOverrides: { '/pets/:id/edit': { id: '99' } }, // different template
    });
    const result = derivePlans(intentSet, manifest, a1);
    expect(result.plans[0]!.assignment.routeParams).toEqual({ id: '42' });
  });

  test('generates form data from formSchema', () => {
    const formSchema: IntentFormField[] = [
      makeField({ fieldNodeId: 'f1', formControlName: 'email', tagName: 'input', inputType: 'email' }),
      makeField({ fieldNodeId: 'f2', formControlName: 'password', tagName: 'input', inputType: 'password' }),
    ];
    const intent = makeIntent({
      triggerKind: 'WIDGET_SUBMITS_FORM',
      formSchema,
    });
    const intentSet = makeIntentSet([intent]);
    const manifest = makeManifest();
    const result = derivePlans(intentSet, manifest, a1);
    const formData = result.plans[0]!.assignment.formData;
    expect(formData['email']).toMatch(/^test-[a-f0-9]{4}@example\.com$/);
    expect(formData['password']).toBe('Test123!');
  });

  test('uses formDataOverrides from manifest', () => {
    const formSchema: IntentFormField[] = [
      makeField({ fieldNodeId: 'f1', formControlName: 'name', tagName: 'input', inputType: 'text' }),
    ];
    const intent = makeIntent({
      workflowId: 'wf-form',
      triggerKind: 'WIDGET_SUBMITS_FORM',
      formSchema,
    });
    const intentSet = makeIntentSet([intent]);
    const manifest = makeManifest({
      formDataOverrides: { 'wf-form': { name: 'Custom Name' } },
    });
    const result = derivePlans(intentSet, manifest, a1);
    expect(result.plans[0]!.assignment.formData['name']).toBe('Custom Name');
  });
});

describe('startRoute selection', () => {
  const a1 = makeMinimalA1();

  test('prefers non-wildcard route over wildcard', () => {
    const intent = makeIntent({
      startRoutes: [
        { routeId: 'route-wildcard', fullPath: '/**', requiredParams: [] },
        { routeId: 'route-1', fullPath: '/', requiredParams: [] },
      ],
    });
    const intentSet = makeIntentSet([intent]);
    const manifest = makeManifest();
    const result = derivePlans(intentSet, manifest, a1);
    const navUrl = result.plans[0]!.preConditions.find(pc => pc.type === 'navigate-to-route');
    expect(navUrl!.config['url']).toBe('/');
  });

  test('prefers unguarded route over guarded', () => {
    const intent = makeIntent({
      startRoutes: [
        { routeId: 'route-guarded', fullPath: '/admin', requiredParams: [] },
        { routeId: 'route-1', fullPath: '/', requiredParams: [] },
      ],
    });
    const intentSet = makeIntentSet([intent]);
    const manifest = makeManifest();
    const result = derivePlans(intentSet, manifest, a1);
    const navUrl = result.plans[0]!.preConditions.find(pc => pc.type === 'navigate-to-route');
    expect(navUrl!.config['url']).toBe('/');
    // Should NOT have auth-setup since unguarded route selected
    expect(result.plans[0]!.assignment.account).toBeUndefined();
  });

  test('prefers fewer params among unguarded routes', () => {
    const intent = makeIntent({
      startRoutes: [
        { routeId: 'route-params', fullPath: '/items/:id', requiredParams: ['id'] },
        { routeId: 'route-1', fullPath: '/', requiredParams: [] },
      ],
    });
    const intentSet = makeIntentSet([intent]);
    const manifest = makeManifest();
    const result = derivePlans(intentSet, manifest, a1);
    const navUrl = result.plans[0]!.preConditions.find(pc => pc.type === 'navigate-to-route');
    expect(navUrl!.config['url']).toBe('/');
  });

  test('uses wildcard route when no non-wildcard available', () => {
    const intent = makeIntent({
      startRoutes: [
        { routeId: 'route-wildcard', fullPath: '/**', requiredParams: [] },
      ],
    });
    const intentSet = makeIntentSet([intent]);
    const manifest = makeManifest();
    const result = derivePlans(intentSet, manifest, a1);
    const navUrl = result.plans[0]!.preConditions.find(pc => pc.type === 'navigate-to-route');
    expect(navUrl!.config['url']).toBe('/**');
  });
});

describe('preConditions', () => {
  const a1 = makeMinimalA1();

  test('adds auth-setup when guarded route with account', () => {
    const intent = makeIntent({
      startRoutes: [{ routeId: 'route-guarded', fullPath: '/admin', requiredParams: [] }],
    });
    const intentSet = makeIntentSet([intent]);
    const manifest = makeManifest();
    const result = derivePlans(intentSet, manifest, a1);
    const authPc = result.plans[0]!.preConditions.find(pc => pc.type === 'auth-setup');
    expect(authPc).toBeDefined();
    expect(authPc!.config['loginRoute']).toBe('/login');
    expect(authPc!.config['username']).toBe('admin@test.com');
  });

  test('omits auth-setup when no guards', () => {
    const intent = makeIntent({
      startRoutes: [{ routeId: 'route-1', fullPath: '/', requiredParams: [] }],
    });
    const intentSet = makeIntentSet([intent]);
    const manifest = makeManifest();
    const result = derivePlans(intentSet, manifest, a1);
    const authPc = result.plans[0]!.preConditions.find(pc => pc.type === 'auth-setup');
    expect(authPc).toBeUndefined();
  });

  test('always includes navigate-to-route', () => {
    const intent = makeIntent({
      startRoutes: [{ routeId: 'route-params', fullPath: '/items/:id', requiredParams: ['id'] }],
    });
    const intentSet = makeIntentSet([intent]);
    const manifest = makeManifest();
    const result = derivePlans(intentSet, manifest, a1);
    const navPc = result.plans[0]!.preConditions.find(pc => pc.type === 'navigate-to-route');
    expect(navPc).toBeDefined();
    expect(navPc!.config['url']).toBe('/items/42');
  });

  test('auth-setup precedes navigate-to-route', () => {
    const intent = makeIntent({
      startRoutes: [{ routeId: 'route-guarded', fullPath: '/admin', requiredParams: [] }],
    });
    const intentSet = makeIntentSet([intent]);
    const manifest = makeManifest();
    const result = derivePlans(intentSet, manifest, a1);
    const types = result.plans[0]!.preConditions.map(pc => pc.type);
    expect(types[0]).toBe('auth-setup');
    expect(types[1]).toBe('navigate-to-route');
  });
});

describe('action steps', () => {
  const a1 = makeMinimalA1();

  test('WTH generates click step', () => {
    const intent = makeIntent({ triggerKind: 'WIDGET_TRIGGERS_HANDLER' });
    const intentSet = makeIntentSet([intent]);
    const result = derivePlans(intentSet, makeManifest(), a1);
    const steps = result.plans[0]!.steps;
    expect(steps).toHaveLength(1);
    expect(steps[0]!.type).toBe('click');
  });

  test('WNR generates click step', () => {
    const intent = makeIntent({ triggerKind: 'WIDGET_NAVIGATES_ROUTE' });
    const intentSet = makeIntentSet([intent]);
    const result = derivePlans(intentSet, makeManifest(), a1);
    expect(result.plans[0]!.steps[0]!.type).toBe('click');
  });

  test('WNE generates click step', () => {
    const intent = makeIntent({ triggerKind: 'WIDGET_NAVIGATES_EXTERNAL' });
    const intentSet = makeIntentSet([intent]);
    const result = derivePlans(intentSet, makeManifest(), a1);
    expect(result.plans[0]!.steps[0]!.type).toBe('click');
  });

  test('WSF generates form field steps + submit', () => {
    const formSchema: IntentFormField[] = [
      makeField({ fieldNodeId: 'f1', formControlName: 'email', tagName: 'input', inputType: 'email' }),
      makeField({ fieldNodeId: 'f2', formControlName: 'role', tagName: 'select' }),
    ];
    const intent = makeIntent({
      triggerKind: 'WIDGET_SUBMITS_FORM',
      formSchema,
      triggerWidget: {
        nodeId: 'widget-form-btn',
        tagName: 'button',
        widgetKind: 'Button',
        attributes: { type: 'submit' },
        componentSelector: 'app-home',
        containingFormId: 'form-1',
      },
    });
    const intentSet = makeIntentSet([intent]);
    const result = derivePlans(intentSet, makeManifest(), a1);
    const steps = result.plans[0]!.steps;
    expect(steps).toHaveLength(3);
    expect(steps[0]!.type).toBe('clear-and-type');
    expect(steps[1]!.type).toBe('select-option');
    expect(steps[2]!.type).toBe('submit');
  });

  test('visibility gate prepends wait-for-element', () => {
    const intent = makeIntent({
      triggerWidget: {
        nodeId: 'widget-visible',
        tagName: 'button',
        widgetKind: 'Button',
        attributes: { 'data-testid': 'save-btn' },
      },
    });
    const intentSet = makeIntentSet([intent]);
    const result = derivePlans(intentSet, makeManifest(), a1);
    const steps = result.plans[0]!.steps;
    expect(steps).toHaveLength(2);
    expect(steps[0]!.type).toBe('wait-for-element');
    expect(steps[1]!.type).toBe('click');
  });
});

describe('postConditions', () => {
  const a1 = makeMinimalA1();

  test('assert-url-matches for WNR with terminal route', () => {
    const intent = makeIntent({
      triggerKind: 'WIDGET_NAVIGATES_ROUTE',
      terminalRoutePath: '/items/:id',
    });
    const intentSet = makeIntentSet([intent]);
    const result = derivePlans(intentSet, makeManifest(), a1);
    const pc = result.plans[0]!.postConditions[0]!;
    expect(pc.type).toBe('assert-url-matches');
    expect(pc.expected).toBe('/items/42');
  });

  test('assert-url-matches for WNE with external URL', () => {
    const intent = makeIntent({
      triggerKind: 'WIDGET_NAVIGATES_EXTERNAL',
      terminalNodeId: 'ext-1',
    });
    const intentSet = makeIntentSet([intent]);
    const result = derivePlans(intentSet, makeManifest(), a1);
    const pc = result.plans[0]!.postConditions[0]!;
    expect(pc.type).toBe('assert-url-matches');
    expect(pc.expected).toBe('https://example.com');
  });

  test('assert-no-crash for WTH without terminal route', () => {
    const intent = makeIntent({
      triggerKind: 'WIDGET_TRIGGERS_HANDLER',
    });
    const intentSet = makeIntentSet([intent]);
    const result = derivePlans(intentSet, makeManifest(), a1);
    expect(result.plans[0]!.postConditions[0]!.type).toBe('assert-no-crash');
  });
});

describe('resolveWidgetLocator', () => {
  test('routerlink strategy for routerLinkText', () => {
    const intent = makeIntent({
      triggerWidget: {
        nodeId: 'widget-router',
        tagName: 'a',
        widgetKind: 'Link',
        attributes: {},
        routerLinkText: '/home',
      },
    });
    const loc = resolveWidgetLocator(intent);
    expect(loc.strategy).toBe('routerlink');
    expect(loc.value).toBe('/home');
  });

  test('href strategy for href attribute', () => {
    const intent = makeIntent({
      triggerWidget: {
        nodeId: 'w1',
        tagName: 'a',
        widgetKind: 'Link',
        attributes: { href: 'https://example.com' },
      },
    });
    const loc = resolveWidgetLocator(intent);
    expect(loc.strategy).toBe('href');
    expect(loc.value).toBe('https://example.com');
  });

  test('data-testid strategy', () => {
    const intent = makeIntent({
      triggerWidget: {
        nodeId: 'w1',
        tagName: 'button',
        widgetKind: 'Button',
        attributes: { 'data-testid': 'my-btn' },
      },
    });
    const loc = resolveWidgetLocator(intent);
    expect(loc.strategy).toBe('data-testid');
    expect(loc.value).toBe('my-btn');
  });

  test('id strategy', () => {
    const intent = makeIntent({
      triggerWidget: {
        nodeId: 'w1',
        tagName: 'button',
        widgetKind: 'Button',
        attributes: { id: 'my-id' },
      },
    });
    const loc = resolveWidgetLocator(intent);
    expect(loc.strategy).toBe('id');
    expect(loc.value).toBe('my-id');
  });

  test('formcontrolname strategy', () => {
    const intent = makeIntent({
      triggerWidget: {
        nodeId: 'w1',
        tagName: 'input',
        widgetKind: 'Input',
        attributes: {},
        formControlName: 'email',
      },
    });
    const loc = resolveWidgetLocator(intent);
    expect(loc.strategy).toBe('formcontrolname');
    expect(loc.value).toBe('email');
  });

  test('tag-position fallback', () => {
    const intent = makeIntent({
      triggerWidget: {
        nodeId: 'w1',
        tagName: 'div',
        widgetKind: 'OtherInteractive',
        attributes: {},
      },
    });
    const loc = resolveWidgetLocator(intent);
    expect(loc.strategy).toBe('tag-position');
    expect(loc.value).toBe('div');
  });

  test('includes componentSelector when present', () => {
    const intent = makeIntent({
      triggerWidget: {
        nodeId: 'w1',
        tagName: 'button',
        widgetKind: 'Button',
        attributes: { id: 'btn' },
        componentSelector: 'app-home',
      },
    });
    const loc = resolveWidgetLocator(intent);
    expect(loc.componentSelector).toBe('app-home');
  });

  test('includes formSelector when containingFormId set', () => {
    const intent = makeIntent({
      triggerWidget: {
        nodeId: 'w1',
        tagName: 'button',
        widgetKind: 'Button',
        attributes: { id: 'btn' },
        containingFormId: 'form-1',
      },
    });
    const loc = resolveWidgetLocator(intent);
    expect(loc.formSelector).toBe('form');
  });
});

describe('resolveFieldLocator', () => {
  test('formcontrolname strategy', () => {
    const field = makeField({ fieldNodeId: 'f1', formControlName: 'email', tagName: 'input' });
    const loc = resolveFieldLocator(field);
    expect(loc.strategy).toBe('formcontrolname');
    expect(loc.value).toBe('email');
    expect(loc.formSelector).toBe('form');
  });

  test('name strategy fallback', () => {
    const field = makeField({ fieldNodeId: 'f1', nameAttr: 'username', tagName: 'input' });
    const loc = resolveFieldLocator(field);
    expect(loc.strategy).toBe('name');
    expect(loc.value).toBe('username');
  });

  test('tag-position fallback', () => {
    const field = makeField({ fieldNodeId: 'f1', tagName: 'input' });
    const loc = resolveFieldLocator(field);
    expect(loc.strategy).toBe('tag-position');
    expect(loc.value).toBe('input');
  });
});

describe('default form values', () => {
  const a1 = makeMinimalA1();

  test('generates type-appropriate defaults', () => {
    const formSchema: IntentFormField[] = [
      makeField({ fieldNodeId: 'f1', formControlName: 'email', tagName: 'input', inputType: 'email' }),
      makeField({ fieldNodeId: 'f2', formControlName: 'pass', tagName: 'input', inputType: 'password' }),
      makeField({ fieldNodeId: 'f3', formControlName: 'count', tagName: 'input', inputType: 'number' }),
      makeField({ fieldNodeId: 'f4', formControlName: 'phone', tagName: 'input', inputType: 'tel' }),
      makeField({ fieldNodeId: 'f5', formControlName: 'site', tagName: 'input', inputType: 'url' }),
      makeField({ fieldNodeId: 'f6', formControlName: 'role', tagName: 'select' }),
      makeField({ fieldNodeId: 'f7', formControlName: 'bio', tagName: 'textarea' }),
      makeField({ fieldNodeId: 'f8', formControlName: 'name', tagName: 'input', inputType: 'text' }),
    ];
    const intent = makeIntent({
      triggerKind: 'WIDGET_SUBMITS_FORM',
      formSchema,
    });
    const intentSet = makeIntentSet([intent]);
    const result = derivePlans(intentSet, makeManifest(), a1);
    const fd = result.plans[0]!.assignment.formData;
    expect(fd['email']).toMatch(/^test-[a-f0-9]{4}@example\.com$/);
    expect(fd['pass']).toBe('Test123!');
    expect(fd['count']).toBe('1');
    expect(fd['phone']).toBe('1234567890');
    expect(fd['site']).toBe('https://example.com');
    expect(fd['role']).toBe('option-1');
    expect(fd['bio']).toMatch(/^test-bio-[a-f0-9]{4}$/);
    expect(fd['name']).toMatch(/^test-name-[a-f0-9]{4}$/);
  });

  test('generates correct datetime/special type defaults', () => {
    const formSchema: IntentFormField[] = [
      makeField({ fieldNodeId: 'f1', formControlName: 'bg', tagName: 'input', inputType: 'color' }),
      makeField({ fieldNodeId: 'f2', formControlName: 'dob', tagName: 'input', inputType: 'date' }),
      makeField({ fieldNodeId: 'f3', formControlName: 'appt', tagName: 'input', inputType: 'time' }),
      makeField({ fieldNodeId: 'f4', formControlName: 'mo', tagName: 'input', inputType: 'month' }),
      makeField({ fieldNodeId: 'f5', formControlName: 'wk', tagName: 'input', inputType: 'week' }),
      makeField({ fieldNodeId: 'f6', formControlName: 'dt', tagName: 'input', inputType: 'datetime-local' }),
    ];
    const intent = makeIntent({ triggerKind: 'WIDGET_SUBMITS_FORM', formSchema });
    const intentSet = makeIntentSet([intent]);
    const result = derivePlans(intentSet, makeManifest(), a1);
    const fd = result.plans[0]!.assignment.formData;
    expect(fd['bg']).toBe('#000000');
    expect(fd['dob']).toBe('2024-01-01');
    expect(fd['appt']).toBe('12:00');
    expect(fd['mo']).toBe('2024-01');
    expect(fd['wk']).toBe('2024-W01');
    expect(fd['dt']).toBe('2024-01-01T12:00');
  });

  test('respects minLength constraint', () => {
    const formSchema: IntentFormField[] = [
      makeField({ fieldNodeId: 'f1', formControlName: 'code', tagName: 'input', inputType: 'text', minLength: 20 }),
    ];
    const intent = makeIntent({ triggerKind: 'WIDGET_SUBMITS_FORM', formSchema });
    const intentSet = makeIntentSet([intent]);
    const result = derivePlans(intentSet, makeManifest(), a1);
    const val = result.plans[0]!.assignment.formData['code']!;
    expect(val.length).toBeGreaterThanOrEqual(20);
  });

  test('uses min value for number type', () => {
    const formSchema: IntentFormField[] = [
      makeField({ fieldNodeId: 'f1', formControlName: 'qty', tagName: 'input', inputType: 'number', min: 5 }),
    ];
    const intent = makeIntent({ triggerKind: 'WIDGET_SUBMITS_FORM', formSchema });
    const intentSet = makeIntentSet([intent]);
    const result = derivePlans(intentSet, makeManifest(), a1);
    expect(result.plans[0]!.assignment.formData['qty']).toBe('5');
  });
});

describe('determinism', () => {
  const a1 = makeMinimalA1();

  test('plans are byte-identical across runs', () => {
    const formSchema: IntentFormField[] = [
      makeField({ fieldNodeId: 'f1', formControlName: 'name', tagName: 'input', inputType: 'text' }),
    ];
    const intents = [
      makeIntent({ workflowId: 'wf-1', triggerKind: 'WIDGET_TRIGGERS_HANDLER' }),
      makeIntent({ workflowId: 'wf-2', triggerKind: 'WIDGET_SUBMITS_FORM', formSchema }),
      makeIntent({
        workflowId: 'wf-3',
        triggerKind: 'WIDGET_NAVIGATES_ROUTE',
        startRoutes: [{ routeId: 'route-guarded', fullPath: '/admin', requiredParams: [] }],
        terminalRoutePath: '/items/:id',
      }),
    ];
    const intentSet = makeIntentSet(intents);
    const manifest = makeManifest();

    const run1 = JSON.stringify(derivePlans(intentSet, manifest, a1));
    const run2 = JSON.stringify(derivePlans(intentSet, manifest, a1));
    expect(run1).toBe(run2);
  });
});
