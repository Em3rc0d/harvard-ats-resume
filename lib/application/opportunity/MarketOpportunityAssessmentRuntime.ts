import type {
  CandidateProfile,
  CareerAssertion,
  CareerEvidence,
  CareerSource,
  JobSnapshotId,
  MarketJobProjection,
} from '../../domain';
import {
  validateMarketJobProjectionHistorySnapshot,
  type MarketJobProjectionHistoryRepository,
} from '../market/MarketJobProjectionHistory';
import {
  buildOpportunityHistoryArtifactsFromJobSnapshot,
  persistOpportunityAssessmentHistoryFromJobSnapshot,
  type OpportunityHistoryArtifacts,
  type OpportunityHistoryRepository,
  type OpportunityHistorySnapshot,
} from './OpportunityHistory';
import {
  assessMarketJobSnapshot,
  type MarketOpportunityAssessmentResult,
} from './MarketOpportunityAssessmentService';

export class MarketAssessmentJobSnapshotNotFoundError extends Error {
  constructor(readonly jobSnapshotId: JobSnapshotId) {
    super(`Market JobSnapshot ${jobSnapshotId} was not found in durable M4B-05 projection history.`);
    this.name = 'MarketAssessmentJobSnapshotNotFoundError';
  }
}

export interface MarketOpportunityAssessmentRuntimeInput {
  readonly candidate: CandidateProfile;
  readonly sources: readonly CareerSource[];
  readonly evidence: readonly CareerEvidence[];
  readonly assertions: readonly CareerAssertion[];
  readonly candidateSnapshotSha256: string;
  readonly jobSnapshotId: JobSnapshotId;
  readonly capturedAt?: string;
}

export interface MarketOpportunityAssessmentRuntimeDependencies {
  readonly marketProjectionRepository: MarketJobProjectionHistoryRepository;
  readonly opportunityHistoryRepository: OpportunityHistoryRepository;
}

export interface MarketOpportunityAssessmentRuntimeResult extends MarketOpportunityAssessmentResult {
  readonly projection: MarketJobProjection;
  readonly artifacts: OpportunityHistoryArtifacts;
  readonly history: OpportunityHistorySnapshot;
  readonly persistence: 'DURABLE_MARKET_JOB_SNAPSHOT_OPPORTUNITY_HISTORY_M4B_06';
  readonly historyScopeBoundary: 'ASSESSMENT_REFERENCES_EXACT_MARKET_JOB_SNAPSHOT_AND_CAREER_SNAPSHOT';
}

/**
 * Loads the exact M4B-05 snapshot selected by id, assesses it against candidate
 * truth, and persists the very same snapshot identity into OpportunityHistory.
 */
export async function assessDurableMarketJobSnapshot(
  input: MarketOpportunityAssessmentRuntimeInput,
  dependencies: MarketOpportunityAssessmentRuntimeDependencies,
): Promise<MarketOpportunityAssessmentRuntimeResult> {
  const projectionHistory = await dependencies.marketProjectionRepository.load();
  if (!projectionHistory) throw new MarketAssessmentJobSnapshotNotFoundError(input.jobSnapshotId);
  validateMarketJobProjectionHistorySnapshot(projectionHistory);

  const record = projectionHistory.records.find((item) => item.jobSnapshot.id === input.jobSnapshotId);
  if (!record) throw new MarketAssessmentJobSnapshotNotFoundError(input.jobSnapshotId);

  const capturedAt = input.capturedAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(capturedAt))) {
    throw new Error('Market opportunity assessment capturedAt must be a valid timestamp.');
  }

  const assessed = assessMarketJobSnapshot({
    jobSnapshot: record.jobSnapshot,
    assertions: input.assertions,
    candidateSnapshotSha256: input.candidateSnapshotSha256,
    assessedAt: capturedAt,
  });
  const historyInput = {
    repository: dependencies.opportunityHistoryRepository,
    candidate: input.candidate,
    sources: input.sources,
    evidence: input.evidence,
    assertions: input.assertions,
    jobSnapshot: record.jobSnapshot,
    jobMatch: assessed.jobMatch,
    assessment: assessed.assessment,
    capturedAt,
  } as const;
  const artifacts = buildOpportunityHistoryArtifactsFromJobSnapshot(historyInput);
  const history = await persistOpportunityAssessmentHistoryFromJobSnapshot(historyInput);

  if (artifacts.jobSnapshot.id !== input.jobSnapshotId) {
    throw new Error('M4B-06 replaced the requested market JobSnapshot identity.');
  }
  const persistedJobSnapshot = history.jobSnapshots.find((item) => item.id === input.jobSnapshotId);
  if (!persistedJobSnapshot || persistedJobSnapshot.contentSha256 !== record.jobSnapshot.contentSha256) {
    throw new Error('OpportunityHistory did not preserve the exact market JobSnapshot content address.');
  }
  if (artifacts.assessmentRecord.jobSnapshotId !== input.jobSnapshotId) {
    throw new Error('OpportunityAssessment history is not linked to the requested market JobSnapshot.');
  }

  return {
    ...assessed,
    projection: record.projection,
    artifacts,
    history,
    persistence: 'DURABLE_MARKET_JOB_SNAPSHOT_OPPORTUNITY_HISTORY_M4B_06',
    historyScopeBoundary: 'ASSESSMENT_REFERENCES_EXACT_MARKET_JOB_SNAPSHOT_AND_CAREER_SNAPSHOT',
  };
}
