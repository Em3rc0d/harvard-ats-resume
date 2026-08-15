import { createHash } from 'node:crypto';
import {
  OBSERVATION_OCCURRENCE_SCHEMA_VERSION,
  domainId,
  type MarketObservation,
  type ObservationOccurrence,
} from '../../domain';
import { validateMarketObservation } from './MarketObservationService';

export const MARKET_OBSERVATION_HISTORY_SCHEMA_VERSION = 'market-observation-history-v1' as const;

export interface MarketObservationHistorySnapshot {
  readonly schemaVersion: typeof MARKET_OBSERVATION_HISTORY_SCHEMA_VERSION;
  readonly observations: readonly MarketObservation[];
  readonly occurrences: readonly ObservationOccurrence[];
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MarketObservationHistoryRepository {
  load(): Promise<MarketObservationHistorySnapshot | null>;
  save(snapshot: MarketObservationHistorySnapshot): Promise<void>;
}

export interface PersistMarketObservationHistoryInput {
  readonly observation: MarketObservation;
  readonly repository: MarketObservationHistoryRepository;
}

export interface PersistMarketObservationHistoryResult {
  readonly snapshot: MarketObservationHistorySnapshot;
  readonly occurrence: ObservationOccurrence;
  readonly observationAdded: boolean;
  readonly occurrenceAdded: boolean;
}

export class MarketObservationHistoryIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MarketObservationHistoryIntegrityError';
  }
}

export class MarketObservationHistoryUnavailableError extends Error {
  constructor(message = 'Durable market observation history storage is not configured.') {
    super(message);
    this.name = 'MarketObservationHistoryUnavailableError';
  }
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

function requireHistory(condition: boolean, message: string): asserts condition {
  if (!condition) throw new MarketObservationHistoryIntegrityError(message);
}

function requireTimestamp(value: string, label: string): void {
  requireHistory(Number.isFinite(Date.parse(value)), `${label} must be a valid timestamp.`);
}

function occurrenceSemantic(observation: MarketObservation, observedAt: string) {
  return {
    schemaVersion: OBSERVATION_OCCURRENCE_SCHEMA_VERSION,
    marketObservationId: observation.id,
    observedAt,
    scopeBoundary: 'OBSERVATION_EVENT_NOT_SEMANTIC_MARKET_STATE' as const,
  };
}

export function createObservationOccurrence(observation: MarketObservation): ObservationOccurrence {
  validateMarketObservation(observation);
  requireTimestamp(observation.observedAt, 'MarketObservation observedAt');

  const semantic = occurrenceSemantic(observation, observation.observedAt);
  const contentSha256 = sha256(stableJson(semantic));
  const occurrence: ObservationOccurrence = {
    ...semantic,
    id: domainId('ObservationOccurrence', `observation-occurrence:${contentSha256.slice(0, 32)}`),
    contentSha256,
  };
  validateObservationOccurrence(occurrence);
  return occurrence;
}

export function validateObservationOccurrence(occurrence: ObservationOccurrence): void {
  requireHistory(
    occurrence.schemaVersion === OBSERVATION_OCCURRENCE_SCHEMA_VERSION,
    `Unsupported observation occurrence schema: ${occurrence.schemaVersion}`,
  );
  requireTimestamp(occurrence.observedAt, 'ObservationOccurrence observedAt');
  requireHistory(
    occurrence.scopeBoundary === 'OBSERVATION_EVENT_NOT_SEMANTIC_MARKET_STATE',
    'ObservationOccurrence scope boundary changed.',
  );

  const semantic = {
    schemaVersion: occurrence.schemaVersion,
    marketObservationId: occurrence.marketObservationId,
    observedAt: occurrence.observedAt,
    scopeBoundary: occurrence.scopeBoundary,
  };
  const expectedHash = sha256(stableJson(semantic));
  requireHistory(occurrence.contentSha256 === expectedHash, `ObservationOccurrence ${occurrence.id} content hash mismatch.`);
  requireHistory(
    occurrence.id === `observation-occurrence:${expectedHash.slice(0, 32)}`,
    `ObservationOccurrence ${occurrence.id} identity is not content-addressed.`,
  );
}

export function validateMarketObservationHistorySnapshot(snapshot: MarketObservationHistorySnapshot): void {
  requireHistory(
    snapshot.schemaVersion === MARKET_OBSERVATION_HISTORY_SCHEMA_VERSION,
    `Unsupported market observation history schema: ${snapshot.schemaVersion}`,
  );
  requireHistory(Number.isInteger(snapshot.revision) && snapshot.revision >= 1, 'Market observation history revision must be a positive integer.');
  requireTimestamp(snapshot.createdAt, 'Market observation history createdAt');
  requireTimestamp(snapshot.updatedAt, 'Market observation history updatedAt');

  const observationIds = snapshot.observations.map((item) => item.id);
  const occurrenceIds = snapshot.occurrences.map((item) => item.id);
  requireHistory(new Set(observationIds).size === observationIds.length, 'MarketObservation collection contains duplicate identifiers.');
  requireHistory(new Set(occurrenceIds).size === occurrenceIds.length, 'ObservationOccurrence collection contains duplicate identifiers.');

  snapshot.observations.forEach(validateMarketObservation);
  snapshot.occurrences.forEach(validateObservationOccurrence);

  const observationsById = new Map(snapshot.observations.map((item) => [item.id, item]));
  snapshot.occurrences.forEach((occurrence) => {
    requireHistory(
      observationsById.has(occurrence.marketObservationId),
      `ObservationOccurrence ${occurrence.id} references an unknown MarketObservation.`,
    );
  });

  snapshot.observations.forEach((observation) => {
    const occurrences = snapshot.occurrences.filter((item) => item.marketObservationId === observation.id);
    requireHistory(occurrences.length > 0, `MarketObservation ${observation.id} has no durable observation occurrence.`);
    requireHistory(
      occurrences.some((item) => item.observedAt === observation.observedAt),
      `MarketObservation ${observation.id} canonical observedAt is not represented by an occurrence.`,
    );
  });
}

function earlierTimestamp(first: string, second: string): string {
  return Date.parse(first) <= Date.parse(second) ? first : second;
}

function laterTimestamp(first: string, second: string): string {
  return Date.parse(first) >= Date.parse(second) ? first : second;
}

/**
 * M4B-02B durability boundary.
 *
 * Semantic market state and temporal observation events are persisted
 * separately. Seeing unchanged source content again keeps one MarketObservation
 * and appends a new ObservationOccurrence. Changed semantic content creates a
 * new MarketObservation while every prior state and occurrence remain intact.
 */
export async function persistMarketObservationHistory(
  input: PersistMarketObservationHistoryInput,
): Promise<PersistMarketObservationHistoryResult> {
  validateMarketObservation(input.observation);
  const occurrence = createObservationOccurrence(input.observation);
  const existing = await input.repository.load();
  if (existing) validateMarketObservationHistorySnapshot(existing);

  const priorObservation = existing?.observations.find((item) => item.id === input.observation.id);
  if (priorObservation) {
    requireHistory(
      priorObservation.contentSha256 === input.observation.contentSha256,
      `MarketObservation identity collision changed historical meaning: ${input.observation.id}`,
    );
  }

  const priorOccurrence = existing?.occurrences.find((item) => item.id === occurrence.id);
  if (priorOccurrence) {
    requireHistory(
      priorOccurrence.contentSha256 === occurrence.contentSha256,
      `ObservationOccurrence identity collision changed historical meaning: ${occurrence.id}`,
    );
  }

  const observationAdded = !priorObservation;
  const occurrenceAdded = !priorOccurrence;
  if (existing && !observationAdded && !occurrenceAdded) {
    return { snapshot: existing, occurrence: priorOccurrence!, observationAdded, occurrenceAdded };
  }

  const observations = observationAdded
    ? [...(existing?.observations ?? []), input.observation]
    : existing!.observations;
  const occurrences = occurrenceAdded
    ? [...(existing?.occurrences ?? []), occurrence]
    : existing!.occurrences;
  const next: MarketObservationHistorySnapshot = {
    schemaVersion: MARKET_OBSERVATION_HISTORY_SCHEMA_VERSION,
    observations,
    occurrences,
    revision: (existing?.revision ?? 0) + 1,
    createdAt: existing
      ? earlierTimestamp(existing.createdAt, input.observation.observedAt)
      : input.observation.observedAt,
    updatedAt: existing
      ? laterTimestamp(existing.updatedAt, input.observation.observedAt)
      : input.observation.observedAt,
  };
  validateMarketObservationHistorySnapshot(next);
  await input.repository.save(next);

  const reloaded = await input.repository.load();
  requireHistory(Boolean(reloaded), 'Market observation history save could not be reloaded for verification.');
  validateMarketObservationHistorySnapshot(reloaded!);
  requireHistory(reloaded!.revision === next.revision, `Market observation history expected revision ${next.revision} but reloaded ${reloaded!.revision}.`);
  requireHistory(
    reloaded!.observations.some((item) => item.id === input.observation.id),
    'Market observation history reload could not find the persisted semantic observation.',
  );
  requireHistory(
    reloaded!.occurrences.some((item) => item.id === occurrence.id),
    'Market observation history reload could not find the persisted observation occurrence.',
  );

  return { snapshot: reloaded!, occurrence, observationAdded, occurrenceAdded };
}
