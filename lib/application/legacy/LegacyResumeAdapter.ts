import type { ResumeRequest } from '../../schemas';
import type { ResumeImportContext } from '../import/ResumeImportProvider';
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
  type CareerSourceKind,
  type ClaimLedger,
  type ResumeClaim,
  type TruthClass,
} from '../../domain';

export interface LegacyResumeProjectionOptions {
  readonly projectionKey?: string;
  readonly capturedAt?: string;
  readonly candidateProfileId?: CandidateProfileId;
  readonly sourceKind?: CareerSourceKind;
  readonly sourceLabel?: string;
  readonly truthClass?: TruthClass;
  readonly sourceContext?: ResumeImportContext;
}

export interface LegacyResumeDomainProjection {
  readonly candidateProfile: CandidateProfile;
  readonly source: CareerSource;
  readonly sources: readonly CareerSource[];
  readonly evidence: readonly CareerEvidence[];
  readonly assertions: readonly CareerAssertion[];
}

export interface LegacyTruthContext extends LegacyResumeDomainProjection {
  readonly claimLedger: ClaimLedger;
  readonly claims: readonly ResumeClaim[];
}

interface EvidencePart {
  readonly fieldPath: string;
  readonly excerpt: string;
}

interface AssertionSeed {
  readonly statement: string;
  readonly evidenceParts: readonly EvidencePart[];
}

const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9:_-]*$/;

function requireSafeProjectionKey(value: string): string {
  if (!SAFE_KEY.test(value)) {
    throw new Error(`Legacy projection key must be stable and URL-safe: ${value}`);
  }
  return value;
}

function part(fieldPath: string, excerpt: string): EvidencePart {
  return { fieldPath, excerpt: excerpt.trim() };
}

function pushSeed(
  seeds: AssertionSeed[],
  statement: string,
  evidenceParts: readonly EvidencePart[],
): void {
  const materialParts = evidenceParts.filter((item) => item.excerpt.length > 0);
  if (!statement.trim() || materialParts.length === 0) return;
  seeds.push({ statement: statement.trim(), evidenceParts: materialParts });
}

/**
 * Projection preserves the familiar legacy statements when all historical DTO
 * fields exist, but it never manufactures empty prose for source-reconciled
 * gaps. Missing evidence produces no assertion for that missing fact.
 */
function collectAssertionSeeds(data: ResumeRequest): AssertionSeed[] {
  const seeds: AssertionSeed[] = [];

  if (data.summary.trim()) {
    pushSeed(seeds, `Professional summary: ${data.summary}`, [part('summary', data.summary)]);
  }

  pushSeed(
    seeds,
    `Candidate location: ${data.personalInfo.location}.`,
    [part('personalInfo.location', data.personalInfo.location)],
  );

  data.experience.forEach((experience, index) => {
    const prefix = `experience[${index}]`;
    const experienceParts = [
      part(`${prefix}.company`, experience.company),
      part(`${prefix}.role`, experience.role),
      part(`${prefix}.startDate`, experience.startDate),
      part(`${prefix}.endDate`, experience.endDate),
      part(`${prefix}.description`, experience.description),
    ];

    const completeLegacyShape = Boolean(
      experience.company.trim() &&
      experience.role.trim() &&
      experience.startDate.trim() &&
      experience.endDate.trim() &&
      experience.description.trim(),
    );

    const statement = completeLegacyShape
      ? `Worked at ${experience.company} as ${experience.role} from ${experience.startDate} to ${experience.endDate}. ${experience.description}`
      : [
          'Work experience.',
          experience.company.trim() ? `Company: ${experience.company}.` : '',
          experience.role.trim() ? `Role: ${experience.role}.` : '',
          experience.startDate.trim() || experience.endDate.trim()
            ? `Period: ${experience.startDate || 'unspecified'} to ${experience.endDate || 'unspecified'}.`
            : '',
          experience.description.trim() ? experience.description : '',
        ].filter(Boolean).join(' ');

    pushSeed(seeds, statement, experienceParts);

    experience.technologies.forEach((technology, techIndex) => {
      const technologyParts = [
        part(`${prefix}.technologies[${techIndex}]`, technology),
        part(`${prefix}.company`, experience.company),
        part(`${prefix}.role`, experience.role),
      ];
      const technologyStatement = experience.company.trim() && experience.role.trim()
        ? `Used ${technology} at ${experience.company} while serving as ${experience.role}.`
        : `Technical experience: ${technology}.`;
      pushSeed(seeds, technologyStatement, technologyParts);
    });
  });

  data.education.forEach((education, index) => {
    const prefix = `education[${index}]`;
    const honors = education.honors?.trim() ?? '';
    const educationParts = [
      part(`${prefix}.institution`, education.institution),
      part(`${prefix}.degree`, education.degree),
      part(`${prefix}.startDate`, education.startDate),
      part(`${prefix}.endDate`, education.endDate),
      part(`${prefix}.honors`, honors),
    ];
    const completeLegacyShape = Boolean(
      education.degree.trim() && education.institution.trim() &&
      education.startDate.trim() && education.endDate.trim(),
    );
    const statement = completeLegacyShape
      ? [
          `Studied ${education.degree} at ${education.institution} from ${education.startDate} to ${education.endDate}.`,
          honors ? `Academic distinction: ${honors}.` : '',
        ].filter(Boolean).join(' ')
      : [
          'Education.',
          education.degree.trim() ? `Degree: ${education.degree}.` : '',
          education.institution.trim() ? `Institution: ${education.institution}.` : '',
          education.startDate.trim() || education.endDate.trim()
            ? `Period: ${education.startDate || 'unspecified'} to ${education.endDate || 'unspecified'}.`
            : '',
          honors ? `Academic distinction: ${honors}.` : '',
        ].filter(Boolean).join(' ');
    pushSeed(seeds, statement, educationParts);
  });

  data.skills.hardSkills.forEach((skill, index) => {
    pushSeed(seeds, `Technical skill: ${skill}.`, [part(`skills.hardSkills[${index}]`, skill)]);
  });

  data.skills.softSkills.forEach((skill, index) => {
    pushSeed(seeds, `Soft skill: ${skill}.`, [part(`skills.softSkills[${index}]`, skill)]);
  });

  (data.projects ?? []).forEach((project, index) => {
    const prefix = `projects[${index}]`;
    const projectParts = [
      part(`${prefix}.name`, project.name),
      part(`${prefix}.description`, project.description),
      part(`${prefix}.link`, project.link ?? ''),
    ];
    const projectStatement = project.name.trim() && project.description.trim()
      ? `Project ${project.name}: ${project.description}`
      : [
          project.name.trim() ? `Project: ${project.name}.` : 'Project evidence.',
          project.description.trim() ? project.description : '',
          project.link?.trim() ? `Link: ${project.link}.` : '',
        ].filter(Boolean).join(' ');
    pushSeed(seeds, projectStatement, projectParts);

    project.technologies.forEach((technology, techIndex) => {
      const technologyStatement = project.name.trim()
        ? `Used ${technology} on project ${project.name}.`
        : `Project technology: ${technology}.`;
      pushSeed(seeds, technologyStatement, [
        part(`${prefix}.technologies[${techIndex}]`, technology),
        part(`${prefix}.name`, project.name),
      ]);
    });
  });

  (data.certifications ?? []).forEach((certification, index) => {
    const prefix = `certifications[${index}]`;
    const certificationParts = [
      part(`${prefix}.name`, certification.name),
      part(`${prefix}.issuer`, certification.issuer),
      part(`${prefix}.date`, certification.date),
    ];
    const completeLegacyShape = Boolean(
      certification.name.trim() && certification.issuer.trim() && certification.date.trim(),
    );
    const statement = completeLegacyShape
      ? `Certification ${certification.name}, issued by ${certification.issuer}, dated ${certification.date}.`
      : [
          certification.name.trim() ? `Certification: ${certification.name}.` : 'Certification evidence.',
          certification.issuer.trim() ? `Issuer: ${certification.issuer}.` : '',
          certification.date.trim() ? `Date: ${certification.date}.` : '',
        ].filter(Boolean).join(' ');
    pushSeed(seeds, statement, certificationParts);
  });

  (data.languages ?? []).forEach((language, index) => {
    const prefix = `languages[${index}]`;
    const statement = language.proficiency.trim()
      ? `Language ${language.language} proficiency: ${language.proficiency}.`
      : `Language: ${language.language}.`;
    pushSeed(seeds, statement, [
      part(`${prefix}.language`, language.language),
      part(`${prefix}.proficiency`, language.proficiency),
    ]);
  });

  return seeds;
}

function normalized(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function projectLegacyResumeRequest(
  data: ResumeRequest,
  options: LegacyResumeProjectionOptions = {},
): LegacyResumeDomainProjection {
  const projectionKey = requireSafeProjectionKey(options.projectionKey ?? 'legacy');
  const capturedAt = options.capturedAt ?? new Date().toISOString();
  const candidateProfileId =
    options.candidateProfileId ?? domainId('CandidateProfile', `candidate:${projectionKey}`);
  const sourceContext = options.sourceContext;
  const truthClass: TruthClass = sourceContext
    ? 'CANDIDATE_ASSERTED'
    : options.truthClass ?? 'CANDIDATE_ASSERTED';

  const candidateProfile = createCandidateProfile({
    id: candidateProfileId,
    displayName: data.personalInfo.fullName,
    createdAt: capturedAt,
  });

  const sources: CareerSource[] = [];
  let primarySource: CareerSource;
  let reviewSource: CareerSource | undefined;

  if (sourceContext) {
    const receipt = sourceContext.receipt;
    primarySource = createCareerSource({
      id: domainId('CareerSource', `source:${projectionKey}:resume-upload`),
      candidateProfileId,
      kind: 'RESUME_UPLOAD',
      label: `Resume upload: ${receipt.originalFileName}`,
      capturedAt: receipt.capturedAt,
      document: {
        receiptId: receipt.receiptId,
        originalFileName: receipt.originalFileName,
        mimeType: receipt.mimeType,
        byteSize: receipt.byteSize,
        sha256: receipt.sha256,
        importer: receipt.importer,
        importerVersion: receipt.importerVersion,
      },
    });
    reviewSource = createCareerSource({
      id: domainId('CareerSource', `source:${projectionKey}:candidate-review`),
      candidateProfileId,
      kind: 'MANUAL_REVIEW',
      label: 'Candidate review of imported resume',
      capturedAt,
    });
    sources.push(primarySource, reviewSource);
  } else {
    const sourceKind = options.sourceKind ?? 'CANDIDATE_PROVIDED';
    primarySource = createCareerSource({
      id: domainId('CareerSource', `source:${projectionKey}:${sourceKind.toLowerCase()}`),
      candidateProfileId,
      kind: sourceKind,
      label: options.sourceLabel ?? 'Legacy resume form reviewed by candidate',
      capturedAt,
    });
    sources.push(primarySource);
  }

  const importedByPath = new Map(
    (sourceContext?.evidenceMap ?? []).map((item) => [item.fieldPath, item]),
  );
  const evidence: CareerEvidence[] = [];
  const supportEvidenceByPath = new Map<string, CareerEvidence>();

  const createEvidence = (input: Omit<CareerEvidence, 'id'>): CareerEvidence => {
    const ordinal = String(evidence.length + 1).padStart(3, '0');
    const item = createCareerEvidence({
      id: domainId('CareerEvidence', `evidence:${projectionKey}:${ordinal}`),
      ...input,
    });
    evidence.push(item);
    return item;
  };

  const supportEvidenceFor = (evidencePart: EvidencePart): CareerEvidence => {
    const cached = supportEvidenceByPath.get(evidencePart.fieldPath);
    if (cached) return cached;

    const imported = importedByPath.get(evidencePart.fieldPath);
    if (sourceContext && imported) {
      const unchanged = normalized(imported.excerpt) === normalized(evidencePart.excerpt);
      const importedEvidence = createEvidence({
        sourceId: primarySource.id,
        excerpt: imported.excerpt,
        observedAt: sourceContext.receipt.capturedAt,
        locator: imported.locator,
        confidence: imported.confidence,
        reviewState: unchanged ? 'CANDIDATE_CONFIRMED' : 'UNREVIEWED_EXTRACTION',
      });

      if (unchanged) {
        supportEvidenceByPath.set(evidencePart.fieldPath, importedEvidence);
        return importedEvidence;
      }

      const editedEvidence = createEvidence({
        sourceId: reviewSource!.id,
        excerpt: evidencePart.excerpt,
        observedAt: capturedAt,
        locator: {
          scope: 'EXTRACTION_OUTPUT',
          granularity: 'FIELD',
          fieldPath: evidencePart.fieldPath,
        },
        reviewState: 'CANDIDATE_EDITED',
      });
      supportEvidenceByPath.set(evidencePart.fieldPath, editedEvidence);
      return editedEvidence;
    }

    if (sourceContext) {
      const addedEvidence = createEvidence({
        sourceId: reviewSource!.id,
        excerpt: evidencePart.excerpt,
        observedAt: capturedAt,
        locator: {
          scope: 'EXTRACTION_OUTPUT',
          granularity: 'FIELD',
          fieldPath: evidencePart.fieldPath,
        },
        reviewState: 'CANDIDATE_ADDED',
      });
      supportEvidenceByPath.set(evidencePart.fieldPath, addedEvidence);
      return addedEvidence;
    }

    const manualEvidence = createEvidence({
      sourceId: primarySource.id,
      excerpt: evidencePart.excerpt,
      observedAt: capturedAt,
      reviewState: 'CANDIDATE_CONFIRMED',
    });
    supportEvidenceByPath.set(evidencePart.fieldPath, manualEvidence);
    return manualEvidence;
  };

  const assertions: CareerAssertion[] = collectAssertionSeeds(data).map((seed, index) => {
    const supportingEvidence = seed.evidenceParts.map(supportEvidenceFor);
    const evidenceIds: CareerEvidenceId[] = supportingEvidence.map((item) => item.id);
    const sourceIds: CareerSourceId[] = Array.from(new Set(supportingEvidence.map((item) => item.sourceId)));
    const ordinal = String(index + 1).padStart(3, '0');

    return createCareerAssertion({
      id: domainId('CareerAssertion', `assertion:${projectionKey}:${ordinal}`),
      candidateProfileId,
      statement: seed.statement,
      truthClass,
      evidenceIds,
      sourceIds,
      derivedFromAssertionIds: [],
      createdAt: capturedAt,
    });
  });

  return {
    candidateProfile,
    source: primarySource,
    sources,
    evidence,
    assertions,
  };
}

export function buildLegacyTruthContext(
  data: ResumeRequest,
  options: LegacyResumeProjectionOptions = {},
): LegacyTruthContext {
  const projectionKey = requireSafeProjectionKey(options.projectionKey ?? 'legacy');
  const projection = projectLegacyResumeRequest(data, { ...options, projectionKey });
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
