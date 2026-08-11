import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ResumeRequest } from '../../lib/schemas';
import type {
  ResumeImportContext,
  ResumeImportProvider,
} from '../../lib/application/import/ResumeImportProvider';
import {
  importResumeWithProvenance,
  resolveResumeMimeType,
  sha256Hex,
} from '../../lib/application/import/ResumeImportService';
import { projectLegacyResumeRequest } from '../../lib/application/legacy/LegacyResumeAdapter';
import { validateGeneratedResumeGrounding } from '../../lib/application/grounding/GroundingValidator';
import { analyzeJobDescription } from '../../lib/application/job/JobIntelligenceEngine';
import { matchJobToCandidate } from '../../lib/application/matching/JobMatchEngine';

function resumeFixture(overrides: Partial<ResumeRequest> = {}): ResumeRequest {
  return {
    personalInfo: {
      fullName: 'Jane Candidate',
      location: 'Lima, Peru',
      email: 'jane@example.com',
      linkedin: '',
      github: '',
    },
    summary: 'Backend engineer focused on reliable APIs and TypeScript services.',
    experience: [
      {
        company: 'Acme',
        role: 'Backend Engineer',
        startDate: '2023',
        endDate: '2025',
        description: 'Built APIs with TypeScript for internal business workflows.',
        technologies: ['TypeScript'],
      },
    ],
    education: [
      {
        institution: 'Universidad Nacional',
        degree: 'Computer Science',
        startDate: '2018',
        endDate: '2022',
      },
    ],
    skills: {
      hardSkills: ['TypeScript'],
      softSkills: ['Collaboration'],
    },
    projects: [],
    certifications: [],
    languages: [{ language: 'Spanish', proficiency: 'Native' }],
    jobDescription: '',
    ...overrides,
  };
}

function candidateDraft() {
  const { jobDescription: _jobDescription, ...candidate } = resumeFixture();
  return candidate;
}

function importContextFixture(): ResumeImportContext {
  return {
    receipt: {
      receiptId: 'resume-import-test',
      originalFileName: 'jane-resume.pdf',
      mimeType: 'application/pdf',
      byteSize: 1024,
      sha256: 'a'.repeat(64),
      capturedAt: '2026-08-10T00:00:00.000Z',
      importer: 'test-importer',
      importerVersion: '1.0.0',
    },
    evidenceMap: [
      {
        fieldPath: 'summary',
        excerpt: 'Backend engineer focused on reliable APIs and TypeScript services.',
        locator: {
          scope: 'SOURCE_DOCUMENT',
          granularity: 'PAGE',
          page: 1,
          fieldPath: 'summary',
        },
        confidence: 0.97,
      },
      {
        fieldPath: 'personalInfo.location',
        excerpt: 'Lima, Peru',
        locator: {
          scope: 'EXTRACTION_OUTPUT',
          granularity: 'FIELD',
          fieldPath: 'personalInfo.location',
        },
      },
      {
        fieldPath: 'experience[0].company',
        excerpt: 'Acme',
        locator: {
          scope: 'SOURCE_DOCUMENT',
          granularity: 'PAGE',
          page: 1,
          fieldPath: 'experience[0].company',
        },
      },
      {
        fieldPath: 'experience[0].role',
        excerpt: 'Backend Engineer',
        locator: {
          scope: 'SOURCE_DOCUMENT',
          granularity: 'PAGE',
          page: 1,
          fieldPath: 'experience[0].role',
        },
      },
      {
        fieldPath: 'experience[0].startDate',
        excerpt: '2023',
        locator: {
          scope: 'EXTRACTION_OUTPUT',
          granularity: 'FIELD',
          fieldPath: 'experience[0].startDate',
        },
      },
      {
        fieldPath: 'experience[0].endDate',
        excerpt: '2025',
        locator: {
          scope: 'EXTRACTION_OUTPUT',
          granularity: 'FIELD',
          fieldPath: 'experience[0].endDate',
        },
      },
      {
        fieldPath: 'experience[0].description',
        excerpt: 'Built APIs with TypeScript for internal business workflows.',
        locator: {
          scope: 'SOURCE_DOCUMENT',
          granularity: 'PAGE',
          page: 1,
          fieldPath: 'experience[0].description',
        },
      },
      {
        fieldPath: 'experience[0].technologies[0]',
        excerpt: 'TypeScript',
        locator: {
          scope: 'EXTRACTION_OUTPUT',
          granularity: 'FIELD',
          fieldPath: 'experience[0].technologies[0]',
        },
      },
      {
        fieldPath: 'education[0].institution',
        excerpt: 'Universidad Nacional',
        locator: {
          scope: 'SOURCE_DOCUMENT',
          granularity: 'PAGE',
          page: 2,
          fieldPath: 'education[0].institution',
        },
      },
      {
        fieldPath: 'education[0].degree',
        excerpt: 'Computer Science',
        locator: {
          scope: 'SOURCE_DOCUMENT',
          granularity: 'PAGE',
          page: 2,
          fieldPath: 'education[0].degree',
        },
      },
    ],
  };
}

test('legacy projection distinguishes candidate assertions from verified facts and preserves source origin', () => {
  const projection = projectLegacyResumeRequest(resumeFixture(), {
    projectionKey: 'test-upload',
    sourceKind: 'RESUME_UPLOAD',
    sourceLabel: 'Uploaded resume reviewed by candidate',
  });

  assert.equal(projection.source.kind, 'RESUME_UPLOAD');
  assert.ok(projection.assertions.every((assertion) => assertion.truthClass === 'CANDIDATE_ASSERTED'));
  assert.ok(
    projection.assertions.some((assertion) => assertion.statement === 'Candidate location: Lima, Peru.'),
  );
});

test('grounding requires confirmation for unsupported narrative scope', () => {
  const result = validateGeneratedResumeGrounding(
    resumeFixture(),
    'PROFESSIONAL SUMMARY\nLed enterprise-wide digital transformation programs.',
  );

  assert.equal(result.status, 'NEEDS_USER_CONFIRMATION');
  assert.ok(result.violations.some((violation) => violation.kind === 'UNSUPPORTED_NARRATIVE_CLAIM'));
});

test('grounding rejects narrative claims copied from the job description without candidate support', () => {
  const data = resumeFixture({
    jobDescription: 'Must lead enterprise-wide digital transformation programs.',
  });
  const result = validateGeneratedResumeGrounding(
    data,
    'PROFESSIONAL SUMMARY\nLed enterprise-wide digital transformation programs.',
  );

  assert.equal(result.status, 'REJECTED');
  assert.ok(result.violations.some((violation) => violation.kind === 'JD_REQUIREMENT_LEAKAGE'));
});

test('job intelligence carries required section context and retains uncatalogued requirements', () => {
  const result = analyzeJobDescription('Requirements:\n- TypeScript\n- Snowflake', {
    projectionKey: 'job-context',
    capturedAt: '2026-08-10T00:00:00.000Z',
  });

  const typeScript = result.requirements.find((requirement) => requirement.canonicalConcept === 'TypeScript');
  const snowflake = result.requirements.find((requirement) => requirement.statement === 'Snowflake');

  assert.equal(typeScript?.necessity, 'REQUIRED');
  assert.equal(snowflake?.necessity, 'REQUIRED');
  assert.equal(snowflake?.kind, 'OTHER');
});

test('skill tenure requirement is not marked MATCH when documented linked duration is below minimum', () => {
  const data = resumeFixture({
    jobDescription: 'Requirements:\n- 5+ years TypeScript',
  });
  const projection = projectLegacyResumeRequest(data, {
    projectionKey: 'tenure-candidate',
    capturedAt: '2026-08-10T00:00:00.000Z',
  });
  const job = analyzeJobDescription(data.jobDescription ?? '', {
    projectionKey: 'tenure-job',
    capturedAt: '2026-08-10T00:00:00.000Z',
  });
  const match = matchJobToCandidate(job, projection.assertions, {
    projectionKey: 'tenure-match',
    generatedAt: '2026-08-10T00:00:00.000Z',
  });
  const skillRequirementIndex = job.requirements.findIndex(
    (requirement) => requirement.canonicalConcept === 'TypeScript',
  );

  assert.notEqual(skillRequirementIndex, -1);
  assert.equal(match.report.matches[skillRequirementIndex]?.status, 'GAP');
});

test('missing work authorization evidence remains UNKNOWN rather than becoming a blocker', () => {
  const data = resumeFixture({
    jobDescription: 'Requirements:\n- Must be authorized to work in the United States',
  });
  const projection = projectLegacyResumeRequest(data, {
    projectionKey: 'authorization-candidate',
    capturedAt: '2026-08-10T00:00:00.000Z',
  });
  const job = analyzeJobDescription(data.jobDescription ?? '', {
    projectionKey: 'authorization-job',
    capturedAt: '2026-08-10T00:00:00.000Z',
  });
  const match = matchJobToCandidate(job, projection.assertions, {
    projectionKey: 'authorization-match',
    generatedAt: '2026-08-10T00:00:00.000Z',
  });
  const authorizationIndex = job.requirements.findIndex(
    (requirement) => requirement.kind === 'WORK_AUTHORIZATION',
  );

  assert.notEqual(authorizationIndex, -1);
  assert.equal(match.report.matches[authorizationIndex]?.status, 'UNKNOWN');
  assert.equal(match.breakdown.blockers, 0);
});

test('Java requirement does not match JavaScript candidate evidence', () => {
  const data = resumeFixture({
    experience: [
      {
        company: 'Acme',
        role: 'Backend Engineer',
        startDate: '2023',
        endDate: '2025',
        description: 'Built APIs with JavaScript for internal business workflows.',
        technologies: ['JavaScript'],
      },
    ],
    skills: {
      hardSkills: ['JavaScript'],
      softSkills: ['Collaboration'],
    },
    jobDescription: 'Requirements:\n- Java',
  });
  const projection = projectLegacyResumeRequest(data, {
    projectionKey: 'java-candidate',
    capturedAt: '2026-08-10T00:00:00.000Z',
  });
  const job = analyzeJobDescription(data.jobDescription ?? '', {
    projectionKey: 'java-job',
    capturedAt: '2026-08-10T00:00:00.000Z',
  });
  const match = matchJobToCandidate(job, projection.assertions, {
    projectionKey: 'java-match',
    generatedAt: '2026-08-10T00:00:00.000Z',
  });
  const javaIndex = job.requirements.findIndex((requirement) => requirement.canonicalConcept === 'Java');

  assert.notEqual(javaIndex, -1);
  assert.equal(match.report.matches[javaIndex]?.status, 'GAP');
});

test('trusted import creates a source receipt with a stable document hash and never imports Job Description truth', async () => {
  const bytes = new TextEncoder().encode('candidate resume source bytes');
  const provider: ResumeImportProvider = {
    async extract() {
      return {
        candidate: candidateDraft(),
        importer: 'test-importer',
        importerVersion: '1.0.0',
        evidenceMap: [
          {
            fieldPath: 'summary',
            excerpt: resumeFixture().summary,
            locator: {
              scope: 'SOURCE_DOCUMENT',
              granularity: 'PAGE',
              page: 1,
              fieldPath: 'summary',
            },
            confidence: 0.95,
          },
        ],
      };
    },
  };

  const result = await importResumeWithProvenance(provider, {
    originalFileName: 'candidate.pdf',
    suppliedMimeType: 'application/pdf',
    bytes,
    capturedAt: '2026-08-10T00:00:00.000Z',
  });

  assert.equal(result.context.receipt.sha256, sha256Hex(bytes));
  assert.equal(result.context.receipt.originalFileName, 'candidate.pdf');
  assert.equal(result.context.receipt.importer, 'test-importer');
  assert.equal('jobDescription' in result.resume, false);
});

test('trusted import rejects a mismatched extension and MIME type before extraction', () => {
  assert.throws(
    () => resolveResumeMimeType('candidate.pdf', 'application/msword'),
    /extension and MIME type do not match/,
  );
});

test('unchanged imported fields remain linked to upload evidence and never become VERIFIED_FACT', () => {
  const context = importContextFixture();
  const projection = projectLegacyResumeRequest(resumeFixture(), {
    projectionKey: 'trusted-unchanged',
    capturedAt: '2026-08-10T01:00:00.000Z',
    sourceContext: context,
    truthClass: 'VERIFIED_FACT',
  });

  assert.equal(projection.source.kind, 'RESUME_UPLOAD');
  assert.equal(projection.source.document?.sha256, context.receipt.sha256);
  assert.ok(projection.assertions.every((assertion) => assertion.truthClass === 'CANDIDATE_ASSERTED'));

  const summaryAssertion = projection.assertions.find((assertion) =>
    assertion.statement.startsWith('Professional summary:'),
  );
  assert.ok(summaryAssertion);
  const summaryEvidence = projection.evidence.find((item) =>
    summaryAssertion.evidenceIds.includes(item.id),
  );

  assert.equal(summaryEvidence?.sourceId, projection.source.id);
  assert.equal(summaryEvidence?.reviewState, 'CANDIDATE_CONFIRMED');
  assert.equal(summaryEvidence?.locator?.scope, 'SOURCE_DOCUMENT');
  assert.equal(summaryEvidence?.locator?.page, 1);
});

test('candidate edits preserve original upload evidence but support the assertion from MANUAL_REVIEW', () => {
  const context = importContextFixture();
  const edited = resumeFixture({
    summary: 'Backend engineer focused on reliable APIs, TypeScript services, and platform reliability.',
  });
  const projection = projectLegacyResumeRequest(edited, {
    projectionKey: 'trusted-edited',
    capturedAt: '2026-08-10T01:00:00.000Z',
    sourceContext: context,
  });

  const reviewSource = projection.sources.find((source) => source.kind === 'MANUAL_REVIEW');
  assert.ok(reviewSource);

  const originalSummaryEvidence = projection.evidence.find((item) =>
    item.sourceId === projection.source.id && item.excerpt === context.evidenceMap[0].excerpt,
  );
  assert.equal(originalSummaryEvidence?.reviewState, 'UNREVIEWED_EXTRACTION');

  const summaryAssertion = projection.assertions.find((assertion) =>
    assertion.statement.startsWith('Professional summary:'),
  );
  assert.ok(summaryAssertion);
  assert.equal(summaryAssertion.sourceIds.includes(projection.source.id), false);
  assert.equal(summaryAssertion.sourceIds.includes(reviewSource.id), true);

  const editedEvidence = projection.evidence.find((item) =>
    summaryAssertion.evidenceIds.includes(item.id) && item.sourceId === reviewSource.id,
  );
  assert.equal(editedEvidence?.reviewState, 'CANDIDATE_EDITED');
});

test('candidate-added fields are explicitly supported by MANUAL_REVIEW evidence', () => {
  const context = importContextFixture();
  const projection = projectLegacyResumeRequest(resumeFixture(), {
    projectionKey: 'trusted-added',
    capturedAt: '2026-08-10T01:00:00.000Z',
    sourceContext: context,
  });

  const languageAssertion = projection.assertions.find((assertion) =>
    assertion.statement.startsWith('Language Spanish'),
  );
  assert.ok(languageAssertion);
  const supportingEvidence = projection.evidence.filter((item) =>
    languageAssertion.evidenceIds.includes(item.id),
  );

  assert.ok(supportingEvidence.length > 0);
  assert.ok(supportingEvidence.every((item) => item.reviewState === 'CANDIDATE_ADDED'));
  assert.ok(supportingEvidence.every((item) =>
    projection.sources.find((source) => source.id === item.sourceId)?.kind === 'MANUAL_REVIEW'
  ));
});

test('browser resume upload cannot reference the external n8n resume webhook', () => {
  const component = readFileSync(join(process.cwd(), 'components/CVUpload.tsx'), 'utf8');
  const envExample = readFileSync(join(process.cwd(), '.env.example'), 'utf8');

  assert.match(component, /fetch\('\/api\/import-resume'/);
  assert.doesNotMatch(component, /N8N_RESUME_URL|NEXT_PUBLIC_N8N_RESUME_URL/);
  assert.doesNotMatch(envExample, /NEXT_PUBLIC_N8N_RESUME_URL/);
  assert.match(envExample, /^N8N_RESUME_URL=/m);
});
