import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ResumeRequest } from '../../lib/schemas';
import { buildLegacyTruthContext } from '../../lib/application/legacy/LegacyResumeAdapter';
import { composeApprovedResumeVersion } from '../../lib/application/resume/ResumeCompositionService';

const CREATED_AT = '2026-08-23T20:53:50.093Z';
const GENERATION = {
  provider: 'cv-engine-deterministic',
  model: 'source-preserving-resume-composer-v2',
  contractVersion: 'ats2-evidence-bound-resume-v2',
} as const;

function sparseResume(): ResumeRequest {
  return {
    personalInfo: {
      fullName: 'PERSONA FOUR',
      location: '',
      email: 'p04@example.test',
      linkedin: '',
      github: '',
    },
    summary: '',
    experience: [],
    education: [],
    skills: {
      hardSkills: ['Python', 'SQL', 'Git'],
      softSkills: [],
    },
    projects: [],
    certifications: [],
    languages: [{ language: 'English', proficiency: 'Professional' }],
    jobDescription: null,
  };
}

function compose(formattedResume: string) {
  const truth = buildLegacyTruthContext(sparseResume(), {
    projectionKey: 'ats-sys-02-p04-structured-list',
    capturedAt: CREATED_AT,
  });

  return composeApprovedResumeVersion({
    formattedResume,
    candidateProfileId: truth.candidateProfile.id,
    assertions: truth.assertions,
    generation: GENERATION,
    createdAt: CREATED_AT,
  });
}

test('P04-class 3-item technical skill line binds every source-backed atomic skill assertion', () => {
  const result = compose(`PERSONA FOUR\np04@example.test\n\nSKILLS\nTechnical Skills: Python, SQL, Git\n\nLANGUAGES\nEnglish — Professional`);
  const claim = result.claims.find((item) => item.wording === 'Technical Skills: Python, SQL, Git');

  assert.ok(claim);
  assert.equal(claim.assertionIds.length, 3);
});

test('structured list provenance remains fail-closed when even one rendered item is unsupported', () => {
  assert.throws(
    () => compose(`PERSONA FOUR\np04@example.test\n\nSKILLS\nTechnical Skills: Python, SQL, Git, Kubernetes\n\nLANGUAGES\nEnglish — Professional`),
    /cannot trace approved wording to candidate assertions/i,
  );
});
