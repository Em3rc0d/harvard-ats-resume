import { Redis } from '@upstash/redis';
import {
  MarketObservationHistoryUnavailableError,
  validateMarketObservationHistorySnapshot,
  validateObservationOccurrence,
  type AppendMarketObservationHistoryEvent,
  type MarketObservationHistoryRepository,
  type MarketObservationHistorySnapshot,
} from '../../application/market/MarketObservationHistory';
import { validateMarketObservation } from '../../application/market/MarketObservationService';
import type { MarketObservation, ObservationOccurrence } from '../../domain';
import {
  UpstashPartitionedMarketPersistenceBackend,
  immutablePartitionRecord,
  mergeImmutableRecordsById,
  readPartitionedMarketCollection,
  type PartitionedMarketPersistenceBackend,
} from './PartitionedMarketPersistence';

const LEGACY_KEY = 'ats2:market-observation-history:v1';
const NAMESPACE = 'ats2:market-observation-history:v2';
const MIGRATION_MARKER = `${NAMESPACE}:migration-complete`;
const OBSERVATION_KIND = 'observation';
const OCCURRENCE_KIND = 'occurrence';

function compareTimestampThenId<T>(
  first: T,
  second: T,
  timestampOf: (item: T) => string,
  idOf: (item: T) => string,
): number {
  const byTime = Date.parse(timestampOf(first)) - Date.parse(timestampOf(second));
  return byTime !== 0 ? byTime : idOf(first).localeCompare(idOf(second));
}

export class PartitionedMarketObservationHistoryRepository implements MarketObservationHistoryRepository {
  constructor(private readonly backend: PartitionedMarketPersistenceBackend) {}

  private async ensureLegacyMigrated(): Promise<void> {
    if (await this.backend.get<string>(MIGRATION_MARKER)) return;

    const legacy = await this.backend.get<MarketObservationHistorySnapshot>(LEGACY_KEY);
    if (legacy) {
      validateMarketObservationHistorySnapshot(legacy);
      const observationsById = new Map(legacy.observations.map((item) => [item.id, item]));
      for (const occurrence of legacy.occurrences) {
        const observation = observationsById.get(occurrence.marketObservationId);
        if (!observation) {
          throw new Error(`Legacy market history occurrence ${occurrence.id} has no MarketObservation.`);
        }
        await this.commitEvent({ observation, occurrence });
      }
    }

    await this.backend.set(MIGRATION_MARKER, 'complete');
  }

  private async commitEvent(event: AppendMarketObservationHistoryEvent): Promise<void> {
    validateMarketObservation(event.observation);
    validateObservationOccurrence(event.occurrence);
    if (event.occurrence.marketObservationId !== event.observation.id) {
      throw new Error('Partitioned market observation event occurrence does not reference its observation.');
    }

    await this.backend.commitImmutableRecords([
      immutablePartitionRecord({
        namespace: NAMESPACE,
        kind: OBSERVATION_KIND,
        id: event.observation.id,
        record: event.observation,
      }),
      immutablePartitionRecord({
        namespace: NAMESPACE,
        kind: OCCURRENCE_KIND,
        id: event.occurrence.id,
        record: event.occurrence,
      }),
    ]);
  }

  async load(): Promise<MarketObservationHistorySnapshot | null> {
    const [partitionedObservations, partitionedOccurrences, legacy] = await Promise.all([
      readPartitionedMarketCollection<MarketObservation>({
        backend: this.backend,
        namespace: NAMESPACE,
        kind: OBSERVATION_KIND,
      }),
      readPartitionedMarketCollection<ObservationOccurrence>({
        backend: this.backend,
        namespace: NAMESPACE,
        kind: OCCURRENCE_KIND,
      }),
      this.backend.get<MarketObservationHistorySnapshot>(LEGACY_KEY),
    ]);
    if (legacy) validateMarketObservationHistorySnapshot(legacy);

    const observations = mergeImmutableRecordsById(
      legacy?.observations ?? [],
      partitionedObservations,
      (item) => item.id,
    ).sort((first, second) => compareTimestampThenId(first, second, (item) => item.observedAt, (item) => item.id));
    const occurrences = mergeImmutableRecordsById(
      legacy?.occurrences ?? [],
      partitionedOccurrences,
      (item) => item.id,
    ).sort((first, second) => compareTimestampThenId(first, second, (item) => item.observedAt, (item) => item.id));

    if (observations.length === 0 && occurrences.length === 0) return null;
    if (occurrences.length === 0) {
      throw new Error('Partitioned market observation history contains observations without occurrences.');
    }

    const snapshot: MarketObservationHistorySnapshot = {
      schemaVersion: 'market-observation-history-v1',
      observations,
      occurrences,
      revision: occurrences.length,
      createdAt: occurrences[0].observedAt,
      updatedAt: occurrences[occurrences.length - 1].observedAt,
    };
    validateMarketObservationHistorySnapshot(snapshot);
    return snapshot;
  }

  async append(event: AppendMarketObservationHistoryEvent): Promise<void> {
    await this.ensureLegacyMigrated();
    await this.commitEvent(event);
  }

  async save(snapshot: MarketObservationHistorySnapshot): Promise<void> {
    validateMarketObservationHistorySnapshot(snapshot);
    await this.ensureLegacyMigrated();
    const observationsById = new Map(snapshot.observations.map((item) => [item.id, item]));
    for (const occurrence of snapshot.occurrences) {
      const observation = observationsById.get(occurrence.marketObservationId);
      if (!observation) throw new Error(`Market history occurrence ${occurrence.id} has no MarketObservation.`);
      await this.commitEvent({ observation, occurrence });
    }
  }
}

export class UpstashMarketObservationHistoryRepository
extends PartitionedMarketObservationHistoryRepository {
  constructor(redis: Redis) {
    super(new UpstashPartitionedMarketPersistenceBackend(redis));
  }
}

export interface MarketObservationHistoryEnvironment {
  readonly UPSTASH_REDIS_REST_URL?: string;
  readonly UPSTASH_REDIS_REST_TOKEN?: string;
}

function processMarketObservationHistoryEnvironment(): MarketObservationHistoryEnvironment {
  return {
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  };
}

export function createMarketObservationHistoryRepositoryFromEnv(
  env: MarketObservationHistoryEnvironment = processMarketObservationHistoryEnvironment(),
): MarketObservationHistoryRepository {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new MarketObservationHistoryUnavailableError(
      'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required for durable market observation history.',
    );
  }

  return new UpstashMarketObservationHistoryRepository(new Redis({ url, token }));
}
