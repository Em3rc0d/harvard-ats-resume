import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const BASE = 'https://harvard-ats-resume.vercel.app';
const EXPECTED_SHA = 'a44ec836235b3f3e54e74ae05068d2bfd49d3998';
const ARTIFACTS = process.env.CERT_ARTIFACT_DIR || 'artifacts/production-certification';
const CORE_EMAIL = 'cvengine-cert-a44ec836@invalid.example';
const CORE_PASSWORD = 'CVEngine-Cert-a44ec836-2026!';
const AI_EMAIL = 'cvengine-cert-ai-a44ec836@invalid.example';
const AI_PASSWORD = 'CVEngine-Cert-AI-a44ec836-2026!';

fs.mkdirSync(ARTIFACTS, { recursive: true });

function attachGuards(page, name) {
  const fiveHundreds = [];
  const pageErrors = [];
  page.on('response', (response) => {
    if (response.url().startsWith(BASE) && response.status() >= 500) {
      fiveHundreds.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('dialog', (dialog) => void dialog.accept());
  return {
    assertClean() {
      assert.deepEqual(fiveHundreds, [], `${name}: production 5xx responses: ${fiveHundreds.join('\n')}`);
      assert.deepEqual(pageErrors, [], `${name}: page errors: ${pageErrors.join('\n')}`);
    },
  };
}

async function assertProductionIdentity(page) {
  const response = await page.request.get(`${BASE}/api/runtime`);
  assert.equal(response.status(), 200, 'Production runtime endpoint must be healthy');
  const runtime = await response.json();
  assert.equal(runtime.service, 'cvengine');
  assert.equal(runtime.releaseContract, 'b8-release-hardening-v1');
  assert.equal(runtime.gitCommitSha, EXPECTED_SHA, 'Browser certification must hit the exact release SHA');
  assert.equal(runtime.environment, 'production');
  assert.equal(runtime.exactHeadObservable, true);
  assert.equal(runtime.supabaseConfigured, true);
  assert.equal(runtime.platformGeminiConfigured, true);
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(ARTIFACTS, `${name}.png`), fullPage: true });
}

async function signInThroughFirstRun(page, email, password, aiTitle) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Your career evidence stays separate from AI suggestions.' }).waitFor({ timeout: 30000 });
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Acknowledge and continue' }).click();
  await page.getByRole('heading', { name: 'Sign in' }).waitFor({ timeout: 30000 });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('heading', { name: 'Choose how CV Engine may use AI' }).waitFor({ timeout: 30000 });
  await page.getByRole('radio', { name: new RegExp(aiTitle, 'i') }).click();
  await page.getByRole('button', { name: 'Continue to CV Engine' }).click();
  await page.getByRole('button', { name: 'Career Evidence', exact: true }).waitFor({ timeout: 30000 });
}

async function createVerifiedEvidence(page, text) {
  const save = page.getByRole('button', { name: 'Save Career Evidence' });
  assert.equal(await save.isDisabled(), true, 'Evidence save must be disabled before explicit kind/text');
  await page.getByLabel('Evidence type').selectOption('PROJECT');
  await page.getByLabel('Evidence statement').fill(text);
  await page.getByLabel('I can defend this statement as true.').check();
  await save.click();
  await page.getByText(text, { exact: true }).waitFor({ timeout: 30000 });
}

async function exerciseImport(page) {
  await page.getByRole('button', { name: 'Resume Import', exact: true }).click();
  await page.getByLabel('Resume file').setInputFiles('/tmp/cvengine-cert.docx');
  await page.getByRole('button', { name: 'Extract review proposals' }).click();
  await page.getByRole('heading', { name: 'cvengine-cert.docx' }).waitFor({ timeout: 30000 });
  const proposalKind = page.getByRole('combobox', { name: /Evidence kind for proposal/ }).first();
  await proposalKind.selectOption('PROJECT');
  await page.getByRole('button', { name: 'Accept as NEEDS_REVIEW' }).first().click();
  await page.getByText(/Created Career Evidence/).first().waitFor({ timeout: 30000 });
  assert.match(await page.locator('body').innerText(), /raw source not persisted/i);
  await screenshot(page, '02-import-reviewed');
}

async function createTarget(page) {
  await page.getByRole('button', { name: 'Career Target', exact: true }).click();
  assert.equal(await page.getByLabel('Preferred seniority').inputValue(), '', 'Seniority must start unspecified');
  assert.equal(await page.getByLabel('Work model').inputValue(), '', 'Work model must start unspecified');
  assert.equal(await page.getByLabel('Employment type').inputValue(), '', 'Employment type must start unspecified');
  await page.getByLabel('Target role').fill('Backend Engineer');
  await page.getByLabel('Job family').fill('Software Engineering');
  await page.getByLabel('Preferred locations').fill('Lima');
  await page.getByLabel('Industries').fill('SaaS');
  await page.getByRole('button', { name: 'Save and activate target' }).click();
  await page.getByText('Active intent', { exact: true }).waitFor({ timeout: 30000 });
}

async function createJob(page, company = 'CVEngine Certification') {
  await page.getByRole('button', { name: 'Job Truth', exact: true }).click();
  await page.getByLabel('Role title').fill('Backend Engineer');
  await page.getByLabel('Company').fill(company);
  await page.getByLabel('Job Description').fill([
    'Requirements:',
    '- TypeScript is required.',
    '- PostgreSQL is required.',
    'Preferred:',
    '- Docker is a plus.',
  ].join('\n'));
  await page.getByRole('button', { name: 'Capture immutable Job Snapshot' }).click();
  await page.getByRole('heading', { name: 'Backend Engineer' }).last().waitFor({ timeout: 30000 });
  const body = await page.locator('body').innerText();
  assert.match(body, /TypeScript is required/i);
}

async function createAssessment(page, expectNoCloud) {
  await page.getByRole('button', { name: 'Assessment', exact: true }).click();
  const button = page.getByRole('button', { name: 'Create evidence assessment' });
  assert.equal(await button.isDisabled(), true, 'Assessment must require an explicit Job Snapshot');
  const select = page.getByLabel('Job Snapshot');
  await select.selectOption({ label: /Backend Engineer/ });
  await button.click();
  await page.getByRole('heading', { name: 'Backend Engineer' }).last().waitFor({ timeout: 30000 });
  if (expectNoCloud) {
    const aiButton = page.getByRole('button', { name: 'AI explanation unavailable in this mode' }).first();
    await aiButton.waitFor({ timeout: 30000 });
    assert.equal(await aiButton.isDisabled(), true, 'No-cloud mode must not offer cloud AI execution');
  }
}

async function exerciseOpportunitySpace(page) {
  await page.getByRole('button', { name: 'Opportunity Space', exact: true }).click();
  const capture = page.getByRole('button', { name: 'Capture market observation' }).first();
  await capture.click();
  await page.getByText(/Observed /).first().waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: 'Select latest assessed state' }).first().click();
  await page.getByRole('heading', { name: 'Backend Engineer' }).last().waitFor({ timeout: 30000 });
}

async function exerciseResumes(page) {
  await page.getByRole('button', { name: 'ResumeVersion', exact: true }).click();
  const create = page.getByRole('button', { name: 'Create trusted ResumeVersion' });
  assert.equal(await create.isDisabled(), true, 'Resume creation must require explicit mode');

  await page.getByLabel('Resume mode').selectOption('GENERAL');
  await create.click();
  const generalCard = page.locator('article').filter({ hasText: 'General ResumeVersion' }).first();
  await generalCard.waitFor({ timeout: 30000 });
  const [textDownload] = await Promise.all([
    page.waitForEvent('download'),
    generalCard.getByRole('link', { name: 'Export text' }).click(),
  ]);
  const textPath = path.join(ARTIFACTS, 'general-resume.txt');
  await textDownload.saveAs(textPath);
  assert.ok(fs.readFileSync(textPath, 'utf8').includes('TypeScript'), 'General resume export must contain verified evidence');

  await page.getByLabel('Resume mode').selectOption('TARGETED');
  const jobSelect = page.getByLabel('Job Snapshot');
  assert.equal(await create.isDisabled(), true, 'Targeted resume must require explicit Job Snapshot');
  await jobSelect.selectOption({ label: /Backend Engineer/ });
  await create.click();
  const targetedCard = page.locator('article').filter({ hasText: 'Targeted ResumeVersion' }).first();
  await targetedCard.waitFor({ timeout: 30000 });
  const [jsonDownload] = await Promise.all([
    page.waitForEvent('download'),
    targetedCard.getByRole('link', { name: 'Export provenance JSON' }).click(),
  ]);
  const jsonPath = path.join(ARTIFACTS, 'targeted-resume-provenance.json');
  await jsonDownload.saveAs(jsonPath);
  const provenance = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  assert.equal(provenance.mode, 'TARGETED');
  assert.ok(Array.isArray(provenance.claims) && provenance.claims.length > 0, 'Targeted resume must preserve claim provenance');
}

async function verifyReturningUser(page) {
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Career Evidence', exact: true }).waitFor({ timeout: 30000 });
  assert.equal(await page.getByRole('heading', { name: 'Your career evidence stays separate from AI suggestions.' }).count(), 0, 'Returning user must not repeat acknowledged Trust');
  const body = await page.locator('body').innerText();
  assert.match(body, /AI: NO_CLOUD_AI/, 'Durable no-cloud preference must restore after reload');
}

async function exportAndDeleteAccount(page, exportName) {
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download my account data' }).click(),
  ]);
  const exportPath = path.join(ARTIFACTS, exportName);
  await download.saveAs(exportPath);
  const payload = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
  assert.ok(payload && typeof payload === 'object', 'Account export must be valid JSON');

  await page.getByLabel(/Type DELETE_MY_ACCOUNT to continue/).fill('DELETE_MY_ACCOUNT');
  await page.getByRole('button', { name: 'Permanently delete my account' }).click();
  await page.getByRole('heading', { name: 'Your career evidence stays separate from AI suggestions.' }).waitFor({ timeout: 30000 });
  const sessionResponse = await page.request.get(`${BASE}/api/session`);
  assert.equal(sessionResponse.status(), 401, 'Deleted account session must no longer authenticate');
}

async function coreNoCloud(browser) {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const guard = attachGuards(page, 'core-no-cloud');
  try {
    await assertProductionIdentity(page);
    await signInThroughFirstRun(page, CORE_EMAIL, CORE_PASSWORD, 'Continue without cloud AI');
    await screenshot(page, '01-core-entry');
    await createVerifiedEvidence(page, 'Built a TypeScript and PostgreSQL service with Docker deployment and automated tests.');
    await exerciseImport(page);
    await createTarget(page);
    await createJob(page);
    await createAssessment(page, true);
    await exerciseOpportunitySpace(page);
    await exerciseResumes(page);
    await screenshot(page, '03-resume-versions');
    await verifyReturningUser(page);
    await screenshot(page, '04-returning-user');
    await exportAndDeleteAccount(page, 'core-account-export.json');
    guard.assertClean();
  } catch (error) {
    await screenshot(page, 'FAIL-core-no-cloud').catch(() => undefined);
    throw error;
  } finally {
    await context.close();
  }
}

async function platformGemini(browser) {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const guard = attachGuards(page, 'platform-gemini');
  try {
    await assertProductionIdentity(page);
    await signInThroughFirstRun(page, AI_EMAIL, AI_PASSWORD, 'Use CV Engine AI');
    await createVerifiedEvidence(page, 'Built a TypeScript backend service and PostgreSQL persistence layer.');
    await createJob(page, 'CVEngine AI Certification');
    await createAssessment(page, false);
    const explain = page.getByRole('button', { name: 'Explain with optional AI' }).first();
    await explain.click();
    await page.getByText('AI explanation · proposal only').first().waitFor({ timeout: 90000 });
    const body = await page.locator('body').innerText();
    assert.match(body, /request /i, 'AI explanation must expose provider/model/request provenance receipt');
    await screenshot(page, '05-platform-gemini');
    await exportAndDeleteAccount(page, 'ai-account-export.json');
    guard.assertClean();
  } catch (error) {
    await screenshot(page, 'FAIL-platform-gemini').catch(() => undefined);
    throw error;
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({ headless: true });
try {
  await coreNoCloud(browser);
  await platformGemini(browser);
  fs.writeFileSync(path.join(ARTIFACTS, 'CERTIFICATION_PASS.txt'), `CVEngine production browser E2E PASS\nsha=${EXPECTED_SHA}\nbase=${BASE}\n`);
  console.log('CVENGINE_PRODUCTION_BROWSER_E2E=PASS');
} finally {
  await browser.close();
}
