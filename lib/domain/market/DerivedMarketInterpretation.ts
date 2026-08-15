import type { MarketObservationId, DerivedMarketInterpretationId } from '../shared/identifiers';
import type { ObservedJobFields } from './MarketObservation';

export const DERIVED_MARKET_INTERPRETATION_SCHEMA_VERSION = 'derived-market-interpretation-v1' as const;
export const MARKET_INTERPRETATION_POLICY_VERSION = 'market-interpretation-v1' as const;

export type DerivedMarketSourceField = keyof ObservedJobFields;
export type DerivedMarketDerivationKind =
  | 'NORMALIZED_EXPLICIT'
  | 'CONTROLLED_CLASSIFICATION'
  | 'ISO_DATE_NORMALIZATION';

export type DerivedMarketUnknownReason =
  | 'SOURCE_SILENT'
  | 'UNRECOGNIZED_SOURCE_VALUE'
  | 'INVALID_SOURCE_VALUE';

export interface DerivedMarketEvidence {
  readonly marketObservationId: MarketObservationId;
  readonly sourceField: DerivedMarketSourceField;
  readonly sourceValue: string;
  readonly sourcePath?: string;
  readonly sourceExcerpt?: string;
}

export interface KnownDerivedMarketField<TValue extends string = string> {
  readonly status: 'KNOWN';
  readonly value: TValue;
  readonly derivation: DerivedMarketDerivationKind;
  readonly evidence: DerivedMarketEvidence;
}

export interface UnknownDerivedMarketField {
  readonly status: 'UNKNOWN';
  readonly reason: DerivedMarketUnknownReason;
  readonly evidence?: DerivedMarketEvidence;
}

export type DerivedMarketField<TValue extends string = string> =
  | KnownDerivedMarketField<TValue>
  | UnknownDerivedMarketField;

export type CanonicalWorkModel = 'REMOTE' | 'HYBRID' | 'ONSITE';
export type CanonicalEmploymentType =
  | 'FULL_TIME'
  | 'PART_TIME'
  | 'CONTRACT'
  | 'TEMPORARY'
  | 'INTERNSHIP';
export type CanonicalSeniority =
  | 'INTERN'
  | 'ENTRY'
  | 'MID'
  | 'SENIOR'
  | 'LEAD'
  | 'MANAGER'
  | 'DIRECTOR'
  | 'EXECUTIVE';

export interface DerivedMarketInterpretationFields {
  readonly companyName: DerivedMarketField;
  readonly roleTitle: DerivedMarketField;
  readonly location: DerivedMarketField;
  readonly workModel: DerivedMarketField<CanonicalWorkModel>;
  readonly employmentType: DerivedMarketField<CanonicalEmploymentType>;
  readonly seniority: DerivedMarketField<CanonicalSeniority>;
  readonly compensation: DerivedMarketField;
  readonly postedAt: DerivedMarketField;
  readonly expiresAt: DerivedMarketField;
  readonly description: DerivedMarketField;
}

/**
 * Deterministic interpretation of one immutable MarketObservation under one
 * explicit policy version. Every KNOWN value must be traceable to exactly one
 * source-explicit observation field. UNKNOWN is a first-class result and may
 * never be filled from unrelated raw text or candidate information.
 */
export interface DerivedMarketInterpretation {
  readonly schemaVersion: typeof DERIVED_MARKET_INTERPRETATION_SCHEMA_VERSION;
  readonly id: DerivedMarketInterpretationId;
  readonly marketObservationId: MarketObservationId;
  readonly observationContentSha256: string;
  readonly policyVersion: typeof MARKET_INTERPRETATION_POLICY_VERSION;
  readonly fields: DerivedMarketInterpretationFields;
  readonly contentSha256: string;
  /** Runtime creation provenance; excluded from semantic identity. */
  readonly generatedAt: string;
  readonly scopeBoundary: 'DERIVED_MARKET_INTERPRETATION_NOT_SOURCE_FACT_OR_JOB_REQUIREMENT';
}
