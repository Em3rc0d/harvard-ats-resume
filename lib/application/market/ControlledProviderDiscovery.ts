import type { MarketObservation } from '../../domain';
import type {
  ControlledMarketProvider,
  ControlledSourceAcquisitionErrorCode,
  ControlledSourceAcquisitionRequest,
  ControlledSourceAcquisitionResult,
} from './ControlledSourceAcquisition';

export const CONTROLLED_PROVIDER_DISCOVERY_POLICY_VERSION = 'controlled-provider-discovery-v1' as const;
export const DEFAULT_PROVIDER_DISCOVERY_MAX_LISTINGS = 50;
export const DEFAULT_PROVIDER_DISCOVERY_MAX_PAGES = 5;
export const DEFAULT_PROVIDER_DISCOVERY_CONCURRENCY = 4;
export const LEVER_DISCOVERY_PAGE_SIZE = 20;

export interface ProviderDiscoveryBudget {
  readonly maxListings: number;
  readonly maxPages: number;
  readonly maxConcurrentAcquisitions: number;
}

export const DEFAULT_PROVIDER_DISCOVERY_BUDGET: ProviderDiscoveryBudget = {
  maxListings: DEFAULT_PROVIDER_DISCOVERY_MAX_LISTINGS,
  maxPages: DEFAULT_PROVIDER_DISCOVERY_MAX_PAGES,
  maxConcurrentAcquisitions: DEFAULT_PROVIDER_DISCOVERY_CONCURRENCY,
};

export interface GreenhouseProviderDiscoveryRequest {
  readonly provider: 'GREENHOUSE';
  readonly boardToken: string;
}

export interface LeverProviderDiscoveryRequest {
  readonly provider: 'LEVER';
  readonly site: string;
  readonly region?: 'GLOBAL' | 'EU';
}

export interface AshbyProviderDiscoveryRequest {
  readonly provider: 'ASHBY';
  readonly jobBoardName: string;
}

export type ControlledProviderDiscoveryRequest =
  | GreenhouseProviderDiscoveryRequest
  | LeverProviderDiscoveryRequest
  | AshbyProviderDiscoveryRequest;

export interface DiscoveredProviderLocator {
  readonly provider: ControlledMarketProvider;
  readonly acquisitionRequest: ControlledSourceAcquisitionRequest;
  readonly discoverySourceUrl: string;
  readonly discoveryOrdinal: number;
}

export interface ControlledProviderDiscoveryResult {
  readonly policyVersion: typeof CONTROLLED_PROVIDER_DISCOVERY_POLICY_VERSION;
  readonly provider: ControlledMarketProvider;
  readonly locators: readonly DiscoveredProviderLocator[];
  readonly providerRequestCount: number;
  readonly truncated: boolean;
  readonly scopeBoundary: 'DISCOVERY_LOCATORS_ONLY_NOT_MARKET_FACT_OR_JOB_REQUIREMENT';
}

export type ControlledProviderDiscoverer = (
  request: ControlledProviderDiscoveryRequest,
  budget: ProviderDiscoveryBudget,
) => Promise<ControlledProviderDiscoveryResult>;

export interface ProviderDiscoveryFailure {
  readonly locator: ControlledSourceAcquisitionRequest;
  readonly code: ControlledSourceAcquisitionErrorCode | 'UNEXPECTED_ACQUISITION_FAILURE';
  readonly message: string;
  readonly upstreamStatus?: number;
  readonly scopeBoundary: 'ACQUISITION_FAILURE_NOT_MARKET_CLOSURE';
}

export interface ProviderDiscoverySuccess {
  readonly locator: ControlledSourceAcquisitionRequest;
  readonly observationId: MarketObservation['id'];
  readonly occurrenceId: string;
  readonly observationAdded: boolean;
  readonly occurrenceAdded: boolean;
}

export interface ControlledProviderDiscoveryBatchResult {
  readonly policyVersion: typeof CONTROLLED_PROVIDER_DISCOVERY_POLICY_VERSION;
  readonly provider: ControlledMarketProvider;
  readonly discovered: number;
  readonly attempted: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly truncated: boolean;
  readonly providerDiscoveryRequestCount: number;
  readonly successes: readonly ProviderDiscoverySuccess[];
  readonly failures: readonly ProviderDiscoveryFailure[];
  readonly persistence: ControlledSourceAcquisitionResult['persistence'];
  readonly scopeBoundary: 'BOUNDED_PROVIDER_DISCOVERY_TO_DURABLE_OBSERVATIONS_NO_DERIVED_ANALYSIS';
}

export function validateProviderDiscoveryBudget(budget: ProviderDiscoveryBudget): void {
  const validInteger = (value: number) => Number.isInteger(value) && value > 0;
  if (!validInteger(budget.maxListings) || budget.maxListings > 200) {
    throw new Error('Provider discovery maxListings must be an integer between 1 and 200.');
  }
  if (!validInteger(budget.maxPages) || budget.maxPages > 20) {
    throw new Error('Provider discovery maxPages must be an integer between 1 and 20.');
  }
  if (!validInteger(budget.maxConcurrentAcquisitions) || budget.maxConcurrentAcquisitions > 10) {
    throw new Error('Provider discovery concurrency must be an integer between 1 and 10.');
  }
}
