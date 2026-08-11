import {
  assertValid,
  combineValidation,
  createCandidateProfile,
  createCareerAssertion,
  createCareerEvidence,
  createCareerSource,
  createJobDescription,
  createJobRequirement,
  createMatchReport,
  createRequirementMatch,
  createResumeClaim,
  createResumeManifest,
  createResumeVersion,
  domainId,
  validateCareerAssertion,
  validateJobRequirement,
  validateRequirementMatch,
  validateResumeClaim,
  validateResumeManifest,
} from './index';

const createdAt = '2026-08-10T00:00:00.000Z';

export function createRoundtripFixture() {
  const candidateProfile = createCandidateProfile({
    id: domainId('CandidateProfile', 'candidate:farid'),
    displayName: 'Candidate',
    createdAt,
  });

  const careerSource = createCareerSource({
    id: domainId('CareerSource', 'source:candidate-interview'),
    candidateProfileId: candidateProfile.id,
    kind: 'CANDIDATE_PROVIDED',
    label: 'Candidate intake interview',
    capturedAt: createdAt,
  });

  const careerEvidence = createCareerEvidence({
    id: domainId('CareerEvidence', 'evidence:event-services'),
    sourceId: careerSource.id,
    excerpt: 'Built asynchronous event-driven services.',
    observedAt: createdAt,
  });

  const supportingCareerEvidence = createCareerEvidence({
    id: domainId('CareerEvidence', 'evidence:event-consumers'),
    sourceId: careerSource.id,
    excerpt: 'Implemented event consumers for asynchronous workflows.',
    observedAt: createdAt,
  });

  const careerAssertion = createCareerAssertion({
    id: domainId('CareerAssertion', 'assertion:event-services'),
    candidateProfileId: candidateProfile.id,
    statement: 'Built asynchronous event-driven services.',
    truthClass: 'VERIFIED_FACT',
    evidenceIds: [careerEvidence.id],
    sourceIds: [careerSource.id],
    derivedFromAssertionIds: [],
    createdAt,
  });

  const supportingCareerAssertion = createCareerAssertion({
    id: domainId('CareerAssertion', 'assertion:event-consumers'),
    candidateProfileId: candidateProfile.id,
    statement: 'Implemented event consumers for asynchronous workflows.',
    truthClass: 'VERIFIED_FACT',
    evidenceIds: [supportingCareerEvidence.id],
    sourceIds: [careerSource.id],
    derivedFromAssertionIds: [],
    createdAt,
  });

  const suggestionAssertion = createCareerAssertion({
    id: domainId('CareerAssertion', 'assertion:suggest-distributed-systems'),
    candidateProfileId: candidateProfile.id,
    statement: 'Consider positioning this as distributed systems experience.',
    truthClass: 'SUGGESTION',
    evidenceIds: [],
    sourceIds: [careerSource.id],
    derivedFromAssertionIds: [careerAssertion.id],
    derivationRule: 'match-rationale-question',
    createdAt,
  });

  const jobDescription = createJobDescription({
    id: domainId('JobDescription', 'job:platform-engineer'),
    title: 'Platform Engineer',
    company: 'Example Co.',
    sourceText: 'Experience with distributed systems.',
    capturedAt: createdAt,
  });

  const jobRequirement = createJobRequirement({
    id: domainId('JobRequirement', 'requirement:distributed-systems'),
    jobDescriptionId: jobDescription.id,
    statement: 'Experience with distributed systems.',
    kind: 'EXPERIENCE',
    necessity: 'PREFERRED',
  });

  const requirementMatch = createRequirementMatch({
    id: domainId('RequirementMatch', 'match:event-services-to-distributed-systems'),
    requirementId: jobRequirement.id,
    assertionIds: [careerAssertion.id],
    status: 'POTENTIAL_MATCH',
    rationale:
      'The assertion supports async/event-driven service work, but distributed systems remains an inference, not a candidate fact.',
  });

  const matchReport = createMatchReport({
    id: domainId('MatchReport', 'report:platform-engineer'),
    candidateProfileId: candidateProfile.id,
    jobDescriptionId: jobDescription.id,
    matches: [requirementMatch],
    generatedAt: createdAt,
  });

  const assertionsById = new Map([
    [careerAssertion.id, careerAssertion],
    [supportingCareerAssertion.id, supportingCareerAssertion],
    [suggestionAssertion.id, suggestionAssertion],
  ]);

  const resumeClaim = createResumeClaim(
    {
      id: domainId('ResumeClaim', 'claim:event-services'),
      assertionIds: [careerAssertion.id],
      wording: 'Built asynchronous event-driven services.',
    },
    assertionsById,
  );

  const multiAssertionResumeClaim = createResumeClaim(
    {
      id: domainId('ResumeClaim', 'claim:event-services-and-consumers'),
      assertionIds: [careerAssertion.id, supportingCareerAssertion.id],
      wording: 'Built asynchronous event-driven services and implemented event consumers.',
    },
    assertionsById,
  );

  const resumeVersion = createResumeVersion({
    id: domainId('ResumeVersion', 'resume:platform-engineer:v1'),
    candidateProfileId: candidateProfile.id,
    targetedJobDescriptionId: jobDescription.id,
    targetJobDescriptionSha256: 'b'.repeat(64),
    matchReportId: matchReport.id,
    claimIds: [resumeClaim.id],
    contentSha256: 'a'.repeat(64),
    generation: {
      provider: 'fixture-provider',
      model: 'fixture-model',
      contractVersion: 'fixture-contract-v1',
    },
    createdAt,
  });

  const claimsById = new Map([
    [resumeClaim.id, resumeClaim],
    [multiAssertionResumeClaim.id, multiAssertionResumeClaim],
  ]);

  const resumeManifest = createResumeManifest(
    {
      id: domainId('ResumeManifest', 'manifest:platform-engineer:v1'),
      resumeVersionId: resumeVersion.id,
      entries: [{ claimId: resumeClaim.id, assertionIds: resumeClaim.assertionIds }],
    },
    claimsById,
  );

  return {
    candidateProfile,
    careerSource,
    careerEvidence,
    supportingCareerEvidence,
    careerAssertion,
    supportingCareerAssertion,
    suggestionAssertion,
    jobDescription,
    jobRequirement,
    requirementMatch,
    matchReport,
    resumeClaim,
    multiAssertionResumeClaim,
    resumeVersion,
    resumeManifest,
    assertionsById,
    claimsById,
  };
}

export function validateRoundtripFixture(): void {
  const fixture = createRoundtripFixture();

  assertValid(
    combineValidation([
      validateCareerAssertion(fixture.careerAssertion),
      validateCareerAssertion(fixture.supportingCareerAssertion),
      validateCareerAssertion(fixture.suggestionAssertion),
      validateJobRequirement(fixture.jobRequirement),
      validateRequirementMatch(fixture.requirementMatch),
      validateResumeClaim(fixture.resumeClaim, fixture.assertionsById),
      validateResumeClaim(fixture.multiAssertionResumeClaim, fixture.assertionsById),
      validateResumeManifest(fixture.resumeManifest, fixture.claimsById),
    ]),
  );

  const manifestEntry = fixture.resumeManifest.entries.find(
    (entry) => entry.claimId === fixture.resumeClaim.id,
  );
  const roundtripAssertionId = manifestEntry?.assertionIds[0];
  const roundtripAssertion = roundtripAssertionId
    ? fixture.assertionsById.get(roundtripAssertionId)
    : undefined;

  if (roundtripAssertion?.statement !== fixture.careerAssertion.statement) {
    throw new Error('Roundtrip failed: assertion statement did not survive provenance chain.');
  }

  const inferredCandidateFact = Array.from(fixture.assertionsById.values()).find(
    (assertion) => assertion.statement === 'Distributed Systems',
  );

  if (inferredCandidateFact) {
    throw new Error('MATCH INFERENCE must not become a candidate fact.');
  }

  const partialManifestValidation = validateResumeManifest(
    {
      id: domainId('ResumeManifest', 'manifest:partial-provenance-regression'),
      resumeVersionId: fixture.resumeVersion.id,
      entries: [
        {
          claimId: fixture.multiAssertionResumeClaim.id,
          assertionIds: [fixture.careerAssertion.id],
        },
      ],
    },
    fixture.claimsById,
  );

  if (partialManifestValidation.ok) {
    throw new Error('INV-006 regression: partial ResumeClaim provenance was incorrectly accepted.');
  }
}

validateRoundtripFixture();
