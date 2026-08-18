import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ResumeRequest } from '../../lib/schemas';
import { buildLegacyTruthContext } from '../../lib/application/legacy/LegacyResumeAdapter';
import { composeApprovedResumeVersion } from '../../lib/application/resume/ResumeCompositionService';

const CREATED_AT = '2026-08-18T13:00:00.000Z';

function candidateFixture(): ResumeRequest {
  return {
    personalInfo: {
      fullName: 'Jane Candidate',
      location: 'Lima, Peru',
      email: 'jane@example.com',
      linkedin: '',
      github: '',
    },
    summary: '',
    experience: [{
      company: 'Acme',
      role: 'Backend Engineer',
      startDate: '2023',
      endDate: '2025',
      description: 'Built APIs with TypeScript for internal business workflows.',
      technologies: ['TypeScript'],
    }],
    education: [],
    skills: {
      hardSkills: ['TypeScript'],
      softSkills: [],
    },
    projects: [],
    certifications: [],
    languages: [],
    jobDescription: '',
  };
}

test('a material first line is composed instead of being discarded as an identity header', () => {
  const truth = buildLegacyTruthContext(candidateFixture(), {
    projectionKey: 'real-cv-first-line-claim',
    capturedAt: CREATED_AT,
  });
  const wording = 'Built APIs with TypeScript for internal business workflows.';

  const result = composeApprovedResumeVersion({
    formattedResume: wording,
    candidateProfileId: truth.candidateProfile.id,
    assertions: truth.assertions,
    generation: {
      provider: 'test-provider',
      model: 'test-model',
      contractVersion: 'real-cv-release-hardening-v1',
    },
    createdAt: CREATED_AT,
  });

  const claim = result.claims.find((item) => item.wording === wording);
  assert.ok(claim);
  assert.ok(claim.assertionIds.length > 0);
  assert.equal(result.renderedResume, wording);
});
