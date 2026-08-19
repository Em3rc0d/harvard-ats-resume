import assert from 'node:assert/strict';
import test from 'node:test';
import { validateGeneratedResumeGrounding } from '../../lib/application/grounding/GroundingValidator';
import { projectLegacyResumeRequest } from '../../lib/application/legacy/LegacyResumeAdapter';
import { reconcileCandidateToSource } from '../../lib/infrastructure/import/NativeResumeImportProvider';
import type { ResumeImportContext } from '../../lib/application/import/ResumeImportProvider';
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

test('candidate-confirmed academic distinction authorizes only the exact stored distinction', () => {
  const data = candidate({
    education: [{
      institution: 'Universidad Nacional Mayor de San Marcos (UNMSM)',
      degree: 'Ingeniería de Sistemas',
      startDate: '',
      endDate: '',
      honors: 'Quinto superior',
    }],
  });

  const approved = validateGeneratedResumeGrounding(
    data,
    'EDUCATION\nUniversidad Nacional Mayor de San Marcos (UNMSM) — Ingeniería de Sistemas — Quinto superior',
  );
  assert.equal(approved.status, 'APPROVED');

  const stronger = validateGeneratedResumeGrounding(
    data,
    'EDUCATION\nUniversidad Nacional Mayor de San Marcos (UNMSM) — Ingeniería de Sistemas — Primer puesto',
  );
  assert.equal(stronger.status, 'NEEDS_USER_CONFIRMATION');
  assert.deepEqual(stronger.factsToConfirm, ['Primer puesto']);
});

test('resume source reconciliation preserves source-exact academic honors and evidence path', () => {
  const imported = candidate({
    education: [{
      institution: 'Universidad Nacional Mayor de San Marcos (UNMSM)',
      degree: 'Ingeniería de Sistemas',
      startDate: '2021',
      endDate: '2026',
      honors: 'Quinto superior',
    }],
  });
  const { jobDescription: _jobDescription, ...draft } = imported;
  const source = {
    format: 'PDF' as const,
    text: 'Jane Candidate jane@example.com Lima, Peru Universidad Nacional Mayor de San Marcos (UNMSM) Ingeniería de Sistemas 2021 2026 Quinto superior TypeScript',
    pages: [{
      page: 1,
      text: 'Jane Candidate jane@example.com Lima, Peru Universidad Nacional Mayor de San Marcos (UNMSM) Ingeniería de Sistemas 2021 2026 Quinto superior TypeScript',
    }],
  };

  const reconciled = reconcileCandidateToSource(draft, source);
  assert.equal(reconciled.candidate.education[0]?.honors, 'Quinto superior');
  assert.ok(reconciled.evidenceMap.some((item) => item.fieldPath === 'education[0].honors' && item.excerpt === 'Quinto superior'));
});

test('manual confirmation after import becomes CANDIDATE_ADDED evidence, not verified fact', () => {
  const data = candidate({
    education: [{
      institution: 'Universidad Nacional Mayor de San Marcos (UNMSM)',
      degree: 'Ingeniería de Sistemas',
      startDate: '',
      endDate: '',
      honors: 'Quinto superior',
    }],
  });
  const context: ResumeImportContext = {
    receipt: {
      receiptId: 'receipt-honors',
      originalFileName: 'candidate.pdf',
      mimeType: 'application/pdf',
      byteSize: 100,
      sha256: 'a'.repeat(64),
      capturedAt: '2026-08-19T20:00:00.000Z',
      importer: 'native-resume-import',
      importerVersion: 'fixture',
    },
    evidenceMap: [
      {
        fieldPath: 'education[0].institution',
        excerpt: 'Universidad Nacional Mayor de San Marcos (UNMSM)',
        locator: { scope: 'SOURCE_DOCUMENT', granularity: 'PAGE', page: 1, fieldPath: 'education[0].institution' },
      },
      {
        fieldPath: 'education[0].degree',
        excerpt: 'Ingeniería de Sistemas',
        locator: { scope: 'SOURCE_DOCUMENT', granularity: 'PAGE', page: 1, fieldPath: 'education[0].degree' },
      },
    ],
  };

  const projection = projectLegacyResumeRequest(data, {
    projectionKey: 'honors-confirmation',
    capturedAt: '2026-08-19T21:00:00.000Z',
    sourceContext: context,
  });

  const honorsEvidence = projection.evidence.find((item) => item.locator?.fieldPath === 'education[0].honors');
  assert.ok(honorsEvidence);
  assert.equal(honorsEvidence.reviewState, 'CANDIDATE_ADDED');
  assert.ok(projection.assertions.some((item) => item.statement.includes('Academic distinction: Quinto superior.')));
});
