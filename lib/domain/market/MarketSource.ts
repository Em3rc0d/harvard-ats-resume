import type { MarketSourceId } from '../shared/identifiers';

export type MarketSourceType =
  | 'MANUAL_TEXT'
  | 'JOB_URL'
  | 'PROVIDER_API'
  | 'COMPANY_CAREERS'
  | 'PARTNER_FEED';

/**
 * Stable origin channel for market observations. Concrete providers are data,
 * not domain types, so Greenhouse/Lever/Ashby adapters can remain infrastructure.
 */
export interface MarketSource {
  readonly id: MarketSourceId;
  readonly type: MarketSourceType;
  readonly provider?: string;
  readonly label?: string;
}
