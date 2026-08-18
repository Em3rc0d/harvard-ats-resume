import {
  ControlledSourceAcquisitionError,
  type ControlledProviderSourceAcquirer,
} from './ControlledSourceAcquisition';
import { acquireControlledMarketSource } from './ControlledSourceAcquisitionService';
import {
  CONTROLLED_PROVIDER_DISCOVERY_POLICY_VERSION,
  DEFAULT_PROVIDER_DISCOVERY_BUDGET,
  validateProviderDiscoveryBudget,
  type ControlledProviderDiscoverer,
  type ControlledProviderDiscoveryBatchResult,
  type ControlledProviderDiscoveryRequest,
  type DiscoveredProviderLocator,
  type ProviderDiscoveryBudget,
  type ProviderDiscoveryFailure,
  type ProviderDiscoverySuccess,
} from './ControlledProviderDiscovery';
import type { MarketObservationHistoryRepository } from './MarketObservationHistory';

export interface ControlledProviderDiscoveryDependencies {
  readonly repository: MarketObservationHistoryRepository;
  readonly discoverer: ControlledProviderDiscoverer;
  readonly acquirer: ControlledProviderSourceAcquirer;
  readonly observedAt?: string;
  readonly budget?: ProviderDiscoveryBudget;
}

function locatorKey(locator: DiscoveredProviderLocator): string {
  return JSON.stringify(locator.acquisitionRequest);
}

function safeFailure(locator: DiscoveredProviderLocator, error: unknown): ProviderDiscoveryFailure {
  if (error instanceof ControlledSourceAcquisitionError) {
    return {
      locator: locator.acquisitionRequest,
      code: error.code,
      message: error.message,
      ...(error.upstreamStatus === undefined ? {} : { upstreamStatus: error.upstreamStatus }),
      scopeBoundary: 'ACQUISITION_FAILURE_NOT_MARKET_CLOSURE',
    };
  }
  return {
    locator: locator.acquisitionRequest,
    code: 'UNEXPECTED_ACQUISITION_FAILURE',
    message: 'Provider listing acquisition failed unexpectedly.',
    scopeBoundary: 'ACQUISITION_FAILURE_NOT_MARKET_CLOSURE',
  };
}

async function acquireOne(
  locator: DiscoveredProviderLocator,
  dependencies: ControlledProviderDiscoveryDependencies,
): Promise<{ success?: ProviderDiscoverySuccess; failure?: ProviderDiscoveryFailure }> {
  try {
    const acquired = await acquireControlledMarketSource(locator.acquisitionRequest, {
      repository: dependencies.repository,
      acquirer: dependencies.acquirer,
      ...(dependencies.observedAt === undefined ? {} : { observedAt: dependencies.observedAt }),
    });
    return {
      success: {
        locator: locator.acquisitionRequest,
        observationId: acquired.observation.id,
        occurrenceId: acquired.occurrenceId,
        observationAdded: acquired.history.observationAdded,
        occurrenceAdded: acquired.history.occurrenceAdded,
      },
    };
  } catch (error) {
    return { failure: safeFailure(locator, error) };
  }
}

/**
 * M4B-09 bounded provider-discovery orchestration.
 *
 * Discovery emits provider-native M4B-03 locators only. Acquisition remains the
 * sole authority that may turn those locators into canonical durable market
 * observations. Failures are item-scoped and never become lifecycle closure.
 */
export async function discoverAndAcquireControlledMarketSources(
  request: ControlledProviderDiscoveryRequest,
  dependencies: ControlledProviderDiscoveryDependencies,
): Promise<ControlledProviderDiscoveryBatchResult> {
  const budget = dependencies.budget ?? DEFAULT_PROVIDER_DISCOVERY_BUDGET;
  validateProviderDiscoveryBudget(budget);
  const discovery = await dependencies.discoverer(request, budget);
  if (discovery.provider !== request.provider) {
    throw new Error('Provider discoverer returned a provider different from the requested provider.');
  }
  if (discovery.locators.length > budget.maxListings) {
    throw new Error('Provider discoverer exceeded the authorized listing budget.');
  }
  if (discovery.providerRequestCount > budget.maxPages) {
    throw new Error('Provider discoverer exceeded the authorized provider request/page budget.');
  }

  const unique: DiscoveredProviderLocator[] = [];
  const seen = new Set<string>();
  for (const locator of discovery.locators) {
    if (locator.provider !== request.provider || locator.acquisitionRequest.provider !== request.provider) {
      throw new Error('Discovered locator provider does not match the requested provider.');
    }
    const key = locatorKey(locator);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(locator);
  }

  const successes: ProviderDiscoverySuccess[] = [];
  const failures: ProviderDiscoveryFailure[] = [];
  let cursor = 0;
  const workerCount = Math.min(budget.maxConcurrentAcquisitions, unique.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= unique.length) return;
      const result = await acquireOne(unique[index], dependencies);
      if (result.success) successes.push(result.success);
      if (result.failure) failures.push(result.failure);
    }
  });
  await Promise.all(workers);

  const orderByLocator = new Map(unique.map((locator, index) => [locatorKey(locator), index]));
  successes.sort((left, right) => (
    orderByLocator.get(JSON.stringify(left.locator))! - orderByLocator.get(JSON.stringify(right.locator))!
  ));
  failures.sort((left, right) => (
    orderByLocator.get(JSON.stringify(left.locator))! - orderByLocator.get(JSON.stringify(right.locator))!
  ));

  return {
    policyVersion: CONTROLLED_PROVIDER_DISCOVERY_POLICY_VERSION,
    provider: request.provider,
    discovered: unique.length,
    attempted: unique.length,
    succeeded: successes.length,
    failed: failures.length,
    truncated: discovery.truncated,
    providerDiscoveryRequestCount: discovery.providerRequestCount,
    successes,
    failures,
    persistence: 'DURABLE_OBSERVATION_HISTORY_M4B_02B',
    scopeBoundary: 'BOUNDED_PROVIDER_DISCOVERY_TO_DURABLE_OBSERVATIONS_NO_DERIVED_ANALYSIS',
  };
}
