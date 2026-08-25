import test from 'node:test';
import assert from 'node:assert/strict';

import {
  recoverSourceExactSingleExperienceRole,
  splitResumeIntoSections,
} from '../../lib/infrastructure/import/OllamaResumeImportV3Provider';

function proposal(company: string, role: string) {
  return {
    items: [{
      company,
      role,
      startDate: '',
      endDate: '',
      description: '',
      technologies: [],
    }],
  };
}

test('ATS-SYS-03E INC-02 fans one composite source heading into education and certification contracts', () => {
  const document = {
    format: 'PDF' as const,
    pages: [{
      page: 1,
      text: [
        'EDUCATION & CERTIFICATES',
        'Master of Applied Systems | 2022 – 2023',
        'Bachelor of Engineering | 2017 – 2021',
        'Certificates:',
        'Cloud Systems Certificate',
      ].join('\n'),
    }],
    text: [
      '[PAGE 1]',
      'EDUCATION & CERTIFICATES',
      'Master of Applied Systems | 2022 – 2023',
      'Bachelor of Engineering | 2017 – 2021',
      'Certificates:',
      'Cloud Systems Certificate',
    ].join('\n'),
  };

  const sectioned = splitResumeIntoSections(document);

  assert.equal(sectioned.sections.has('education'), true);
  assert.equal(sectioned.sections.has('certifications'), true);

  assert.match(
    sectioned.sections.get('education') ?? '',
    /Master of Applied Systems/,
  );

  assert.match(
    sectioned.sections.get('certifications') ?? '',
    /Cloud Systems Certificate/,
  );
});

test('ATS-SYS-03E INC-02 recovers a direct source-exact role from a two-part identity line', () => {
  const recovered = recoverSourceExactSingleExperienceRole(
    proposal('Northstar Labs', ''),
    [
      'EXPERIENCE',
      'Northstar Labs — Backend Developer',
      'Feb. 2025 – Present',
      'Built internal services.',
    ].join('\n'),
    '',
  );

  assert.equal(recovered.items[0].role, 'Backend Developer');
});

test('ATS-SYS-03E INC-02 treats the final non-location component of a three-part identity as the source-exact role', () => {
  const recovered = recoverSourceExactSingleExperienceRole(
    proposal('Bluebird Systems', 'Certified Platform Partner'),
    [
      'EXPERIENCE',
      'Bluebird Systems — Certified Platform Partner — QA Associate',
      'Mar. 2025 – Sep. 2025',
      'Executed regression tests.',
    ].join('\n'),
    'Lima, Perú',
  );

  assert.equal(recovered.items[0].role, 'QA Associate');
});

test('ATS-SYS-03E INC-02 recovers role from the exact prefix before an already extracted location', () => {
  const recovered = recoverSourceExactSingleExperienceRole(
    proposal('Bluebird Systems', 'Certified Platform Partner'),
    [
      'EXPERIENCE',
      'Bluebird Systems — Certified Platform Partner Mar. 2025 – Sep. 2025',
      'QA Associate Lima, Perú',
      'Executed regression tests.',
    ].join('\n'),
    'Lima, Perú',
  );

  assert.equal(recovered.items[0].role, 'QA Associate');
});

test('ATS-SYS-03E INC-02 leaves ambiguous experience identity unchanged', () => {
  const original = proposal(
    'Northstar Labs',
    'Existing Source Role',
  );

  const recovered = recoverSourceExactSingleExperienceRole(
    original,
    [
      'EXPERIENCE',
      'Unrelated Company',
      'Some ambiguous text',
    ].join('\n'),
    '',
  );

  assert.deepEqual(recovered, original);
});
