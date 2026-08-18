import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ResumeRequest } from '../../lib/schemas';
import { buildLegacyTruthContext } from '../../lib/application/legacy/LegacyResumeAdapter';
import { analyzeJobDescription } from '../../lib/application/job/JobIntelligenceEngine';
import { matchJobToCandidate } from '../../lib/application/matching/JobMatchEngine';
import { composeApprovedResumeVersion } from '../../lib/application/resume/ResumeCompositionService';

const CREATED_AT = '2026-08-11T20:00:00.000Z';
const GENERATION = {
  provider: 'google-gemini',
  model: 'gemini-2.5-flash',
  contractVersion: 'ats2-structured-resume-v1',
} as const;

function resumeFixture(jobDescription = 'Requirements:\n- TypeScript\n- Docker'): ResumeRequest {
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
        technologies: ['TypeScript', 'Docker'],
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
      hardSkills: ['TypeScript', 'Docker'],
      softSkills: ['Collaboration'],
    },
    projects: [],
    certifications: [],
    languages: [{ language: 'Spanish', proficiency: 'Native' }],
    jobDescription,
  };
}

const FORMATTED_RESUME = `JANE CANDIDATE
Lima, Peru | jane@example.com

PROFESSIONAL SUMMARY
Backend engineer focused on reliable APIs and TypeScript services.

EXPERIENCE
ACME — BACKEND ENGINEER
2023 - 2025
• Built APIs with TypeScript for internal business workflows.

EDUCATION
Universidad Nacional
Computer Science, 2018 - 2022

SKILLS
Technical Skills: TypeScript, Docker
Soft Skills: Collaboration

LANGUAGES
Spanish: Native`;

function compositionFor(
  formattedResume = FORMATTED_RESUME,
  jobDescription = 'Requirements:\n- TypeScript\n- Docker',
  createdAt = CREATED_AT,
) {
  const data = resumeFixture(jobDescription);
  const truth = buildLegacyTruthContext(data, {
    projectionKey: 'versioning-candidate',
    capturedAt: CREATED_AT,
  });
  const job = analyzeJobDescription(jobDescription, {
    projectionKey: 'versioning-job',
    capturedAt: CREATED_AT,
  });
  const match = matchJobToCandidate(job, truth.assertions, {
    projectionKey: 'versioning-match',
    generatedAt: CREATED_AT,
  });

  return composeApprovedResumeVersion({
    formattedResume,
    candidateProfileId: truth.candidateProfile.id,
    assertions: truth.assertions,
    targetedJobDescriptionId: job.jobDescription.id,
    targetJobDescription: job.jobDescription.sourceText,
    matchReportId: match.report.id,
    generation: GENERATION,
    createdAt,
  });
}

test('approved resume materializes as a content-addressed version with complete claim provenance', () => {
  const result = compositionFor();

  assert.match(result.version.contentSha256, /^[a-f0-9]{64}$/);
  assert.match(result.version.targetJobDescriptionSha256 ?? '', /^[a-f0-9]{64}$/);
  assert.equal(result.version.generation.provider, 'google-gemini');
  assert.equal(result.persistence, 'EPHEMERAL_RUNTIME');
  assert.ok(result.claims.length >= 7);
  assert.equal(result.version.claimIds.length, result.claims.length);
  assert.equal(result.manifest.entries.length, result.claims.length);

  result.manifest.entries.forEach((entry) => {
    const claim = result.claims.find((item) => item.id === entry.claimId);
    assert.ok(claim);
    assert.deepEqual(new Set(entry.assertionIds), new Set(claim.assertionIds));
    assert.ok(entry.assertionIds.length > 0);
  });
});

test('same approved content and target reuse deterministic version identity across runtime attempts', () => {
  const first = compositionFor(FORMATTED_RESUME, 'Requirements:\n- TypeScript\n- Docker', CREATED_AT);
  const second = compositionFor(FORMATTED_RESUME, 'Requirements:\n- TypeScript\n- Docker', '2026-08-11T21:00:00.000Z');

  assert.equal(first.version.id, second.version.id);
  assert.equal(first.version.contentSha256, second.version.contentSha256);
  assert.equal(first.version.targetJobDescriptionSha256, second.version.targetJobDescriptionSha256);
  assert.notEqual(first.version.createdAt, second.version.createdAt);
});

test('changing target job changes version identity even when rendered resume content is unchanged', () => {
  const first = compositionFor(FORMATTED_RESUME, 'Requirements:\n- TypeScript\n- Docker');
  const second = compositionFor(FORMATTED_RESUME, 'Requirements:\n- TypeScript\n- PostgreSQL');

  assert.equal(first.version.contentSha256, second.version.contentSha256);
  assert.notEqual(first.version.targetJobDescriptionSha256, second.version.targetJobDescriptionSha256);
  assert.notEqual(first.version.id, second.version.id);
});

test('generated skill line preserves provenance to every supporting skill assertion', () => {
  const result = compositionFor();
  const skillClaim = result.claims.find((claim) => claim.wording === 'Technical Skills: TypeScript, Docker');

  assert.ok(skillClaim);
  assert.ok(skillClaim.assertionIds.length >= 2);
  const manifestEntry = result.manifest.entries.find((entry) => entry.claimId === skillClaim.id);
  assert.ok(manifestEntry);
  assert.deepEqual(new Set(manifestEntry.assertionIds), new Set(skillClaim.assertionIds));
});

test('summary remains a traceable claim when a resume omits the contact line', () => {
  const withoutContact = `JANE CANDIDATE
PROFESSIONAL SUMMARY
Backend engineer focused on reliable APIs and TypeScript services.

EXPERIENCE
ACME — BACKEND ENGINEER
2023 - 2025
• Built APIs with TypeScript for internal business workflows.`;
  const result = compositionFor(withoutContact);

  const summaryClaim = result.claims.find(
    (claim) => claim.wording === 'Backend engineer focused on reliable APIs and TypeScript services.',
  );
  assert.ok(summaryClaim);
  assert.ok(summaryClaim.assertionIds.length > 0);
});

test('runtime versioning refuses material wording that cannot be traced to candidate assertions', () => {
  const untraceable = `${FORMATTED_RESUME}\n\nPROJECTS\n• Operated quantum satellites for lunar logistics.`;

  assert.throws(
    () => compositionFor(untraceable),
    /cannot trace approved wording to candidate assertions/i,
  );
});

test('composition repairs provider output that serialized line breaks as literal backslash-n text', () => {
  const serialized = FORMATTED_RESUME.replace(/\n/g, '\\n');
  const result = compositionFor(serialized);

  assert.ok(result.claims.length >= 7);
  assert.match(result.renderedResume, /PROFESSIONAL SUMMARY\nBackend engineer/);
  assert.match(result.renderedResume, /EXPERIENCE\nACME/);
  assert.doesNotMatch(result.renderedResume, /\\n/);
});

test('composition recovers a compressed one-line resume with explicit standard headings and bullets', () => {
  const compressed = 'JANE CANDIDATE PROFESSIONAL SUMMARY Backend engineer focused on reliable APIs and TypeScript services. EXPERIENCE ACME — BACKEND ENGINEER • Built APIs with TypeScript for internal business workflows. SKILLS Technical Skills: TypeScript, Docker';
  const result = compositionFor(compressed);

  assert.ok(result.claims.some((claim) =>
    claim.wording === 'Backend engineer focused on reliable APIs and TypeScript services.',
  ));
  assert.ok(result.claims.some((claim) =>
    claim.wording === 'Built APIs with TypeScript for internal business workflows.',
  ));
});

test('composition keeps safe multi-anchor paraphrases traceable without accepting one-word support', () => {
  const paraphrased = `JANE CANDIDATE
EXPERIENCE
• Engineered TypeScript services for workflow automation.`;
  const result = compositionFor(paraphrased);

  const claim = result.claims.find(
    (item) => item.wording === 'Engineered TypeScript services for workflow automation.',
  );
  assert.ok(claim);
  assert.ok(claim.assertionIds.length > 0);
});
