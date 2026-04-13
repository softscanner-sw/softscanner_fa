/**
 * Deterministic seeding for ever-traduora.
 * Idempotent: safe to run multiple times.
 *
 * Creates:
 *   - admin account (admin@test.com / Test1234!)
 *   - regular user (user@test.com / Test1234!)
 *   - project "Test Project"
 *   - English locale on the project
 *
 * Outputs:
 *   - subjects/ever-traduora/.seed-output.json
 *   - Updates subjects/ever-traduora/subject-manifest.json with real projectId
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const API = 'http://localhost:8080/api/v1';
const ADMIN_EMAIL = 'admin@test.com';
const ADMIN_PASS = 'Test1234!';
const USER_EMAIL = 'user@test.com';
const USER_PASS = 'Test1234!';
const PROJECT_NAME = 'Test Project';
const LOCALE_CODE = 'en';

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

function request(method, urlStr, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const payload = body ? JSON.stringify(body) : undefined;
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Wait for API
// ---------------------------------------------------------------------------

async function waitForApi(maxAttempts = 30, delayMs = 2000) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await request('GET', 'http://localhost:8080/health');
      if (res.status === 200) {
        console.log('API ready.');
        return;
      }
    } catch { /* retry */ }
    console.log(`Waiting for API... (${i + 1}/${maxAttempts})`);
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error('API did not become ready');
}

// ---------------------------------------------------------------------------
// Seed functions
// ---------------------------------------------------------------------------

async function createUser(email, password, name) {
  const res = await request('POST', `${API}/auth/signup`, { name, email, password });
  if (res.status === 200 || res.status === 201) {
    console.log(`  Created user: ${email}`);
  } else if (res.status === 400 || res.status === 409) {
    console.log(`  User exists: ${email} (idempotent)`);
  } else {
    console.error(`  Unexpected signup response (${res.status}):`, res.body);
  }
}

async function getToken(email, password) {
  const res = await request('POST', `${API}/auth/token`, {
    grant_type: 'password',
    username: email,
    password,
  });
  if (res.status === 200 && res.body.access_token) {
    return res.body.access_token;
  }
  throw new Error(`Token request failed (${res.status}): ${JSON.stringify(res.body)}`);
}

async function findOrCreateProject(token, projectName) {
  // List existing projects
  const listRes = await request('GET', `${API}/projects`, undefined, {
    Authorization: `Bearer ${token}`,
  });
  if (listRes.status === 200 && Array.isArray(listRes.body.data)) {
    const existing = listRes.body.data.find((p) => p.name === projectName);
    if (existing) {
      console.log(`  Project exists: ${existing.id} (${projectName})`);
      return existing.id;
    }
  }

  // Create new
  const createRes = await request(
    'POST',
    `${API}/projects`,
    { name: projectName, description: 'Seeded for Phase B' },
    { Authorization: `Bearer ${token}` },
  );
  if (createRes.status === 201 && createRes.body.data?.id) {
    console.log(`  Created project: ${createRes.body.data.id} (${projectName})`);
    return createRes.body.data.id;
  }
  throw new Error(`Project creation failed (${createRes.status}): ${JSON.stringify(createRes.body)}`);
}

async function addLocale(token, projectId, localeCode) {
  const res = await request(
    'POST',
    `${API}/projects/${projectId}/translations`,
    { code: localeCode },
    { Authorization: `Bearer ${token}` },
  );
  if (res.status === 201) {
    console.log(`  Added locale: ${localeCode}`);
  } else if (res.status === 400 || res.status === 409) {
    console.log(`  Locale exists: ${localeCode} (idempotent)`);
  } else {
    console.error(`  Unexpected locale response (${res.status}):`, res.body);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Ever-Traduora Deterministic Seeding ===\n');

  await waitForApi();

  console.log('\n1. Creating accounts...');
  await createUser(ADMIN_EMAIL, ADMIN_PASS, 'Admin');
  await createUser(USER_EMAIL, USER_PASS, 'User');

  console.log('\n2. Authenticating admin...');
  const token = await getToken(ADMIN_EMAIL, ADMIN_PASS);
  console.log(`  Token: ${token.slice(0, 20)}...`);

  console.log('\n3. Finding or creating project...');
  const projectId = await findOrCreateProject(token, PROJECT_NAME);

  console.log('\n4. Adding locale...');
  await addLocale(token, projectId, LOCALE_CODE);

  console.log('\n5. Seeding terms and API clients (for data-dependent tests)...');
  // Add a term (idempotent: 409 if value already exists)
  const termRes = await request('POST', `${API}/projects/${projectId}/terms`,
    { value: 'hello.world' }, { Authorization: `Bearer ${token}` });
  console.log(`  Term: ${termRes.status === 201 ? 'created' : 'exists (idempotent)'}`);

  // Add a second term for list rendering
  const term2Res = await request('POST', `${API}/projects/${projectId}/terms`,
    { value: 'app.title' }, { Authorization: `Bearer ${token}` });
  console.log(`  Term 2: ${term2Res.status === 201 ? 'created' : 'exists (idempotent)'}`);

  // Add an API client (idempotent by checking existing)
  const clientsRes = await request('GET', `${API}/projects/${projectId}/clients`, undefined,
    { Authorization: `Bearer ${token}` });
  const existingClients = clientsRes.body?.data ?? [];
  if (existingClients.length === 0) {
    const clientRes = await request('POST', `${API}/projects/${projectId}/clients`,
      { name: 'test-client', role: 'viewer' }, { Authorization: `Bearer ${token}` });
    console.log(`  API client: ${clientRes.status === 201 ? 'created' : 'failed (' + clientRes.status + ')'}`);
  } else {
    console.log(`  API client: exists (${existingClients.length} client(s))`);
  }

  console.log('\n6. Resetting login lockout counters...');
  // Reset loginAttempts via direct MySQL to prevent B3 retry cascade lockout.
  // The traduora API has a hardcoded 3-attempt lockout with no env override.
  const { execSync } = await import('node:child_process');
  try {
    execSync('docker exec mysqldb mysql -u tr -pchange_me tr_dev -e "UPDATE user SET loginAttempts = 0, lastLogin = NULL;"',
      { stdio: 'pipe' });
    console.log('  loginAttempts reset for all users');
  } catch (e) {
    console.log('  WARNING: could not reset loginAttempts (docker exec failed)');
  }

  // Write seed output
  const seedOutput = { projectId, localeCode: LOCALE_CODE };
  const seedOutputPath = path.join(ROOT, 'subjects', 'ever-traduora', '.seed-output.json');
  fs.writeFileSync(seedOutputPath, JSON.stringify(seedOutput, null, 2) + '\n');
  console.log(`\n7. Seed output written to: ${seedOutputPath}`);

  // Update manifest
  const manifestPath = path.join(ROOT, 'subjects', 'ever-traduora', 'subject-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.routeParamValues.projectId = projectId;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`8. Manifest updated: projectId=${projectId}`);

  console.log('\n=== Seeding complete ===');
  console.log(`   projectId:  ${projectId}`);
  console.log(`   localeCode: ${LOCALE_CODE}`);
  console.log(`   admin:      ${ADMIN_EMAIL} / ${ADMIN_PASS}`);
  console.log(`   user:       ${USER_EMAIL} / ${USER_PASS}`);
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
