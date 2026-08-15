import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MarketObservationId } from '../../lib/domain';
import {
  persistDerivedMarketInterpretation,
  validateDerivedMarketInterpretationHistorySnapshot,
  type DerivedMarketInterpretationHistoryRepository,
  type DerivedMarketInterpretationHistorySnapshot,
} from '../../lib/application/market/DerivedMarketInterpretationHistory';
import {
  deriveMarketInterpretation,
  validateDerivedMarketInterpretation,
} from '../../lib/application/market/DerivedMarketInterpretationService';
import { interpretMarketObservation } from '../../lib/application/market/MarketInterpretationService';
import {
  persistMarketObservationHistory,
  type MarketObservationHistoryRepository,
  type MarketObservationHistorySnapshot,
} from '../../lib/application/market/MarketObservationHistory';
import { createMarketObservation } from '../../lib/application/market/MarketObservationService';
import { createDerivedMarketInterpretationHistoryRepositoryFromEnv } from '../../lib/infrastructure/persistence/UpstashDerivedMarketInterpretationHistoryRepository';

class MemoryObservationHistoryRepository implements MarketObservationHistoryRepository {
  state: MarketObservationHistorySnapshot | null = null;

  async load(): Promise<MarketObservationHistorySnapshot | null> {
    return this.state;
  }

  async save(snapshot: MarketObservationHistorySnapshot): Promise<void> {
    this.state = snapshot;
  }
}

class MemoryInterpretationHistoryRepository implements DerivedMarketInterpretationHistoryRepository {
  state: DerivedMarketInterpretationHistorySnapshot | null = null;

  async load(): Promise<DerivedMarketInterpretationHistorySnapshot | null> {
    return this.state;
  }

  async save(snapshot: DerivedMarketInterpretationHistorySnapshot): Promise<void> {
    this.state = snapshot;
  }
}

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

function providerObservation(overrides: {
  title?: string;
  workModel?: string;
  employmentType?: string;
  seniority?: string;
  postedAt?: string;
  description?: string;
  observedAt?: string;
} = {}) {
  const title = overrides.title ?? '  Senior   Platform Engineer  ';
  const description = overrides.description ?? 'Own platform reliability.';
  const payload = {
    title,
    workModel: overrides.workModel,
    employmentType: overrides.employmentType,
    seniority: overrides.seniority,
    postedAt: overrides.postedAt,
    description,
  };

  return createMarketObservation({
    source: { type: 'PROVIDER_API', provider: 'TEST_PROVIDER', label: 'Interpretation fixture' },
    payload: { format: 'JSON', content: JSON.stringify(payload) },
    explicitFields: {
      roleTitle: { value: title, evidence: { origin: 'SOURCE_EXPLICIT', sourcePath: '$.title' } },
      workModel: overrides.workModel
        ? { value: overrides.workModel, evidence: { origin: 'SOURCE_EXPLICIT', sourcePath: '$.workModel' } }
        : undefined,
      employmentType: overrides.employmentType
        ? { value: overrides.employmentType, evidence: { origin: 'SOURCE_EXPLICIT', sourcePath: '$.employmentType' } }
        : undefined,
      seniority: overrides.seniority
        ? { value: overrides.seniority, evidence: { origin: 'SOURCE_EXPLICIT', sourcePath: '$.seniority' } }
        : undefined,
      postedAt: overrides.postedAt
        ? { value: overrides.postedAt, evidence: { origin: 'SOURCE_EXPLICIT', sourcePath: '$.postedAt' } }
        : undefined,
      description: { value: description, evidence: { origin: 'SOURCE_EXPLICIT', sourcePath: '$.description' } },
    },
    provenance: {
      captureMethod: 'PROVIDER_ADAPTER',
      sourceUrl: 'https://provider.example/jobs/1',
      externalId: 'job-1',
      adapter: { adapterId: 'test-provider', adapterVersion: '1.0.0' },
    },
    observedAt: overrides.observedAt ?? '2026-08-15T15:00:00.000Z',
  });
}

test('M4B-04 normalizes only source-explicit fields and keeps exact evidence links', () => {
  const observation = providerObservation({
    workModel: 'Híbrido',
    employmentType: 'Full-time',
    seniority: 'Senior',
    postedAt: '2026-08-15T10:30:00-05:00',
  });

  const interpretation = deriveMarketInterpretation(observation, {
    generatedAt: '2026-08-15T16:00:00.000Z',
  });

  assert.equal(interpretation.fields.roleTitle.status, 'KNOWN');
  if (interpretation.fields.roleTitle.status === 'KNOWN') {
    assert.equal(interpretation.fields.roleTitle.value, 'Senior Platform Engineer');
    assert.equal(interpretation.fields.roleTitle.evidence.sourceField, 'roleTitle');
    assert.equal(interpretation.fields.roleTitle.evidence.sourceValue, '  Senior   Platform Engineer  ');
  }

  assert.deepEqual(interpretation.fields.workModel, {
    status: 'KNOWN',
    value: 'HYBRID',
    derivation: 'CONTROLLED_CLASSIFICATION',
    evidence: {
      marketObservationId: observation.id,
      sourceField: 'workModel',
      sourceValue: 'Híbrido',
      sourcePath: '$.workModel',
      sourceExcerpt: undefined,
    },
  });
  assert.equal(interpretation.fields.employmentType.status === 'KNOWN' && interpretation.fields.employmentType.value, 'FULL_TIME');
  assert.equal(interpretation.fields.seniority.status === 'KNOWN' && interpretation.fields.seniority.value, 'SENIOR');
  assert.equal(interpretation.fields.postedAt.status === 'KNOWN' && interpretation.fields.postedAt.value, '2026-08-15T15:30:00.000Z');
  validateDerivedMarketInterpretation(interpretation, observation);
});

test('source silence remains UNKNOWN even when title or description contains tempting signals', () => {
  const observation = providerObservation({
    title: 'Senior Remote Engineer',
    description: 'This is a full-time remote senior role. Must know TypeScript.',
  });
  const interpretation = deriveMarketInterpretation(observation);

  assert.deepEqual(interpretation.fields.workModel, { status: 'UNKNOWN', reason: 'SOURCE_SILENT' });
  assert.deepEqual(interpretation.fields.employmentType, { status: 'UNKNOWN', reason: 'SOURCE_SILENT' });
  assert.deepEqual(interpretation.fields.seniority, { status: 'UNKNOWN', reason: 'SOURCE_SILENT' });
  assert.equal(interpretation.fields.roleTitle.status, 'KNOWN');
  assert.equal(interpretation.fields.description.status, 'KNOWN');
});

test('unrecognized and invalid source values remain UNKNOWN with evidence instead of being guessed', () => {
  const observation = providerObservation({
    workModel: 'Flexible anywhere-ish',
    employmentType: 'Permanent-ish',
    seniority: 'Staff',
    postedAt: 'sometime next week',
  });
  const interpretation = deriveMarketInterpretation(observation);

  assert.equal(interpretation.fields.workModel.status, 'UNKNOWN');
  assert.equal(interpretation.fields.workModel.status === 'UNKNOWN' && interpretation.fields.workModel.reason, 'UNRECOGNIZED_SOURCE_VALUE');
  assert.equal(interpretation.fields.workModel.status === 'UNKNOWN' && interpretation.fields.workModel.evidence?.sourceValue, 'Flexible anywhere-ish');
  assert.equal(interpretation.fields.employmentType.status === 'UNKNOWN' && interpretation.fields.employmentType.reason, 'UNRECOGNIZED_SOURCE_VALUE');
  assert.equal(interpretation.fields.seniority.status === 'UNKNOWN' && interpretation.fields.seniority.reason, 'UNRECOGNIZED_SOURCE_VALUE');
  assert.equal(interpretation.fields.postedAt.status === 'UNKNOWN' && interpretation.fields.postedAt.reason, 'INVALID_SOURCE_VALUE');
});

test('same MarketObservation + policy keeps the same semantic interpretation identity across generation times', () => {
  const observation = providerObservation({ workModel: 'remote' });
  const first = deriveMarketInterpretation(observation, { generatedAt: '2026-08-15T16:00:00.000Z' });
  const second = deriveMarketInterpretation(observation, { generatedAt: '2026-08-15T17:00:00.000Z' });

  assert.equal(first.id, second.id);
  assert.equal(first.contentSha256, second.contentSha256);
  assert.notEqual(first.generatedAt, second.generatedAt);
});

test('changed source semantic state produces a different derived interpretation identity', () => {
  const firstObservation = providerObservation({ workModel: 'remote' });
  const changedObservation = providerObservation({ workModel: 'hybrid' });

  const first = deriveMarketInterpretation(firstObservation);
  const changed = deriveMarketInterpretation(changedObservation);

  assert.notEqual(firstObservation.id, changedObservation.id);
  assert.notEqual(first.id, changed.id);
});

test('tampered derived values fail full validation against the authoritative observation', () => {
  const observation = providerObservation({ workModel: 'remote' });
  const interpretation = deriveMarketInterpretation(observation);
  const tampered = {
    ...interpretation,
    fields: {
      ...interpretation.fields,
      workModel: {
        status: 'KNOWN' as const,
        value: 'ONSITE' as const,
        derivation: 'CONTROLLED_CLASSIFICATION' as const,
        evidence: interpretation.fields.workModel.status === 'KNOWN'
          ? interpretation.fields.workModel.evidence
          : undefined!,
      },
    },
  };

  assert.throws(
    () => validateDerivedMarketInterpretation(tampered, observation),
    /content hash mismatch|derived fields do not match deterministic policy output/,
  );
});

test('durable interpretation history is idempotent for the same observation + policy', async () => {
  const repository = new MemoryInterpretationHistoryRepository();
  const observation = providerObservation({ workModel: 'remote' });
  const firstInterpretation = deriveMarketInterpretation(observation, { generatedAt: '2026-08-15T16:00:00.000Z' });
  const repeatedInterpretation = deriveMarketInterpretation(observation, { generatedAt: '2026-08-15T17:00:00.000Z' });

  const first = await persistDerivedMarketInterpretation({ observation, interpretation: firstInterpretation, repository });
  const repeated = await persistDerivedMarketInterpretation({ observation, interpretation: repeatedInterpretation, repository });

  assert.equal(first.interpretationAdded, true);
  assert.equal(repeated.interpretationAdded, false);
  assert.equal(repeated.snapshot.revision, 1);
  assert.equal(repeated.snapshot.interpretations.length, 1);
  assert.equal(repeated.interpretation.generatedAt, '2026-08-15T16:00:00.000Z');
});

test('interpretation history rejects duplicate observation + policy semantic slots', () => {
  const observation = providerObservation({ workModel: 'remote' });
  const interpretation = deriveMarketInterpretation(observation);
  const corrupted: DerivedMarketInterpretationHistorySnapshot = {
    schemaVersion: 'derived-market-interpretation-history-v1',
    interpretations: [interpretation, interpretation],
    revision: 1,
    createdAt: interpretation.generatedAt,
    updatedAt: interpretation.generatedAt,
  };

  assert.throws(
    () => validateDerivedMarketInterpretationHistorySnapshot(corrupted),
    /duplicate identifiers|only one deterministic interpretation/,
  );
});

test('runtime interpretation resolves only an already-durable observation and persists the derived artifact', async () => {
  const observationRepository = new MemoryObservationHistoryRepository();
  const interpretationRepository = new MemoryInterpretationHistoryRepository();
  const observation = providerObservation({ workModel: 'remote', employmentType: 'full time' });
  await persistMarketObservationHistory({ observation, repository: observationRepository });

  const result = await interpretMarketObservation(observation.id, {
    observationRepository,
    interpretationRepository,
    generatedAt: '2026-08-15T18:00:00.000Z',
  });

  assert.equal(result.interpretation.marketObservationId, observation.id);
  assert.equal(result.interpretationHistory.interpretationAdded, true);
  assert.equal(result.persistence, 'DURABLE_DERIVED_MARKET_INTERPRETATION_M4B_04');
  assert.equal(result.scopeBoundary, 'INTERPRETATION_ONLY_NO_JOB_INTELLIGENCE_MATCH_OR_RECOMMENDATION');
});

test('runtime interpretation fails when the requested durable observation does not exist', async () => {
  const observationRepository = new MemoryObservationHistoryRepository();
  const interpretationRepository = new MemoryInterpretationHistoryRepository();

  await assert.rejects(
    interpretMarketObservation(
      'market-observation:00000000000000000000000000000000' as MarketObservationId,
      { observationRepository, interpretationRepository },
    ),
    /was not found for interpretation/,
  );
});

test('missing Upstash configuration fails closed for durable interpretation history', () => {
  assert.throws(
    () => createDerivedMarketInterpretationHistoryRepositoryFromEnv({}),
    /required for durable derived market interpretation history/,
  );
});

test('M4B-04 service and route do not invoke Job Intelligence, matching, opportunity decisions, or resume generation', () => {
  const service = source('lib/application/market/MarketInterpretationService.ts');
  const interpreter = source('lib/application/market/DerivedMarketInterpretationService.ts');
  const route = source('app/api/market-interpretation/route.ts');
  const combined = `${service}\n${interpreter}\n${route}`;

  assert.doesNotMatch(combined, /JobIntelligenceEngine|analyzeJobDescription|createJobRequirement|matchJobToCandidate/);
  assert.doesNotMatch(combined, /OpportunityAssessment|OpportunitySpace|ResumeVersion|generateResume/);
});

test('public interpretation route accepts only MarketObservation identity and keeps derivation server-owned', () => {
  const route = source('app/api/market-interpretation/route.ts');
  const sizeAt = route.indexOf("request.headers.get('content-length')");
  const rateAt = route.indexOf("rateLimitPublicApiRequest(request.headers, 'market-interpretation')");
  const jsonAt = route.indexOf('await request.json()');
  const interpretAt = route.indexOf('await interpretMarketObservation');

  assert.ok(sizeAt >= 0 && rateAt >= 0 && jsonAt >= 0 && interpretAt >= 0);
  assert.ok(sizeAt < rateAt && rateAt < jsonAt && jsonAt < interpretAt);
  assert.match(route, /marketObservationId:/);
  assert.doesNotMatch(route, /workModel:\s*z\.|seniority:\s*z\.|policyVersion:\s*z\.|generatedAt:\s*z\./);
});
