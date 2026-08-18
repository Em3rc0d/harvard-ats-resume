import { Redis } from '@upstash/redis';
import {
  MarketJobProjectionHistoryUnavailableError,
  validateMarketJobProjectionHistorySnapshot,
  type MarketJobProjectionHistoryRecord,
  type MarketJobProjectionHistoryRepository,
  type MarketJobProjectionHistorySnapshot,
} from '../../application/market/MarketJobProjectionHistory';
import {
  UpstashPartitionedMarketPersistenceBackend,
  immutablePartitionRecord,
  mergeImmutableRecordsById,
  readPartitionedMarketCollection,
  type PartitionedMarketPersistenceBackend,
} from './PartitionedMarketPersistence';

const LEGACY_KEY = 'ats2:market-job-projection-history:v1';
const NAMESPACE = 'ats2:market-job-projection-history:v2';
const MIGRATION_MARKER = `${NAMESPACE}:migration-complete`;
const RECORD_KIND = 'projection-record';

function recordId(record: MarketJobProjectionHistoryRecord): string {
  return `${record.projection.id}:${record.jobSnapshot.analyzerVersion}`;
}

function compareRecords(first: MarketJobProjectionHistoryRecord, second: MarketJobProjectionHistoryRecord): number {
  const byTime = Date.parse(first.projection.projectedAt) - Date.parse(second.projection.projectedAt);
  return byTime !== 0 ? byTime : recordId(first).localeCompare(recordId(second));
}

function validateRecord(record: MarketJobProjectionHistoryRecord): void {
  validateMarketJobProjectionHistorySnapshot({
    schemaVersion: 'market-job-projection-history-v1',
    records: [record],
    revision: 1,
    createdAt: record.projection.projectedAt,
    updatedAt: record.projection.projectedAt,
  });
}

export class PartitionedMarketJobProjectionHistoryRepository
implements MarketJobProjectionHistoryRepository {
  constructor(private readonly backend: PartitionedMarketPersistenceBackend) {}

  private async commitRecord(record: MarketJobProjectionHistoryRecord): Promise<void> {
    validateRecord(record);
    const id = recordId(record);
    await this.backend.commitImmutableRecords([
      immutablePartitionRecord({
        namespace: NAMESPACE,
        kind: RECORD_KIND,
        id,
        record,
      }),
    ]);
  }

  private async ensureLegacyMigrated(): Promise<void> {
    if (await this.backend.get<string>(MIGRATION_MARKER)) return;
    const legacy = await this.backend.get<MarketJobProjectionHistorySnapshot>(LEGACY_KEY);
    if (legacy) {
      validateMarketJobProjectionHistorySnapshot(legacy);
      await Promise.all(legacy.records.map((record) => this.commitRecord(record)));
    }
    await this.backend.set(MIGRATION_MARKER, 'complete');
  }

  async load(): Promise<MarketJobProjectionHistorySnapshot | null> {
    const [partitioned, migrated] = await Promise.all([
      readPartitionedMarketCollection<MarketJobProjectionHistoryRecord>({
        backend: this.backend,
        namespace: NAMESPACE,
        kind: RECORD_KIND,
      }),
      this.backend.get<string>(MIGRATION_MARKER),
    ]);
    const legacy = migrated
      ? null
      : await this.backend.get<MarketJobProjectionHistorySnapshot>(LEGACY_KEY);
    if (legacy) validateMarketJobProjectionHistorySnapshot(legacy);

    const records = mergeImmutableRecordsById(
      legacy?.records ?? [],
      partitioned,
      recordId,
    ).sort(compareRecords);
    if (records.length === 0) return null;

    const snapshot: MarketJobProjectionHistorySnapshot = {
      schemaVersion: 'market-job-projection-history-v1',
      records,
      revision: records.length,
      createdAt: records[0].projection.projectedAt,
      updatedAt: records[records.length - 1].projection.projectedAt,
    };
    validateMarketJobProjectionHistorySnapshot(snapshot);
    return snapshot;
  }

  async append(record: MarketJobProjectionHistoryRecord): Promise<void> {
    await this.ensureLegacyMigrated();
    await this.commitRecord(record);
  }

  async save(snapshot: MarketJobProjectionHistorySnapshot): Promise<void> {
    validateMarketJobProjectionHistorySnapshot(snapshot);
    await this.ensureLegacyMigrated();
    await Promise.all(snapshot.records.map((record) => this.commitRecord(record)));
  }
}

export class UpstashMarketJobProjectionHistoryRepository
extends PartitionedMarketJobProjectionHistoryRepository {
  constructor(redis: Redis) {
    super(new UpstashPartitionedMarketPersistenceBackend(redis));
  }
}

export interface MarketJobProjectionHistoryEnvironment {
  readonly UPSTASH_REDIS_REST_URL?: string;
  readonly UPSTASH_REDIS_REST_TOKEN?: string;
}

function processEnvironment(): MarketJobProjectionHistoryEnvironment {
  return {
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  };
}

export function createMarketJobProjectionHistoryRepositoryFromEnv(
  env: MarketJobProjectionHistoryEnvironment = processEnvironment(),
): MarketJobProjectionHistoryRepository {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new MarketJobProjectionHistoryUnavailableError(
      'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required for durable market job projection history.',
    );
  }
  return new UpstashMarketJobProjectionHistoryRepository(new Redis({ url, token }));
}
