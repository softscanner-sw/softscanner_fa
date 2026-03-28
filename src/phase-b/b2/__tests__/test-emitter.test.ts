/**
 * test-emitter.test.ts
 * Unit tests for B2 code generation (test-emitter.ts).
 */

import {
  emitLocator,
  emitFindElement,
  emitPreCondition,
  emitStep,
  emitPostCondition,
  emitTest,
  emitTestSet,
} from '../test-emitter.js';
import type {
  ActionPlan,
  ActionStep,
  Assignment,
  PostCondition,
  PreCondition,
  ScopedLocator,
} from '../../b1/plan-types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlan(overrides?: Partial<ActionPlan>): ActionPlan {
  return {
    workflowId: 'test-wf-001',
    planVersion: 1,
    assignment: {
      routeParams: {},
      formData: {},
    },
    preConditions: [
      { type: 'navigate-to-route', config: { url: '/home' } },
    ],
    steps: [
      {
        type: 'click',
        locator: { strategy: 'id', value: 'btn-submit' },
        description: 'Click submit button',
      },
    ],
    postConditions: [
      { type: 'assert-no-crash' },
    ],
    ...overrides,
  };
}

function makeAssignment(overrides?: Partial<Assignment>): Assignment {
  return {
    routeParams: {},
    formData: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Locator translation
// ---------------------------------------------------------------------------

describe('emitLocator', () => {
  it('translates id strategy', () => {
    const loc: ScopedLocator = { strategy: 'id', value: 'my-id' };
    expect(emitLocator(loc)).toBe("By.id('my-id')");
  });

  it('translates name strategy', () => {
    const loc: ScopedLocator = { strategy: 'name', value: 'field-name' };
    expect(emitLocator(loc)).toBe("By.name('field-name')");
  });

  it('translates formcontrolname strategy', () => {
    const loc: ScopedLocator = { strategy: 'formcontrolname', value: 'email' };
    expect(emitLocator(loc)).toBe("By.css('[formcontrolname=\"email\"]')");
  });

  it('translates aria-label strategy', () => {
    const loc: ScopedLocator = { strategy: 'aria-label', value: 'Submit' };
    expect(emitLocator(loc)).toBe("By.css('[aria-label=\"Submit\"]')");
  });

  it('translates routerlink strategy', () => {
    const loc: ScopedLocator = { strategy: 'routerlink', value: '/heroes' };
    expect(emitLocator(loc)).toBe("By.css('[routerlink=\"/heroes\"]')");
  });

  it('translates href strategy', () => {
    const loc: ScopedLocator = { strategy: 'href', value: 'https://example.com' };
    expect(emitLocator(loc)).toBe("By.css('[href=\"https://example.com\"]')");
  });

  it('translates placeholder strategy', () => {
    const loc: ScopedLocator = { strategy: 'placeholder', value: 'Enter name' };
    expect(emitLocator(loc)).toBe("By.css('[placeholder=\"Enter name\"]')");
  });

  it('translates data-testid strategy', () => {
    const loc: ScopedLocator = { strategy: 'data-testid', value: 'login-btn' };
    expect(emitLocator(loc)).toBe("By.css('[data-testid=\"login-btn\"]')");
  });

  it('translates tag-position strategy', () => {
    const loc: ScopedLocator = { strategy: 'tag-position', value: 'button[3]' };
    expect(emitLocator(loc)).toBe("By.css('button:nth-of-type(3)')");
  });

  it('translates tag-position without brackets', () => {
    const loc: ScopedLocator = { strategy: 'tag-position', value: 'div' };
    expect(emitLocator(loc)).toBe("By.css('div:nth-of-type(1)')");
  });

  it('translates custom strategy', () => {
    const loc: ScopedLocator = { strategy: 'custom', value: '.my-class > span' };
    expect(emitLocator(loc)).toBe("By.css('.my-class > span')");
  });
});

// ---------------------------------------------------------------------------
// Find element with scoping
// ---------------------------------------------------------------------------

describe('emitFindElement', () => {
  it('emits direct find for unscoped locator', () => {
    const loc: ScopedLocator = { strategy: 'id', value: 'btn' };
    expect(emitFindElement(loc)).toBe("await driver.findElement(By.id('btn'))");
  });

  it('emits component-scoped find', () => {
    const loc: ScopedLocator = { strategy: 'id', value: 'btn', componentSelector: 'app-hero' };
    expect(emitFindElement(loc)).toContain("findElement(By.css('app-hero'))");
    expect(emitFindElement(loc)).toContain("findElement(By.id('btn'))");
  });

  it('emits form-scoped find', () => {
    const loc: ScopedLocator = { strategy: 'name', value: 'email', formSelector: 'form#login' };
    expect(emitFindElement(loc)).toContain("findElement(By.css('form#login'))");
    expect(emitFindElement(loc)).toContain("findElement(By.name('email'))");
  });

  it('emits component + form double scoping', () => {
    const loc: ScopedLocator = {
      strategy: 'name', value: 'email',
      componentSelector: 'app-login',
      formSelector: 'form#login',
    };
    const result = emitFindElement(loc);
    expect(result).toContain("findElement(By.css('app-login'))");
    expect(result).toContain("findElement(By.css('form#login'))");
    expect(result).toContain("findElement(By.name('email'))");
  });
});

// ---------------------------------------------------------------------------
// PreCondition emission
// ---------------------------------------------------------------------------

describe('emitPreCondition', () => {
  it('emits auth-setup with authSuccessSelector polling', () => {
    const pre: PreCondition = {
      type: 'auth-setup',
      config: {
        loginRoute: '/login',
        usernameField: '#username',
        passwordField: '#password',
        submitButton: 'button[type="submit"]',
        authSuccessSelector: 'app-bar',
      },
    };
    const assignment = makeAssignment({
      account: { username: 'admin', password: 'pass123', roles: [] },
    });
    const lines = emitPreCondition(pre, assignment, 'http://localhost:4200');
    const code = lines.join('\n');
    expect(code).toContain('/login');
    expect(code).toContain('#username');
    expect(code).toContain('admin');
    expect(code).toContain('pass123');
    expect(code).toContain('click');
    // Auth success: polls for authSuccessSelector as sole success signal
    expect(code).toContain('app-bar');
    expect(code).toContain('findElements');
    expect(code).toContain('NAVIGATION_WAIT * 3');
    // No URL-based detection, no form-disappearance, no fixed sleep (Promise setTimeout)
    expect(code).not.toContain('url.includes');
    expect(code).not.toContain('new Promise');
  });

  it('emits navigate-to-route', () => {
    const pre: PreCondition = {
      type: 'navigate-to-route',
      config: { url: '/dashboard' },
    };
    const lines = emitPreCondition(pre, makeAssignment(), 'http://localhost:4200');
    const code = lines.join('\n');
    expect(code).toContain('/dashboard');
    expect(code).toContain('driver.get');
  });

  it('emits trigger-dialog-open', () => {
    const pre: PreCondition = {
      type: 'trigger-dialog-open',
      config: { openerSelector: 'button.add', dialogSelector: 'mat-dialog-container' },
    };
    const lines = emitPreCondition(pre, makeAssignment(), 'http://localhost:4200');
    const code = lines.join('\n');
    expect(code).toContain('button.add');
    expect(code).toContain('mat-dialog-container');
    expect(code).toContain('click');
  });
});

// ---------------------------------------------------------------------------
// Step emission
// ---------------------------------------------------------------------------

describe('emitStep', () => {
  it('emits click step', () => {
    const step: ActionStep = {
      type: 'click',
      locator: { strategy: 'id', value: 'btn' },
      description: 'click button',
    };
    const lines = emitStep(step);
    const code = lines.join('\n');
    expect(code).toContain('click()');
    expect(code).toContain("By.id('btn')");
  });

  it('emits type step with value', () => {
    const step: ActionStep = {
      type: 'type',
      locator: { strategy: 'name', value: 'email' },
      value: 'test@example.com',
      description: 'type email',
    };
    const lines = emitStep(step);
    const code = lines.join('\n');
    expect(code).toContain('sendKeys');
    expect(code).toContain('test@example.com');
  });

  it('emits clear-and-type step', () => {
    const step: ActionStep = {
      type: 'clear-and-type',
      locator: { strategy: 'name', value: 'name' },
      value: 'John',
      description: 'clear and type name',
    };
    const lines = emitStep(step);
    const code = lines.join('\n');
    expect(code).toContain('clear()');
    expect(code).toContain('sendKeys');
    expect(code).toContain('John');
  });

  it('emits submit step by clicking submit button inside form', () => {
    const step: ActionStep = {
      type: 'submit',
      locator: { strategy: 'tag-position', value: 'form[1]' },
      description: 'submit form',
    };
    const lines = emitStep(step);
    const code = lines.join('\n');
    expect(code).toContain('button[type="submit"]');
    expect(code).toContain('.click()');
  });

  it('emits select-option step for native select using first-option position strategy', () => {
    const step: ActionStep = {
      type: 'select-option',
      locator: { strategy: 'name', value: 'category' },
      value: 'electronics',
      description: 'select category',
    };
    const lines = emitStep(step);
    const code = lines.join('\n');
    expect(code).toContain('click()');
    expect(code).toContain('option:nth-of-type(1)');
    expect(code).not.toContain('option[value=');
    expect(code).not.toContain('mat-option');
  });

  it('emits select-option step for mat-select using mat-option overlay', () => {
    const step: ActionStep = {
      type: 'select-option',
      locator: { strategy: 'formcontrolname', value: 'petType', tagName: 'mat-select' },
      value: 'cat',
      description: 'select pet type',
    };
    const lines = emitStep(step);
    const code = lines.join('\n');
    expect(code).toContain('mat-option');
    expect(code).toContain('elementLocated');
    expect(code).toContain('firstOption');
    expect(code).not.toContain('option[value=');
  });

  it('emits wait-for-element step', () => {
    const step: ActionStep = {
      type: 'wait-for-element',
      locator: { strategy: 'id', value: 'spinner' },
      description: 'wait for spinner',
    };
    const lines = emitStep(step);
    const code = lines.join('\n');
    expect(code).toContain('driver.wait');
    expect(code).toContain('elementLocated');
  });

  it('emits wait-for-navigation step', () => {
    const step: ActionStep = {
      type: 'wait-for-navigation',
      locator: { strategy: 'custom', value: 'body' },
      value: '/dashboard',
      description: 'wait for nav',
    };
    const lines = emitStep(step);
    const code = lines.join('\n');
    expect(code).toContain('urlContains');
    expect(code).toContain('/dashboard');
  });

  it('emits wait-for-dialog step', () => {
    const step: ActionStep = {
      type: 'wait-for-dialog',
      locator: { strategy: 'custom', value: '.modal' },
      description: 'wait for dialog',
    };
    const lines = emitStep(step);
    const code = lines.join('\n');
    expect(code).toContain('driver.wait');
    expect(code).toContain('elementLocated');
  });

  it('emits navigate step', () => {
    const step: ActionStep = {
      type: 'navigate',
      locator: { strategy: 'custom', value: '' },
      value: '/settings',
      description: 'navigate to settings',
    };
    const lines = emitStep(step);
    const code = lines.join('\n');
    expect(code).toContain('driver.get');
    expect(code).toContain('/settings');
  });
});

// ---------------------------------------------------------------------------
// PostCondition emission
// ---------------------------------------------------------------------------

describe('emitPostCondition', () => {
  it('emits assert-url-matches for internal route', () => {
    const post: PostCondition = {
      type: 'assert-url-matches',
      expected: '/heroes',
    };
    const lines = emitPostCondition(post);
    const code = lines.join('\n');
    expect(code).toContain('/heroes');
    expect(code).toContain('driver.wait');
  });

  it('emits assert-url-matches for external URL', () => {
    const post: PostCondition = {
      type: 'assert-url-matches',
      expected: 'https://github.com/example',
    };
    const lines = emitPostCondition(post);
    const code = lines.join('\n');
    expect(code).toContain('https://github.com/example');
    expect(code).toContain('assert.ok');
  });

  it('emits assert-no-crash', () => {
    const post: PostCondition = { type: 'assert-no-crash' };
    const lines = emitPostCondition(post);
    const code = lines.join('\n');
    expect(code).toContain('getTitle');
    expect(code).toContain('body');
    expect(code).toContain('assert.ok');
  });
});

// ---------------------------------------------------------------------------
// Full test file
// ---------------------------------------------------------------------------

describe('emitTest', () => {
  it('produces a complete test file', () => {
    const plan = makePlan();
    const code = emitTest(plan, 'http://localhost:4200');

    // Imports
    expect(code).toContain("import { Builder, By, until, WebDriver } from 'selenium-webdriver'");
    expect(code).toContain("import chrome from 'selenium-webdriver/chrome'");
    expect(code).toContain("import assert from 'assert'");

    // Setup
    expect(code).toContain('new Builder()');
    expect(code).toContain("forBrowser('chrome')");
    expect(code).toContain('setTimeouts');

    // Content
    expect(code).toContain('navigate-to-route');
    expect(code).toContain('click');

    // Teardown
    expect(code).toContain('driver.quit()');
    expect(code).toContain('finally');

    // Runner
    expect(code).toContain('runTest()');
    expect(code).toContain('process.exit(1)');
  });

  it('includes workflow ID in comments', () => {
    const plan = makePlan({ workflowId: 'my-special-workflow' });
    const code = emitTest(plan, 'http://localhost:4200');
    expect(code).toContain('my-special-workflow');
  });

  it('includes baseUrl as BASE_URL constant', () => {
    const plan = makePlan();
    const code = emitTest(plan, 'http://localhost:9876');
    expect(code).toContain("const BASE_URL = 'http://localhost:9876'");
  });
});

// ---------------------------------------------------------------------------
// Batch emission
// ---------------------------------------------------------------------------

describe('emitTestSet', () => {
  it('produces one entry per plan', () => {
    const plans = [
      makePlan({ workflowId: 'wf-1' }),
      makePlan({ workflowId: 'wf-2' }),
      makePlan({ workflowId: 'wf-3' }),
    ];
    const result = emitTestSet(plans, 'http://localhost:4200');
    expect(result.size).toBe(3);
    expect(result.has('wf-1')).toBe(true);
    expect(result.has('wf-2')).toBe(true);
    expect(result.has('wf-3')).toBe(true);
  });

  it('is deterministic', () => {
    const plans = [
      makePlan({ workflowId: 'wf-a' }),
      makePlan({ workflowId: 'wf-b' }),
    ];
    const r1 = emitTestSet(plans, 'http://localhost:4200');
    const r2 = emitTestSet(plans, 'http://localhost:4200');
    expect(r1.get('wf-a')).toBe(r2.get('wf-a'));
    expect(r1.get('wf-b')).toBe(r2.get('wf-b'));
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('handles plan with no steps', () => {
    const plan = makePlan({ steps: [] });
    const code = emitTest(plan, 'http://localhost:4200');
    expect(code).toContain('runTest');
    expect(code).toContain('driver.quit');
  });

  it('handles plan with auth precondition + account', () => {
    const plan = makePlan({
      assignment: {
        account: { username: 'admin', password: 'secret', roles: ['admin'] },
        routeParams: {},
        formData: {},
      },
      preConditions: [
        {
          type: 'auth-setup',
          config: {
            loginRoute: '/login',
            usernameField: '#user',
            passwordField: '#pass',
            submitButton: '#login-btn',
          },
        },
        { type: 'navigate-to-route', config: { url: '/admin' } },
      ],
    });
    const code = emitTest(plan, 'http://localhost:4200');
    expect(code).toContain('admin');
    expect(code).toContain('secret');
    expect(code).toContain('/login');
    expect(code).toContain('/admin');
  });

  it('escapes special characters in strings', () => {
    const plan = makePlan({
      preConditions: [
        { type: 'navigate-to-route', config: { url: "/it's" } },
      ],
    });
    const code = emitTest(plan, 'http://localhost:4200');
    // Should not produce a syntax error from unescaped quote
    expect(code).toContain("\\'s");
  });
});
