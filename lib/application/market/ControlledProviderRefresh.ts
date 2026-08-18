import type { MarketObservation, MarketObservationId, MarketOpportunityLifecycle } from '../../domain';
import {
  ControlledSourceAcquisitionError,
  type ControlledProviderSourceAcquirer,
  type ControlledSourceAcquisitionRequest,
} from './ControlledSourceAcquisition';
import { acquireControlledMarketSource } from './ControlledSourceAcquisitionService';
import {
  MARKET_OPPORTUNITY_DIRECT_FRESHNESS_HOURS,
} from './MarketOpportunityIdentityLifecycleService';
import type { MarketOpportunityIndexRepository } from './MarketOpportunityIndexHistory';
import {
  registerDurableMarketOpportunityLifecycle,
} from './MarketOpportunityLifecycleRuntime';
import {
  validateMarketObservationHistorySnapshot,
  type MarketObservationHistoryRepository,
} from './MarketObservationHistory';

export const CONTROLLED_PROVIDER_REFRESH_POLICY_VERSION = 'controlled-provider-refresh-v1' as const;

export type MarketRefreshDecisionState = 'DUE' | 'NOT_DUE' | 'INELIGIBLE';

export interface MarketRefreshDecision {
  readonly policyVersion: typeof CONTROLLED_PROVIDER_REFRESH_POLICY_VERSION;
  readonly marketOpportunityId: MarketOpportunityLifecycle['marketOpportunityId'];
  readonly currentMarketObservationId: MarketObservationId;
  readonly state: MarketRefreshDecisionState;
  readonly reason:
    | 'DIRECT_SOURCE_STALE'
    | 'DIRECT_SOURCE_STILL_FRESH'
    | 'SOURCE_EXPLICITLY_CLOSED'
    | 'SOURCE_NOT_PROVIDER_REFRESHABLE';
  readonly lastObservedAt: string;
  readonly nextEligibleRefreshAt?: string;
  readonly scopeBoundary: 'REFRESH_DECISION_NOT_LIFECYCLE_OR_MARKET_FACT';
}

export type ControlledProviderRefreshLocatorResolver = (
  observation: MarketObservation,
) => ControlledSourceAcquisitionRequest;

export interface ControlledProviderRefreshDependencies {
  readonly observationRepository: MarketObservationHistoryRepository;
  readonly opportunityIndexRepository: MarketOpportunityIndexRepository;
  readonly acquirer: ControlledProviderSourceAcquirer;
  readonly locatorResolver: ControlledProviderRefreshLocatorResolver;
  readonly evaluatedAt?: string;
}

export interface ControlledProviderRefreshResult {
  readonly decision: MarketRefreshDecision;
  readonly attempted: boolean;
  readonly outcome: 'NOT_ATTEMPTED' | 'REFRESHED' | 'REFRESH_FAILED';
  readonly observationId?: MarketObservationId;
  readonly occurrenceId?: string;
  readonly lifecycle?: MarketOpportunityLifecycle;
  readonly failure?: {
    readonly code: ControlledSourceAcquisitionError['code'] | 'UNEXPECTED_ACQUISITION_FAILURE';
    readonly message: string;
    readonly upstreamStatus?: number;
    readonly scopeBoundary: 'REFRESH_FAILURE_NOT_MARKET_CLOSURE';
  };
  readonly scopeBoundary: 'CONTROLLED_REOBSERVATION_ONLY_NO_DERIVED_ANALYSIS_OR_CLOSURE_INFERENCE';
}

export function deriveMarketRefreshDecision(lifecycle: MarketOpportunityLifecycle): MarketRefreshDecision {
  if (lifecycle.status === 'STALE') {
    return {
      policyVersion: CONTROLLED_PROVIDER_REFRESH_POLICY_VERSION,
      marketOpportunityId: lifecycle.marketOpportunityId,
      currentMarketObservationId: lifecycle.currentMarketObservationId,
      state: 'DUE',
      reason: 'DIRECT_SOURCE_STALE',
      lastObservedAt: lifecycle.lastObservedAt,
      scopeBoundary: 'REFRESH_DECISION_NOT_LIFECYCLE_OR_MARKET_FACT',
    };
  }
  if (lifecycle.status === 'OPEN') {
    const nextEligibleRefreshAt = new Date(
      Date.parse(lifecycle.lastObservedAt) + MARKET_OPPORTUNITY_DIRECT_FRESHNESS_HOURS * 60 * 60 * 1000,
    ).toISOString();
    return {
      policyVersion: CONTROLLED_PROVIDER_REFRESH_POLICY_VERSION,
      marketOpportunityId: lifecycle.marketOpportunityId,
      currentMarketObservationId: lifecycle.currentMarketObservationId,
      state: 'NOT_DUE',
      reason: 'DIRECT_SOURCE_STILL_FRESH',
      lastObservedAt: lifecycle.lastObservedAt,
      nextEligibleRefreshAt,
      scopeBoundary: 'REFRESH_DECISION_NOT_LIFECYCLE_OR_MARKET_FACT',
    };
  }
  return {
    policyVersion: CONTROLLED_PROVIDER_REFRESH_POLICY_VERSION,
    marketOpportunityId: lifecycle.marketOpportunityId,
    currentMarketObservationId: lifecycle.currentMarketObservationId,
    state: 'INELIGIBLE',
    reason: lifecycle.status === 'CLOSED'
      ? 'SOURCE_EXPLICITLY_CLOSED'
      : 'SOURCE_NOT_PROVIDER_REFRESHABLE',
    lastObservedAt: lifecycle.lastObservedAt,
    scopeBoundary: 'REFRESH_DECISION_NOT_LIFECYCLE_OR_MARKET_FACT',
  };
}

function failure(error: unknown): ControlledProviderRefreshResult['failure'] {
  if (error instanceof ControlledSourceAcquisitionError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.upstreamStatus === undefined ? {} : { upstreamStatus: error.upstreamStatus }),
      scopeBoundary: 'REFRESH_FAILURE_NOT_MARKET_CLOSURE',
    };
  }
  return {
    code: 'UNEXPECTED_ACQUISITION_FAILURE',
    message: 'Provider refresh acquisition failed unexpectedly.',
    scopeBoundary: 'REFRESH_FAILURE_NOT_MARKET_CLOSURE',
  };
}

export async function refreshDurableMarketOpportunity(
  marketObservationId: MarketObservationId,
  dependencies: ControlledProviderRefreshDependencies,
): Promise<ControlledProviderRefreshResult> {
  const before = await registerDurableMarketOpportunityLifecycle(marketObservationId, {
    observationRepository: dependencies.observationRepository,
    opportunityIndexRepository: dependencies.opportunityIndexRepository,
    ...(dependencies.evaluatedAt === undefined ? {} : { evaluatedAt: dependencies.evaluatedAt }),
  });
  const decision = deriveMarketRefreshDecision(before.lifecycle);
  if (decision.state !== 'DUE') {
    return {
      decision,
      attempted: false,
      outcome: 'NOT_ATTEMPTED',
      lifecycle: before.lifecycle,
      scopeBoundary: 'CONTROLLED_REOBSERVATION_ONLY_NO_DERIVED_ANALYSIS_OR_CLOSURE_INFERENCE',
    };
  }

  const history = await dependencies.observationRepository.load();
  if (!history) throw new Error('Durable market observation history disappeared before refresh.');
  validateMarketObservationHistorySnapshot(history);
  const current = history.observations.find((item) => item.id === decision.currentMarketObservationId);
  if (!current) throw new Error('Current MarketObservation is absent from durable history before refresh.');

  let acquisition;
  try {
    const locator = dependencies.locatorResolver(current);
    acquisition = await acquireControlledMarketSource(locator, {
      repository: dependencies.observationRepository,
      acquirer: dependencies.acquirer,
      ...(dependencies.evaluatedAt === undefined ? {} : { observedAt: dependencies.evaluatedAt }),
    });
  } catch (error) {
    return {
      decision,
      attempted: true,
      outcome: 'REFRESH_FAILED',
      lifecycle: before.lifecycle,
      failure: failure(error),
      scopeBoundary: 'CONTROLLED_REOBSERVATION_ONLY_NO_DERIVED_ANALYSIS_OR_CLOSURE_INFERENCE',
    };
  }

  const after = await registerDurableMarketOpportunityLifecycle(acquisition.observation.id, {
    observationRepository: dependencies.observationRepository,
    opportunityIndexRepository: dependencies.opportunityIndexRepository,
    ...(dependencies.evaluatedAt === undefined ? {} : { evaluatedAt: dependencies.evaluatedAt }),
  });

  return {
    decision,
    attempted: true,
    outcome: 'REFRESHED',
    observationId: acquisition.observation.id,
    occurrenceId: acquisition.occurrenceId,
    lifecycle: after.lifecycle,
    scopeBoundary: 'CONTROLLED_REOBSERVATION_ONLY_NO_DERIVED_ANALYSIS_OR_CLOSURE_INFERENCE',
  };
}
