import assert from 'node:assert/strict';

const playwrightModule = process.env.CV_ENGINE_PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(playwrightModule);
const baseUrl = process.env.CV_ENGINE_E2E_BASE_URL || 'http://localhost:3000';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const pageErrors = [];

page.on('pageerror', (error) => {
  pageErrors.push(error.message);
});

async function expectVisible(text) {
  const locator = page.getByText(text, { exact: false }).first();
  await locator.waitFor({ state: 'visible', timeout: 10_000 });
  return locator;
}

async function clickButtonWithText(text) {
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

async function assertNoPageErrors(context) {
  assert.deepEqual(pageErrors, [], `${context}: browser page errors detected: ${pageErrors.join(' | ')}`);
}

const sourceBackedResume = {
  personalInfo: {
    fullName: 'Jane Candidate',
    email: 'jane@example.com',
    location: 'Lima, Peru',
    linkedin: '',
    github: '',
  },
  summary: '',
  experience: [],
  education: [{
    institution: 'Universidad Nacional Mayor de San Marcos (UNMSM)',
    degree: 'Ingeniería de Sistemas',
    startDate: '2021',
    endDate: '2026',
    honors: 'Quinto superior',
  }],
  skills: { hardSkills: ['TypeScript'], softSkills: [] },
  projects: [],
  certifications: [],
  languages: [],
};

const importContext = {
  receipt: {
    receiptId: 'resume-import-browser-acceptance',
    originalFileName: 'candidate.pdf',
    mimeType: 'application/pdf',
    byteSize: 256,
    sha256: 'a'.repeat(64),
    capturedAt: '2026-08-19T20:00:00.000Z',
    importer: 'browser-acceptance-fixture',
    importerVersion: 'browser-acceptance-v1',
  },
  evidenceMap: [
    { fieldPath: 'personalInfo.fullName', excerpt: 'Jane Candidate', locator: { scope: 'SOURCE_DOCUMENT', granularity: 'PAGE', page: 1, fieldPath: 'personalInfo.fullName' } },
    { fieldPath: 'personalInfo.email', excerpt: 'jane@example.com', locator: { scope: 'SOURCE_DOCUMENT', granularity: 'PAGE', page: 1, fieldPath: 'personalInfo.email' } },
    { fieldPath: 'personalInfo.location', excerpt: 'Lima, Peru', locator: { scope: 'SOURCE_DOCUMENT', granularity: 'PAGE', page: 1, fieldPath: 'personalInfo.location' } },
    { fieldPath: 'education[0].institution', excerpt: 'Universidad Nacional Mayor de San Marcos (UNMSM)', locator: { scope: 'SOURCE_DOCUMENT', granularity: 'PAGE', page: 1, fieldPath: 'education[0].institution' } },
    { fieldPath: 'education[0].degree', excerpt: 'Ingeniería de Sistemas', locator: { scope: 'SOURCE_DOCUMENT', granularity: 'PAGE', page: 1, fieldPath: 'education[0].degree' } },
    { fieldPath: 'education[0].startDate', excerpt: '2021', locator: { scope: 'SOURCE_DOCUMENT', granularity: 'PAGE', page: 1, fieldPath: 'education[0].startDate' } },
    { fieldPath: 'education[0].endDate', excerpt: '2026', locator: { scope: 'SOURCE_DOCUMENT', granularity: 'PAGE', page: 1, fieldPath: 'education[0].endDate' } },
    { fieldPath: 'education[0].honors', excerpt: 'Quinto superior', locator: { scope: 'SOURCE_DOCUMENT', granularity: 'PAGE', page: 1, fieldPath: 'education[0].honors' } },
    { fieldPath: 'skills.hardSkills[0]', excerpt: 'TypeScript', locator: { scope: 'SOURCE_DOCUMENT', granularity: 'PAGE', page: 1, fieldPath: 'skills.hardSkills[0]' } },
  ],
};

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await expectVisible('Before you continue');
  await acceptResponsibleUse();
  await expectVisible('Build from career truth');
  await assertNoPageErrors('START');

  const languageSelect = page.locator('select[aria-label="Select language"]');
  await languageSelect.selectOption('es');
  await page.waitForFunction(() => document.documentElement.lang === 'es');
  await expectVisible('Empezar desde mi CV');
  await page.locator('select[aria-label="Seleccionar idioma"]').selectOption('en');
  await page.waitForFunction(() => document.documentElement.lang === 'en');
  await expectVisible('Build from career truth');

  await clickButtonWithText('Start from my CV');
  await expectVisible('Upload Your Resume');
  await clickButtonWithText('Cancel');
  await expectVisible('Build from career truth');

  await page.route('**/api/import-resume', async (route) => {
    await route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        error: 'The resume contains no usable source-backed candidate content.',
        errorCode: 'NO_SOURCE_BACKED_CANDIDATE_CONTENT',
        stage: 'SOURCE_RECONCILIATION',
        canRetry: true,
      }),
    });
  });
  await clickButtonWithText('Start from my CV');
  await page.locator('#cv-upload').setInputFiles({ name: 'candidate.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 browser acceptance fixture') });
  await expectVisible('NO_SOURCE_BACKED_CANDIDATE_CONTENT');
  await expectVisible('SOURCE_RECONCILIATION');
  await assertNoPageErrors('UPLOAD typed failure');

  await page.unroute('**/api/import-resume');
  await page.route('**/api/import-resume', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { resume: sourceBackedResume, context: importContext } }) });
  });
  await page.locator('#cv-upload').setInputFiles({ name: 'candidate.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 browser acceptance fixture success') });
  await expectVisible('We found your career information');
  await expectVisible('candidate.pdf');
  await expectVisible('Academic distinction: Quinto superior');
  await clickButtonWithText('Use another resume');
  await expectVisible('Build from career truth');

  await clickButtonWithText('Build my evidence');
  await expectVisible('Build only what you can defend');
  await page.locator('input[autocomplete="name"]').fill('Jane Candidate');
  await page.locator('input[type="email"]').fill('jane@example.com');
  await page.locator('input[autocomplete="address-level2"]').fill('Lima, Peru');

  await clickButtonWithText('Next');
  await expectVisible('Professional summary');
  await clickButtonWithText('Previous');
  await expectVisible('Personal information');
  await clickButtonWithText('Next');
  await clickButtonWithText('Next');
  await expectVisible('Work experience');
  await clickButtonWithText('Add Work experience');
  await expectVisible('Work experience #1');
  await clickButtonWithText('Remove');
  assert.equal(await page.getByText('Work experience #1', { exact: true }).count(), 0);

  await clickButtonWithText('Next');
  await expectVisible('Education');
  await clickButtonWithText('Next');
  await expectVisible('Skills');
  await page.locator('textarea').first().fill('TypeScript');
  await clickButtonWithText('Next');
  await expectVisible('Projects');
  await clickButtonWithText('Next');
  await expectVisible('Certifications');
  await clickButtonWithText('Next');
  await expectVisible('Languages');
  await clickButtonWithText('Continue to target');
  await expectVisible('What are you applying for?');

  await clickButtonWithText('General resume');
  const generateButton = page.locator('button').filter({ hasText: 'Generate trusted resume' }).first();
  assert.equal(await generateButton.isEnabled(), true, 'General resume generation should be enabled for ready evidence');
  await clickButtonWithText('Back to career review');
  await expectVisible('Build only what you can defend');

  await page.getByRole('button', { name: 'CV Engine home' }).click();
  await expectVisible('Build from career truth');
  await assertNoPageErrors('full browser acceptance flow');

  console.log('RELEASE_BROWSER_ACCEPTANCE_OK');
} finally {
  await browser.close();
}
