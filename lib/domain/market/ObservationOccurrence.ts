import type { MarketObservationId, ObservationOccurrenceId } from '../shared/identifiers';

export const OBSERVATION_OCCURRENCE_SCHEMA_VERSION = 'market-observation-occurrence-v1' as const;

/**
 * A durable record that CV Engine observed one already-defined semantic market
 * state at a specific instant. The occurrence is temporal evidence only: it
 * never changes the meaning or identity of its MarketObservation.
 */
export interface ObservationOccurrence {
  readonly schemaVersion: typeof OBSERVATION_OCCURRENCE_SCHEMA_VERSION;
  readonly id: ObservationOccurrenceId;
  readonly marketObservationId: MarketObservationId;
  readonly observedAt: string;
  readonly contentSha256: string;
  readonly scopeBoundary: 'OBSERVATION_EVENT_NOT_SEMANTIC_MARKET_STATE';
}
