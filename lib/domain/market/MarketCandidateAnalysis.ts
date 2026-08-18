import type {
  CandidateProfileId,
  CareerSnapshotId,
  CareerTargetId,
  DerivedMarketInterpretationId,
  JobSnapshotId,
  MarketCandidateAnalysisRunId,
  MarketCandidateSetId,
  MarketJobProjectionId,
  MarketObservationId,
  MarketOpportunityId,
  OpportunityAssessmentId,
  OpportunitySpaceId,
} from '../shared/identifiers';
import type { MarketRetrievalDisposition } from './MarketCandidateRetrieval';

export const MARKET_CANDIDATE_ANALYSIS_SCHEMA_VERSION = 'market-candidate-analysis-v1' as const;
export const MARKET_CANDIDATE_ANALYSIS_POLICY_VERSION = 'market-candidate-analysis-v1' as const;

export type MarketCandidateAnalysisStage =
  | 'INTERPRETATION'
  | 'PROJECTION'
  | 'ASSESSMENT'
  | 'TARGET_LINK'
  | 'LIFECYCLE';

export type MarketCandidateAnalysisItemStatus =
  | 'ANALYZED'
  | 'FAILED';

export type MarketCandidateAnalysisFailureCode =
  | 'INTERPRETATION_FAILED'
  | 'PROJECTION_FAILED'
  | 'ASSESSMENT_FAILED'
  | 'TARGET_LINK_FAILED'
  | 'LIFECYCLE_FAILED';

export interface MarketCandidateAnalysisItem {
  readonly marketOpportunityId: MarketOpportunityId;
  readonly marketObservationId: MarketObservationId;
  readonly retrievalDisposition: Extract<MarketRetrievalDisposition, 'CANDIDATE' | 'REVIEW'>;
  readonly retrievalRank: number;
  readonly status: MarketCandidateAnalysisItemStatus;
  readonly completedStage?: 'LIFECYCLE';
  readonly failedStage?: MarketCandidateAnalysisStage;
  readonly failureCode?: MarketCandidateAnalysisFailureCode;
  readonly derivedMarketInterpretationId?: DerivedMarketInterpretationId;
  readonly marketJobProjectionId?: MarketJobProjectionId;
  readonly jobSnapshotId?: JobSnapshotId;
  readonly opportunityAssessmentId?: OpportunityAssessmentId;
  readonly careerSnapshotId?: CareerSnapshotId;
  readonly targetRelevanceLevel?: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  readonly scopeBoundary: 'ANALYSIS_RESULT_DOES_NOT_CHANGE_RETRIEVAL_MARKET_FACT_OR_CANDIDATE_TRUTH';
}

export type MarketCandidateAnalysisOutcome =
  | 'COMPLETE'
  | 'PARTIAL_SUCCESS'
  | 'FAILED';

export type MarketCandidateOpportunitySpaceStatus =
  | 'DURABLE'
  | 'INSUFFICIENT_SUCCESSFUL_ASSESSMENTS'
  | 'FAILED';

export interface MarketCandidateAnalysisSummary {
  readonly selectedAvailableCount: number;
  readonly attemptedCount: number;
  readonly analyzedCount: number;
  readonly failedCount: number;
  readonly maxDeepAnalysis: number;
}

/**
 * Current orchestration report for a bounded M4B-10 selection. The report itself
 * is not market truth and is not used as candidate evidence. The durable
 * authorities remain the M4B-04 interpretation, M4B-05 projection/JobSnapshot,
 * M4B-06 OpportunityAssessment, target relevance link and OpportunitySpace.
 */
export interface MarketCandidateAnalysisRun {
  readonly schemaVersion: typeof MARKET_CANDIDATE_ANALYSIS_SCHEMA_VERSION;
  readonly policyVersion: typeof MARKET_CANDIDATE_ANALYSIS_POLICY_VERSION;
  readonly id: MarketCandidateAnalysisRunId;
  readonly candidateProfileId: CandidateProfileId;
  readonly careerTargetId: CareerTargetId;
  readonly candidateSnapshotSha256: string;
  readonly marketCandidateSetId: MarketCandidateSetId;
  readonly marketCandidateSetContentSha256: string;
  readonly items: readonly MarketCandidateAnalysisItem[];
  readonly outcome: MarketCandidateAnalysisOutcome;
  readonly summary: MarketCandidateAnalysisSummary;
  readonly opportunitySpace: {
    readonly status: MarketCandidateOpportunitySpaceStatus;
    readonly opportunitySpaceId?: OpportunitySpaceId;
    readonly successfulAssessmentCount: number;
  };
  readonly contentSha256: string;
  readonly generatedAt: string;
  readonly persistence: 'DURABLE_ITEM_ARTIFACTS_NON_PERSISTED_BATCH_REPORT_M4B_11';
  readonly scopeBoundary: 'SELECTED_FOR_ANALYSIS_NOT_QUALIFIED_AND_BATCH_RESULT_NOT_CANDIDATE_TRUTH';
}
