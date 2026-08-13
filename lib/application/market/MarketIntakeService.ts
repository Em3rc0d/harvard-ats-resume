import { createMarketObservation } from './MarketObservationService';
import {
  manualTextMarketIntakeAdapter,
  structuredPayloadMarketIntakeAdapter,
} from './MarketIntakeAdapters';
import {
  MARKET_INTAKE_POLICY_VERSION,
  type MarketIntakeRequest,
  type MarketIntakeResult,
} from './MarketIntake';

function unreachable(value: never): never {
  throw new Error(`Unsupported MarketIntake kind: ${String(value)}`);
}

/**
 * Canonical M4B-02A application boundary.
 *
 * Every supported caller representation must first become a MarketObservation.
 * This service intentionally performs no URL fetch, Job Intelligence analysis,
 * candidate comparison, persistence, ranking, or recommendation.
 */
export function intakeMarketObservation(request: MarketIntakeRequest): MarketIntakeResult {
  const observationInput = request.kind === 'MANUAL_TEXT'
    ? manualTextMarketIntakeAdapter.toObservationInput(request)
    : request.kind === 'STRUCTURED_PAYLOAD'
      ? structuredPayloadMarketIntakeAdapter.toObservationInput(request)
      : unreachable(request);

  const observation = createMarketObservation(observationInput);
  return {
    policyVersion: MARKET_INTAKE_POLICY_VERSION,
    intakeKind: request.kind,
    observation,
    persistence: 'NOT_PERSISTED_M4B_02A',
    scopeBoundary: 'INTAKE_CREATES_OBSERVED_MARKET_FACT_ONLY_NO_DERIVED_INTERPRETATION_OR_PERSISTENCE',
  };
}
