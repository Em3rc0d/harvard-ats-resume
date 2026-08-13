import type { MarketObservationId } from '../shared/identifiers';
import type { MarketSource } from './MarketSource';

export const MARKET_OBSERVATION_SCHEMA_VERSION = 'market-observation-v1' as const;

export type MarketPayloadFormat = 'TEXT' | 'JSON';

export type MarketCaptureMethod =
  | 'USER_SUPPLIED_TEXT'
  | 'USER_SUPPLIED_STRUCTURED'
  | 'PUBLIC_URL_FETCH'
  | 'PROVIDER_ADAPTER'
  | 'PARTNER_IMPORT';

export interface MarketObservationPayload {
  readonly format: MarketPayloadFormat;
  /** Exact source material used by downstream interpretation. */
  readonly content: string;
}

export interface ObservedMarketFieldEvidence {
  readonly origin: 'SOURCE_EXPLICIT';
  /** Provider/JSON path or human-readable source location when available. */
  readonly sourcePath?: string;
  /** Exact supporting fragment when available. */
  readonly sourceExcerpt?: string;
}

export interface ObservedMarketField {
  /** Raw source value. Canonicalization belongs to derived interpretation. */
  readonly value: string;
  readonly evidence: ObservedMarketFieldEvidence;
}

/**
 * Source-explicit job attributes only. Presence here means the source declared
 * the value; absence must remain absence and must not be filled by inference.
 */
export interface ObservedJobFields {
  readonly companyName?: ObservedMarketField;
  readonly roleTitle?: ObservedMarketField;
  readonly location?: ObservedMarketField;
  readonly workModel?: ObservedMarketField;
  readonly employmentType?: ObservedMarketField;
  readonly seniority?: ObservedMarketField;
  readonly compensation?: ObservedMarketField;
  readonly postedAt?: ObservedMarketField;
  readonly expiresAt?: ObservedMarketField;
  readonly description?: ObservedMarketField;
}

export interface MarketObservationAdapterProvenance {
  readonly adapterId: string;
  readonly adapterVersion: string;
}

export interface MarketObservationProvenance {
  readonly captureMethod: MarketCaptureMethod;
  /** Listing URL exactly as supplied/observed. Canonical URL derivation is later. */
  readonly sourceUrl?: string;
  /** Provider-native listing identity when the source exposes one. */
  readonly externalId?: string;
  readonly adapter?: MarketObservationAdapterProvenance;
}

/**
 * Immutable semantic record of what CV Engine observed from one market source.
 * It is Market Fact only at the raw/explicit layer. Any normalized title,
 * inferred seniority, work-model classification, or requirement extraction is
 * a separate Derived Market Interpretation.
 */
export interface MarketObservation {
  readonly schemaVersion: typeof MARKET_OBSERVATION_SCHEMA_VERSION;
  readonly id: MarketObservationId;
  readonly source: MarketSource;
  readonly payload: MarketObservationPayload;
  readonly explicitFields: ObservedJobFields;
  readonly provenance: MarketObservationProvenance;
  readonly contentSha256: string;
  /** Runtime observation event; excluded from semantic identity. */
  readonly observedAt: string;
  readonly scopeBoundary: 'OBSERVED_MARKET_FACT_NOT_CANDIDATE_EVIDENCE_OR_DERIVED_INTERPRETATION';
}
