import type { MarketObservationId, MarketOpportunityLifecycle } from '../../domain';
import {
  persistMarketOpportunityLink,
  validateMarketOpportunityIndexSnapshot,
  type MarketOpportunityIndexRepository,
  type MarketOpportunityIndexSnapshot,
} from './MarketOpportunityIndexHistory';
import {
  createMarketOpportunityLink,
  deriveMarketOpportunityId,
  deriveMarketOpportunityLifecycle,
} from './MarketOpportunityIdentityLifecycleService';
import {
  validateMarketObservationHistorySnapshot,
  type MarketObservationHistoryRepository,
} from './MarketObservationHistory';

export class MarketOpportunitySourceNotFoundError extends Error {
  constructor(readonly marketObservationId: MarketObservationId) {
    super(`Durable MarketObservation not found for logical opportunity: ${marketObservationId}`);
    this.name = 'MarketOpportunitySourceNotFoundError';
  }
}

export interface MarketOpportunityLifecycleRuntimeDependencies {
  readonly observationRepository: MarketObservationHistoryRepository;
  readonly opportunityIndexRepository: MarketOpportunityIndexRepository;
  readonly evaluatedAt?: string;
}

export interface DurableMarketOpportunityLifecycleResult {
  readonly marketObservationId: MarketObservationId;
  readonly lifecycle: MarketOpportunityLifecycle;
  readonly indexSnapshot: MarketOpportunityIndexSnapshot;
  readonly linksAdded: number;
  readonly persistence: 'DURABLE_MARKET_OPPORTUNITY_INDEX_M4B_07';
  readonly scopeBoundary: 'LOGICAL_IDENTITY_AND_LIFECYCLE_ONLY_NO_MATCH_OR_CANDIDATE_TRUTH';
}

/**
 * Resolves one durable observation into its conservative logical opportunity.
 * All already-durable observations that reproduce the same source-native
 * identity are linked in the same call, preserving material state history.
 */
export async function registerDurableMarketOpportunityLifecycle(
  marketObservationId: MarketObservationId,
  dependencies: MarketOpportunityLifecycleRuntimeDependencies,
): Promise<DurableMarketOpportunityLifecycleResult> {
  const observationHistory = await dependencies.observationRepository.load();
  if (!observationHistory) throw new MarketOpportunitySourceNotFoundError(marketObservationId);
  validateMarketObservationHistorySnapshot(observationHistory);

  const requested = observationHistory.observations.find((item) => item.id === marketObservationId);
  if (!requested) throw new MarketOpportunitySourceNotFoundError(marketObservationId);
  const marketOpportunityId = deriveMarketOpportunityId(requested);

  const sameLogicalOpportunity = observationHistory.observations.filter(
    (observation) => deriveMarketOpportunityId(observation) === marketOpportunityId,
  );

  let linksAdded = 0;
  let indexSnapshot: MarketOpportunityIndexSnapshot | null = null;
  for (const observation of sameLogicalOpportunity) {
    const persisted = await persistMarketOpportunityLink({
      link: createMarketOpportunityLink(observation),
      repository: dependencies.opportunityIndexRepository,
    });
    indexSnapshot = persisted.snapshot;
    if (persisted.linkAdded) linksAdded += 1;
  }

  if (!indexSnapshot) {
    indexSnapshot = await dependencies.opportunityIndexRepository.load();
  }
  if (!indexSnapshot) {
    throw new Error('Market opportunity index did not persist a logical opportunity link.');
  }
  validateMarketOpportunityIndexSnapshot(indexSnapshot);

  const lifecycle = deriveMarketOpportunityLifecycle({
    marketOpportunityId,
    links: indexSnapshot.links,
    observationHistory,
    evaluatedAt: dependencies.evaluatedAt,
  });
  if (!lifecycle.observationIds.includes(marketObservationId)) {
    throw new Error('Market opportunity lifecycle does not include the requested observation after persistence.');
  }

  return {
    marketObservationId,
    lifecycle,
    indexSnapshot,
    linksAdded,
    persistence: 'DURABLE_MARKET_OPPORTUNITY_INDEX_M4B_07',
    scopeBoundary: 'LOGICAL_IDENTITY_AND_LIFECYCLE_ONLY_NO_MATCH_OR_CANDIDATE_TRUTH',
  };
}
