import type { MarketObservation } from '../../domain';
import type { AcquiredProviderMarketIntake } from './ControlledSourceAcquisition';
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
 * Canonical M4B-02A application boundary for controlled user-supplied source
 * representations. It intentionally performs no network acquisition itself.
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

export interface ProviderMarketIntakeResult {
  readonly policyVersion: typeof MARKET_INTAKE_POLICY_VERSION;
  readonly intakeKind: 'PROVIDER_ACQUIRED';
  readonly observation: MarketObservation;
  readonly persistence: 'NOT_PERSISTED_UNTIL_M4B_02B_HISTORY';
  readonly scopeBoundary: 'INTAKE_CREATES_PROVIDER_OBSERVED_MARKET_FACT_ONLY_NO_DERIVED_INTERPRETATION_OR_PERSISTENCE';
}

/**
 * Internal canonical-intake entry for M4B-03 provider adapters.
 *
 * Acquisition infrastructure is allowed to fetch and validate one supported
 * public provider listing, but it cannot create MarketObservation directly.
 * The adapter must hand its source-explicit result back to this application
 * boundary, preserving the same MarketObservation authority as manual intake.
 */
export function intakeAcquiredProviderObservation(
  acquired: AcquiredProviderMarketIntake,
  observedAt?: string,
): ProviderMarketIntakeResult {
  const observation = createMarketObservation({
    source: {
      type: 'PROVIDER_API',
      provider: acquired.provider,
      label: acquired.sourceLabel,
    },
    payload: {
      format: 'JSON',
      content: acquired.payloadContent,
    },
    explicitFields: acquired.explicitFields,
    provenance: {
      captureMethod: 'PROVIDER_ADAPTER',
      sourceUrl: acquired.sourceUrl,
      externalId: acquired.externalId,
      adapter: {
        adapterId: acquired.adapterId,
        adapterVersion: acquired.adapterVersion,
      },
    },
    observedAt,
  });

  return {
    policyVersion: MARKET_INTAKE_POLICY_VERSION,
    intakeKind: 'PROVIDER_ACQUIRED',
    observation,
    persistence: 'NOT_PERSISTED_UNTIL_M4B_02B_HISTORY',
    scopeBoundary: 'INTAKE_CREATES_PROVIDER_OBSERVED_MARKET_FACT_ONLY_NO_DERIVED_INTERPRETATION_OR_PERSISTENCE',
  };
}
