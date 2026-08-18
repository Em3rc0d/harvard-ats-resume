import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createObservationOccurrence,
  persistMarketObservationHistory,
  type MarketObservationHistorySnapshot,
} from '../../lib/application/market/MarketObservationHistory';
import {
  deriveMarketInterpretation,
} from '../../lib/application/market/DerivedMarketInterpretationService';
import { persistDerivedMarketInterpretation } from '../../lib/application/market/DerivedMarketInterpretationHistory';
import { projectMarketToJobIntelligence } from '../../lib/application/market/MarketJobProjectionService';
import { persistMarketJobProjection } from '../../lib/application/market/MarketJobProjectionHistory';
import {
  createMarketOpportunityLink,
  validateMarketOpportunityLinkIntegrity,
} from '../../lib/application/market/MarketOpportunityIdentityLifecycleService';
import { persistMarketOpportunityLink } from '../../lib/application/market/MarketOpportunityIndexHistory';
import { intakeMarketObservation } from '../../lib/application/market/MarketIntakeService';
import {
  domainId,
  type MarketOpportunityLink,
} from '../../lib/domain';
import {
  type ImmutablePartitionRecordWrite,
  type PartitionedMarketPersistenceBackend,
} from '../../lib/infrastructure/persistence/PartitionedMarketPersistence';
import { PartitionedMarketObservationHistoryRepository } from '../../lib/infrastructure/persistence/UpstashMarketObservationHistoryRepository';
import { PartitionedDerivedMarketInterpretationHistoryRepository } from '../../lib/infrastructure/persistence/UpstashDerivedMarketInterpretationHistoryRepository';
import { PartitionedMarketJobProjectionHistoryRepository } from '../../lib/infrastructure/persistence/UpstashMarketJobProjectionHistoryRepository';
import { PartitionedMarketOpportunityIndexRepository } from '../../lib/infrastructure/persistence/UpstashMarketOpportunityIndexRepository';

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

class MemoryPartitionedBackend implements PartitionedMarketPersistenceBackend {
  private readonly values = new Map<string, unknown>();
  private readonly sets = new Map<string, Set<string>>();
  readonly commitSizes: number[] = [];

  async get<T>(key: string): Promise<T | null> {
    return (this.values.has(key) ? this.values.get(key) : null) as T | null;
  }

  async members(key: string): Promise<readonly string[]> {
    return [...(this.sets.get(key) ?? new Set<string>())];
  }

  async many<T>(keys: readonly string[]): Promise<readonly (T | null)[]> {
    return keys.map((key) => (this.values.has(key) ? this.values.get(key) as T : null));
  }

  async commitImmutableRecords(records: readonly ImmutablePartitionRecordWrite[]): Promise<void> {
    await new Promise<void>((resolve) => setImmediate(resolve));
    this.commitSizes.push(records.length);

    for (const record of records) {
      const prior = this.values.get(record.recordKey);
      if (prior !== undefined && stableJson(prior) !== stableJson(record.record)) {
        throw new Error(`Immutable partition key ${record.recordKey} already contains different content.`);
      }
    }

    // No await inside this block: the fake models one atomic MULTI/EXEC visibility boundary.
    for (const record of records) {
      if (!this.values.has(record.recordKey)) this.values.set(record.recordKey, record.record);
      const members = this.sets.get(record.indexKey) ?? new Set<string>();
      members.add(record.id);
      this.sets.set(record.indexKey, members);
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
  }
}

function observation(text: string, observedAt: string) {
  return intakeMarketObservation({
    kind: 'MANUAL_TEXT',
    text,
    observedAt,
  }).observation;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function conflictingOpportunityLink(link: MarketOpportunityLink): MarketOpportunityLink {
  const marketOpportunityId = domainId(
    'MarketOpportunity',
    'market-opportunity:ffffffffffffffffffffffffffffffff',
  );
  const semantic = {
    schemaVersion: link.schemaVersion,
    marketOpportunityId,
    marketObservationId: link.marketObservationId,
    observationContentSha256: link.observationContentSha256,
    identityPolicyVersion: link.identityPolicyVersion,
    identityBasis: link.identityBasis,
    identityEvidence: link.identityEvidence,
    scopeBoundary: link.scopeBoundary,
  };
  const contentSha256 = sha256(stableJson(semantic));
  const conflict: MarketOpportunityLink = {
    ...semantic,
    id: domainId('MarketOpportunityLink', `market-opportunity-link:${contentSha256.slice(0, 32)}`),
    contentSha256,
    linkedAt: link.linkedAt,
  };
  validateMarketOpportunityLinkIntegrity(conflict);
  return conflict;
}

test('parallel market writers preserve every observation, interpretation, projection, and opportunity link', async () => {
  const backend = new MemoryPartitionedBackend();
  const observationRepository = new PartitionedMarketObservationHistoryRepository(backend);
  const interpretationRepository = new PartitionedDerivedMarketInterpretationHistoryRepository(backend);
  const projectionRepository = new PartitionedMarketJobProjectionHistoryRepository(backend);
  const opportunityRepository = new PartitionedMarketOpportunityIndexRepository(backend);

  const first = observation(
    'Backend Engineer. Required: Node.js and PostgreSQL.',
    '2026-08-17T01:00:00.000Z',
  );
  const second = observation(
    'Platform Engineer. Required: Kubernetes and Terraform.',
    '2026-08-17T01:00:01.000Z',
  );

  await Promise.all([
    persistMarketObservationHistory({ observation: first, repository: observationRepository }),
    persistMarketObservationHistory({ observation: second, repository: observationRepository }),
  ]);
  const observationHistory = await observationRepository.load();
  assert.equal(observationHistory?.observations.length, 2);
  assert.equal(observationHistory?.occurrences.length, 2);
  assert.equal(observationHistory?.revision, 2);
  assert.ok(backend.commitSizes.filter((size) => size === 2).length >= 2, 'observation + occurrence must share one atomic commit');

  const firstInterpretation = deriveMarketInterpretation(first, { generatedAt: '2026-08-17T01:01:00.000Z' });
  const secondInterpretation = deriveMarketInterpretation(second, { generatedAt: '2026-08-17T01:01:01.000Z' });
  await Promise.all([
    persistDerivedMarketInterpretation({ observation: first, interpretation: firstInterpretation, repository: interpretationRepository }),
    persistDerivedMarketInterpretation({ observation: second, interpretation: secondInterpretation, repository: interpretationRepository }),
  ]);
  assert.equal((await interpretationRepository.load())?.revision, 2);

  const firstProjection = projectMarketToJobIntelligence(first, firstInterpretation, { projectedAt: '2026-08-17T01:02:00.000Z' });
  const secondProjection = projectMarketToJobIntelligence(second, secondInterpretation, { projectedAt: '2026-08-17T01:02:01.000Z' });
  await Promise.all([
    persistMarketJobProjection({
      projection: firstProjection.projection,
      jobSnapshot: firstProjection.jobSnapshot,
      repository: projectionRepository,
    }),
    persistMarketJobProjection({
      projection: secondProjection.projection,
      jobSnapshot: secondProjection.jobSnapshot,
      repository: projectionRepository,
    }),
  ]);
  assert.equal((await projectionRepository.load())?.revision, 2);

  await Promise.all([
    persistMarketOpportunityLink({ link: createMarketOpportunityLink(first), repository: opportunityRepository }),
    persistMarketOpportunityLink({ link: createMarketOpportunityLink(second), repository: opportunityRepository }),
  ]);
  assert.equal((await opportunityRepository.load())?.revision, 2);
});

test('legacy observation history is lazily migrated and remains dual-read during rolling cutover', async () => {
  const backend = new MemoryPartitionedBackend();
  const repository = new PartitionedMarketObservationHistoryRepository(backend);

  const legacyObservation = observation('Legacy Backend Engineer', '2026-08-16T01:00:00.000Z');
  const legacyOccurrence = createObservationOccurrence(legacyObservation);
  const legacySnapshot: MarketObservationHistorySnapshot = {
    schemaVersion: 'market-observation-history-v1',
    observations: [legacyObservation],
    occurrences: [legacyOccurrence],
    revision: 1,
    createdAt: legacyObservation.observedAt,
    updatedAt: legacyObservation.observedAt,
  };
  await backend.set('ats2:market-observation-history:v1', legacySnapshot);

  const currentObservation = observation('Current Platform Engineer', '2026-08-17T01:00:00.000Z');
  await persistMarketObservationHistory({ observation: currentObservation, repository });
  assert.equal((await repository.load())?.revision, 2);

  // Simulate one old deployment instance writing the legacy v1 key after the v2 migration marker exists.
  const lateLegacyObservation = observation('Late legacy Security Engineer', '2026-08-17T01:00:02.000Z');
  const lateLegacyOccurrence = createObservationOccurrence(lateLegacyObservation);
  await backend.set('ats2:market-observation-history:v1', {
    ...legacySnapshot,
    observations: [legacyObservation, lateLegacyObservation],
    occurrences: [legacyOccurrence, lateLegacyOccurrence],
    revision: 2,
    updatedAt: lateLegacyObservation.observedAt,
  } satisfies MarketObservationHistorySnapshot);

  const merged = await repository.load();
  assert.equal(merged?.observations.length, 3);
  assert.equal(merged?.occurrences.length, 3);
  assert.equal(merged?.revision, 3);
  assert.ok(merged?.observations.some((item) => item.id === lateLegacyObservation.id));
});

test('semantic opportunity-link key rejects a competing logical meaning for the same MarketObservation', async () => {
  const backend = new MemoryPartitionedBackend();
  const repository = new PartitionedMarketOpportunityIndexRepository(backend);
  const source = observation('Backend Engineer at Acme', '2026-08-17T01:00:00.000Z');
  const canonical = createMarketOpportunityLink(source);
  const conflict = conflictingOpportunityLink(canonical);

  await repository.append(canonical);
  await assert.rejects(
    repository.append(conflict),
    /already contains different content/,
  );

  const snapshot = await repository.load();
  assert.equal(snapshot?.links.length, 1);
  assert.equal(snapshot?.links[0].id, canonical.id);
});

test('Upstash partition backend uses MULTI/EXEC with SETNX, SADD, and read verification instead of global snapshot overwrite', () => {
  const source = readFileSync(
    path.join(process.cwd(), 'lib/infrastructure/persistence/PartitionedMarketPersistence.ts'),
    'utf8',
  );
  assert.match(source, /this\.redis\.multi\(\)/);
  assert.match(source, /transaction\.setnx\(/);
  assert.match(source, /transaction\.sadd\(/);
  assert.match(source, /this\.redis\.mget<unknown\[\]>/);

  for (const file of [
    'UpstashMarketObservationHistoryRepository.ts',
    'UpstashDerivedMarketInterpretationHistoryRepository.ts',
    'UpstashMarketJobProjectionHistoryRepository.ts',
    'UpstashMarketOpportunityIndexRepository.ts',
  ]) {
    const repositorySource = readFileSync(
      path.join(process.cwd(), 'lib/infrastructure/persistence', file),
      'utf8',
    );
    assert.match(repositorySource, /:v2/);
    assert.match(repositorySource, /commitImmutableRecords/);
    assert.doesNotMatch(repositorySource, /private readonly redis: Redis/);
  }
});
