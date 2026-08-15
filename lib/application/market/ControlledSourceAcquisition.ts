import type { MarketObservation, ObservedJobFields } from '../../domain';
import type {
  MarketObservationHistoryRepository,
  MarketObservationHistorySnapshot,
} from './MarketObservationHistory';

export const CONTROLLED_SOURCE_ACQUISITION_POLICY_VERSION = 'controlled-source-acquisition-v1' as const;
export const MAX_SOURCE_ACQUISITION_RESPONSE_BYTES = 2 * 1024 * 1024;
export const SOURCE_ACQUISITION_TIMEOUT_MS = 8_000;

export type ControlledMarketProvider = 'GREENHOUSE' | 'LEVER' | 'ASHBY';

export interface GreenhouseSourceAcquisitionRequest {
  readonly provider: 'GREENHOUSE';
  readonly boardToken: string;
  readonly jobId: string;
}

export interface LeverSourceAcquisitionRequest {
  readonly provider: 'LEVER';
  readonly site: string;
  readonly postingId: string;
  readonly region?: 'GLOBAL' | 'EU';
}

export interface AshbySourceAcquisitionRequest {
  readonly provider: 'ASHBY';
  readonly jobBoardName: string;
  /**
   * Selector only. CV Engine never fetches this URL directly; it fetches the
   * fixed Ashby public job-board API and selects the matching published job.
   */
  readonly jobUrl: string;
}

export type ControlledSourceAcquisitionRequest =
  | GreenhouseSourceAcquisitionRequest
  | LeverSourceAcquisitionRequest
  | AshbySourceAcquisitionRequest;

export interface AcquiredProviderMarketIntake {
  readonly provider: ControlledMarketProvider;
  readonly sourceLabel: string;
  readonly payloadContent: string;
  readonly explicitFields: ObservedJobFields;
  readonly sourceUrl: string;
  readonly externalId: string;
  readonly adapterId: string;
  readonly adapterVersion: string;
}

export interface ControlledSourceAcquisitionResult {
  readonly policyVersion: typeof CONTROLLED_SOURCE_ACQUISITION_POLICY_VERSION;
  readonly provider: ControlledMarketProvider;
  readonly observation: MarketObservation;
  readonly occurrenceId: string;
  readonly history: {
    readonly schemaVersion: MarketObservationHistorySnapshot['schemaVersion'];
    readonly revision: number;
    readonly observationCount: number;
    readonly occurrenceCount: number;
    readonly observationAdded: boolean;
    readonly occurrenceAdded: boolean;
  };
  readonly persistence: 'DURABLE_OBSERVATION_HISTORY_M4B_02B';
  readonly scopeBoundary: 'CONTROLLED_PROVIDER_ACQUISITION_TO_OBSERVED_MARKET_FACT_ONLY_NO_DERIVED_INTERPRETATION';
}

export interface ControlledSourceAcquisitionDependencies {
  readonly repository: MarketObservationHistoryRepository;
  readonly fetcher?: typeof fetch;
  readonly observedAt?: string;
}

export type ControlledSourceAcquisitionErrorCode =
  | 'INVALID_LOCATOR'
  | 'SOURCE_NOT_FOUND'
  | 'SOURCE_RATE_LIMITED'
  | 'SOURCE_UNAVAILABLE'
  | 'SOURCE_RESPONSE_INVALID'
  | 'SOURCE_RESPONSE_TOO_LARGE';

export class ControlledSourceAcquisitionError extends Error {
  constructor(
    readonly code: ControlledSourceAcquisitionErrorCode,
    message: string,
    readonly upstreamStatus?: number,
  ) {
    super(message);
    this.name = 'ControlledSourceAcquisitionError';
  }
}
