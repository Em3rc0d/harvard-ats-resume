import {
  validateResumeManifest,
  type CandidateProfile,
  type CareerAssertion,
  type CareerEvidence,
  type CareerSource,
} from '../../domain';
import type { JobIntelligenceResult } from '../job/JobIntelligenceEngine';
import type { JobMatchResult } from '../matching/JobMatchEngine';
import type { RuntimeResumeComposition } from '../resume/ResumeCompositionService';
import {
  JOB_INTELLIGENCE_PERSISTENCE_VERSION,
  JOB_MATCH_PERSISTENCE_VERSION,
  stableJson,
} from './CareerVaultIdentity';
import {
  CAREER_VAULT_SCHEMA_VERSION,
  type CareerVaultRepository,
  type CareerVaultSnapshot,
  type PersistedJobAnalysis,
  type PersistedMatchEvaluation,
} from './CareerVaultRepository';

export class CareerVaultIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CareerVaultIntegrityError';
  }
}

export interface PersistCareerVaultInput {
  readonly repository: CareerVaultRepository;
  readonly candidate: CandidateProfile;
  readonly sources: readonly CareerSource[];
  readonly evidence: readonly CareerEvidence[];
  readonly assertions: readonly CareerAssertion[];
  readonly jobIntelligence?: JobIntelligenceResult;
  readonly jobMatch?: JobMatchResult;
  readonly resumeComposition: RuntimeResumeComposition;
  readonly persistedAt?: string;
}

const TEMPORAL_KEYS = new Set([
  'createdAt',
  'capturedAt',
  'observedAt',
  'generatedAt',
  'updatedAt',
]);

function semanticValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(semanticValue);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .filter((key) => !TEMPORAL_KEYS.has(key))
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = semanticValue((value as Record<string, unknown>)[key]);
        return result;
      }, {});
  }
  return value;
}

function semanticallyEqual(left: unknown, right: unknown): boolean {
  return stableJson(semanticValue(left)) === stableJson(semanticValue(right));
}

function mergeImmutableByKey<T>(
  existing: readonly T[],
  incoming: readonly T[],
  keyOf: (item: T) => string,
  label: string,
): T[] {
  const merged = new Map(existing.map((item) => [keyOf(item), item]));

  incoming.forEach((item) => {
    const key = keyOf(item);
    const prior = merged.get(key);
    if (prior && !semanticallyEqual(prior, item)) {
      throw new CareerVaultIntegrityError(
        `${label} identity collision would overwrite historical meaning: ${key}`,
      );
    }
    if (!prior) merged.set(key, item);
  });

  return Array.from(merged.values());
}

function requireUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new CareerVaultIntegrityError(`${label} contains duplicate identifiers.`);
  }
}

function requireReference(
  condition: boolean,
  message: string,
): asserts condition {
  if (!condition) throw new CareerVaultIntegrityError(message);
}

/**
 * Validates the complete persisted graph. This is deliberately stricter than
 * validating each object in isolation: every persisted reference must resolve
 * inside the same candidate vault snapshot and manifests must preserve full
 * claim-to-assertion provenance.
 */
export function validateCareerVaultSnapshot(snapshot: CareerVaultSnapshot): void {
  requireReference(
    snapshot.schemaVersion === CAREER_VAULT_SCHEMA_VERSION,
    `Unsupported Career Vault schema: ${snapshot.schemaVersion}`,
  );
  requireReference(
    Number.isInteger(snapshot.revision) && snapshot.revision >= 1,
    'Career Vault revision must be a positive integer.',
  );

  requireUnique(snapshot.sources.map((item) => item.id), 'CareerSource collection');
  requireUnique(snapshot.evidence.map((item) => item.id), 'CareerEvidence collection');
  requireUnique(snapshot.assertions.map((item) => item.id), 'CareerAssertion collection');
  requireUnique(snapshot.jobs.map((item) => item.id), 'JobDescription collection');
  requireUnique(snapshot.jobRequirements.map((item) => item.id), 'JobRequirement collection');
  requireUnique(snapshot.matchReports.map((item) => item.id), 'MatchReport collection');
  requireUnique(snapshot.resumeClaims.map((item) => item.id), 'ResumeClaim collection');
  requireUnique(snapshot.resumeVersions.map((item) => item.id), 'ResumeVersion collection');
  requireUnique(snapshot.resumeManifests.map((item) => item.id), 'ResumeManifest collection');

  const sourceIds = new Set(snapshot.sources.map((item) => item.id));
  const evidenceIds = new Set(snapshot.evidence.map((item) => item.id));
  const assertionIds = new Set(snapshot.assertions.map((item) => item.id));
  const jobIds = new Set(snapshot.jobs.map((item) => item.id));
  const requirementIds = new Set(snapshot.jobRequirements.map((item) => item.id));
  const matchReportIds = new Set(snapshot.matchReports.map((item) => item.id));
  const claimIds = new Set(snapshot.resumeClaims.map((item) => item.id));
  const versionIds = new Set(snapshot.resumeVersions.map((item) => item.id));
  const claimsById = new Map(snapshot.resumeClaims.map((item) => [item.id, item]));

  snapshot.sources.forEach((source) => {
    requireReference(
      source.candidateProfileId === snapshot.candidate.id,
      `CareerSource ${source.id} belongs to a different candidate.`,
    );
  });

  snapshot.evidence.forEach((item) => {
    requireReference(sourceIds.has(item.sourceId), `CareerEvidence ${item.id} references unknown source.`);
  });

  snapshot.assertions.forEach((assertion) => {
    requireReference(
      assertion.candidateProfileId === snapshot.candidate.id,
      `CareerAssertion ${assertion.id} belongs to a different candidate.`,
    );
    assertion.sourceIds.forEach((id) => requireReference(
      sourceIds.has(id),
      `CareerAssertion ${assertion.id} references unknown source ${id}.`,
    ));
    assertion.evidenceIds.forEach((id) => requireReference(
      evidenceIds.has(id),
      `CareerAssertion ${assertion.id} references unknown evidence ${id}.`,
    ));
  });

  snapshot.jobRequirements.forEach((requirement) => requireReference(
    jobIds.has(requirement.jobDescriptionId),
    `JobRequirement ${requirement.id} references unknown JobDescription.`,
  ));

  snapshot.jobAnalyses.forEach((analysis) => {
    requireReference(
      jobIds.has(analysis.jobDescriptionId),
      `Persisted job analysis references unknown JobDescription ${analysis.jobDescriptionId}.`,
    );
    requireReference(Boolean(analysis.analyzerVersion), 'Persisted job analysis requires analyzerVersion.');
  });

  snapshot.matchReports.forEach((report) => {
    requireReference(
      report.candidateProfileId === snapshot.candidate.id,
      `MatchReport ${report.id} belongs to a different candidate.`,
    );
    requireReference(
      jobIds.has(report.jobDescriptionId),
      `MatchReport ${report.id} references unknown JobDescription.`,
    );
    report.matches.forEach((match) => {
      requireReference(
        requirementIds.has(match.requirementId),
        `RequirementMatch ${match.id} references unknown JobRequirement.`,
      );
      match.assertionIds.forEach((id) => requireReference(
        assertionIds.has(id),
        `RequirementMatch ${match.id} references unknown CareerAssertion ${id}.`,
      ));
    });
  });

  snapshot.matchEvaluations.forEach((evaluation) => {
    requireReference(
      matchReportIds.has(evaluation.matchReportId),
      `Persisted match evaluation references unknown MatchReport ${evaluation.matchReportId}.`,
    );
    requireReference(Boolean(evaluation.engineVersion), 'Persisted match evaluation requires engineVersion.');
  });

  snapshot.resumeClaims.forEach((claim) => claim.assertionIds.forEach((id) => requireReference(
    assertionIds.has(id),
    `ResumeClaim ${claim.id} references unknown CareerAssertion ${id}.`,
  )));

  snapshot.resumeVersions.forEach((version) => {
    requireReference(
      version.candidateProfileId === snapshot.candidate.id,
      `ResumeVersion ${version.id} belongs to a different candidate.`,
    );
    version.claimIds.forEach((id) => requireReference(
      claimIds.has(id),
      `ResumeVersion ${version.id} references unknown ResumeClaim ${id}.`,
    ));
    if (version.targetedJobDescriptionId) {
      requireReference(
        jobIds.has(version.targetedJobDescriptionId),
        `ResumeVersion ${version.id} references unknown target JobDescription.`,
      );
    }
    if (version.matchReportId) {
      requireReference(
        matchReportIds.has(version.matchReportId),
        `ResumeVersion ${version.id} references unknown MatchReport.`,
      );
    }
  });

  snapshot.resumeManifests.forEach((manifest) => {
    requireReference(
      versionIds.has(manifest.resumeVersionId),
      `ResumeManifest ${manifest.id} references unknown ResumeVersion.`,
    );
    manifest.entries.forEach((entry) => entry.assertionIds.forEach((id) => requireReference(
      assertionIds.has(id),
      `ResumeManifest ${manifest.id} references unknown CareerAssertion ${id}.`,
    )));
    const validation = validateResumeManifest(manifest, claimsById);
    if (!validation.ok) {
      throw new CareerVaultIntegrityError(
        validation.issues.map((issue) => issue.message).join('\n'),
      );
    }
  });
}

function buildSnapshot(
  existing: CareerVaultSnapshot | null,
  input: PersistCareerVaultInput,
  persistedAt: string,
): CareerVaultSnapshot {
  if (existing && existing.candidate.id !== input.candidate.id) {
    throw new CareerVaultIntegrityError('Cannot merge different candidates into one Career Vault.');
  }

  const jobAnalyses: PersistedJobAnalysis[] = input.jobIntelligence
    ? [{
        jobDescriptionId: input.jobIntelligence.jobDescription.id,
        language: input.jobIntelligence.language,
        analyzerVersion: JOB_INTELLIGENCE_PERSISTENCE_VERSION,
      }]
    : [];
  const matchEvaluations: PersistedMatchEvaluation[] = input.jobMatch
    ? [{
        matchReportId: input.jobMatch.report.id,
        score: input.jobMatch.score,
        breakdown: input.jobMatch.breakdown,
        engineVersion: JOB_MATCH_PERSISTENCE_VERSION,
      }]
    : [];

  const snapshot: CareerVaultSnapshot = {
    schemaVersion: CAREER_VAULT_SCHEMA_VERSION,
    candidate: existing
      ? { ...input.candidate, createdAt: existing.candidate.createdAt }
      : input.candidate,
    sources: mergeImmutableByKey(existing?.sources ?? [], input.sources, (item) => item.id, 'CareerSource'),
    evidence: mergeImmutableByKey(existing?.evidence ?? [], input.evidence, (item) => item.id, 'CareerEvidence'),
    assertions: mergeImmutableByKey(existing?.assertions ?? [], input.assertions, (item) => item.id, 'CareerAssertion'),
    jobs: mergeImmutableByKey(
      existing?.jobs ?? [],
      input.jobIntelligence ? [input.jobIntelligence.jobDescription] : [],
      (item) => item.id,
      'JobDescription',
    ),
    jobRequirements: mergeImmutableByKey(
      existing?.jobRequirements ?? [],
      input.jobIntelligence?.requirements ?? [],
      (item) => item.id,
      'JobRequirement',
    ),
    jobAnalyses: mergeImmutableByKey(
      existing?.jobAnalyses ?? [],
      jobAnalyses,
      (item) => `${item.jobDescriptionId}:${item.analyzerVersion}`,
      'Job analysis',
    ),
    matchReports: mergeImmutableByKey(
      existing?.matchReports ?? [],
      input.jobMatch ? [input.jobMatch.report] : [],
      (item) => item.id,
      'MatchReport',
    ),
    matchEvaluations: mergeImmutableByKey(
      existing?.matchEvaluations ?? [],
      matchEvaluations,
      (item) => `${item.matchReportId}:${item.engineVersion}`,
      'Match evaluation',
    ),
    resumeClaims: mergeImmutableByKey(
      existing?.resumeClaims ?? [],
      input.resumeComposition.claims,
      (item) => item.id,
      'ResumeClaim',
    ),
    resumeVersions: mergeImmutableByKey(
      existing?.resumeVersions ?? [],
      [input.resumeComposition.version],
      (item) => item.id,
      'ResumeVersion',
    ),
    resumeManifests: mergeImmutableByKey(
      existing?.resumeManifests ?? [],
      [input.resumeComposition.manifest],
      (item) => item.id,
      'ResumeManifest',
    ),
    revision: (existing?.revision ?? 0) + 1,
    createdAt: existing?.createdAt ?? persistedAt,
    updatedAt: persistedAt,
  };

  validateCareerVaultSnapshot(snapshot);
  return snapshot;
}

/**
 * Persists the complete candidate/job/resume provenance graph as one atomic
 * repository snapshot, then reloads and revalidates it before success returns.
 * A failed save or failed verification must propagate to the API so a generated
 * resume is never reported as durably stored when it is not.
 */
export async function persistCareerVault(
  input: PersistCareerVaultInput,
): Promise<CareerVaultSnapshot> {
  const persistedAt = input.persistedAt ?? new Date().toISOString();
  const existing = await input.repository.load(input.candidate.id);
  if (existing) validateCareerVaultSnapshot(existing);

  const next = buildSnapshot(existing, input, persistedAt);
  await input.repository.save(next);

  const reloaded = await input.repository.load(input.candidate.id);
  if (!reloaded) {
    throw new CareerVaultIntegrityError('Career Vault save could not be reloaded for verification.');
  }
  validateCareerVaultSnapshot(reloaded);

  requireReference(
    reloaded.revision === next.revision,
    `Career Vault verification expected revision ${next.revision} but loaded ${reloaded.revision}.`,
  );
  requireReference(
    reloaded.resumeVersions.some((item) => item.id === input.resumeComposition.version.id),
    'Career Vault verification could not find the persisted ResumeVersion.',
  );
  requireReference(
    reloaded.resumeManifests.some((item) => item.id === input.resumeComposition.manifest.id),
    'Career Vault verification could not find the persisted ResumeManifest.',
  );

  return reloaded;
}
