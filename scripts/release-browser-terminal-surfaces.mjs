import assert from 'node:assert/strict';

const playwrightModule = process.env.CV_ENGINE_PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(playwrightModule);
const baseUrl = process.env.CV_ENGINE_E2E_BASE_URL || 'http://localhost:3000';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ acceptDownloads: true });
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

const resume = {
  personalInfo: { fullName: 'Jane Candidate', email: 'jane@example.com', location: 'Lima, Peru', linkedin: '', github: '' },
  summary: '', experience: [], education: [],
  skills: { hardSkills: ['TypeScript'], softSkills: [] }, projects: [], certifications: [], languages: [],
};
const context = {
  receipt: { receiptId: 'resume-import-browser-terminal', originalFileName: 'candidate.pdf', mimeType: 'application/pdf', byteSize: 256, sha256: 'a'.repeat(64), capturedAt: '2026-08-19T20:00:00.000Z', importer: 'browser-acceptance-fixture', importerVersion: 'browser-acceptance-v1' },
  evidenceMap: [
    { fieldPath: 'personalInfo.fullName', excerpt: 'Jane Candidate', locator: { scope: 'SOURCE_DOCUMENT', granularity: 'PAGE', page: 1, fieldPath: 'personalInfo.fullName' } },
    { fieldPath: 'personalInfo.email', excerpt: 'jane@example.com', locator: { scope: 'SOURCE_DOCUMENT', granularity: 'PAGE', page: 1, fieldPath: 'personalInfo.email' } },
    { fieldPath: 'personalInfo.location', excerpt: 'Lima, Peru', locator: { scope: 'SOURCE_DOCUMENT', granularity: 'PAGE', page: 1, fieldPath: 'personalInfo.location' } },
    { fieldPath: 'skills.hardSkills[0]', excerpt: 'TypeScript', locator: { scope: 'SOURCE_DOCUMENT', granularity: 'PAGE', page: 1, fieldPath: 'skills.hardSkills[0]' } },
  ],
};
const successfulResult = {
  formattedResume: 'JANE CANDIDATE\njane@example.com | Lima, Peru\nSKILLS\nTypeScript',
  productEvaluation: {
    resumeQuality: { score: 80, version: 'ats2-product-evaluation-v1', scope: 'Deterministic quality fixture.', checks: [] },
    atsParseability: { score: 90, version: 'ats2-product-evaluation-v1', scope: 'Deterministic parseability fixture.', checks: [] },
  },
  claimTraceability: [],
  resumeVersion: { id: 'resume-version-browser-acceptance', contentSha256: 'b'.repeat(64), generation: { provider: 'fixture', model: 'fixture', contractVersion: 'fixture-v1' }, createdAt: '2026-08-19T20:01:00.000Z' },
  resumePersistence: 'DURABLE_CAREER_VAULT',
  careerVault: { schemaVersion: 'career-vault-browser-v1', candidateProfileId: 'candidate-browser-acceptance', revision: 1, createdAt: '2026-08-19T20:00:00.000Z', updatedAt: '2026-08-19T20:01:00.000Z' },
  suggestions: [],
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
async function acceptResponsibleUse() {
  const dialog = page.getByRole('dialog', { name: 'Before you continue' });
  await dialog.waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByRole('button', { name: 'I understand — continue with real information' }).click();
  await dialog.waitFor({ state: 'detached', timeout: 10_000 });
}
async function installImportSuccessRoute() {
  await page.route('**/api/import-resume', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { resume, context } }) });
  });
}
async function reachGeneralTarget() {
  await click('Start from my CV');
  await page.locator('#cv-upload').setInputFiles({ name: 'candidate.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 terminal acceptance fixture') });
  await visible('We found your career information');
  await click('Continue to target job');
  await visible('What are you applying for?');
  await click('General resume');
  const generate = page.locator('button').filter({ hasText: 'Generate trusted resume' }).first();
  assert.equal(await generate.isEnabled(), true);
}

try {
  await installImportSuccessRoute();
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await acceptResponsibleUse();

  await reachGeneralTarget();
  await page.route('**/api/generate-resume', async (route) => {
    await route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'Unsupported candidate wording requires confirmation.', grounding: { status: 'NEEDS_USER_CONFIRMATION', factsToConfirm: ['Led an unsupported enterprise program.'], violations: [{ kind: 'UNSUPPORTED_NARRATIVE_CLAIM', value: 'Led an unsupported enterprise program.', message: 'Narrative claim requires confirmation.', source: 'GENERATED_ONLY' }] } }) });
  });
  await click('Generate trusted resume');
  await visible('We paused before adding unsupported career facts');
  await visible('Led an unsupported enterprise program');
  await click('Edit my career evidence');
  await visible('Build only what you can defend');
  assert.deepEqual(pageErrors, [], `Guardrail flow produced browser errors: ${pageErrors.join(' | ')}`);

  await page.getByRole('button', { name: 'CV Engine home' }).click();
  await page.unroute('**/api/generate-resume');
  await reachGeneralTarget();
  await page.route('**/api/generate-resume', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: successfulResult }) });
  });
  await click('Generate trusted resume');
  await visible('Resume Quality');
  await visible('ATS Parseability');
  await visible('Saved to Career Vault');
  await visible('Current version integrity');

  await page.evaluate(() => { window.print = () => { document.body.dataset.printCalled = 'true'; }; });
  await click('Print');
  assert.equal(await page.locator('body').getAttribute('data-print-called'), 'true', 'Print button did not invoke window.print');

  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 10_000 }), click('Download PDF')]);
  assert.match(download.suggestedFilename(), /Jane Candidate.*\.pdf$/i);

  await click('Create New');
  await visible('Build from career truth');
  assert.deepEqual(pageErrors, [], `Result flow produced browser errors: ${pageErrors.join(' | ')}`);
  console.log('RELEASE_BROWSER_TERMINAL_SURFACES_OK');
} finally {
  await browser.close();
}
