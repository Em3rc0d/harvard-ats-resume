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

function validatePayload(payload: MarketObservationPayload): void {
  assertMarket(Boolean(payload.content.trim()), 'source payload cannot be empty.');
  assertMarket(payload.format === 'TEXT' || payload.format === 'JSON', 'unsupported payload format.');
  if (payload.format === 'JSON') {
    try {
      JSON.parse(payload.content);
    } catch {
      throw new Error('MarketObservation integrity: JSON payload must contain valid JSON source material.');
    }
  }
}

function validateObservedField(
  field: ObservedMarketField,
  label: string,
  payload: MarketObservationPayload,
): void {
  assertMarket(Boolean(field.value.trim()), `${label} cannot be empty.`);
  assertMarket(field.evidence.origin === 'SOURCE_EXPLICIT', `${label} must be explicitly sourced.`);

  const sourcePath = normalizedOptional(field.evidence.sourcePath);
  const sourceExcerpt = normalizedOptional(field.evidence.sourceExcerpt);
  assertMarket(Boolean(sourcePath || sourceExcerpt), `${label} must identify where the explicit source value came from.`);

  if (field.evidence.sourcePath !== undefined) {
    assertMarket(Boolean(sourcePath), `${label} sourcePath cannot be blank.`);
  }
  if (field.evidence.sourceExcerpt !== undefined) {
    assertMarket(Boolean(sourceExcerpt), `${label} sourceExcerpt cannot be blank.`);
    assertMarket(payload.content.includes(sourceExcerpt!), `${label} sourceExcerpt is not present in the raw source payload.`);
    assertMarket(sourceExcerpt!.includes(field.value), `${label} raw value is not present in its sourceExcerpt.`);
  }

  if (payload.format === 'TEXT') {
    assertMarket(Boolean(sourceExcerpt), `${label} from TEXT payload requires an exact sourceExcerpt.`);
  }
}

function validateExplicitFields(fields: ObservedJobFields, payload: MarketObservationPayload): void {
  Object.entries(fields).forEach(([key, field]) => {
    if (field) validateObservedField(field, key, payload);
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
  if (semantic.type === 'PROVIDER_API') {
    assertMarket(Boolean(semantic.provider), 'PROVIDER_API source requires a provider identity.');
  }
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

function validateProvenance(source: MarketSource, provenance: MarketObservationProvenance): void {
  if (provenance.sourceUrl !== undefined) {
    assertMarket(Boolean(provenance.sourceUrl.trim()), 'sourceUrl cannot be blank.');
  }
  if (provenance.externalId !== undefined) {
    assertMarket(Boolean(provenance.externalId.trim()), 'externalId cannot be blank.');
  }
  if (provenance.adapter) {
    assertMarket(Boolean(provenance.adapter.adapterId.trim()), 'adapterId cannot be blank.');
    assertMarket(Boolean(provenance.adapter.adapterVersion.trim()), 'adapterVersion cannot be blank.');
  }
  if (provenance.captureMethod === 'PROVIDER_ADAPTER') {
    assertMarket(Boolean(provenance.adapter), 'provider-adapter capture requires adapter provenance.');
    assertMarket(Boolean(source.provider), 'provider-adapter capture requires provider identity.');
  }
  if (provenance.captureMethod === 'PUBLIC_URL_FETCH') {
    assertMarket(Boolean(normalizedOptional(provenance.sourceUrl)), 'public URL capture requires sourceUrl provenance.');
  }
}

export function validateMarketObservation(observation: MarketObservation): void {
  assertMarket(observation.schemaVersion === MARKET_OBSERVATION_SCHEMA_VERSION, 'unsupported schema version.');
  validatePayload(observation.payload);
  assertMarket(observation.source.id === expectedSourceId(observation.source), 'MarketSource identity is not content-addressed.');
  if (observation.source.type === 'PROVIDER_API') {
    assertMarket(Boolean(normalizedOptional(observation.source.provider)), 'PROVIDER_API source requires a provider identity.');
  }
  validateExplicitFields(observation.explicitFields, observation.payload);
  validateProvenance(observation.source, observation.provenance);
  assertMarket(Number.isFinite(Date.parse(observation.observedAt)), 'observedAt must be a valid timestamp.');

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
  const observedAt = input.observedAt ?? new Date().toISOString();

  validatePayload(payload);
  validateExplicitFields(explicitFields, payload);
  validateProvenance(source, provenance);
  assertMarket(Number.isFinite(Date.parse(observedAt)), 'observedAt must be a valid timestamp.');

  const semantic = observationSemantic({ source, payload, explicitFields, provenance });
  const contentSha256 = sha256(stableJson(semantic));
  const observation: MarketObservation = {
    ...semantic,
    id: domainId('MarketObservation', `market-observation:${contentSha256.slice(0, 32)}`),
    contentSha256,
    observedAt,
  };
  validateMarketObservation(observation);
  return observation;
}
