import type { MarketSourceId } from '../shared/identifiers';

export type MarketSourceType =
  | 'MANUAL_TEXT'
  | 'MANUAL_STRUCTURED'
  | 'JOB_URL'
  | 'PROVIDER_API'
  | 'COMPANY_CAREERS'
  | 'PARTNER_FEED';

/**
 * Stable origin channel for market observations. Concrete providers are data,
 * not domain types, so Greenhouse/Lever/Ashby adapters can remain infrastructure.
 * Payload representation stays separate: MANUAL_STRUCTURED is an origin channel,
 * while MarketObservationPayload.format records JSON versus text representation.
 */
export interface MarketSource {
  readonly id: MarketSourceId;
  readonly type: MarketSourceType;
  readonly provider?: string;
  readonly label?: string;
}
