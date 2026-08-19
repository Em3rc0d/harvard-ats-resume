import assert from 'node:assert/strict';

const playwrightModule = process.env.CV_ENGINE_PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(playwrightModule);
const baseUrl = process.env.CV_ENGINE_E2E_BASE_URL || 'http://localhost:3000';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

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
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await click('Build my evidence');
  await visible('Build only what you can defend');

  // Cancel from first section must return to START.
  await click('Cancel');
  await visible('Build from career truth');
  await click('Build my evidence');

  // Identity input persistence.
  await page.locator('input[autocomplete="name"]').fill('Jane Candidate');
  await page.locator('input[type="email"]').fill('jane@example.com');
  await page.locator('input[autocomplete="address-level2"]').fill('Lima, Peru');
  await click('Next');

  // Summary optimizer: success updates wording; failure remains inline and preserves existing text.
  const summary = page.locator('textarea').first();
  await summary.fill('Built reliable TypeScript services for internal workflows.');
  await page.route('**/api/optimize-content', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ output: 'Built reliable internal workflow services with TypeScript.' }) });
  });
  await click('Improve wording safely');
  await page.waitForFunction(() => document.querySelector('textarea')?.value.includes('reliable internal workflow services'));
  assert.match(await summary.inputValue(), /reliable internal workflow services/);
  await page.unroute('**/api/optimize-content');
  await page.route('**/api/optimize-content', async (route) => {
    await route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: 'Safe rewrite rejected by deterministic truth guard.' }) });
  });
  const preservedSummary = await summary.inputValue();
  await click('Improve wording safely');
  await visible('Safe rewrite rejected by deterministic truth guard');
  assert.equal(await summary.inputValue(), preservedSummary, 'Failed optimize mutated candidate evidence');
  await page.unroute('**/api/optimize-content');

  // Experience add/remove.
  await click('Next');
  await click('Add Work experience');
  await visible('Work experience #1');
  await page.getByRole('button', { name: 'Remove Work experience 1' }).click();
  assert.equal(await page.getByText('Work experience #1', { exact: true }).count(), 0);

  // Education certificate PDF quick-fill + manual academic distinction add/remove.
  await click('Next');
  await visible('Education');
  await page.route('**/api/extract-certificate-text', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, text: 'Certificate of Software Engineering Example University awarded on June 10, 2024 with distinction' }),
    });
  });
  await page.locator('#certificate-upload--20').setInputFiles({
    name: 'education.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 certificate fixture'),
  });
  await visible('Education #1');
  assert.match(await page.locator('input[placeholder="Institution"]').first().inputValue(), /University/i);
  await page.getByRole('button', { name: 'Remove Education 1' }).click();
  assert.equal(await page.getByText('Education #1', { exact: true }).count(), 0);
  await page.unroute('**/api/extract-certificate-text');

  await click('Add Education');
  await visible('Education #1');
  const honorsInput = page.locator('input[placeholder*="Quinto superior"]').first();
  await honorsInput.fill('Quinto superior');
  assert.equal(await honorsInput.inputValue(), 'Quinto superior');
  await page.getByRole('button', { name: 'Remove Education 1' }).click();

  // Skills editor accepts/deduplicates comma-separated evidence.
  await click('Next');
  await visible('Skills');
  const skillAreas = page.locator('textarea');
  await skillAreas.nth(0).fill('TypeScript, TypeScript, PostgreSQL');
  assert.equal(await skillAreas.nth(0).inputValue(), 'TypeScript, PostgreSQL');

  // Projects add/remove.
  await click('Next');
  await visible('Projects');
  await click('Add Projects');
  await visible('Projects #1');
  await page.getByRole('button', { name: 'Remove Projects 1' }).click();
  assert.equal(await page.getByText('Projects #1', { exact: true }).count(), 0);

  // Certifications add/remove.
  await click('Next');
  await visible('Certifications');
  await click('Add Certifications');
  assert.equal(await page.getByRole('button', { name: 'Remove Certifications 1' }).count(), 1);
  await page.getByRole('button', { name: 'Remove Certifications 1' }).click();
  assert.equal(await page.getByRole('button', { name: 'Remove Certifications 1' }).count(), 0);

  // Languages add/remove and readiness guard on final continue.
  await click('Next');
  await visible('Languages');
  await click('Add Languages');
  assert.equal(await page.getByRole('button', { name: 'Remove Languages 1' }).count(), 1);
  await page.getByRole('button', { name: 'Remove Languages 1' }).click();
  await click('Continue to target');
  await visible('What are you applying for?');

  assert.deepEqual(pageErrors, [], `Editor controls produced browser errors: ${pageErrors.join(' | ')}`);
  console.log('RELEASE_BROWSER_EDITOR_CONTROLS_OK');
} finally {
  await browser.close();
}
