import { createHash } from 'node:crypto';
import { Redis } from '@upstash/redis';

export const MARKET_PERSISTENCE_SHARD_COUNT = 16 as const;

export interface PartitionedMarketPersistenceBackend {
  get<T>(key: string): Promise<T | null>;
  members(key: string): Promise<readonly string[]>;
  many<T>(keys: readonly string[]): Promise<readonly (T | null)[]>;
  commitImmutableRecord(input: {
    readonly recordKey: string;
    readonly record: unknown;
    readonly indexKey: string;
    readonly id: string;
  }): Promise<void>;
  set(key: string, value: unknown): Promise<void>;
}

/**
 * Redis implementation for M4B-08 partitioned persistence.
 *
 * Each immutable record is written in one MULTI/EXEC transaction together with
 * membership in exactly one deterministic shard index. Writers targeting
 * disjoint record/index keys can proceed independently; writers that collide on
 * one shard serialize without replacing another writer's record or membership.
 */
export class UpstashPartitionedMarketPersistenceBackend
implements PartitionedMarketPersistenceBackend {
  constructor(private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    return await this.redis.get<T>(key);
  }

  async members(key: string): Promise<readonly string[]> {
    return await this.redis.smembers<string>(key);
  }

  async many<T>(keys: readonly string[]): Promise<readonly (T | null)[]> {
    if (keys.length === 0) return [];
    return await this.redis.mget<T>(...keys);
  }

  async commitImmutableRecord(input: {
    readonly recordKey: string;
    readonly record: unknown;
    readonly indexKey: string;
    readonly id: string;
  }): Promise<void> {
    const transaction = this.redis.multi();
    transaction.setnx(input.recordKey, input.record);
    transaction.sadd(input.indexKey, input.id);
    await transaction.exec();
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.redis.set(key, value);
  }
}

export function marketPersistenceShard(id: string): string {
  const digest = createHash('sha256').update(id, 'utf8').digest();
  const shard = digest[0] % MARKET_PERSISTENCE_SHARD_COUNT;
  return shard.toString(16).padStart(2, '0');
}

export function partitionedMarketRecordKey(namespace: string, kind: string, id: string): string {
  return `${namespace}:${kind}:record:${id}`;
}

export function partitionedMarketIndexKey(namespace: string, kind: string, id: string): string {
  return `${namespace}:${kind}:index:${marketPersistenceShard(id)}`;
}

export function partitionedMarketIndexKeys(namespace: string, kind: string): readonly string[] {
  return Array.from({ length: MARKET_PERSISTENCE_SHARD_COUNT }, (_, shard) => (
    `${namespace}:${kind}:index:${shard.toString(16).padStart(2, '0')}`
  ));
}

export async function readPartitionedMarketCollection<T>(input: {
  readonly backend: PartitionedMarketPersistenceBackend;
  readonly namespace: string;
  readonly kind: string;
}): Promise<readonly T[]> {
  const shardMembers = await Promise.all(
    partitionedMarketIndexKeys(input.namespace, input.kind)
      .map((key) => input.backend.members(key)),
  );
  const ids = [...new Set(shardMembers.flat())].sort();
  if (ids.length === 0) return [];

  const keys = ids.map((id) => partitionedMarketRecordKey(input.namespace, input.kind, id));
  const records = await input.backend.many<T>(keys);
  if (records.some((record) => record === null)) {
    throw new Error(`Partitioned market persistence index ${input.namespace}:${input.kind} references a missing immutable record.`);
  }
  return records as readonly T[];
}

export async function writePartitionedMarketCollection<T>(input: {
  readonly backend: PartitionedMarketPersistenceBackend;
  readonly namespace: string;
  readonly kind: string;
  readonly records: readonly T[];
  readonly idOf: (record: T) => string;
}): Promise<void> {
  await Promise.all(input.records.map(async (record) => {
    const id = input.idOf(record);
    await input.backend.commitImmutableRecord({
      recordKey: partitionedMarketRecordKey(input.namespace, input.kind, id),
      record,
      indexKey: partitionedMarketIndexKey(input.namespace, input.kind, id),
      id,
    });
  }));
}

export function mergeImmutableRecordsById<T>(
  legacy: readonly T[],
  partitioned: readonly T[],
  idOf: (record: T) => string,
): readonly T[] {
  const byId = new Map<string, T>();
  for (const record of legacy) byId.set(idOf(record), record);
  for (const record of partitioned) {
    const id = idOf(record);
    if (!byId.has(id)) byId.set(id, record);
  }
  return [...byId.values()];
}
