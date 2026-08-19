import assert from 'node:assert/strict';
import test from 'node:test';
import { validateGeneratedResumeGrounding } from '../../lib/application/grounding/GroundingValidator';
import type { ResumeRequest } from '../../lib/schemas';

function candidate(overrides: Partial<ResumeRequest> = {}): ResumeRequest {
  return {
    personalInfo: {
      fullName: 'Jane Candidate',
      email: 'jane@example.com',
      location: 'Lima, Peru',
      linkedin: '',
      github: '',
    },
    summary: '',
    experience: [],
    education: [],
    skills: { hardSkills: ['TypeScript'], softSkills: [] },
    projects: [],
    certifications: [],
    languages: [],
    jobDescription: '',
    ...overrides,
  };
}

test('language + exact proficiency survives hyphen and em-dash presentation separators', () => {
  const data = candidate({
    languages: [
      { language: 'Spanish', proficiency: 'Native' },
      { language: 'English', proficiency: 'Professional' },
    ],
  });

  const report = validateGeneratedResumeGrounding(
    data,
    'LANGUAGES\nSpanish - Native\nEnglish — Professional',
  );

  assert.equal(report.status, 'APPROVED');
  assert.deepEqual(report.factsToConfirm, []);
});

test('Spanish source wording with exact proficiency survives an em-dash separator', () => {
  const data = candidate({
    languages: [
      { language: 'Español', proficiency: 'nativo' },
      { language: 'Inglés', proficiency: 'intermedio' },
    ],
  });

  const report = validateGeneratedResumeGrounding(
    data,
    'LANGUAGES\nEspañol — nativo\nInglés — intermedio',
  );

  assert.equal(report.status, 'APPROVED');
  assert.deepEqual(report.factsToConfirm, []);
});

test('supported language does not authorize a stronger generated proficiency', () => {
  const data = candidate({
    languages: [{ language: 'English', proficiency: 'Intermediate' }],
  });

  const report = validateGeneratedResumeGrounding(
    data,
    'LANGUAGES\nEnglish — Professional',
  );

  assert.equal(report.status, 'NEEDS_USER_CONFIRMATION');
  assert.deepEqual(report.factsToConfirm, ['English — Professional']);
  assert.equal(report.violations[0]?.kind, 'UNSUPPORTED_LANGUAGE');
});

test('translation is not treated as evidence equivalence when candidate data does not contain it', () => {
  const data = candidate({
    languages: [{ language: 'English', proficiency: 'Intermediate' }],
  });

  const report = validateGeneratedResumeGrounding(
    data,
    'LANGUAGES\nInglés — intermedio',
  );

  assert.equal(report.status, 'NEEDS_USER_CONFIRMATION');
  assert.deepEqual(report.factsToConfirm, ['Inglés']);
});

test('supported institution and degree are separated from an unsupported academic distinction', () => {
  const data = candidate({
    education: [{
      institution: 'Universidad Nacional Mayor de San Marcos (UNMSM)',
      degree: 'Ingeniería de Sistemas',
      startDate: '',
      endDate: '',
    }],
  });

  const report = validateGeneratedResumeGrounding(
    data,
    'EDUCATION\nUniversidad Nacional Mayor de San Marcos (UNMSM) — Ingeniería de Sistemas — Quinto superior',
  );

  assert.equal(report.status, 'NEEDS_USER_CONFIRMATION');
  assert.deepEqual(report.factsToConfirm, ['Quinto superior']);
  assert.equal(report.violations[0]?.kind, 'UNSUPPORTED_EDUCATION');
});

test('supported institution + degree structured line is approved without reconfirmation', () => {
  const data = candidate({
    education: [{
      institution: 'Universidad Nacional Mayor de San Marcos (UNMSM)',
      degree: 'Ingeniería de Sistemas',
      startDate: '',
      endDate: '',
    }],
  });

  const report = validateGeneratedResumeGrounding(
    data,
    'EDUCATION\nUniversidad Nacional Mayor de San Marcos (UNMSM) — Ingeniería de Sistemas',
  );

  assert.equal(report.status, 'APPROVED');
  assert.deepEqual(report.factsToConfirm, []);
});
