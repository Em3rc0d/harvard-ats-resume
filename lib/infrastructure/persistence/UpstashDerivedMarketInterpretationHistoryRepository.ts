import { Redis } from '@upstash/redis';
import {
  DerivedMarketInterpretationHistoryUnavailableError,
  validateDerivedMarketInterpretationHistorySnapshot,
  type DerivedMarketInterpretationHistoryRepository,
  type DerivedMarketInterpretationHistorySnapshot,
} from '../../application/market/DerivedMarketInterpretationHistory';
import { validateDerivedMarketInterpretationIntegrity } from '../../application/market/DerivedMarketInterpretationService';
import type { DerivedMarketInterpretation } from '../../domain';
import {
  UpstashPartitionedMarketPersistenceBackend,
  immutablePartitionRecord,
  mergeImmutableRecordsById,
  readPartitionedMarketCollection,
  type PartitionedMarketPersistenceBackend,
} from './PartitionedMarketPersistence';

const LEGACY_KEY = 'ats2:derived-market-interpretation-history:v1';
const NAMESPACE = 'ats2:derived-market-interpretation-history:v2';
const MIGRATION_MARKER = `${NAMESPACE}:migration-complete`;
const INTERPRETATION_KIND = 'interpretation';

function semanticKey(interpretation: DerivedMarketInterpretation): string {
  return `${interpretation.marketObservationId}:${interpretation.policyVersion}`;
}

function compareInterpretations(first: DerivedMarketInterpretation, second: DerivedMarketInterpretation): number {
  const byTime = Date.parse(first.generatedAt) - Date.parse(second.generatedAt);
  return byTime !== 0 ? byTime : semanticKey(first).localeCompare(semanticKey(second));
}

export class PartitionedDerivedMarketInterpretationHistoryRepository
implements DerivedMarketInterpretationHistoryRepository {
  constructor(private readonly backend: PartitionedMarketPersistenceBackend) {}

  private async commitInterpretation(interpretation: DerivedMarketInterpretation): Promise<void> {
    validateDerivedMarketInterpretationIntegrity(interpretation);
    const key = semanticKey(interpretation);
    await this.backend.commitImmutableRecords([
      immutablePartitionRecord({
        namespace: NAMESPACE,
        kind: INTERPRETATION_KIND,
        id: key,
        record: interpretation,
      }),
    ]);
  }

  private async ensureLegacyMigrated(): Promise<void> {
    if (await this.backend.get<string>(MIGRATION_MARKER)) return;
    const legacy = await this.backend.get<DerivedMarketInterpretationHistorySnapshot>(LEGACY_KEY);
    if (legacy) {
      validateDerivedMarketInterpretationHistorySnapshot(legacy);
      await Promise.all(legacy.interpretations.map((item) => this.commitInterpretation(item)));
    }
    await this.backend.set(MIGRATION_MARKER, 'complete');
  }

  async load(): Promise<DerivedMarketInterpretationHistorySnapshot | null> {
    const [partitioned, legacy] = await Promise.all([
      readPartitionedMarketCollection<DerivedMarketInterpretation>({
        backend: this.backend,
        namespace: NAMESPACE,
        kind: INTERPRETATION_KIND,
      }),
      this.backend.get<DerivedMarketInterpretationHistorySnapshot>(LEGACY_KEY),
    ]);
    if (legacy) validateDerivedMarketInterpretationHistorySnapshot(legacy);

    const interpretations = mergeImmutableRecordsById(
      legacy?.interpretations ?? [],
      partitioned,
      semanticKey,
    ).sort(compareInterpretations);
    if (interpretations.length === 0) return null;

    const snapshot: DerivedMarketInterpretationHistorySnapshot = {
      schemaVersion: 'derived-market-interpretation-history-v1',
      interpretations,
      revision: interpretations.length,
      createdAt: interpretations[0].generatedAt,
      updatedAt: interpretations[interpretations.length - 1].generatedAt,
    };
    validateDerivedMarketInterpretationHistorySnapshot(snapshot);
    return snapshot;
  }

  async append(interpretation: DerivedMarketInterpretation): Promise<void> {
    await this.ensureLegacyMigrated();
    await this.commitInterpretation(interpretation);
  }

  async save(snapshot: DerivedMarketInterpretationHistorySnapshot): Promise<void> {
    validateDerivedMarketInterpretationHistorySnapshot(snapshot);
    await this.ensureLegacyMigrated();
    await Promise.all(snapshot.interpretations.map((item) => this.commitInterpretation(item)));
  }
}

export class UpstashDerivedMarketInterpretationHistoryRepository
extends PartitionedDerivedMarketInterpretationHistoryRepository {
  constructor(redis: Redis) {
    super(new UpstashPartitionedMarketPersistenceBackend(redis));
  }
}

export interface DerivedMarketInterpretationHistoryEnvironment {
  readonly UPSTASH_REDIS_REST_URL?: string;
  readonly UPSTASH_REDIS_REST_TOKEN?: string;
}

function processEnvironment(): DerivedMarketInterpretationHistoryEnvironment {
  return {
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  };
}

export function createDerivedMarketInterpretationHistoryRepositoryFromEnv(
  env: DerivedMarketInterpretationHistoryEnvironment = processEnvironment(),
): DerivedMarketInterpretationHistoryRepository {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new DerivedMarketInterpretationHistoryUnavailableError(
      'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required for durable derived market interpretation history.',
    );
  }

  return new UpstashDerivedMarketInterpretationHistoryRepository(new Redis({ url, token }));
}
