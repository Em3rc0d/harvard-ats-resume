import type {
  MarketObservationId,
  MarketOpportunityId,
  MarketOpportunityLinkId,
} from '../shared/identifiers';
import type { MarketSourceType } from './MarketSource';

export const MARKET_OPPORTUNITY_LINK_SCHEMA_VERSION = 'market-opportunity-link-v1' as const;
export const MARKET_OPPORTUNITY_IDENTITY_POLICY_VERSION = 'market-opportunity-identity-v1' as const;
export const MARKET_OPPORTUNITY_LIFECYCLE_POLICY_VERSION = 'market-opportunity-lifecycle-v1' as const;

export type MarketOpportunityIdentityBasis =
  | 'PROVIDER_NATIVE'
  | 'OBSERVATION_BOUND';

export interface MarketOpportunityIdentityEvidence {
  readonly sourceType: MarketSourceType;
  readonly provider?: string;
  readonly sourceUrl?: string;
  readonly externalId?: string;
  readonly observationId?: MarketObservationId;
}

/**
 * Immutable semantic link between one MarketObservation and one logical market
 * opportunity. A material source change creates a new MarketObservation/link
 * while preserving the stable MarketOpportunity id when source-native identity
 * remains unchanged.
 */
export interface MarketOpportunityLink {
  readonly schemaVersion: typeof MARKET_OPPORTUNITY_LINK_SCHEMA_VERSION;
  readonly id: MarketOpportunityLinkId;
  readonly marketOpportunityId: MarketOpportunityId;
  readonly marketObservationId: MarketObservationId;
  readonly observationContentSha256: string;
  readonly identityPolicyVersion: typeof MARKET_OPPORTUNITY_IDENTITY_POLICY_VERSION;
  readonly identityBasis: MarketOpportunityIdentityBasis;
  readonly identityEvidence: MarketOpportunityIdentityEvidence;
  readonly contentSha256: string;
  readonly linkedAt: string;
  readonly scopeBoundary: 'LOGICAL_OPPORTUNITY_LINK_NOT_JOB_FACT_OR_CANDIDATE_TRUTH';
}

export type MarketOpportunityLifecycleStatus =
  | 'OPEN'
  | 'STALE'
  | 'CLOSED'
  | 'UNKNOWN';

export type MarketOpportunityLifecycleBasis =
  | 'RECENT_DIRECT_SOURCE_OBSERVATION'
  | 'DIRECT_SOURCE_OBSERVATION_AGED_OUT'
  | 'SOURCE_EXPLICIT_EXPIRY_PASSED'
  | 'NON_DIRECT_SOURCE_NOT_CURRENTLY_VERIFIED';

/**
 * Temporal derived view over durable observations/occurrences for one logical
 * opportunity. evaluatedAt is intentionally runtime context, not source truth.
 */
export interface MarketOpportunityLifecycle {
  readonly policyVersion: typeof MARKET_OPPORTUNITY_LIFECYCLE_POLICY_VERSION;
  readonly marketOpportunityId: MarketOpportunityId;
  readonly currentMarketObservationId: MarketObservationId;
  readonly observationIds: readonly MarketObservationId[];
  readonly materialStateCount: number;
  readonly status: MarketOpportunityLifecycleStatus;
  readonly basis: MarketOpportunityLifecycleBasis;
  readonly firstObservedAt: string;
  readonly lastObservedAt: string;
  readonly evaluatedAt: string;
  readonly ageHours: number;
  readonly scopeBoundary: 'DERIVED_MARKET_LIFECYCLE_NOT_SOURCE_FACT_OR_APPLICATION_DECISION';
}
