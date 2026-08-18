import type {
  CandidateProfileId,
  CareerTargetId,
  MarketCandidateSetId,
  MarketObservationId,
  MarketOpportunityId,
} from '../shared/identifiers';
import type { MarketOpportunityLifecycleBasis, MarketOpportunityLifecycleStatus } from './MarketOpportunity';

export const MARKET_CANDIDATE_RETRIEVAL_SCHEMA_VERSION = 'market-candidate-retrieval-v1' as const;
export const MARKET_CANDIDATE_RETRIEVAL_POLICY_VERSION = 'market-candidate-retrieval-v1' as const;

export type MarketRetrievalDimension =
  | 'ROLE'
  | 'SENIORITY'
  | 'LOCATION'
  | 'WORK_MODEL'
  | 'EMPLOYMENT_TYPE';

export type MarketRetrievalSignalStatus =
  | 'ALIGNED'
  | 'PARTIAL'
  | 'CONFLICT'
  | 'UNKNOWN'
  | 'NOT_CONSTRAINED';

export interface MarketRetrievalSignal {
  readonly dimension: MarketRetrievalDimension;
  readonly status: MarketRetrievalSignalStatus;
  /** Candidate-owned preference values. These are intent, never capability evidence. */
  readonly targetValues: readonly string[];
  /** Exact source-explicit market value when one exists. */
  readonly marketValue?: string;
  readonly sourcePath?: string;
  readonly scopeBoundary: 'RETRIEVAL_SIGNAL_NOT_JOB_MATCH_OR_CANDIDATE_FACT';
}

export type MarketRetrievalDisposition =
  | 'CANDIDATE'
  | 'REVIEW'
  | 'REFRESH_FIRST'
  | 'EXCLUDED_CLOSED'
  | 'INSUFFICIENT_SIGNAL';

export interface MarketRetrievalCandidate {
  readonly marketOpportunityId: MarketOpportunityId;
  readonly marketObservationId: MarketObservationId;
  readonly lifecycle: {
    readonly status: MarketOpportunityLifecycleStatus;
    readonly basis: MarketOpportunityLifecycleBasis;
    readonly lastObservedAt: string;
  };
  readonly provider?: string;
  readonly companyName?: string;
  readonly roleTitle?: string;
  readonly location?: string;
  readonly disposition: MarketRetrievalDisposition;
  readonly signals: readonly MarketRetrievalSignal[];
  readonly alignedSignalCount: number;
  readonly conflictSignalCount: number;
  readonly scopeBoundary: 'MARKET_RETRIEVAL_CANDIDATE_NOT_OPPORTUNITY_ASSESSMENT';
}

export interface MarketCandidateRetrievalSummary {
  readonly logicalOpportunityCount: number;
  readonly candidateCount: number;
  readonly reviewCount: number;
  readonly refreshFirstCount: number;
  readonly excludedClosedCount: number;
  readonly insufficientSignalCount: number;
  readonly selectedCount: number;
  readonly selectedLimit: number;
}

/**
 * Current, target-bound market retrieval view. It is intentionally cheaper and
 * weaker than Job Match: only active CareerTarget intent, source-explicit market
 * fields and lifecycle may influence this object.
 */
export interface MarketCandidateSet {
  readonly schemaVersion: typeof MARKET_CANDIDATE_RETRIEVAL_SCHEMA_VERSION;
  readonly policyVersion: typeof MARKET_CANDIDATE_RETRIEVAL_POLICY_VERSION;
  readonly id: MarketCandidateSetId;
  readonly candidateProfileId: CandidateProfileId;
  readonly careerTargetId: CareerTargetId;
  readonly careerTargetContentSha256: string;
  readonly marketObservationHistoryRevision: number;
  readonly candidates: readonly MarketRetrievalCandidate[];
  readonly summary: MarketCandidateRetrievalSummary;
  readonly contentSha256: string;
  readonly generatedAt: string;
  readonly persistence: 'NOT_PERSISTED_CURRENT_RETRIEVAL_VIEW_M4B_10';
  readonly scopeBoundary: 'TARGET_BOUND_MARKET_PREFILTER_NOT_JOB_MATCH_HIRING_PROBABILITY_OR_CANDIDATE_TRUTH';
}
