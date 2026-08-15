import type {
  DerivedMarketInterpretationId,
  MarketJobProjectionId,
  MarketObservationId,
} from '../shared/identifiers';

export const MARKET_JOB_PROJECTION_SCHEMA_VERSION = 'market-job-projection-v1' as const;
export const MARKET_JOB_PROJECTION_POLICY_VERSION = 'market-job-projection-v1' as const;

export type MarketJobProjectionTextOrigin =
  | 'RAW_TEXT_PAYLOAD'
  | 'EXPLICIT_DESCRIPTION_FIELD';

/**
 * Immutable authorization record for the exact text allowed to cross from the
 * market-truth graph into Job Intelligence.
 *
 * policyVersion is stored as a string so historical projections remain readable
 * after a future projection policy is introduced. New projection creation/full
 * validation still pins to MARKET_JOB_PROJECTION_POLICY_VERSION.
 */
export interface MarketJobProjection {
  readonly schemaVersion: typeof MARKET_JOB_PROJECTION_SCHEMA_VERSION;
  readonly id: MarketJobProjectionId;
  readonly marketObservationId: MarketObservationId;
  readonly derivedMarketInterpretationId: DerivedMarketInterpretationId;
  readonly observationContentSha256: string;
  readonly interpretationContentSha256: string;
  readonly policyVersion: string;
  readonly sourceText: string;
  readonly sourceTextOrigin: MarketJobProjectionTextOrigin;
  readonly sourceTextSha256: string;
  readonly roleTitle?: string;
  readonly companyName?: string;
  readonly contentSha256: string;
  /** Runtime projection provenance; excluded from semantic identity. */
  readonly projectedAt: string;
  readonly scopeBoundary: 'MARKET_TO_JOB_INTELLIGENCE_INPUT_NOT_JOB_REQUIREMENT_OR_CANDIDATE_TRUTH';
}
