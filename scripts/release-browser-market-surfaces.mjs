import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.CV_ENGINE_E2E_BASE_URL || 'http://127.0.0.1:3000';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

const resume = {
  personalInfo: { fullName: 'Jane Candidate', email: 'jane@example.com', location: 'Lima, Peru', linkedin: '', github: '' },
  summary: '',
  experience: [],
  education: [],
  skills: { hardSkills: ['TypeScript'], softSkills: [] },
  projects: [],
  certifications: [],
  languages: [],
};
const context = {
  receipt: {
    receiptId: 'resume-import-browser-market', originalFileName: 'candidate.pdf', mimeType: 'application/pdf', byteSize: 256,
    sha256: 'c'.repeat(64), capturedAt: '2026-08-19T20:00:00.000Z', importer: 'browser-acceptance-fixture', importerVersion: 'browser-acceptance-v1',
  },
  evidenceMap: [
    { fieldPath: 'personalInfo.fullName', excerpt: 'Jane Candidate', locator: { scope: 'SOURCE_DOCUMENT', granularity: 'PAGE', page: 1, fieldPath: 'personalInfo.fullName' } },
    { fieldPath: 'personalInfo.email', excerpt: 'jane@example.com', locator: { scope: 'SOURCE_DOCUMENT', granularity: 'PAGE', page: 1, fieldPath: 'personalInfo.email' } },
    { fieldPath: 'personalInfo.location', excerpt: 'Lima, Peru', locator: { scope: 'SOURCE_DOCUMENT', granularity: 'PAGE', page: 1, fieldPath: 'personalInfo.location' } },
    { fieldPath: 'skills.hardSkills[0]', excerpt: 'TypeScript', locator: { scope: 'SOURCE_DOCUMENT', granularity: 'PAGE', page: 1, fieldPath: 'skills.hardSkills[0]' } },
  ],
};

async function visible(text) {
  const locator = page.getByText(text, { exact: false }).first();
  await locator.waitFor({ state: 'visible', timeout: 10_000 });
  return locator;
}
async function click(text) {
  const button = page.locator('button').filter({ hasText: text }).first();
  await button.waitFor({ state: 'visible', timeout: 10_000 });
  await button.click();
}

try {
  await page.route('**/api/import-resume', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { resume, context } }) });
  });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await click('Start from my CV');
  await page.locator('#cv-upload').setInputFiles({ name: 'candidate.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 market acceptance fixture') });
  await visible('We found your career information');
  await click('Continue to target job');
  await visible('What are you applying for?');

  // Specific-job assessment must lock mutable controls during the durable request and recover cleanly after failure.
  await click('Specific job');
  const roleInput = page.locator('input[placeholder="e.g. Senior Backend Engineer"]');
  const jobInput = page.locator('#target-job-description');
  await roleInput.fill('Backend Engineer');
  await jobInput.fill('Requirements: TypeScript, APIs, PostgreSQL and reliable backend delivery.');
  await page.route('**/api/assess-opportunity', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'Deliberate durable assessment failure.' }) });
  });
  const assessButton = page.locator('button').filter({ hasText: 'Assess opportunity' }).first();
  await assessButton.click();
  await visible('Target inputs are locked while the durable assessment is running');
  assert.equal(await roleInput.isDisabled(), true, 'Target role stayed mutable during durable assessment');
  assert.equal(await jobInput.isDisabled(), true, 'Job description stayed mutable during durable assessment');
  const backButton = page.locator('button').filter({ hasText: 'Back to career review' }).first();
  assert.equal(await backButton.isDisabled(), true, 'Back stayed enabled during durable assessment');
  await visible('Deliberate durable assessment failure');
  assert.equal(await roleInput.isEnabled(), true, 'Target role did not unlock after failed assessment');
  assert.equal(await jobInput.isEnabled(), true, 'Job description did not unlock after failed assessment');
  assert.equal(await roleInput.inputValue(), 'Backend Engineer');
  assert.match(await jobInput.inputValue(), /PostgreSQL/);

  // Opportunity Space: real add/remove, immutable request lock, inline failure, and recovery.
  await click('Compare multiple opportunities');
  await visible('Compare where your attention is worth spending');
  let opportunityTextareas = page.locator('textarea[placeholder="Paste a complete job description…"]');
  assert.equal(await opportunityTextareas.count(), 2);
  await click('Add opportunity');
  opportunityTextareas = page.locator('textarea[placeholder="Paste a complete job description…"]');
  assert.equal(await opportunityTextareas.count(), 3);
  await page.getByRole('button', { name: 'Remove opportunity 3' }).click();
  assert.equal(await page.locator('textarea[placeholder="Paste a complete job description…"]').count(), 2);

  const spaceRole = page.locator('input[placeholder="e.g. Senior Backend Engineer"]');
  await spaceRole.fill('Backend Engineer');
  opportunityTextareas = page.locator('textarea[placeholder="Paste a complete job description…"]');
  await opportunityTextareas.nth(0).fill('Opportunity one requires TypeScript, APIs and PostgreSQL for backend services.');
  await opportunityTextareas.nth(1).fill('Opportunity two requires TypeScript, distributed systems and API delivery.');

  await page.unroute('**/api/assess-opportunity');
  await page.route('**/api/assess-opportunity', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'Opportunity sequence stopped safely.' }) });
  });
  await click('Build Opportunity Space');
  await visible('Inputs are locked while durable assessments are being written');
  assert.equal(await spaceRole.isDisabled(), true, 'Opportunity Space target stayed mutable while analyzing');
  assert.equal(await opportunityTextareas.nth(0).isDisabled(), true, 'Opportunity text stayed mutable while analyzing');
  assert.equal(await page.locator('button').filter({ hasText: 'Add opportunity' }).first().isDisabled(), true, 'Add opportunity stayed enabled while analyzing');
  assert.equal(await page.locator('button').filter({ hasText: 'Back to one job' }).first().isDisabled(), true, 'Back stayed enabled while Opportunity Space was writing');
  await visible('Opportunity sequence stopped safely');
  assert.equal(await spaceRole.isEnabled(), true, 'Opportunity Space target did not unlock after failure');
  assert.match(await opportunityTextareas.nth(0).inputValue(), /Opportunity one/);
  assert.match(await opportunityTextareas.nth(1).inputValue(), /Opportunity two/);
  await click('Back to one job');
  await visible('What are you applying for?');

  assert.deepEqual(pageErrors, [], `Market browser surfaces produced page errors: ${pageErrors.join(' | ')}`);
  console.log('RELEASE_BROWSER_MARKET_SURFACES_OK');
} finally {
  await browser.close();
}
