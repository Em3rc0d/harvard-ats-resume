import type { MarketObservation } from '../../domain';

export const MARKET_INTAKE_POLICY_VERSION = 'market-intake-v1' as const;
export const MAX_MARKET_INTAKE_TEXT_CHARS = 100_000;
export const MAX_MARKET_INTAKE_FIELD_CHARS = 2_000;
export const MAX_MARKET_INTAKE_DESCRIPTION_CHARS = 100_000;
export const MAX_MARKET_SOURCE_URL_CHARS = 2_048;

export type MarketIntakeKind = 'MANUAL_TEXT' | 'STRUCTURED_PAYLOAD';

/**
 * User-supplied structured market fields. These values are source material,
 * not CV Engine classifications. For example, workModel='Remote-first' remains
 * that exact string; normalization to REMOTE belongs to derived interpretation.
 */
export interface StructuredMarketJobPayload {
  readonly companyName?: string;
  readonly roleTitle?: string;
  readonly location?: string;
  readonly workModel?: string;
  readonly employmentType?: string;
  readonly seniority?: string;
  readonly compensation?: string;
  readonly postedAt?: string;
  readonly expiresAt?: string;
  readonly description?: string;
}

export interface ManualTextMarketIntakeRequest {
  readonly kind: 'MANUAL_TEXT';
  /** Exact user-supplied vacancy/source text. */
  readonly text: string;
  /** Optional source locator supplied by the user. M4B-02A never fetches it. */
  readonly sourceUrl?: string;
  readonly observedAt?: string;
}

export interface StructuredPayloadMarketIntakeRequest {
  readonly kind: 'STRUCTURED_PAYLOAD';
  /** Source-explicit values supplied in a structured shape by the caller. */
  readonly job: StructuredMarketJobPayload;
  /** Optional source locator supplied by the user. M4B-02A never fetches it. */
  readonly sourceUrl?: string;
  readonly observedAt?: string;
}

export type MarketIntakeRequest =
  | ManualTextMarketIntakeRequest
  | StructuredPayloadMarketIntakeRequest;

export interface MarketIntakeResult {
  readonly policyVersion: typeof MARKET_INTAKE_POLICY_VERSION;
  readonly intakeKind: MarketIntakeKind;
  readonly observation: MarketObservation;
  readonly persistence: 'NOT_PERSISTED_M4B_02A';
  readonly scopeBoundary: 'INTAKE_CREATES_OBSERVED_MARKET_FACT_ONLY_NO_DERIVED_INTERPRETATION_OR_PERSISTENCE';
}
