import { createHash } from 'node:crypto';
import {
  MARKET_CANDIDATE_ANALYSIS_POLICY_VERSION,
  MARKET_CANDIDATE_ANALYSIS_SCHEMA_VERSION,
  domainId,
  type CandidateProfile,
  type CareerAssertion,
  type CareerEvidence,
  type CareerSource,
  type CareerTarget,
  type MarketCandidateAnalysisFailureCode,
  type MarketCandidateAnalysisItem,
  type MarketCandidateAnalysisRun,
  type MarketCandidateAnalysisStage,
  type MarketRetrievalCandidate,
  type OpportunitySpace,
} from '../../domain';
import { stableJson } from '../career-vault/CareerVaultIdentity';
import {
  buildMarketCandidateSet,
} from './MarketCandidateRetrievalService';
import {
  interpretMarketObservation,
} from './MarketInterpretationService';
import type { DerivedMarketInterpretationHistoryRepository } from './DerivedMarketInterpretationHistory';
import {
  projectDurableMarketObservationToJobIntelligence,
} from './MarketJobProjectionRuntime';
import type { MarketJobProjectionHistoryRepository } from './MarketJobProjectionHistory';
import type { MarketObservationHistoryRepository } from './MarketObservationHistory';
import {
  registerDurableMarketOpportunityLifecycle,
} from './MarketOpportunityLifecycleRuntime';
import type { MarketOpportunityIndexRepository } from './MarketOpportunityIndexHistory';
import {
  assessDurableMarketJobSnapshot,
} from '../opportunity/MarketOpportunityAssessmentRuntime';
import type { OpportunityHistoryRepository } from '../opportunity/OpportunityHistory';
import {
  buildOpportunitySpace,
  type OpportunitySpaceCandidate,
} from '../opportunity/OpportunitySpaceService';
import {
  persistOpportunitySpace,
  type OpportunitySpaceRepository,
} from '../opportunity/OpportunitySpaceHistory';
import {
  assessCareerTargetRelevance,
} from '../target/CareerTargetService';
import {
  recordTargetOpportunityEvaluation,
  validateCareerTargetPortfolio,
  type CareerTargetRepository,
} from '../target/CareerTargetPortfolio';

export const MARKET_CANDIDATE_ANALYSIS_MAX_DEEP_ANALYSIS = 10;

export class MarketCandidateAnalysisUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MarketCandidateAnalysisUnavailableError';
  }
}

export interface AnalyzeSelectedMarketCandidatesInput {
  readonly candidate: CandidateProfile;
  readonly sources: readonly CareerSource[];
  readonly evidence: readonly CareerEvidence[];
  readonly assertions: readonly CareerAssertion[];
  readonly candidateSnapshotSha256: string;
  readonly target: CareerTarget;
  readonly generatedAt?: string;
  /** Internal/test seam only. Public callers never own this budget. */
  readonly maxDeepAnalysis?: number;
}

export interface AnalyzeSelectedMarketCandidatesDependencies {
  readonly observationRepository: MarketObservationHistoryRepository;
  readonly interpretationRepository: DerivedMarketInterpretationHistoryRepository;
  readonly projectionRepository: MarketJobProjectionHistoryRepository;
  readonly opportunityHistoryRepository: OpportunityHistoryRepository;
  readonly targetRepository: CareerTargetRepository;
  readonly opportunityIndexRepository: MarketOpportunityIndexRepository;
  readonly opportunitySpaceRepository: OpportunitySpaceRepository;
}

export interface AnalyzeSelectedMarketCandidatesResult {
  readonly run: MarketCandidateAnalysisRun;
  readonly opportunitySpace?: OpportunitySpace;
}

function requireAnalysis(condition: boolean, message: string): asserts condition {
  if (!condition) throw new MarketCandidateAnalysisUnavailableError(message);
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function failureCode(stage: MarketCandidateAnalysisStage): MarketCandidateAnalysisFailureCode {
  switch (stage) {
    case 'INTERPRETATION': return 'INTERPRETATION_FAILED';
    case 'PROJECTION': return 'PROJECTION_FAILED';
    case 'ASSESSMENT': return 'ASSESSMENT_FAILED';
    case 'TARGET_LINK': return 'TARGET_LINK_FAILED';
    case 'LIFECYCLE': return 'LIFECYCLE_FAILED';
  }
}

function selectedDisposition(
  candidate: MarketRetrievalCandidate,
): Extract<MarketRetrievalCandidate['disposition'], 'CANDIDATE' | 'REVIEW'> {
  requireAnalysis(
    candidate.disposition === 'CANDIDATE' || candidate.disposition === 'REVIEW',
    `M4B-11 received a non-selected retrieval disposition: ${candidate.disposition}.`,
  );
  return candidate.disposition;
}

function runSemantic(run: Omit<MarketCandidateAnalysisRun, 'id' | 'contentSha256' | 'generatedAt'>) {
  return run;
}

/**
 * M4B-11 orchestration boundary.
 *
 * Selection authority remains M4B-10. For each bounded selected current
 * MarketObservation, this function invokes the already-trusted M4B-04 -> M4B-05
 * -> M4B-06 chain, then records target relevance and lifecycle before allowing
 * that exact assessment into OpportunitySpace. Each item is isolated: a later
 * failure never rolls back prior durable facts or assessments.
 */
export async function analyzeSelectedMarketCandidates(
  input: AnalyzeSelectedMarketCandidatesInput,
  dependencies: AnalyzeSelectedMarketCandidatesDependencies,
): Promise<AnalyzeSelectedMarketCandidatesResult> {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  requireAnalysis(Number.isFinite(Date.parse(generatedAt)), 'generatedAt must be a valid timestamp.');
  requireAnalysis(/^[a-f0-9]{64}$/.test(input.candidateSnapshotSha256), 'candidateSnapshotSha256 must be a canonical SHA-256 digest.');
  requireAnalysis(input.assertions.length > 0, 'At least one evidence-backed CareerAssertion is required for deep analysis.');
  requireAnalysis(input.target.candidateProfileId === input.candidate.id, 'Active CareerTarget belongs to another candidate.');

  const maxDeepAnalysis = input.maxDeepAnalysis ?? MARKET_CANDIDATE_ANALYSIS_MAX_DEEP_ANALYSIS;
  requireAnalysis(
    Number.isInteger(maxDeepAnalysis)
      && maxDeepAnalysis >= 1
      && maxDeepAnalysis <= MARKET_CANDIDATE_ANALYSIS_MAX_DEEP_ANALYSIS,
    `M4B-11 maxDeepAnalysis must be between 1 and ${MARKET_CANDIDATE_ANALYSIS_MAX_DEEP_ANALYSIS}.`,
  );

  const [observationHistory, targetPortfolio] = await Promise.all([
    dependencies.observationRepository.load(),
    dependencies.targetRepository.load(input.candidate.id),
  ]);
  requireAnalysis(Boolean(observationHistory), 'Durable market observation history is required.');
  requireAnalysis(Boolean(targetPortfolio), 'Durable active CareerTarget is required.');
  validateCareerTargetPortfolio(targetPortfolio!);
  requireAnalysis(targetPortfolio!.activeTargetId === input.target.id, 'M4B-11 can analyze only the currently active CareerTarget.');
  const durableTarget = targetPortfolio!.targets.find((item) => item.id === input.target.id);
  requireAnalysis(
    Boolean(durableTarget) && durableTarget!.contentSha256 === input.target.contentSha256,
    'Active CareerTarget content differs from the durable target portfolio.',
  );

  const candidateSet = buildMarketCandidateSet({
    target: input.target,
    observationHistory: observationHistory!,
    evaluatedAt: generatedAt,
  });
  requireAnalysis(candidateSet.candidateProfileId === input.candidate.id, 'M4B-10 candidate set belongs to another candidate.');
  requireAnalysis(candidateSet.careerTargetId === input.target.id, 'M4B-10 candidate set belongs to another CareerTarget.');

  const selected = candidateSet.candidates.slice(0, maxDeepAnalysis);
  const items: MarketCandidateAnalysisItem[] = [];
  const opportunityCandidates: OpportunitySpaceCandidate[] = [];

  for (let index = 0; index < selected.length; index += 1) {
    const selectedCandidate = selected[index];
    let stage: MarketCandidateAnalysisStage = 'INTERPRETATION';
    let interpretationId: MarketCandidateAnalysisItem['derivedMarketInterpretationId'];
    let projectionId: MarketCandidateAnalysisItem['marketJobProjectionId'];
    let jobSnapshotId: MarketCandidateAnalysisItem['jobSnapshotId'];
    let opportunityAssessmentId: MarketCandidateAnalysisItem['opportunityAssessmentId'];
    let careerSnapshotId: MarketCandidateAnalysisItem['careerSnapshotId'];
    let targetRelevanceLevel: MarketCandidateAnalysisItem['targetRelevanceLevel'];

    try {
      const interpreted = await interpretMarketObservation(
        selectedCandidate.marketObservationId,
        {
          observationRepository: dependencies.observationRepository,
          interpretationRepository: dependencies.interpretationRepository,
          generatedAt,
        },
      );
      interpretationId = interpreted.interpretation.id;

      stage = 'PROJECTION';
      const projected = await projectDurableMarketObservationToJobIntelligence(
        selectedCandidate.marketObservationId,
        {
          observationRepository: dependencies.observationRepository,
          interpretationRepository: dependencies.interpretationRepository,
          projectionRepository: dependencies.projectionRepository,
          projectedAt: generatedAt,
        },
      );
      projectionId = projected.projection.id;
      jobSnapshotId = projected.jobSnapshot.id;

      stage = 'ASSESSMENT';
      const assessed = await assessDurableMarketJobSnapshot(
        {
          candidate: input.candidate,
          sources: input.sources,
          evidence: input.evidence,
          assertions: input.assertions,
          candidateSnapshotSha256: input.candidateSnapshotSha256,
          jobSnapshotId: projected.jobSnapshot.id,
          capturedAt: generatedAt,
        },
        {
          marketProjectionRepository: dependencies.projectionRepository,
          opportunityHistoryRepository: dependencies.opportunityHistoryRepository,
        },
      );
      opportunityAssessmentId = assessed.artifacts.assessmentRecord.id;
      careerSnapshotId = assessed.artifacts.careerSnapshot.id;
      requireAnalysis(
        assessed.jobSnapshot.marketProvenance?.marketObservationId === selectedCandidate.marketObservationId,
        'M4B-06 assessment does not reference the exact M4B-10 selected MarketObservation.',
      );

      const targetSourceText = [
        assessed.jobSnapshot.jobDescription.title,
        assessed.jobSnapshot.jobDescription.sourceText,
      ].filter((value): value is string => Boolean(value?.trim())).join('\n');
      const targetRelevance = assessCareerTargetRelevance(input.target, targetSourceText);
      targetRelevanceLevel = targetRelevance.level;

      stage = 'TARGET_LINK';
      await recordTargetOpportunityEvaluation(
        dependencies.targetRepository,
        input.target,
        assessed.artifacts.assessmentRecord.id,
        targetRelevance,
        generatedAt,
      );

      stage = 'LIFECYCLE';
      const lifecycle = await registerDurableMarketOpportunityLifecycle(
        selectedCandidate.marketObservationId,
        {
          observationRepository: dependencies.observationRepository,
          opportunityIndexRepository: dependencies.opportunityIndexRepository,
          evaluatedAt: generatedAt,
        },
      );
      requireAnalysis(
        lifecycle.lifecycle.marketOpportunityId === selectedCandidate.marketOpportunityId,
        'M4B-11 lifecycle identity differs from M4B-10 retrieval identity.',
      );
      requireAnalysis(
        lifecycle.lifecycle.currentMarketObservationId === selectedCandidate.marketObservationId,
        'M4B-11 refuses to rank an assessment whose selected MarketObservation is no longer current.',
      );

      opportunityCandidates.push({
        assessmentRecord: assessed.artifacts.assessmentRecord,
        targetRelevance,
        marketLifecycle: lifecycle.lifecycle,
        marketAssessmentObservationId: selectedCandidate.marketObservationId,
      });
      items.push({
        marketOpportunityId: selectedCandidate.marketOpportunityId,
        marketObservationId: selectedCandidate.marketObservationId,
        retrievalDisposition: selectedDisposition(selectedCandidate),
        retrievalRank: index + 1,
        status: 'ANALYZED',
        completedStage: 'LIFECYCLE',
        derivedMarketInterpretationId: interpretationId,
        marketJobProjectionId: projectionId,
        jobSnapshotId,
        opportunityAssessmentId,
        careerSnapshotId,
        targetRelevanceLevel,
        scopeBoundary: 'ANALYSIS_RESULT_DOES_NOT_CHANGE_RETRIEVAL_MARKET_FACT_OR_CANDIDATE_TRUTH',
      });
    } catch {
      items.push({
        marketOpportunityId: selectedCandidate.marketOpportunityId,
        marketObservationId: selectedCandidate.marketObservationId,
        retrievalDisposition: selectedDisposition(selectedCandidate),
        retrievalRank: index + 1,
        status: 'FAILED',
        failedStage: stage,
        failureCode: failureCode(stage),
        derivedMarketInterpretationId: interpretationId,
        marketJobProjectionId: projectionId,
        jobSnapshotId,
        opportunityAssessmentId,
        careerSnapshotId,
        targetRelevanceLevel,
        scopeBoundary: 'ANALYSIS_RESULT_DOES_NOT_CHANGE_RETRIEVAL_MARKET_FACT_OR_CANDIDATE_TRUTH',
      });
    }
  }

  let opportunitySpace: OpportunitySpace | undefined;
  let opportunitySpaceStatus: MarketCandidateAnalysisRun['opportunitySpace']['status'] = 'INSUFFICIENT_SUCCESSFUL_ASSESSMENTS';
  if (opportunityCandidates.length >= 2) {
    try {
      const careerSnapshotIds = new Set(opportunityCandidates.map((item) => item.assessmentRecord.careerSnapshotId));
      requireAnalysis(careerSnapshotIds.size === 1, 'Successful batch assessments do not share one CareerSnapshot.');
      const [careerSnapshotId] = [...careerSnapshotIds];
      opportunitySpace = buildOpportunitySpace({
        candidateProfileId: input.candidate.id,
        careerSnapshotId,
        careerTargetId: input.target.id,
        candidates: opportunityCandidates,
        generatedAt,
      });
      await persistOpportunitySpace(dependencies.opportunitySpaceRepository, opportunitySpace, generatedAt);
      opportunitySpaceStatus = 'DURABLE';
    } catch {
      opportunitySpace = undefined;
      opportunitySpaceStatus = 'FAILED';
    }
  }

  const analyzedCount = items.filter((item) => item.status === 'ANALYZED').length;
  const failedCount = items.length - analyzedCount;
  const outcome: MarketCandidateAnalysisRun['outcome'] = analyzedCount === 0
    ? 'FAILED'
    : failedCount === 0
      ? 'COMPLETE'
      : 'PARTIAL_SUCCESS';

  const semantic = {
    schemaVersion: MARKET_CANDIDATE_ANALYSIS_SCHEMA_VERSION,
    policyVersion: MARKET_CANDIDATE_ANALYSIS_POLICY_VERSION,
    candidateProfileId: input.candidate.id,
    careerTargetId: input.target.id,
    candidateSnapshotSha256: input.candidateSnapshotSha256,
    marketCandidateSetId: candidateSet.id,
    marketCandidateSetContentSha256: candidateSet.contentSha256,
    items,
    outcome,
    summary: {
      selectedAvailableCount: candidateSet.candidates.length,
      attemptedCount: items.length,
      analyzedCount,
      failedCount,
      maxDeepAnalysis,
    },
    opportunitySpace: {
      status: opportunitySpaceStatus,
      opportunitySpaceId: opportunitySpace?.id,
      successfulAssessmentCount: opportunityCandidates.length,
    },
    persistence: 'DURABLE_ITEM_ARTIFACTS_NON_PERSISTED_BATCH_REPORT_M4B_11' as const,
    scopeBoundary: 'SELECTED_FOR_ANALYSIS_NOT_QUALIFIED_AND_BATCH_RESULT_NOT_CANDIDATE_TRUTH' as const,
  };
  const contentSha256 = sha256(stableJson(runSemantic(semantic)));
  const run: MarketCandidateAnalysisRun = {
    ...semantic,
    id: domainId('MarketCandidateAnalysisRun', `market-candidate-analysis:${contentSha256.slice(0, 32)}`),
    contentSha256,
    generatedAt,
  };

  return { run, opportunitySpace };
}
