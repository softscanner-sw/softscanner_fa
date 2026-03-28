/**
 * manifest-validator.test.ts
 *
 * Tests for B0 manifest validation: schema validation and A2 cross-checking.
 *
 * Isolation: uses only manifest-schema types and A2 model types.
 * No AST, parsers, or A1 internals.
 */

import type { A2WorkflowSet, TaskWorkflow, WorkflowExplanation, TaskStep } from '../../../models/workflow.js';
import type { ConstraintSurface } from '../../../models/multigraph.js';
import type { SubjectManifest } from '../manifest-schema.js';
import { validateManifest } from '../manifest-validator.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const EMPTY_CS: ConstraintSurface = {
  requiredParams: [],
  guards: [],
  roles: [],
  uiAtoms: [],
  evidence: [],
};

const EMPTY_EXPLANATION: WorkflowExplanation = {};

function makeWorkflow(id: string, overrides: {
  guards?: string[];
  requiredParams?: string[];
  requiredGuards?: string[];
} = {}): TaskWorkflow {
  const cw: ConstraintSurface = {
    ...EMPTY_CS,
    guards: overrides.guards ?? [],
    requiredParams: overrides.requiredParams ?? [],
  };
  const explanation: WorkflowExplanation = {
    ...EMPTY_EXPLANATION,
    ...(overrides.requiredGuards !== undefined ? { requiredGuards: overrides.requiredGuards } : {}),
  };
  const steps: TaskStep[] = [{ edgeId: `${id}::WTH::C1::0`, kind: 'WIDGET_TRIGGERS_HANDLER' }];
  return {
    id,
    triggerEdgeId: steps[0]!.edgeId,
    startRouteIds: ['R1'],
    steps,
    terminalNodeId: 'R1',
    cw,
    verdict: cw.guards.length > 0 || cw.requiredParams.length > 0 ? 'CONDITIONAL' : 'FEASIBLE',
    explanation,
    meta: {},
  };
}

function makeA2(workflows: TaskWorkflow[]): A2WorkflowSet {
  return {
    input: { projectId: 'test', multigraphHash: 'abc123' },
    config: { mode: 'task' },
    workflows,
    partitions: {
      feasibleIds: workflows.filter(w => w.verdict === 'FEASIBLE').map(w => w.id),
      conditionalIds: workflows.filter(w => w.verdict === 'CONDITIONAL').map(w => w.id),
      prunedIds: [],
    },
    stats: {
      workflowCount: workflows.length,
      feasibleCount: workflows.filter(w => w.verdict === 'FEASIBLE').length,
      conditionalCount: workflows.filter(w => w.verdict === 'CONDITIONAL').length,
      prunedCount: 0,
      triggerEdgeCount: workflows.length,
      enumeratedRouteCount: 1,
    },
  };
}

function validManifest(overrides: Partial<SubjectManifest> = {}): SubjectManifest {
  return {
    subjectName: 'test-subject',
    baseUrl: 'http://localhost:4200',
    accounts: [],
    routeParamValues: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Schema validation tests
// ---------------------------------------------------------------------------

describe('manifest-validator schema checks', () => {
  const simpleA2 = makeA2([makeWorkflow('W1')]);

  it('accepts a valid minimal manifest', () => {
    const result = validateManifest(validManifest(), simpleA2);
    expect(result.status).toBe('VALID');
    expect(result.issues).toHaveLength(0);
  });

  it('rejects missing subjectName', () => {
    const manifest = validManifest({ subjectName: '' });
    const result = validateManifest(manifest, simpleA2);
    expect(result.status).toBe('INVALID');
    expect(result.issues.some(i => i.message.includes('subjectName'))).toBe(true);
  });

  it('rejects missing baseUrl', () => {
    const manifest = validManifest({ baseUrl: '' });
    const result = validateManifest(manifest, simpleA2);
    expect(result.status).toBe('INVALID');
    expect(result.issues.some(i => i.message.includes('baseUrl'))).toBe(true);
  });

  it('validates account fields', () => {
    const manifest = validManifest({
      accounts: [
        { username: '', password: 'p', roles: [], guardSatisfies: [] },
      ],
    });
    const result = validateManifest(manifest, simpleA2);
    expect(result.status).toBe('INVALID');
    expect(result.issues.some(i => i.message.includes('accounts[0].username'))).toBe(true);
  });

  it('accepts valid routeParamOverrides', () => {
    const manifest = validManifest({
      routeParamOverrides: {
        '/owners/:id': { id: '1' },
        '/pets/:id/edit': { id: '2' },
      },
    });
    const result = validateManifest(manifest, makeA2([makeWorkflow('W1')]));
    expect(result.status).toBe('VALID');
    expect(result.issues).toHaveLength(0);
  });

  it('rejects routeParamOverrides when entry value is not a plain object', () => {
    const manifest = validManifest({
      routeParamOverrides: {
        '/owners/:id': 'not-an-object' as unknown as Record<string, string>,
      },
    });
    const result = validateManifest(manifest, makeA2([makeWorkflow('W1')]));
    expect(result.status).toBe('INVALID');
    expect(result.issues.some(i => i.message.includes('/owners/:id'))).toBe(true);
  });

  it('rejects routeParamOverrides when nested param value is not a string', () => {
    const manifest = validManifest({
      routeParamOverrides: {
        '/owners/:id': { id: 123 as unknown as string },
      },
    });
    const result = validateManifest(manifest, makeA2([makeWorkflow('W1')]));
    expect(result.status).toBe('INVALID');
    expect(result.issues.some(i => i.message.includes('"id"'))).toBe(true);
  });

  it('accepts valid authSetup', () => {
    const manifest = validManifest({
      authSetup: {
        loginRoute: '/login',
        usernameField: 'input[name="email"]',
        passwordField: 'input[name="password"]',
        submitButton: 'button[type="submit"]', authSuccessSelector: 'app-bar',
      },
    });
    const result = validateManifest(manifest, simpleA2);
    expect(result.status).toBe('VALID');
  });

  it('accepts valid executionConfig', () => {
    const manifest = validManifest({
      executionConfig: {
        readinessEndpoint: '/api/health',
        readinessTimeoutMs: 15000,
        seedDataNotes: ['Create owner with id=1'],
      },
    });
    const result = validateManifest(manifest, simpleA2);
    expect(result.status).toBe('VALID');
    expect(result.issues).toHaveLength(0);
  });

  it('accepts executionConfig with no optional fields', () => {
    const manifest = validManifest({ executionConfig: {} });
    const result = validateManifest(manifest, simpleA2);
    expect(result.status).toBe('VALID');
  });

  it('rejects executionConfig with invalid readinessEndpoint', () => {
    const manifest = validManifest({
      executionConfig: { readinessEndpoint: '' },
    });
    const result = validateManifest(manifest, simpleA2);
    expect(result.status).toBe('INVALID');
    expect(result.issues.some(i => i.message.includes('readinessEndpoint'))).toBe(true);
  });

  it('rejects executionConfig with non-positive readinessTimeoutMs', () => {
    const manifest = validManifest({
      executionConfig: { readinessTimeoutMs: 0 },
    });
    const result = validateManifest(manifest, simpleA2);
    expect(result.status).toBe('INVALID');
    expect(result.issues.some(i => i.message.includes('readinessTimeoutMs'))).toBe(true);
  });

  it('rejects executionConfig with non-array seedDataNotes', () => {
    const manifest = validManifest({
      executionConfig: { seedDataNotes: 'not an array' as any },
    });
    const result = validateManifest(manifest, simpleA2);
    expect(result.status).toBe('INVALID');
    expect(result.issues.some(i => i.message.includes('seedDataNotes'))).toBe(true);
  });

  it('rejects authSetup with missing fields', () => {
    const manifest = validManifest({
      authSetup: {
        loginRoute: '',
        usernameField: 'input',
        passwordField: 'input',
        submitButton: 'button', authSuccessSelector: 'app-bar',
      },
    });
    const result = validateManifest(manifest, simpleA2);
    expect(result.status).toBe('INVALID');
    expect(result.issues.some(i => i.message.includes('authSetup.loginRoute'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// A2 cross-check tests
// ---------------------------------------------------------------------------

describe('manifest-validator A2 cross-checks', () => {
  it('warns when guard has no satisfying account', () => {
    const a2 = makeA2([makeWorkflow('W1', { guards: ['AuthGuard'] })]);
    const manifest = validManifest();
    const result = validateManifest(manifest, a2);
    expect(result.status).toBe('VALID'); // warnings don't make it INVALID
    expect(result.issues.some(i =>
      i.severity === 'warning' && i.message.includes('AuthGuard'),
    )).toBe(true);
  });

  it('no warning when guard is satisfied by account', () => {
    const a2 = makeA2([makeWorkflow('W1', { guards: ['AuthGuard'] })]);
    const manifest = validManifest({
      accounts: [{ username: 'u', password: 'p', roles: [], guardSatisfies: ['AuthGuard'] }],
    });
    const result = validateManifest(manifest, a2);
    expect(result.issues.filter(i => i.message.includes('AuthGuard'))).toHaveLength(0);
  });

  it('warns when required param has no binding', () => {
    const a2 = makeA2([makeWorkflow('W1', { requiredParams: ['id'] })]);
    const manifest = validManifest();
    const result = validateManifest(manifest, a2);
    expect(result.issues.some(i =>
      i.severity === 'warning' && i.message.includes('"id"'),
    )).toBe(true);
  });

  it('no warning when param has binding', () => {
    const a2 = makeA2([makeWorkflow('W1', { requiredParams: ['id'] })]);
    const manifest = validManifest({ routeParamValues: { id: '42' } });
    const result = validateManifest(manifest, a2);
    expect(result.issues.filter(i => i.message.includes('"id"'))).toHaveLength(0);
  });

  it('warns when skipWorkflows references non-existent workflow', () => {
    const a2 = makeA2([makeWorkflow('W1')]);
    const manifest = validManifest({ skipWorkflows: ['W999'] });
    const result = validateManifest(manifest, a2);
    expect(result.issues.some(i =>
      i.severity === 'warning' && i.message.includes('W999'),
    )).toBe(true);
  });

  it('warns when formDataOverrides references non-existent workflow', () => {
    const a2 = makeA2([makeWorkflow('W1')]);
    const manifest = validManifest({ formDataOverrides: { 'W999': { field1: 'val' } } });
    const result = validateManifest(manifest, a2);
    expect(result.issues.some(i =>
      i.severity === 'warning' && i.message.includes('W999'),
    )).toBe(true);
  });

  it('warns when guards exist and accounts have guardSatisfies but no authSetup', () => {
    const a2 = makeA2([makeWorkflow('W1', { guards: ['AuthGuard'] })]);
    const manifest = validManifest({
      accounts: [{ username: 'u', password: 'p', roles: [], guardSatisfies: ['AuthGuard'] }],
    });
    const result = validateManifest(manifest, a2);
    expect(result.issues.some(i =>
      i.severity === 'warning' && i.message.includes('authSetup'),
    )).toBe(true);
  });

  it('no authSetup warning when authSetup is provided', () => {
    const a2 = makeA2([makeWorkflow('W1', { guards: ['AuthGuard'] })]);
    const manifest = validManifest({
      accounts: [{ username: 'u', password: 'p', roles: [], guardSatisfies: ['AuthGuard'] }],
      authSetup: {
        loginRoute: '/login',
        usernameField: 'input[name="email"]',
        passwordField: 'input[name="password"]',
        submitButton: 'button[type="submit"]', authSuccessSelector: 'app-bar',
      },
    });
    const result = validateManifest(manifest, a2);
    expect(result.issues.filter(i => i.message.includes('authSetup'))).toHaveLength(0);
  });

  it('no warning when param bound only by routeParamOverrides', () => {
    const a2 = makeA2([makeWorkflow('W1', { requiredParams: ['id'] })]);
    const manifest = validManifest({
      routeParamValues: {},
      routeParamOverrides: { '/owners/:id': { id: '1' } },
    });
    const result = validateManifest(manifest, a2);
    expect(result.issues.filter(i => i.message.includes('"id"'))).toHaveLength(0);
  });

  it('warns when param has no binding in routeParamValues or routeParamOverrides', () => {
    const a2 = makeA2([makeWorkflow('W1', { requiredParams: ['id'] })]);
    const manifest = validManifest({
      routeParamValues: {},
      routeParamOverrides: { '/owners/:id': { ownerId: '1' } }, // 'id' not covered
    });
    const result = validateManifest(manifest, a2);
    expect(result.issues.some(i =>
      i.severity === 'warning' && i.message.includes('"id"'),
    )).toBe(true);
  });

  it('reports correct accounts and paramBindings counts', () => {
    const a2 = makeA2([makeWorkflow('W1')]);
    const manifest = validManifest({
      accounts: [
        { username: 'u1', password: 'p1', roles: [], guardSatisfies: [] },
        { username: 'u2', password: 'p2', roles: ['admin'], guardSatisfies: ['AuthGuard'] },
      ],
      routeParamValues: { id: '1', name: 'test' },
    });
    const result = validateManifest(manifest, a2);
    expect(result.accounts).toBe(2);
    expect(result.paramBindings).toBe(2);
  });
});
