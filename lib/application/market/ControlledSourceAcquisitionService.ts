import {
  CONTROLLED_SOURCE_ACQUISITION_POLICY_VERSION,
  type ControlledSourceAcquisitionDependencies,
  type ControlledSourceAcquisitionRequest,
  type ControlledSourceAcquisitionResult,
} from './ControlledSourceAcquisition';
import { intakeAcquiredProviderObservation } from './MarketIntakeService';
import { persistMarketObservationHistory } from './MarketObservationHistory';
import { acquireProviderMarketIntake } from '../../infrastructure/market/ControlledProviderSourceAdapters';

/**
 * M4B-03 orchestration boundary.
 *
 * External source -> provider adapter -> canonical market intake -> immutable
 * MarketObservation -> durable ObservationOccurrence history.
 *
 * No provider response can invoke Job Intelligence, candidate matching,
 * OpportunityAssessment, OpportunitySpace, recommendation, or resume generation
 * through this service.
 */
export async function acquireControlledMarketSource(
  request: ControlledSourceAcquisitionRequest,
  dependencies: ControlledSourceAcquisitionDependencies,
): Promise<ControlledSourceAcquisitionResult> {
  const acquired = await acquireProviderMarketIntake(request, dependencies.fetcher ?? fetch);
  const intake = intakeAcquiredProviderObservation(acquired, dependencies.observedAt);
  const historyResult = await persistMarketObservationHistory({
    observation: intake.observation,
    repository: dependencies.repository,
  });

  return {
    policyVersion: CONTROLLED_SOURCE_ACQUISITION_POLICY_VERSION,
    provider: acquired.provider,
    observation: intake.observation,
    occurrenceId: historyResult.occurrence.id,
    history: {
      schemaVersion: historyResult.snapshot.schemaVersion,
      revision: historyResult.snapshot.revision,
      observationCount: historyResult.snapshot.observations.length,
      occurrenceCount: historyResult.snapshot.occurrences.length,
      observationAdded: historyResult.observationAdded,
      occurrenceAdded: historyResult.occurrenceAdded,
    },
    persistence: 'DURABLE_OBSERVATION_HISTORY_M4B_02B',
    scopeBoundary: 'CONTROLLED_PROVIDER_ACQUISITION_TO_OBSERVED_MARKET_FACT_ONLY_NO_DERIVED_INTERPRETATION',
  };
}
