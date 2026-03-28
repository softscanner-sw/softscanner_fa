/**
 * manifest-validator.ts
 * Validates a SubjectManifest against its schema and cross-checks
 * against the A2WorkflowSet artifact.
 *
 * Phase isolation: imports only manifest-schema and A2 model types.
 * No AST, parsers, analyzers, builders, or orchestrator access.
 */

import type { A2WorkflowSet } from '../../models/workflow.js';
import type { SubjectManifest } from './manifest-schema.js';

// ---------------------------------------------------------------------------
// Validation result types
// ---------------------------------------------------------------------------

export interface ValidationIssue {
  severity: 'error' | 'warning';
  message: string;
}

export interface ManifestValidationResult {
  subject: string;
  status: 'VALID' | 'INVALID';
  issues: ValidationIssue[];
  accounts: number;
  paramBindings: number;
}

// ---------------------------------------------------------------------------
// Schema validation (manifest structure only, no A2 cross-check)
// ---------------------------------------------------------------------------

function validateSchema(manifest: SubjectManifest, expectedSubjectName?: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Required fields (spec: subjectName, baseUrl, accounts, routeParamValues)
  if (typeof manifest.subjectName !== 'string' || manifest.subjectName.length === 0) {
    issues.push({ severity: 'error', message: 'subjectName is required and must be a non-empty string.' });
  } else if (expectedSubjectName !== undefined && manifest.subjectName !== expectedSubjectName) {
    issues.push({
      severity: 'error',
      message: `subjectName "${manifest.subjectName}" does not match expected directory name "${expectedSubjectName}". Check the manifest is in the correct subjects/ subdirectory.`,
    });
  }
  if (typeof manifest.baseUrl !== 'string' || manifest.baseUrl.length === 0) {
    issues.push({ severity: 'error', message: 'baseUrl is required and must be a non-empty string.' });
  }

  // accounts array
  if (!Array.isArray(manifest.accounts)) {
    issues.push({ severity: 'error', message: 'accounts must be an array.' });
  } else {
    for (let i = 0; i < manifest.accounts.length; i++) {
      const acct = manifest.accounts[i]!;
      if (typeof acct.username !== 'string' || acct.username.length === 0) {
        issues.push({ severity: 'error', message: `accounts[${i}].username is required.` });
      }
      if (typeof acct.password !== 'string') {
        issues.push({ severity: 'error', message: `accounts[${i}].password is required.` });
      }
      if (!Array.isArray(acct.roles)) {
        issues.push({ severity: 'error', message: `accounts[${i}].roles must be an array.` });
      }
      if (!Array.isArray(acct.guardSatisfies)) {
        issues.push({ severity: 'error', message: `accounts[${i}].guardSatisfies must be an array.` });
      }
    }
  }

  // routeParamValues
  if (manifest.routeParamValues === undefined || manifest.routeParamValues === null || typeof manifest.routeParamValues !== 'object' || Array.isArray(manifest.routeParamValues)) {
    issues.push({ severity: 'error', message: 'routeParamValues must be a plain object (Record<string, string>).' });
  }

  // routeParamOverrides (optional)
  if (manifest.routeParamOverrides !== undefined) {
    if (typeof manifest.routeParamOverrides !== 'object' || manifest.routeParamOverrides === null || Array.isArray(manifest.routeParamOverrides)) {
      issues.push({ severity: 'error', message: 'routeParamOverrides must be a plain object (Record<string, Record<string, string>>).' });
    } else {
      for (const [template, params] of Object.entries(manifest.routeParamOverrides)) {
        if (typeof params !== 'object' || params === null || Array.isArray(params)) {
          issues.push({ severity: 'error', message: `routeParamOverrides["${template}"] must be a plain object.` });
        } else {
          for (const [pName, pVal] of Object.entries(params)) {
            if (typeof pVal !== 'string') {
              issues.push({ severity: 'error', message: `routeParamOverrides["${template}"]["${pName}"] must be a string.` });
            }
          }
        }
      }
    }
  }

  // skipWorkflows (optional)
  if (manifest.skipWorkflows !== undefined && !Array.isArray(manifest.skipWorkflows)) {
    issues.push({ severity: 'error', message: 'skipWorkflows must be an array of workflow ID strings.' });
  }

  // formDataOverrides (optional)
  if (manifest.formDataOverrides !== undefined) {
    if (typeof manifest.formDataOverrides !== 'object' || manifest.formDataOverrides === null || Array.isArray(manifest.formDataOverrides)) {
      issues.push({ severity: 'error', message: 'formDataOverrides must be a plain object.' });
    }
  }

  // executionConfig (optional, validated if present — consumed only by B3)
  if (manifest.executionConfig !== undefined) {
    if (typeof manifest.executionConfig !== 'object' || manifest.executionConfig === null || Array.isArray(manifest.executionConfig)) {
      issues.push({ severity: 'error', message: 'executionConfig must be a plain object.' });
    } else {
      if (manifest.executionConfig.readinessEndpoint !== undefined) {
        if (typeof manifest.executionConfig.readinessEndpoint !== 'string' || manifest.executionConfig.readinessEndpoint.length === 0) {
          issues.push({ severity: 'error', message: 'executionConfig.readinessEndpoint must be a non-empty string.' });
        }
      }
      if (manifest.executionConfig.readinessTimeoutMs !== undefined) {
        if (typeof manifest.executionConfig.readinessTimeoutMs !== 'number' || manifest.executionConfig.readinessTimeoutMs <= 0) {
          issues.push({ severity: 'error', message: 'executionConfig.readinessTimeoutMs must be a positive number.' });
        }
      }
      if (manifest.executionConfig.seedDataNotes !== undefined) {
        if (!Array.isArray(manifest.executionConfig.seedDataNotes)) {
          issues.push({ severity: 'error', message: 'executionConfig.seedDataNotes must be an array of strings.' });
        } else {
          for (let i = 0; i < manifest.executionConfig.seedDataNotes.length; i++) {
            if (typeof manifest.executionConfig.seedDataNotes[i] !== 'string') {
              issues.push({ severity: 'error', message: `executionConfig.seedDataNotes[${i}] must be a string.` });
            }
          }
        }
      }
    }
  }

  // authSetup (optional, but validated if present)
  if (manifest.authSetup !== undefined) {
    if (typeof manifest.authSetup !== 'object' || manifest.authSetup === null || Array.isArray(manifest.authSetup)) {
      issues.push({ severity: 'error', message: 'authSetup must be a plain object.' });
    } else {
      if (typeof manifest.authSetup.loginRoute !== 'string' || manifest.authSetup.loginRoute.length === 0) {
        issues.push({ severity: 'error', message: 'authSetup.loginRoute is required and must be a non-empty string.' });
      }
      if (typeof manifest.authSetup.usernameField !== 'string' || manifest.authSetup.usernameField.length === 0) {
        issues.push({ severity: 'error', message: 'authSetup.usernameField is required and must be a non-empty string.' });
      }
      if (typeof manifest.authSetup.passwordField !== 'string' || manifest.authSetup.passwordField.length === 0) {
        issues.push({ severity: 'error', message: 'authSetup.passwordField is required and must be a non-empty string.' });
      }
      if (typeof manifest.authSetup.submitButton !== 'string' || manifest.authSetup.submitButton.length === 0) {
        issues.push({ severity: 'error', message: 'authSetup.submitButton is required and must be a non-empty string.' });
      }
      if (typeof manifest.authSetup.authSuccessSelector !== 'string' || manifest.authSetup.authSuccessSelector.length === 0) {
        issues.push({ severity: 'error', message: 'authSetup.authSuccessSelector is required: a CSS selector for an element present only after successful login.' });
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Cross-check against A2WorkflowSet
// ---------------------------------------------------------------------------

function crossCheckA2(manifest: SubjectManifest, a2: A2WorkflowSet): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Collect all required guards across workflows
  const allGuards = new Set<string>();
  // Collect all required params across workflows
  const allParams = new Set<string>();
  // Collect workflow IDs for skip validation
  const workflowIds = new Set<string>();

  for (const wf of a2.workflows) {
    workflowIds.add(wf.id);

    // Guards from explanation
    if (wf.explanation.requiredGuards) {
      for (const g of wf.explanation.requiredGuards) {
        allGuards.add(g);
      }
    }

    // Guards from constraint surface
    for (const g of wf.cw.guards) {
      allGuards.add(g);
    }

    // Required params from constraint surface
    for (const p of wf.cw.requiredParams) {
      allParams.add(p);
    }
  }

  // Check that authSetup is present when guards require authentication
  const hasGuardSatisfyingAccounts = Array.isArray(manifest.accounts) &&
    manifest.accounts.some(a => Array.isArray(a.guardSatisfies) && a.guardSatisfies.length > 0);
  if (allGuards.size > 0 && hasGuardSatisfyingAccounts && !manifest.authSetup) {
    issues.push({
      severity: 'warning',
      message: 'Workflows require guards and accounts declare guardSatisfies, but no authSetup is provided. B1/B2 will not know how to authenticate.',
    });
  }

  // Check that every guard referenced by workflows has at least one account satisfying it
  if (allGuards.size > 0 && Array.isArray(manifest.accounts)) {
    const satisfiedGuards = new Set<string>();
    for (const acct of manifest.accounts) {
      if (Array.isArray(acct.guardSatisfies)) {
        for (const g of acct.guardSatisfies) {
          satisfiedGuards.add(g);
        }
      }
    }
    for (const guard of [...allGuards].sort()) {
      if (!satisfiedGuards.has(guard)) {
        issues.push({
          severity: 'warning',
          message: `Guard "${guard}" is required by workflows but no account in manifest satisfies it.`,
        });
      }
    }
  }

  // Check that every required param has a binding in routeParamValues or routeParamOverrides.
  // A param is bound when it appears in routeParamValues (global) OR in at least one
  // routeParamOverrides entry (per-template). Either is sufficient.
  if (allParams.size > 0 && manifest.routeParamValues) {
    const overrideParams = new Set<string>();
    if (manifest.routeParamOverrides) {
      for (const params of Object.values(manifest.routeParamOverrides)) {
        for (const p of Object.keys(params)) overrideParams.add(p);
      }
    }
    for (const param of [...allParams].sort()) {
      const inGlobal = param in manifest.routeParamValues;
      const inOverrides = overrideParams.has(param);
      if (!inGlobal && !inOverrides) {
        issues.push({
          severity: 'warning',
          message: `Route param "${param}" is required by workflows but has no binding in routeParamValues or routeParamOverrides.`,
        });
      }
    }
  }

  // Check skipWorkflows references exist
  if (Array.isArray(manifest.skipWorkflows)) {
    for (const skipId of manifest.skipWorkflows) {
      if (!workflowIds.has(skipId)) {
        issues.push({
          severity: 'warning',
          message: `skipWorkflows references workflow "${skipId}" which does not exist in A2 output.`,
        });
      }
    }
  }

  // Check formDataOverrides reference valid workflow IDs
  if (manifest.formDataOverrides) {
    for (const wfId of Object.keys(manifest.formDataOverrides).sort()) {
      if (!workflowIds.has(wfId)) {
        issues.push({
          severity: 'warning',
          message: `formDataOverrides references workflow "${wfId}" which does not exist in A2 output.`,
        });
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate a SubjectManifest:
 * 1. Schema validation (required fields, types, value ranges)
 * 2. Cross-check against A2WorkflowSet (guards, params, workflow IDs)
 */
export function validateManifest(
  manifest: SubjectManifest,
  a2: A2WorkflowSet,
  expectedSubjectName?: string,
): ManifestValidationResult {
  const schemaIssues = validateSchema(manifest, expectedSubjectName);
  const crossIssues = crossCheckA2(manifest, a2);
  const allIssues = [...schemaIssues, ...crossIssues];

  const hasError = allIssues.some((i) => i.severity === 'error');

  return {
    subject: manifest.subjectName ?? '(unknown)',
    status: hasError ? 'INVALID' : 'VALID',
    issues: allIssues,
    accounts: Array.isArray(manifest.accounts) ? manifest.accounts.length : 0,
    paramBindings: manifest.routeParamValues ? Object.keys(manifest.routeParamValues).length : 0,
  };
}
