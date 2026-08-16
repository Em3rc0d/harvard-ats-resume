import { createHash } from 'node:crypto';
import {
  domainId,
  type CandidateProfile,
  type CandidateProfileId,
  type CareerAssertion,
  type CareerEvidence,
  type CareerSnapshot,
  type CareerSource,
  type JobSnapshot,
  type MatchReport,
  type OpportunityAssessmentId,
} from '../../domain';
import {
  JOB_INTELLIGENCE_PERSISTENCE_VERSION,
  JOB_MATCH_PERSISTENCE_VERSION,
  stableJson,
} from '../career-vault/CareerVaultIdentity';
import type { JobIntelligenceResult } from '../job/JobIntelligenceEngine';
import {
  validateMarketProjectedJobSnapshotIntegrity,
} from '../market/MarketJobProjectionService';
import type { JobMatchBreakdown, JobMatchResult } from '../matching/JobMatchEngine';
import {
  OPPORTUNITY_ASSESSMENT_POLICY_VERSION,
  type OpportunityAssessment,
} from './OpportunityAssessment';

export const OPPORTUNITY_HISTORY_SCHEMA_VERSION = 'market-opportunity-history-v1' as const;

const TEMPORAL_KEYS = new Set([
  'createdAt',
  'capturedAt',
  'observedAt',
  'generatedAt',
  'updatedAt',
]);

export interface PersistedOpportunityAssessment {
  readonly id: OpportunityAssessmentId;
  readonly careerSnapshotId: CareerSnapshot['id'];
  readonly jobSnapshotId: JobSnapshot['id'];
  readonly matchReport: MatchReport;
  readonly matchScore: number;
  readonly matchBreakdown: JobMatchBreakdown;
  readonly matchEngineVersion: typeof JOB_MATCH_PERSISTENCE_VERSION;
  readonly assessment: OpportunityAssessment;
  readonly assessmentPolicyVersion: typeof OPPORTUNITY_ASSESSMENT_POLICY_VERSION;
  readonly contentSha256: string;
  readonly createdAt: string;
}

export interface OpportunityHistorySnapshot {
  readonly schemaVersion: typeof OPPORTUNITY_HISTORY_SCHEMA_VERSION;
  readonly candidateProfileId: CandidateProfileId;
  readonly careerSnapshots: readonly CareerSnapshot[];
  readonly jobSnapshots: readonly JobSnapshot[];
  readonly assessments: readonly PersistedOpportunityAssessment[];
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface OpportunityHistoryRepository {
  load(candidateProfileId: CandidateProfileId): Promise<OpportunityHistorySnapshot | null>;
  save(snapshot: OpportunityHistorySnapshot): Promise<void>;
}

interface CandidateHistoryTruthInput {
  readonly candidate: CandidateProfile;
  readonly sources: readonly CareerSource[];
  readonly evidence: readonly CareerEvidence[];
  readonly assertions: readonly CareerAssertion[];
  readonly jobMatch: JobMatchResult;
  readonly assessment: OpportunityAssessment;
  readonly capturedAt: string;
}

export interface BuildOpportunityHistoryInput extends CandidateHistoryTruthInput {
  readonly jobIntelligence: JobIntelligenceResult;
}

export interface BuildOpportunityHistoryFromJobSnapshotInput extends CandidateHistoryTruthInput {
  /** Exact prebuilt snapshot. M4B-06 must not reconstruct this object. */
  readonly jobSnapshot: JobSnapshot;
}

export interface OpportunityHistoryArtifacts {
  readonly careerSnapshot: CareerSnapshot;
  readonly jobSnapshot: JobSnapshot;
  readonly assessmentRecord: PersistedOpportunityAssessment;
}

export interface PersistOpportunityHistoryInput extends BuildOpportunityHistoryInput {
  readonly repository: OpportunityHistoryRepository;
}

export interface PersistOpportunityHistoryFromJobSnapshotInput extends BuildOpportunityHistoryFromJobSnapshotInput {
  readonly repository: OpportunityHistoryRepository;
}

export class OpportunityHistoryIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpportunityHistoryIntegrityError';
  }
}

export class OpportunityHistoryUnavailableError extends Error {
  constructor(message = 'Durable opportunity history storage is not configured.') {
    super(message);
    this.name = 'OpportunityHistoryUnavailableError';
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function semanticValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(semanticValue);
  if (!value || typeof value !== 'object') return value;

  return Object.keys(value as Record<string, unknown>)
    .filter((key) => !TEMPORAL_KEYS.has(key))
    .sort()
    .reduce<Record<string, unknown>>((result, key) => {
      result[key] = semanticValue((value as Record<string, unknown>)[key]);
      return result;
    }, {});
}

function semanticHash(value: unknown): string {
  return sha256(stableJson(semanticValue(value)));
}

function requireHistory(condition: boolean, message: string): asserts condition {
  if (!condition) throw new OpportunityHistoryIntegrityError(message);
}

function requireUnique(values: readonly string[], label: string): void {
  requireHistory(new Set(values).size === values.length, `${label} contains duplicate identifiers.`);
}

function careerSnapshotHash(input: {
  readonly candidate: CandidateProfile;
  readonly sources: readonly CareerSource[];
  readonly evidence: readonly CareerEvidence[];
  readonly assertions: readonly CareerAssertion[];
}): string {
  return semanticHash(input);
}

function jobSnapshotHash(input: {
  readonly jobIntelligence: JobIntelligenceResult;
  readonly analyzerVersion: string;
}): string {
  return semanticHash({
    jobDescription: input.jobIntelligence.jobDescription,
    requirements: input.jobIntelligence.requirements,
    language: input.jobIntelligence.language,
    analyzerVersion: input.analyzerVersion,
  });
}

function assessmentRecordHash(input: {
  readonly careerSnapshotId: CareerSnapshot['id'];
  readonly jobSnapshotId: JobSnapshot['id'];
  readonly jobMatch: JobMatchResult;
  readonly assessment: OpportunityAssessment;
}): string {
  return semanticHash({
    careerSnapshotId: input.careerSnapshotId,
    jobSnapshotId: input.jobSnapshotId,
    matchReport: input.jobMatch.report,
    matchScore: input.jobMatch.score,
    matchBreakdown: input.jobMatch.breakdown,
    matchEngineVersion: JOB_MATCH_PERSISTENCE_VERSION,
    assessment: input.assessment,
    assessmentPolicyVersion: OPPORTUNITY_ASSESSMENT_POLICY_VERSION,
  });
}

function validateAssessmentInput(input: CandidateHistoryTruthInput, jobDescriptionId: string): void {
  requireHistory(
    input.assessment.policyVersion === OPPORTUNITY_ASSESSMENT_POLICY_VERSION,
    'OpportunityAssessment policy version is not supported by this history writer.',
  );
  requireHistory(
    input.jobMatch.report.candidateProfileId === input.candidate.id,
    'Job Match belongs to a different candidate than the CareerSnapshot.',
  );
  requireHistory(
    input.jobMatch.report.jobDescriptionId === jobDescriptionId,
    'Job Match belongs to a different job than the JobSnapshot.',
  );
}

function buildCareerSnapshot(input: CandidateHistoryTruthInput): CareerSnapshot {
  const careerHash = careerSnapshotHash({
    candidate: input.candidate,
    sources: input.sources,
    evidence: input.evidence,
    assertions: input.assertions,
  });
  const careerSnapshot: CareerSnapshot = {
    id: domainId('CareerSnapshot', `career-snapshot:${careerHash.slice(0, 32)}`),
    candidateProfileId: input.candidate.id,
    candidate: input.candidate,
    sources: [...input.sources],
    evidence: [...input.evidence],
    assertions: [...input.assertions],
    contentSha256: careerHash,
    capturedAt: input.capturedAt,
  };
  validateCareerSnapshot(careerSnapshot);
  return careerSnapshot;
}

function buildAssessmentRecord(
  input: CandidateHistoryTruthInput,
  careerSnapshot: CareerSnapshot,
  jobSnapshot: JobSnapshot,
): PersistedOpportunityAssessment {
  const recordHash = assessmentRecordHash({
    careerSnapshotId: careerSnapshot.id,
    jobSnapshotId: jobSnapshot.id,
    jobMatch: input.jobMatch,
    assessment: input.assessment,
  });
  const assessmentRecord: PersistedOpportunityAssessment = {
    id: domainId('OpportunityAssessment', `opportunity-assessment:${recordHash.slice(0, 32)}`),
    careerSnapshotId: careerSnapshot.id,
    jobSnapshotId: jobSnapshot.id,
    matchReport: input.jobMatch.report,
    matchScore: input.jobMatch.score,
    matchBreakdown: input.jobMatch.breakdown,
    matchEngineVersion: JOB_MATCH_PERSISTENCE_VERSION,
    assessment: input.assessment,
    assessmentPolicyVersion: OPPORTUNITY_ASSESSMENT_POLICY_VERSION,
    contentSha256: recordHash,
    createdAt: input.capturedAt,
  };
  validatePersistedOpportunityAssessment(
    assessmentRecord,
    new Map([[careerSnapshot.id, careerSnapshot]]),
    new Map([[jobSnapshot.id, jobSnapshot]]),
  );
  return assessmentRecord;
}

export function buildOpportunityHistoryArtifacts(
  input: BuildOpportunityHistoryInput,
): OpportunityHistoryArtifacts {
  validateAssessmentInput(input, input.jobIntelligence.jobDescription.id);
  const careerSnapshot = buildCareerSnapshot(input);

  const jobHash = jobSnapshotHash({
    jobIntelligence: input.jobIntelligence,
    analyzerVersion: JOB_INTELLIGENCE_PERSISTENCE_VERSION,
  });
  const jobSnapshot: JobSnapshot = {
    id: domainId('JobSnapshot', `job-snapshot:${jobHash.slice(0, 32)}`),
    jobDescription: input.jobIntelligence.jobDescription,
    requirements: [...input.jobIntelligence.requirements],
    language: input.jobIntelligence.language,
    analyzerVersion: JOB_INTELLIGENCE_PERSISTENCE_VERSION,
    contentSha256: jobHash,
    capturedAt: input.capturedAt,
  };
  validateJobSnapshot(jobSnapshot);

  const assessmentRecord = buildAssessmentRecord(input, careerSnapshot, jobSnapshot);
  return { careerSnapshot, jobSnapshot, assessmentRecord };
}

/**
 * M4B-06 history bridge. The supplied market-provenanced JobSnapshot is the
 * authority for the job side of the assessment. It is validated and linked
 * directly; no Job Intelligence parser or replacement snapshot is invoked.
 */
export function buildOpportunityHistoryArtifactsFromJobSnapshot(
  input: BuildOpportunityHistoryFromJobSnapshotInput,
): OpportunityHistoryArtifacts {
  validateAssessmentInput(input, input.jobSnapshot.jobDescription.id);
  validateJobSnapshot(input.jobSnapshot);
  requireHistory(
    Boolean(input.jobSnapshot.marketProvenance),
    'M4B-06 requires a market-provenanced JobSnapshot from M4B-05.',
  );
  requireHistory(
    semanticHash(input.jobMatch.requirements) === semanticHash(input.jobSnapshot.requirements),
    'Job Match requirements differ from the exact prebuilt market JobSnapshot.',
  );

  const careerSnapshot = buildCareerSnapshot(input);
  const assessmentRecord = buildAssessmentRecord(input, careerSnapshot, input.jobSnapshot);
  return {
    careerSnapshot,
    jobSnapshot: input.jobSnapshot,
    assessmentRecord,
  };
}

function validateCareerSnapshot(snapshot: CareerSnapshot): void {
  requireHistory(snapshot.candidate.id === snapshot.candidateProfileId, `CareerSnapshot ${snapshot.id} candidate identity mismatch.`);

  const sourceIds = new Set(snapshot.sources.map((item) => item.id));
  const evidenceIds = new Set(snapshot.evidence.map((item) => item.id));
  requireUnique(snapshot.sources.map((item) => item.id), `CareerSnapshot ${snapshot.id} sources`);
  requireUnique(snapshot.evidence.map((item) => item.id), `CareerSnapshot ${snapshot.id} evidence`);
  requireUnique(snapshot.assertions.map((item) => item.id), `CareerSnapshot ${snapshot.id} assertions`);

  snapshot.sources.forEach((source) => requireHistory(
    source.candidateProfileId === snapshot.candidateProfileId,
    `CareerSnapshot ${snapshot.id} contains source ${source.id} from another candidate.`,
  ));
  snapshot.evidence.forEach((item) => requireHistory(
    sourceIds.has(item.sourceId),
    `CareerSnapshot ${snapshot.id} evidence ${item.id} references unknown source.`,
  ));
  snapshot.assertions.forEach((assertion) => {
    requireHistory(
      assertion.candidateProfileId === snapshot.candidateProfileId,
      `CareerSnapshot ${snapshot.id} contains assertion ${assertion.id} from another candidate.`,
    );
    assertion.sourceIds.forEach((id) => requireHistory(sourceIds.has(id), `CareerSnapshot ${snapshot.id} assertion ${assertion.id} references unknown source ${id}.`));
    assertion.evidenceIds.forEach((id) => requireHistory(evidenceIds.has(id), `CareerSnapshot ${snapshot.id} assertion ${assertion.id} references unknown evidence ${id}.`));
  });

  const expectedHash = careerSnapshotHash({
    candidate: snapshot.candidate,
    sources: snapshot.sources,
    evidence: snapshot.evidence,
    assertions: snapshot.assertions,
  });
  requireHistory(expectedHash === snapshot.contentSha256, `CareerSnapshot ${snapshot.id} content hash mismatch.`);
  requireHistory(snapshot.id === `career-snapshot:${expectedHash.slice(0, 32)}`, `CareerSnapshot ${snapshot.id} identity is not content-addressed.`);
}

function validateJobSnapshot(snapshot: JobSnapshot): void {
  requireUnique(snapshot.requirements.map((item) => item.id), `JobSnapshot ${snapshot.id} requirements`);
  snapshot.requirements.forEach((requirement) => requireHistory(
    requirement.jobDescriptionId === snapshot.jobDescription.id,
    `JobSnapshot ${snapshot.id} requirement ${requirement.id} references another JobDescription.`,
  ));

  if (snapshot.marketProvenance) {
    try {
      validateMarketProjectedJobSnapshotIntegrity(snapshot);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown market snapshot integrity failure';
      throw new OpportunityHistoryIntegrityError(
        `JobSnapshot ${snapshot.id} failed market provenance validation: ${message}`,
      );
    }
    return;
  }

  const expectedHash = semanticHash({
    jobDescription: snapshot.jobDescription,
    requirements: snapshot.requirements,
    language: snapshot.language,
    analyzerVersion: snapshot.analyzerVersion,
  });
  requireHistory(expectedHash === snapshot.contentSha256, `JobSnapshot ${snapshot.id} content hash mismatch.`);
  requireHistory(snapshot.id === `job-snapshot:${expectedHash.slice(0, 32)}`, `JobSnapshot ${snapshot.id} identity is not content-addressed.`);
}

function validatePersistedOpportunityAssessment(
  record: PersistedOpportunityAssessment,
  careerSnapshots: ReadonlyMap<CareerSnapshot['id'], CareerSnapshot>,
  jobSnapshots: ReadonlyMap<JobSnapshot['id'], JobSnapshot>,
): void {
  const career = careerSnapshots.get(record.careerSnapshotId);
  const job = jobSnapshots.get(record.jobSnapshotId);
  requireHistory(Boolean(career), `OpportunityAssessment ${record.id} references unknown CareerSnapshot.`);
  requireHistory(Boolean(job), `OpportunityAssessment ${record.id} references unknown JobSnapshot.`);
  requireHistory(record.matchReport.candidateProfileId === career!.candidateProfileId, `OpportunityAssessment ${record.id} MatchReport candidate mismatch.`);
  requireHistory(record.matchReport.jobDescriptionId === job!.jobDescription.id, `OpportunityAssessment ${record.id} MatchReport job mismatch.`);
  requireHistory(record.matchEngineVersion === JOB_MATCH_PERSISTENCE_VERSION, `OpportunityAssessment ${record.id} Match Engine version mismatch.`);
  requireHistory(record.assessmentPolicyVersion === record.assessment.policyVersion, `OpportunityAssessment ${record.id} policy version mismatch.`);

  const requirementIds = new Set(job!.requirements.map((item) => item.id));
  const assertionIds = new Set(career!.assertions.map((item) => item.id));
  requireHistory(
    record.matchReport.matches.length === job!.requirements.length,
    `OpportunityAssessment ${record.id} MatchReport does not cover the exact JobSnapshot requirement set.`,
  );
  record.matchReport.matches.forEach((match) => {
    requireHistory(requirementIds.has(match.requirementId), `OpportunityAssessment ${record.id} MatchReport references requirement outside its JobSnapshot.`);
    match.assertionIds.forEach((id) => requireHistory(assertionIds.has(id), `OpportunityAssessment ${record.id} MatchReport references assertion outside its CareerSnapshot.`));
  });

  const expectedHash = semanticHash({
    careerSnapshotId: record.careerSnapshotId,
    jobSnapshotId: record.jobSnapshotId,
    matchReport: record.matchReport,
    matchScore: record.matchScore,
    matchBreakdown: record.matchBreakdown,
    matchEngineVersion: record.matchEngineVersion,
    assessment: record.assessment,
    assessmentPolicyVersion: record.assessmentPolicyVersion,
  });
  requireHistory(expectedHash === record.contentSha256, `OpportunityAssessment ${record.id} content hash mismatch.`);
  requireHistory(record.id === `opportunity-assessment:${expectedHash.slice(0, 32)}`, `OpportunityAssessment ${record.id} identity is not content-addressed.`);
}

export function validateOpportunityHistorySnapshot(snapshot: OpportunityHistorySnapshot): void {
  requireHistory(snapshot.schemaVersion === OPPORTUNITY_HISTORY_SCHEMA_VERSION, `Unsupported opportunity history schema: ${snapshot.schemaVersion}`);
  requireHistory(Number.isInteger(snapshot.revision) && snapshot.revision >= 1, 'Opportunity history revision must be a positive integer.');
  requireUnique(snapshot.careerSnapshots.map((item) => item.id), 'CareerSnapshot collection');
  requireUnique(snapshot.jobSnapshots.map((item) => item.id), 'JobSnapshot collection');
  requireUnique(snapshot.assessments.map((item) => item.id), 'OpportunityAssessment collection');

  snapshot.careerSnapshots.forEach((item) => {
    requireHistory(item.candidateProfileId === snapshot.candidateProfileId, `CareerSnapshot ${item.id} belongs to another history owner.`);
    validateCareerSnapshot(item);
  });
  snapshot.jobSnapshots.forEach(validateJobSnapshot);

  const careerById = new Map(snapshot.careerSnapshots.map((item) => [item.id, item]));
  const jobById = new Map(snapshot.jobSnapshots.map((item) => [item.id, item]));
  snapshot.assessments.forEach((item) => validatePersistedOpportunityAssessment(item, careerById, jobById));
}

function mergeImmutable<T extends { readonly id: string; readonly contentSha256: string }>(
  existing: readonly T[],
  incoming: T,
  label: string,
): { readonly items: readonly T[]; readonly added: boolean } {
  const prior = existing.find((item) => item.id === incoming.id);
  if (!prior) return { items: [...existing, incoming], added: true };
  requireHistory(prior.contentSha256 === incoming.contentSha256, `${label} identity collision changed historical meaning: ${incoming.id}`);
  return { items: existing, added: false };
}

async function persistOpportunityArtifacts(input: {
  readonly repository: OpportunityHistoryRepository;
  readonly candidateProfileId: CandidateProfileId;
  readonly capturedAt: string;
  readonly artifacts: OpportunityHistoryArtifacts;
}): Promise<OpportunityHistorySnapshot> {
  const existing = await input.repository.load(input.candidateProfileId);
  if (existing) {
    validateOpportunityHistorySnapshot(existing);
    requireHistory(existing.candidateProfileId === input.candidateProfileId, 'Cannot merge opportunity histories from different candidates.');
  }

  const careerMerge = mergeImmutable(existing?.careerSnapshots ?? [], input.artifacts.careerSnapshot, 'CareerSnapshot');
  const jobMerge = mergeImmutable(existing?.jobSnapshots ?? [], input.artifacts.jobSnapshot, 'JobSnapshot');
  const assessmentMerge = mergeImmutable(existing?.assessments ?? [], input.artifacts.assessmentRecord, 'OpportunityAssessment');
  const changed = careerMerge.added || jobMerge.added || assessmentMerge.added;

  if (existing && !changed) return existing;

  const next: OpportunityHistorySnapshot = {
    schemaVersion: OPPORTUNITY_HISTORY_SCHEMA_VERSION,
    candidateProfileId: input.candidateProfileId,
    careerSnapshots: careerMerge.items,
    jobSnapshots: jobMerge.items,
    assessments: assessmentMerge.items,
    revision: (existing?.revision ?? 0) + 1,
    createdAt: existing?.createdAt ?? input.capturedAt,
    updatedAt: input.capturedAt,
  };
  validateOpportunityHistorySnapshot(next);
  await input.repository.save(next);

  const reloaded = await input.repository.load(input.candidateProfileId);
  requireHistory(Boolean(reloaded), 'Opportunity history save could not be reloaded for verification.');
  validateOpportunityHistorySnapshot(reloaded!);
  requireHistory(reloaded!.revision === next.revision, `Opportunity history expected revision ${next.revision} but reloaded ${reloaded!.revision}.`);
  requireHistory(
    reloaded!.assessments.some((item) => item.id === input.artifacts.assessmentRecord.id),
    'Opportunity history reload could not find the persisted assessment.',
  );
  requireHistory(
    reloaded!.jobSnapshots.some((item) => item.id === input.artifacts.jobSnapshot.id),
    'Opportunity history reload could not find the exact assessed JobSnapshot.',
  );
  return reloaded!;
}

/**
 * Persists the exact CareerSnapshot ↔ legacy/manual JobSnapshot comparison.
 */
export async function persistOpportunityAssessmentHistory(
  input: PersistOpportunityHistoryInput,
): Promise<OpportunityHistorySnapshot> {
  const artifacts = buildOpportunityHistoryArtifacts(input);
  return persistOpportunityArtifacts({
    repository: input.repository,
    candidateProfileId: input.candidate.id,
    capturedAt: input.capturedAt,
    artifacts,
  });
}

/**
 * M4B-06 persistence path. The market JobSnapshot identity entering this method
 * is the same identity stored in OpportunityHistory after reload verification.
 */
export async function persistOpportunityAssessmentHistoryFromJobSnapshot(
  input: PersistOpportunityHistoryFromJobSnapshotInput,
): Promise<OpportunityHistorySnapshot> {
  const artifacts = buildOpportunityHistoryArtifactsFromJobSnapshot(input);
  return persistOpportunityArtifacts({
    repository: input.repository,
    candidateProfileId: input.candidate.id,
    capturedAt: input.capturedAt,
    artifacts,
  });
}
