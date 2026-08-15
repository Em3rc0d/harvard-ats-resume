import type { DerivedMarketInterpretation, MarketObservationId } from '../../domain';
import {
  persistDerivedMarketInterpretation,
  type DerivedMarketInterpretationHistoryRepository,
} from './DerivedMarketInterpretationHistory';
import { deriveMarketInterpretation } from './DerivedMarketInterpretationService';
import {
  validateMarketObservationHistorySnapshot,
  type MarketObservationHistoryRepository,
} from './MarketObservationHistory';

export class MarketObservationNotFoundForInterpretationError extends Error {
  constructor(readonly marketObservationId: string) {
    super(`MarketObservation was not found for interpretation: ${marketObservationId}`);
    this.name = 'MarketObservationNotFoundForInterpretationError';
  }
}

export interface InterpretMarketObservationDependencies {
  readonly observationRepository: MarketObservationHistoryRepository;
  readonly interpretationRepository: DerivedMarketInterpretationHistoryRepository;
  readonly generatedAt?: string;
}

export interface InterpretMarketObservationResult {
  readonly interpretation: DerivedMarketInterpretation;
  readonly interpretationHistory: {
    readonly schemaVersion: string;
    readonly revision: number;
    readonly interpretationCount: number;
    readonly interpretationAdded: boolean;
  };
  readonly persistence: 'DURABLE_DERIVED_MARKET_INTERPRETATION_M4B_04';
  readonly scopeBoundary: 'INTERPRETATION_ONLY_NO_JOB_INTELLIGENCE_MATCH_OR_RECOMMENDATION';
}

/**
 * M4B-04 runtime boundary. It resolves one already-durable MarketObservation,
 * derives only the controlled interpretation contract, and persists that
 * interpretation. It does not invoke Job Intelligence or downstream decisions.
 */
export async function interpretMarketObservation(
  marketObservationId: MarketObservationId,
  dependencies: InterpretMarketObservationDependencies,
): Promise<InterpretMarketObservationResult> {
  const observationHistory = await dependencies.observationRepository.load();
  if (!observationHistory) {
    throw new MarketObservationNotFoundForInterpretationError(marketObservationId);
  }
  validateMarketObservationHistorySnapshot(observationHistory);

  const observation = observationHistory.observations.find((item) => item.id === marketObservationId);
  if (!observation) {
    throw new MarketObservationNotFoundForInterpretationError(marketObservationId);
  }

  const interpretation = deriveMarketInterpretation(observation, {
    generatedAt: dependencies.generatedAt,
  });
  const persisted = await persistDerivedMarketInterpretation({
    observation,
    interpretation,
    repository: dependencies.interpretationRepository,
  });

  return {
    interpretation: persisted.interpretation,
    interpretationHistory: {
      schemaVersion: persisted.snapshot.schemaVersion,
      revision: persisted.snapshot.revision,
      interpretationCount: persisted.snapshot.interpretations.length,
      interpretationAdded: persisted.interpretationAdded,
    },
    persistence: 'DURABLE_DERIVED_MARKET_INTERPRETATION_M4B_04',
    scopeBoundary: 'INTERPRETATION_ONLY_NO_JOB_INTELLIGENCE_MATCH_OR_RECOMMENDATION',
  };
}
