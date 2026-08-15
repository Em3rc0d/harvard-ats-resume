import { test } from 'node:test';
import assert from 'node:assert/strict';
import { intakeMarketObservation } from '../../lib/application/market/MarketIntakeService';
import {
  MarketObservationHistoryIntegrityError,
  createObservationOccurrence,
  persistMarketObservationHistory,
  validateMarketObservationHistorySnapshot,
  validateObservationOccurrence,
  type MarketObservationHistoryRepository,
  type MarketObservationHistorySnapshot,
} from '../../lib/application/market/MarketObservationHistory';
import { createMarketObservationHistoryRepositoryFromEnv } from '../../lib/infrastructure/persistence/UpstashMarketObservationHistoryRepository';

class MemoryMarketObservationHistoryRepository implements MarketObservationHistoryRepository {
  snapshot: MarketObservationHistorySnapshot | null = null;
  saves = 0;

  async load(): Promise<MarketObservationHistorySnapshot | null> {
    return this.snapshot;
  }

  async save(snapshot: MarketObservationHistorySnapshot): Promise<void> {
    this.saves += 1;
    this.snapshot = snapshot;
  }
}

function manualObservation(text: string, observedAt: string) {
  return intakeMarketObservation({
    kind: 'MANUAL_TEXT',
    text,
    observedAt,
  }).observation;
}

test('same semantic market state observed later keeps one MarketObservation and appends a new occurrence', async () => {
  const repository = new MemoryMarketObservationHistoryRepository();
  const first = manualObservation('Backend Engineer at Acme', '2026-08-13T01:00:00.000Z');
  const second = manualObservation('Backend Engineer at Acme', '2026-08-14T01:00:00.000Z');

  assert.equal(second.id, first.id);
  assert.notEqual(second.observedAt, first.observedAt);

  const firstWrite = await persistMarketObservationHistory({ observation: first, repository });
  const secondWrite = await persistMarketObservationHistory({ observation: second, repository });

  assert.equal(firstWrite.snapshot.observations.length, 1);
  assert.equal(firstWrite.snapshot.occurrences.length, 1);
  assert.equal(secondWrite.snapshot.observations.length, 1);
  assert.equal(secondWrite.snapshot.occurrences.length, 2);
  assert.equal(secondWrite.observationAdded, false);
  assert.equal(secondWrite.occurrenceAdded, true);
  assert.equal(secondWrite.snapshot.revision, 2);
  assert.deepEqual(
    secondWrite.snapshot.occurrences.map((item) => item.observedAt),
    ['2026-08-13T01:00:00.000Z', '2026-08-14T01:00:00.000Z'],
  );
});

test('replaying the exact same observation occurrence is idempotent and does not manufacture history', async () => {
  const repository = new MemoryMarketObservationHistoryRepository();
  const observation = manualObservation('Backend Engineer at Acme', '2026-08-13T01:00:00.000Z');

  const first = await persistMarketObservationHistory({ observation, repository });
  const replay = await persistMarketObservationHistory({ observation, repository });

  assert.equal(first.snapshot.revision, 1);
  assert.equal(replay.snapshot.revision, 1);
  assert.equal(replay.snapshot.observations.length, 1);
  assert.equal(replay.snapshot.occurrences.length, 1);
  assert.equal(replay.observationAdded, false);
  assert.equal(replay.occurrenceAdded, false);
  assert.equal(repository.saves, 1);
});

test('changed market source content creates a new semantic observation while prior state remains intact', async () => {
  const repository = new MemoryMarketObservationHistoryRepository();
  const first = manualObservation('Backend Engineer — Remote', '2026-08-13T01:00:00.000Z');
  const changed = manualObservation('Backend Engineer — Hybrid', '2026-08-14T01:00:00.000Z');

  assert.notEqual(changed.id, first.id);

  await persistMarketObservationHistory({ observation: first, repository });
  const result = await persistMarketObservationHistory({ observation: changed, repository });

  assert.equal(result.snapshot.observations.length, 2);
  assert.equal(result.snapshot.occurrences.length, 2);
  assert.equal(result.observationAdded, true);
  assert.equal(result.occurrenceAdded, true);
  assert.deepEqual(
    result.snapshot.observations.map((item) => item.payload.content),
    ['Backend Engineer — Remote', 'Backend Engineer — Hybrid'],
  );
});

test('ObservationOccurrence identity is content-addressed from semantic observation id plus observation time', () => {
  const firstObservation = manualObservation('Backend Engineer at Acme', '2026-08-13T01:00:00.000Z');
  const sameStateLater = manualObservation('Backend Engineer at Acme', '2026-08-14T01:00:00.000Z');
  const firstOccurrence = createObservationOccurrence(firstObservation);
  const laterOccurrence = createObservationOccurrence(sameStateLater);

  assert.equal(firstOccurrence.marketObservationId, laterOccurrence.marketObservationId);
  assert.notEqual(firstOccurrence.id, laterOccurrence.id);
  assert.notEqual(firstOccurrence.contentSha256, laterOccurrence.contentSha256);
  assert.equal(firstOccurrence.scopeBoundary, 'OBSERVATION_EVENT_NOT_SEMANTIC_MARKET_STATE');
});

test('tampering with an occurrence breaks content-addressed history validation', () => {
  const observation = manualObservation('Backend Engineer at Acme', '2026-08-13T01:00:00.000Z');
  const occurrence = createObservationOccurrence(observation);
  const tampered = {
    ...occurrence,
    observedAt: '2026-08-15T01:00:00.000Z',
  };

  assert.throws(
    () => validateObservationOccurrence(tampered),
    MarketObservationHistoryIntegrityError,
  );
});

test('corrupted stored history is rejected before a new observation can overwrite it', async () => {
  const repository = new MemoryMarketObservationHistoryRepository();
  const first = manualObservation('Backend Engineer at Acme', '2026-08-13T01:00:00.000Z');
  await persistMarketObservationHistory({ observation: first, repository });

  const corrupted = JSON.parse(JSON.stringify(repository.snapshot)) as MarketObservationHistorySnapshot;
  const mutable = corrupted as unknown as {
    occurrences: Array<{ marketObservationId: string }>;
  };
  mutable.occurrences[0].marketObservationId = 'market-observation:does-not-exist';
  repository.snapshot = corrupted;

  const next = manualObservation('Platform Engineer at Acme', '2026-08-14T01:00:00.000Z');
  await assert.rejects(
    persistMarketObservationHistory({ observation: next, repository }),
    MarketObservationHistoryIntegrityError,
  );
});

test('durability is fail-closed when save cannot be reloaded', async () => {
  const observation = manualObservation('Backend Engineer at Acme', '2026-08-13T01:00:00.000Z');
  const repository: MarketObservationHistoryRepository = {
    async load() {
      return null;
    },
    async save() {
      // Simulate a storage layer that acknowledged the call but lost the write.
    },
  };

  await assert.rejects(
    persistMarketObservationHistory({ observation, repository }),
    /could not be reloaded for verification/,
  );
});

test('market observation history snapshot requires every semantic observation to have a temporal occurrence', () => {
  const observation = manualObservation('Backend Engineer at Acme', '2026-08-13T01:00:00.000Z');
  const snapshot: MarketObservationHistorySnapshot = {
    schemaVersion: 'market-observation-history-v1',
    observations: [observation],
    occurrences: [],
    revision: 1,
    createdAt: observation.observedAt,
    updatedAt: observation.observedAt,
  };

  assert.throws(
    () => validateMarketObservationHistorySnapshot(snapshot),
    /has no durable observation occurrence/,
  );
});

test('durable market history repository configuration fails closed without Upstash credentials', () => {
  assert.throws(
    () => createMarketObservationHistoryRepositoryFromEnv({}),
    /required for durable market observation history/,
  );
});
