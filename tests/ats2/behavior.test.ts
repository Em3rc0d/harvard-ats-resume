import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ResumeRequest } from '../../lib/schemas';
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
