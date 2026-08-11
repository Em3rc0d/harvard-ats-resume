import type { ResumeRequest } from '../../schemas';
import {
  createCandidateProfile,
  createCareerAssertion,
  createCareerEvidence,
  createCareerSource,
  createClaimLedger,
  domainId,
  getResumeClaims,
  registerCanonicalClaim,
  type CandidateProfile,
  type CandidateProfileId,
  type CareerAssertion,
  type CareerEvidence,
  type CareerEvidenceId,
  type CareerSource,
  type CareerSourceId,
  type ClaimLedger,
  type ResumeClaim,
} from '../../domain';

export interface LegacyResumeProjectionOptions {
  readonly projectionKey?: string;
  readonly capturedAt?: string;
  readonly candidateProfileId?: CandidateProfileId;
}

export interface LegacyResumeDomainProjection {
  readonly candidateProfile: CandidateProfile;
  readonly source: CareerSource;
  readonly evidence: readonly CareerEvidence[];
  readonly assertions: readonly CareerAssertion[];
}

export interface LegacyTruthContext extends LegacyResumeDomainProjection {
  readonly claimLedger: ClaimLedger;
  readonly claims: readonly ResumeClaim[];
}

interface AssertionSeed {
  readonly statement: string;
  readonly evidenceExcerpt: string;
}

const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9:_-]*$/;

function requireSafeProjectionKey(value: string): string {
  if (!SAFE_KEY.test(value)) {
    throw new Error(`Legacy projection key must be stable and URL-safe: ${value}`);
  }

  return value;
}

function collectAssertionSeeds(data: ResumeRequest): AssertionSeed[] {
  const seeds: AssertionSeed[] = [
    {
      statement: `Professional summary: ${data.summary}`,
      evidenceExcerpt: data.summary,
    },
  ];

  data.experience.forEach((experience) => {
    seeds.push({
      statement: `Worked at ${experience.company} as ${experience.role} from ${experience.startDate} to ${experience.endDate}. ${experience.description}`,
      evidenceExcerpt: `${experience.company} | ${experience.role} | ${experience.startDate} - ${experience.endDate} | ${experience.description}`,
    });

    experience.technologies.forEach((technology) => {
      seeds.push({
        statement: `Used ${technology} at ${experience.company} while serving as ${experience.role}.`,
        evidenceExcerpt: `${experience.company} | technology: ${technology}`,
      });
    });
  });

  data.education.forEach((education) => {
    seeds.push({
      statement: `Studied ${education.degree} at ${education.institution} from ${education.startDate} to ${education.endDate}.`,
      evidenceExcerpt: `${education.institution} | ${education.degree} | ${education.startDate} - ${education.endDate}`,
    });
  });

  data.skills.hardSkills.forEach((skill) => {
    seeds.push({
      statement: `Technical skill: ${skill}.`,
      evidenceExcerpt: `Technical skill: ${skill}`,
    });
  });

  data.skills.softSkills.forEach((skill) => {
    seeds.push({
      statement: `Soft skill: ${skill}.`,
      evidenceExcerpt: `Soft skill: ${skill}`,
    });
  });

  (data.projects ?? []).forEach((project) => {
    seeds.push({
      statement: `Project ${project.name}: ${project.description}`,
      evidenceExcerpt: `${project.name} | ${project.description}`,
    });

    project.technologies.forEach((technology) => {
      seeds.push({
        statement: `Used ${technology} on project ${project.name}.`,
        evidenceExcerpt: `${project.name} | technology: ${technology}`,
      });
    });
  });

  (data.certifications ?? []).forEach((certification) => {
    seeds.push({
      statement: `Certification ${certification.name}, issued by ${certification.issuer}, dated ${certification.date}.`,
      evidenceExcerpt: `${certification.name} | ${certification.issuer} | ${certification.date}`,
    });
  });

  (data.languages ?? []).forEach((language) => {
    seeds.push({
      statement: `Language ${language.language} proficiency: ${language.proficiency}.`,
      evidenceExcerpt: `${language.language} | ${language.proficiency}`,
    });
  });

  return seeds;
}

/**
 * Converts the current v1 ResumeRequest DTO into ATS v2 candidate truth.
 *
 * Deliberately ignored input: jobDescription.
 * Job requirements are external truth and MUST NOT become candidate evidence.
 */
export function projectLegacyResumeRequest(
  data: ResumeRequest,
  options: LegacyResumeProjectionOptions = {},
): LegacyResumeDomainProjection {
  const projectionKey = requireSafeProjectionKey(options.projectionKey ?? 'legacy');
  const capturedAt = options.capturedAt ?? new Date().toISOString();
  const candidateProfileId =
    options.candidateProfileId ?? domainId('CandidateProfile', `candidate:${projectionKey}`);
  const sourceId: CareerSourceId = domainId('CareerSource', `source:${projectionKey}:manual-form`);

  const candidateProfile = createCandidateProfile({
    id: candidateProfileId,
    displayName: data.personalInfo.fullName,
    createdAt: capturedAt,
  });

  const source = createCareerSource({
    id: sourceId,
    candidateProfileId,
    kind: 'CANDIDATE_PROVIDED',
    label: 'Legacy resume form',
    capturedAt,
  });

  const seeds = collectAssertionSeeds(data);
  const evidence: CareerEvidence[] = [];
  const assertions: CareerAssertion[] = [];

  seeds.forEach((seed, index) => {
    const ordinal = String(index + 1).padStart(3, '0');
    const evidenceId: CareerEvidenceId = domainId(
      'CareerEvidence',
      `evidence:${projectionKey}:${ordinal}`,
    );

    const careerEvidence = createCareerEvidence({
      id: evidenceId,
      sourceId,
      excerpt: seed.evidenceExcerpt,
      observedAt: capturedAt,
    });

    const assertion = createCareerAssertion({
      id: domainId('CareerAssertion', `assertion:${projectionKey}:${ordinal}`),
      candidateProfileId,
      statement: seed.statement,
      truthClass: 'VERIFIED_FACT',
      evidenceIds: [evidenceId],
      sourceIds: [sourceId],
      derivedFromAssertionIds: [],
      createdAt: capturedAt,
    });

    evidence.push(careerEvidence);
    assertions.push(assertion);
  });

  return {
    candidateProfile,
    source,
    evidence,
    assertions,
  };
}

/**
 * Builds the first ATS v2 truth boundary around the legacy request.
 * Every canonical resume claim is backed by exactly one candidate assertion.
 */
export function buildLegacyTruthContext(
  data: ResumeRequest,
  options: LegacyResumeProjectionOptions = {},
): LegacyTruthContext {
  const projectionKey = requireSafeProjectionKey(options.projectionKey ?? 'legacy');
  const projection = projectLegacyResumeRequest(data, {
    ...options,
    projectionKey,
  });

  let claimLedger = createClaimLedger(projection.assertions);

  projection.assertions.forEach((assertion, index) => {
    const ordinal = String(index + 1).padStart(3, '0');
    claimLedger = registerCanonicalClaim(
      claimLedger,
      assertion.id,
      `claim:${projectionKey}:${ordinal}`,
    );
  });

  return {
    ...projection,
    claimLedger,
    claims: getResumeClaims(claimLedger),
  };
}
