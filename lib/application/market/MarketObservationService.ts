import { createHash } from 'node:crypto';
import {
  MARKET_OBSERVATION_SCHEMA_VERSION,
  domainId,
  type MarketObservation,
  type MarketObservationProvenance,
  type MarketObservationPayload,
  type MarketSource,
  type MarketSourceType,
  type ObservedJobFields,
  type ObservedMarketField,
} from '../../domain';

export interface MarketSourceInput {
  readonly type: MarketSourceType;
  readonly provider?: string;
  readonly label?: string;
}

export interface CreateMarketObservationInput {
  readonly source: MarketSourceInput;
  readonly payload: MarketObservationPayload;
  readonly explicitFields?: ObservedJobFields;
  readonly provenance: MarketObservationProvenance;
  readonly observedAt?: string;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((result, key) => {
      const item = (value as Record<string, unknown>)[key];
      if (item !== undefined) result[key] = stableValue(item);
      return result;
    }, {});
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function assertMarket(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`MarketObservation integrity: ${message}`);
}

function normalizedOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function validateObservedField(field: ObservedMarketField, label: string): void {
  assertMarket(Boolean(field.value.trim()), `${label} cannot be empty.`);
  assertMarket(field.evidence.origin === 'SOURCE_EXPLICIT', `${label} must be explicitly sourced.`);
  if (field.evidence.sourcePath !== undefined) {
    assertMarket(Boolean(field.evidence.sourcePath.trim()), `${label} sourcePath cannot be blank.`);
  }
  if (field.evidence.sourceExcerpt !== undefined) {
    assertMarket(Boolean(field.evidence.sourceExcerpt.trim()), `${label} sourceExcerpt cannot be blank.`);
  }
}

function validateExplicitFields(fields: ObservedJobFields): void {
  Object.entries(fields).forEach(([key, field]) => {
    if (field) validateObservedField(field, key);
  });
}

function marketSourceSemantic(input: MarketSourceInput) {
  return {
    type: input.type,
    provider: normalizedOptional(input.provider),
    label: normalizedOptional(input.label),
  };
}

export function createMarketSource(input: MarketSourceInput): MarketSource {
  const semantic = marketSourceSemantic(input);
  const hash = sha256(stableJson(semantic));
  return {
    id: domainId('MarketSource', `market-source:${hash.slice(0, 32)}`),
    ...semantic,
  };
}

function expectedSourceId(source: MarketSource): string {
  const hash = sha256(stableJson(marketSourceSemantic(source)));
  return `market-source:${hash.slice(0, 32)}`;
}

function observationSemantic(input: {
  source: MarketSource;
  payload: MarketObservationPayload;
  explicitFields: ObservedJobFields;
  provenance: MarketObservationProvenance;
}) {
  return {
    schemaVersion: MARKET_OBSERVATION_SCHEMA_VERSION,
    source: input.source,
    payload: input.payload,
    explicitFields: input.explicitFields,
    provenance: input.provenance,
    scopeBoundary: 'OBSERVED_MARKET_FACT_NOT_CANDIDATE_EVIDENCE_OR_DERIVED_INTERPRETATION' as const,
  };
}

export function validateMarketObservation(observation: MarketObservation): void {
  assertMarket(observation.schemaVersion === MARKET_OBSERVATION_SCHEMA_VERSION, 'unsupported schema version.');
  assertMarket(Boolean(observation.payload.content.trim()), 'source payload cannot be empty.');
  assertMarket(observation.payload.format === 'TEXT' || observation.payload.format === 'JSON', 'unsupported payload format.');
  assertMarket(observation.source.id === expectedSourceId(observation.source), 'MarketSource identity is not content-addressed.');
  validateExplicitFields(observation.explicitFields);

  if (observation.provenance.sourceUrl !== undefined) {
    assertMarket(Boolean(observation.provenance.sourceUrl.trim()), 'sourceUrl cannot be blank.');
  }
  if (observation.provenance.externalId !== undefined) {
    assertMarket(Boolean(observation.provenance.externalId.trim()), 'externalId cannot be blank.');
  }
  if (observation.provenance.adapter) {
    assertMarket(Boolean(observation.provenance.adapter.adapterId.trim()), 'adapterId cannot be blank.');
    assertMarket(Boolean(observation.provenance.adapter.adapterVersion.trim()), 'adapterVersion cannot be blank.');
  }
  if (observation.provenance.captureMethod === 'PROVIDER_ADAPTER') {
    assertMarket(Boolean(observation.provenance.adapter), 'provider-adapter capture requires adapter provenance.');
  }

  assertMarket(
    observation.scopeBoundary === 'OBSERVED_MARKET_FACT_NOT_CANDIDATE_EVIDENCE_OR_DERIVED_INTERPRETATION',
    'scope boundary changed.',
  );

  const semantic = observationSemantic({
    source: observation.source,
    payload: observation.payload,
    explicitFields: observation.explicitFields,
    provenance: observation.provenance,
  });
  const expectedHash = sha256(stableJson(semantic));
  assertMarket(observation.contentSha256 === expectedHash, 'content hash mismatch.');
  assertMarket(observation.id === `market-observation:${expectedHash.slice(0, 32)}`, 'identity is not content-addressed.');
}

/**
 * Creates the immutable raw/explicit market-truth boundary. observedAt is an
 * observation event and therefore does not participate in semantic identity.
 */
export function createMarketObservation(input: CreateMarketObservationInput): MarketObservation {
  const source = createMarketSource(input.source);
  const payload = {
    format: input.payload.format,
    content: input.payload.content,
  } as const;
  const explicitFields = input.explicitFields ?? {};
  const provenance: MarketObservationProvenance = {
    captureMethod: input.provenance.captureMethod,
    sourceUrl: normalizedOptional(input.provenance.sourceUrl),
    externalId: normalizedOptional(input.provenance.externalId),
    adapter: input.provenance.adapter
      ? {
          adapterId: input.provenance.adapter.adapterId.trim(),
          adapterVersion: input.provenance.adapter.adapterVersion.trim(),
        }
      : undefined,
  };

  assertMarket(Boolean(payload.content.trim()), 'source payload cannot be empty.');
  validateExplicitFields(explicitFields);

  const semantic = observationSemantic({ source, payload, explicitFields, provenance });
  const contentSha256 = sha256(stableJson(semantic));
  const observation: MarketObservation = {
    ...semantic,
    id: domainId('MarketObservation', `market-observation:${contentSha256.slice(0, 32)}`),
    contentSha256,
    observedAt: input.observedAt ?? new Date().toISOString(),
  };
  validateMarketObservation(observation);
  return observation;
}
