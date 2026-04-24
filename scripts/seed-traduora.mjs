/**
 * Deterministic seeding for ever-traduora.
 * Provisions a rich benchmark state: accounts, project, locales, terms,
 * translations, labels, team member, and API client.
 *
 * Idempotent: uses find-or-create patterns for all entities.
 * Does NOT create new projects on re-run — reuses existing by name.
 *
 * IMPORTANT: Run ONCE before B1/B2 generation. The B3 manifest should NOT
 * have a seedCommand that re-invokes this (to prevent projectId drift).
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
const FIXED_PROJECT_ID = 'fa000000-0000-4000-a000-000000000001';

const LOCALES = ['en', 'fr', 'de'];
const TERMS = [
  'hello.world', 'app.title', 'app.description', 'nav.home', 'nav.settings',
  'btn.save', 'btn.cancel', 'btn.delete', 'label.name', 'label.email',
];
const LABELS = ['frontend', 'backend'];
const TRANSLATIONS = {
  en: { 'hello.world': 'Hello World', 'app.title': 'My App', 'app.description': 'Description',
    'nav.home': 'Home', 'nav.settings': 'Settings', 'btn.save': 'Save', 'btn.cancel': 'Cancel',
    'btn.delete': 'Delete', 'label.name': 'Name', 'label.email': 'Email' },
  fr: { 'hello.world': 'Bonjour le monde', 'app.title': 'Mon App', 'app.description': 'Description',
    'nav.home': 'Accueil', 'nav.settings': 'Paramètres', 'btn.save': 'Enregistrer', 'btn.cancel': 'Annuler',
    'btn.delete': 'Supprimer', 'label.name': 'Nom', 'label.email': 'Courriel' },
  de: { 'hello.world': 'Hallo Welt', 'app.title': 'Meine App', 'app.description': 'Beschreibung',
    'nav.home': 'Startseite', 'nav.settings': 'Einstellungen', 'btn.save': 'Speichern', 'btn.cancel': 'Abbrechen',
    'btn.delete': 'Löschen', 'label.name': 'Name', 'label.email': 'E-Mail' },
};

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

function request(method, urlStr, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const payload = body ? JSON.stringify(body) : undefined;
    const opts = {
      hostname: url.hostname, port: url.port,
      path: url.pathname + url.search, method,
      headers: { 'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...headers },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function authRequest(method, urlStr, body, token) {
  return request(method, urlStr, body, { Authorization: `Bearer ${token}` });
}

// ---------------------------------------------------------------------------
// Wait for API
// ---------------------------------------------------------------------------

async function waitForApi(maxAttempts = 30, delayMs = 2000) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await request('GET', 'http://localhost:8080/health');
      if (res.status === 200) { console.log('API ready.'); return; }
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error('API did not become ready');
}

// ---------------------------------------------------------------------------
// Seed functions
// ---------------------------------------------------------------------------

async function createUser(email, password, name) {
  const res = await request('POST', `${API}/auth/signup`, { name, email, password });
  if (res.status === 200 || res.status === 201) console.log(`  Created user: ${email}`);
  else if (res.status === 400 || res.status === 409) console.log(`  User exists: ${email}`);
  else console.error(`  Unexpected signup (${res.status}):`, res.body);
}

async function getToken(email, password) {
  const res = await request('POST', `${API}/auth/token`, {
    grant_type: 'password', username: email, password });
  if (res.status === 200 && res.body.access_token) return res.body.access_token;
  throw new Error(`Token failed (${res.status}): ${JSON.stringify(res.body)}`);
}

async function findOrCreateProject(token, projectName) {
  const listRes = await authRequest('GET', `${API}/projects`, undefined, token);
  if (listRes.status === 200 && Array.isArray(listRes.body.data)) {
    const existing = listRes.body.data.find((p) => p.name === projectName);
    if (existing) { console.log(`  Project exists: ${existing.id}`); return existing.id; }
  }
  const createRes = await authRequest('POST', `${API}/projects`,
    { name: projectName, description: 'Benchmark project' }, token);
  if (createRes.status === 201 && createRes.body.data?.id) {
    console.log(`  Created project: ${createRes.body.data.id}`);
    return createRes.body.data.id;
  }
  throw new Error(`Project creation failed (${createRes.status})`);
}

async function addLocale(token, projectId, code) {
  const res = await authRequest('POST', `${API}/projects/${projectId}/translations`,
    { code }, token);
  if (res.status === 201) console.log(`  Added locale: ${code}`);
  else console.log(`  Locale ${code}: exists or error (${res.status})`);
}

async function addTerm(token, projectId, value) {
  const res = await authRequest('POST', `${API}/projects/${projectId}/terms`,
    { value }, token);
  return res.status === 201 ? 'created' : 'exists';
}

async function getTerms(token, projectId) {
  const res = await authRequest('GET', `${API}/projects/${projectId}/terms`, undefined, token);
  return res.body?.data ?? [];
}

async function addTranslation(token, projectId, termId, localeCode, value) {
  await authRequest('PATCH', `${API}/projects/${projectId}/translations/${localeCode}`,
    { termId, value }, token);
}

async function addLabel(token, projectId, value, color) {
  const res = await authRequest('POST', `${API}/projects/${projectId}/labels`,
    { value, color }, token);
  if (res.status === 201) return res.body?.data?.id;
  // May already exist
  const listRes = await authRequest('GET', `${API}/projects/${projectId}/labels`, undefined, token);
  const existing = (listRes.body?.data ?? []).find(l => l.value === value);
  return existing?.id;
}

async function assignTermToLabel(token, projectId, labelId, termId) {
  await authRequest('POST', `${API}/projects/${projectId}/labels/${labelId}/terms/${termId}`,
    undefined, token);
}

async function addProjectMember(token, projectId, userEmail, role) {
  const res = await authRequest('POST', `${API}/projects/${projectId}/invites`,
    { email: userEmail, role }, token);
  if (res.status === 201) console.log(`  Invited ${userEmail} as ${role}`);
  else console.log(`  Member invite ${userEmail}: ${res.status} (may already exist)`);
}

async function addApiClient(token, projectId) {
  const clientsRes = await authRequest('GET', `${API}/projects/${projectId}/clients`, undefined, token);
  if ((clientsRes.body?.data ?? []).length > 0) {
    console.log(`  API client: exists`); return;
  }
  const res = await authRequest('POST', `${API}/projects/${projectId}/clients`,
    { name: 'test-client', role: 'viewer' }, token);
  console.log(`  API client: ${res.status === 201 ? 'created' : 'failed (' + res.status + ')'}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Ever-Traduora Rich Benchmark Seeding ===\n');
  await waitForApi();

  // 1. Accounts
  console.log('1. Creating accounts...');
  await createUser(ADMIN_EMAIL, ADMIN_PASS, 'Admin');
  await createUser(USER_EMAIL, USER_PASS, 'User');

  // 2. Auth
  console.log('\n2. Authenticating admin...');
  const token = await getToken(ADMIN_EMAIL, ADMIN_PASS);
  console.log(`  Token: ${token.slice(0, 20)}...`);

  // 3. Project (find-or-create via API)
  console.log('\n3. Finding or creating project...');
  const projectId = await findOrCreateProject(token, PROJECT_NAME);

  // 4. Locales
  console.log('\n4. Adding locales...');
  for (const locale of LOCALES) await addLocale(token, projectId, locale);

  // 5. Terms
  console.log('\n5. Adding terms...');
  let created = 0, existing = 0;
  for (const term of TERMS) {
    const r = await addTerm(token, projectId, term);
    if (r === 'created') created++; else existing++;
  }
  console.log(`  ${created} created, ${existing} already exist`);

  // 6. Translations (for each term × locale)
  console.log('\n6. Adding translations...');
  const terms = await getTerms(token, projectId);
  const termIdByValue = new Map();
  for (const t of terms) termIdByValue.set(t.value, t.id);
  let txCount = 0;
  for (const locale of LOCALES) {
    const txMap = TRANSLATIONS[locale] ?? {};
    for (const [termValue, txValue] of Object.entries(txMap)) {
      const termId = termIdByValue.get(termValue);
      if (termId) { await addTranslation(token, projectId, termId, locale, txValue); txCount++; }
    }
  }
  console.log(`  ${txCount} translations set`);

  // 7. Labels
  console.log('\n7. Adding labels...');
  const labelIds = [];
  for (const label of LABELS) {
    const color = label === 'frontend' ? '#00BCD4' : '#FF5722';
    const id = await addLabel(token, projectId, label, color);
    if (id) { labelIds.push(id); console.log(`  Label "${label}": ${id}`); }
  }

  // 8. Assign first 3 terms to first label, next 3 to second
  if (labelIds.length >= 2 && terms.length >= 6) {
    console.log('\n8. Assigning terms to labels...');
    for (let i = 0; i < 3 && i < terms.length; i++)
      await assignTermToLabel(token, projectId, labelIds[0], terms[i].id);
    for (let i = 3; i < 6 && i < terms.length; i++)
      await assignTermToLabel(token, projectId, labelIds[1], terms[i].id);
    console.log('  6 term-label assignments done');
  }

  // 9. Team member
  console.log('\n9. Adding team member...');
  await addProjectMember(token, projectId, USER_EMAIL, 'admin');

  // 10. API client
  console.log('\n10. Adding API client...');
  await addApiClient(token, projectId);

  // 11. Reset login lockout
  console.log('\n11. Resetting login lockout counters...');
  const { execSync } = await import('node:child_process');
  try {
    execSync('docker exec mysqldb mysql -u tr -pchange_me tr_dev -e "UPDATE user SET loginAttempts = 0, lastLogin = NULL;"',
      { stdio: 'pipe' });
    console.log('  loginAttempts reset');
  } catch { console.log('  WARNING: could not reset loginAttempts'); }

  // 12. Write outputs
  const seedOutput = { projectId, localeCode: 'en' };
  const seedOutputPath = path.join(ROOT, 'subjects', 'ever-traduora', '.seed-output.json');
  fs.writeFileSync(seedOutputPath, JSON.stringify(seedOutput, null, 2) + '\n');
  console.log(`\n12. Seed output: ${seedOutputPath}`);

  // Only update manifest projectId on FIRST run (when it contains a placeholder
  // or when explicitly invoked with --update-manifest). Otherwise leave it stable
  // to prevent plan-manifest drift during B3 reruns.
  const manifestPath = path.join(ROOT, 'subjects', 'ever-traduora', 'subject-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const currentManifestId = manifest.routeParamValues?.projectId ?? '';
  const forceUpdate = process.argv.includes('--update-manifest');
  if (forceUpdate || currentManifestId.includes('PLACEHOLDER') || currentManifestId === '') {
    manifest.routeParamValues.projectId = projectId;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`13. Manifest updated: projectId=${projectId}`);
  } else if (currentManifestId !== projectId) {
    console.log(`13. Manifest projectId KEPT at ${currentManifestId} (seed created ${projectId}; pass --update-manifest to override)`);
  } else {
    console.log(`13. Manifest projectId already correct: ${projectId}`);
  }

  // Summary
  console.log('\n=== Seeding complete ===');
  console.log(`   projectId:  ${projectId}`);
  console.log(`   locales:    ${LOCALES.join(', ')}`);
  console.log(`   terms:      ${TERMS.length}`);
  console.log(`   translations: ${txCount}`);
  console.log(`   labels:     ${LABELS.length}`);
  console.log(`   admin:      ${ADMIN_EMAIL} / ${ADMIN_PASS}`);
  console.log(`   user:       ${USER_EMAIL} / ${USER_PASS}`);
}

main().catch((err) => { console.error('Seed failed:', err.message); process.exit(1); });
