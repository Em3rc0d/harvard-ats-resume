import {
  MARKET_INTERPRETATION_POLICY_VERSION,
  type MarketObservationId,
} from '../../domain';
import {
  validateDerivedMarketInterpretationHistorySnapshot,
  type DerivedMarketInterpretationHistoryRepository,
} from './DerivedMarketInterpretationHistory';
import { validateDerivedMarketInterpretation } from './DerivedMarketInterpretationService';
import {
  persistMarketJobProjection,
  type MarketJobProjectionHistoryRepository,
  type PersistMarketJobProjectionResult,
} from './MarketJobProjectionHistory';
import {
  projectMarketToJobIntelligence,
  type MarketJobProjectionResult,
} from './MarketJobProjectionService';
import {
  validateMarketObservationHistorySnapshot,
  type MarketObservationHistoryRepository,
} from './MarketObservationHistory';

export class MarketJobProjectionSourceNotFoundError extends Error {
  constructor(
    readonly kind: 'MARKET_OBSERVATION' | 'DERIVED_MARKET_INTERPRETATION',
    message: string,
  ) {
    super(message);
    this.name = 'MarketJobProjectionSourceNotFoundError';
  }
}

export interface MarketJobProjectionRuntimeDependencies {
  readonly observationRepository: MarketObservationHistoryRepository;
  readonly interpretationRepository: DerivedMarketInterpretationHistoryRepository;
  readonly projectionRepository: MarketJobProjectionHistoryRepository;
  readonly projectedAt?: string;
}

export interface MarketJobProjectionRuntimeResult extends MarketJobProjectionResult {
  readonly projectionHistory: PersistMarketJobProjectionResult;
  readonly persistence: 'DURABLE_MARKET_JOB_PROJECTION_M4B_05';
  readonly scopeBoundary: 'DURABLE_JOB_INTELLIGENCE_PROJECTION_NOT_CANDIDATE_TRUTH_OR_MATCH';
}

/**
 * Resolves only previously durable M4B-02B/M4B-04 artifacts, then crosses the
 * controlled M4B-05 boundary into Job Intelligence and persists the resulting
 * projection + JobSnapshot before reporting success.
 */
export async function projectDurableMarketObservationToJobIntelligence(
  marketObservationId: MarketObservationId,
  dependencies: MarketJobProjectionRuntimeDependencies,
): Promise<MarketJobProjectionRuntimeResult> {
  const observationHistory = await dependencies.observationRepository.load();
  if (!observationHistory) {
    throw new MarketJobProjectionSourceNotFoundError(
      'MARKET_OBSERVATION',
      `MarketObservation ${marketObservationId} was not found in durable market history.`,
    );
  }
  validateMarketObservationHistorySnapshot(observationHistory);
  const observation = observationHistory.observations.find((item) => item.id === marketObservationId);
  if (!observation) {
    throw new MarketJobProjectionSourceNotFoundError(
      'MARKET_OBSERVATION',
      `MarketObservation ${marketObservationId} was not found in durable market history.`,
    );
  }

  const interpretationHistory = await dependencies.interpretationRepository.load();
  if (!interpretationHistory) {
    throw new MarketJobProjectionSourceNotFoundError(
      'DERIVED_MARKET_INTERPRETATION',
      `No durable ${MARKET_INTERPRETATION_POLICY_VERSION} interpretation exists for ${marketObservationId}.`,
    );
  }
  validateDerivedMarketInterpretationHistorySnapshot(interpretationHistory);
  const interpretation = interpretationHistory.interpretations.find(
    (item) => item.marketObservationId === marketObservationId
      && item.policyVersion === MARKET_INTERPRETATION_POLICY_VERSION,
  );
  if (!interpretation) {
    throw new MarketJobProjectionSourceNotFoundError(
      'DERIVED_MARKET_INTERPRETATION',
      `No durable ${MARKET_INTERPRETATION_POLICY_VERSION} interpretation exists for ${marketObservationId}.`,
    );
  }
  validateDerivedMarketInterpretation(interpretation, observation);

  const projected = projectMarketToJobIntelligence(observation, interpretation, {
    projectedAt: dependencies.projectedAt,
  });
  const projectionHistory = await persistMarketJobProjection({
    projection: projected.projection,
    jobSnapshot: projected.jobSnapshot,
    repository: dependencies.projectionRepository,
  });

  return {
    ...projected,
    projectionHistory,
    persistence: 'DURABLE_MARKET_JOB_PROJECTION_M4B_05',
    scopeBoundary: 'DURABLE_JOB_INTELLIGENCE_PROJECTION_NOT_CANDIDATE_TRUTH_OR_MATCH',
  };
}
