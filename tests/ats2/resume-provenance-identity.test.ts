import { test } from 'node:test';
import assert from 'node:assert/strict';
import { domainId } from '../../lib/domain';
import type { ResumeRequest } from '../../lib/schemas';
import { buildLegacyTruthContext } from '../../lib/application/legacy/LegacyResumeAdapter';
import { analyzeJobDescription } from '../../lib/application/job/JobIntelligenceEngine';
import { composeApprovedResumeVersion } from '../../lib/application/resume/ResumeCompositionService';

const CANDIDATE_ID = domainId('CandidateProfile', 'candidate:stable-provenance-test');
const TARGET = 'Requirements:\n- TypeScript';
const FORMATTED_RESUME = `JANE CANDIDATE
jane@example.com

PROFESSIONAL SUMMARY
Backend engineer focused on reliable APIs and TypeScript services.

EXPERIENCE
ACME — BACKEND ENGINEER
2023 - 2025
• Built APIs with TypeScript for internal business workflows.`;
const GENERATION = {
  provider: 'google-gemini',
  model: 'gemini-2.5-flash',
  contractVersion: 'ats2-structured-resume-v1',
} as const;

function resumeFixture(): ResumeRequest {
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
    education: [],
    skills: { hardSkills: ['TypeScript'], softSkills: [] },
    projects: [],
    certifications: [],
    languages: [],
    jobDescription: TARGET,
  };
}

test('same rendered content and target produce a new logical version when candidate assertion provenance changes', () => {
  const data = resumeFixture();
  const firstTruth = buildLegacyTruthContext(data, {
    projectionKey: 'candidate-snapshot:first',
    candidateProfileId: CANDIDATE_ID,
    capturedAt: '2026-08-11T20:00:00.000Z',
  });
  const secondTruth = buildLegacyTruthContext(data, {
    projectionKey: 'candidate-snapshot:second',
    candidateProfileId: CANDIDATE_ID,
    capturedAt: '2026-08-11T21:00:00.000Z',
  });
  const job = analyzeJobDescription(TARGET, {
    projectionKey: 'job-snapshot:stable',
    capturedAt: '2026-08-11T20:00:00.000Z',
  });

  const first = composeApprovedResumeVersion({
    formattedResume: FORMATTED_RESUME,
    candidateProfileId: CANDIDATE_ID,
    assertions: firstTruth.assertions,
    targetedJobDescriptionId: job.jobDescription.id,
    targetJobDescription: job.jobDescription.sourceText,
    generation: GENERATION,
    createdAt: '2026-08-11T20:00:00.000Z',
  });
  const second = composeApprovedResumeVersion({
    formattedResume: FORMATTED_RESUME,
    candidateProfileId: CANDIDATE_ID,
    assertions: secondTruth.assertions,
    targetedJobDescriptionId: job.jobDescription.id,
    targetJobDescription: job.jobDescription.sourceText,
    generation: GENERATION,
    createdAt: '2026-08-11T21:00:00.000Z',
  });

  assert.equal(first.version.contentSha256, second.version.contentSha256);
  assert.equal(first.version.targetJobDescriptionSha256, second.version.targetJobDescriptionSha256);
  assert.notEqual(first.version.id, second.version.id);
  assert.notEqual(first.manifest.id, second.manifest.id);
  assert.notDeepEqual(
    first.claims.map((claim) => claim.id),
    second.claims.map((claim) => claim.id),
  );
});
