import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MarketObservationId } from '../../lib/domain';
import {
  persistDerivedMarketInterpretation,
  type DerivedMarketInterpretationHistoryRepository,
  type DerivedMarketInterpretationHistorySnapshot,
} from '../../lib/application/market/DerivedMarketInterpretationHistory';
import { deriveMarketInterpretation } from '../../lib/application/market/DerivedMarketInterpretationService';
import {
  persistMarketJobProjection,
  type MarketJobProjectionHistoryRepository,
  type MarketJobProjectionHistorySnapshot,
} from '../../lib/application/market/MarketJobProjectionHistory';
import {
  MarketJobProjectionSourceNotFoundError,
  projectDurableMarketObservationToJobIntelligence,
} from '../../lib/application/market/MarketJobProjectionRuntime';
import {
  MarketJobProjectionUnavailableError,
  projectMarketToJobIntelligence,
  validateMarketJobProjection,
} from '../../lib/application/market/MarketJobProjectionService';
import {
  persistMarketObservationHistory,
  type MarketObservationHistoryRepository,
  type MarketObservationHistorySnapshot,
} from '../../lib/application/market/MarketObservationHistory';
import { createMarketObservation } from '../../lib/application/market/MarketObservationService';
import { createMarketJobProjectionHistoryRepositoryFromEnv } from '../../lib/infrastructure/persistence/UpstashMarketJobProjectionHistoryRepository';

class MemoryObservationHistoryRepository implements MarketObservationHistoryRepository {
  state: MarketObservationHistorySnapshot | null = null;
  async load() { return this.state; }
  async save(snapshot: MarketObservationHistorySnapshot) { this.state = snapshot; }
}

class MemoryInterpretationHistoryRepository implements DerivedMarketInterpretationHistoryRepository {
  state: DerivedMarketInterpretationHistorySnapshot | null = null;
  async load() { return this.state; }
  async save(snapshot: DerivedMarketInterpretationHistorySnapshot) { this.state = snapshot; }
}

class MemoryProjectionHistoryRepository implements MarketJobProjectionHistoryRepository {
  state: MarketJobProjectionHistorySnapshot | null = null;
  async load() { return this.state; }
  async save(snapshot: MarketJobProjectionHistorySnapshot) { this.state = snapshot; }
}

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

function textObservation(text = 'Requirements:\n- 3 years TypeScript\n- AWS preferred') {
  return createMarketObservation({
    source: { type: 'MANUAL_STRUCTURED', label: 'Manual job text' },
    payload: { format: 'TEXT', content: text },
    provenance: { captureMethod: 'USER_SUPPLIED_TEXT' },
    observedAt: '2026-08-15T19:00:00.000Z',
  });
}

function structuredObservation(options: { description?: string; includeDescription?: boolean } = {}) {
  const description = options.description ?? 'Build reliable internal tooling with TypeScript.';
  const includeDescription = options.includeDescription ?? true;
  const payload = {
    title: 'Senior Remote Platform Engineer',
    company: 'Example Corp',
    workModel: 'remote',
    seniority: 'senior',
    description: includeDescription ? description : undefined,
  };
  return createMarketObservation({
    source: { type: 'PROVIDER_API', provider: 'TEST_PROVIDER', label: 'Projection fixture' },
    payload: { format: 'JSON', content: JSON.stringify(payload) },
    explicitFields: {
      roleTitle: {
        value: payload.title,
        evidence: { origin: 'SOURCE_EXPLICIT', sourcePath: '$.title' },
      },
      companyName: {
        value: payload.company,
        evidence: { origin: 'SOURCE_EXPLICIT', sourcePath: '$.company' },
      },
      workModel: {
        value: payload.workModel,
        evidence: { origin: 'SOURCE_EXPLICIT', sourcePath: '$.workModel' },
      },
      seniority: {
        value: payload.seniority,
        evidence: { origin: 'SOURCE_EXPLICIT', sourcePath: '$.seniority' },
      },
      description: includeDescription
        ? {
            value: description,
            evidence: { origin: 'SOURCE_EXPLICIT', sourcePath: '$.description' },
          }
        : undefined,
    },
    provenance: {
      captureMethod: 'PROVIDER_ADAPTER',
      sourceUrl: 'https://provider.example/jobs/1',
      externalId: 'job-1',
      adapter: { adapterId: 'fixture', adapterVersion: '1.0.0' },
    },
    observedAt: '2026-08-15T19:00:00.000Z',
  });
}

test('M4B-05 projects an exact TEXT payload into Job Intelligence', () => {
  const observation = textObservation();
  const interpretation = deriveMarketInterpretation(observation, { generatedAt: '2026-08-15T19:01:00.000Z' });
  const result = projectMarketToJobIntelligence(observation, interpretation, {
    projectedAt: '2026-08-15T19:02:00.000Z',
  });

  assert.equal(result.projection.sourceTextOrigin, 'RAW_TEXT_PAYLOAD');
  assert.equal(result.projection.sourceText, observation.payload.content);
  assert.equal(result.jobSnapshot.jobDescription.sourceText, observation.payload.content);
  assert.ok(result.jobSnapshot.requirements.some((item) => item.canonicalConcept === 'TypeScript'));
  assert.ok(result.jobSnapshot.requirements.some((item) => item.canonicalConcept === 'AWS'));
  assert.equal(result.jobSnapshot.marketProvenance?.marketObservationId, observation.id);
  assert.equal(result.jobSnapshot.marketProvenance?.derivedMarketInterpretationId, interpretation.id);
  assert.equal(result.jobSnapshot.marketProvenance?.marketJobProjectionId, result.projection.id);
});

test('structured metadata is not concatenated into Job Intelligence requirement text', () => {
  const observation = structuredObservation({ description: 'Build reliable internal tooling with TypeScript.' });
  const interpretation = deriveMarketInterpretation(observation);
  const result = projectMarketToJobIntelligence(observation, interpretation);

  assert.equal(result.projection.sourceTextOrigin, 'EXPLICIT_DESCRIPTION_FIELD');
  assert.equal(result.projection.sourceText, 'Build reliable internal tooling with TypeScript.');
  assert.equal(result.jobSnapshot.jobDescription.title, 'Senior Remote Platform Engineer');
  assert.equal(result.jobSnapshot.jobDescription.company, 'Example Corp');
  assert.doesNotMatch(result.jobSnapshot.jobDescription.sourceText, /Senior Remote Platform Engineer|Example Corp|remote|senior/i);
  assert.ok(result.jobSnapshot.requirements.every((item) => !/Senior Remote Platform Engineer|Example Corp/i.test(item.statement)));
});

test('JSON market state without a source-explicit description cannot cross into Job Intelligence', () => {
  const observation = structuredObservation({ includeDescription: false });
  const interpretation = deriveMarketInterpretation(observation);

  assert.throws(
    () => projectMarketToJobIntelligence(observation, interpretation),
    MarketJobProjectionUnavailableError,
  );
});

test('same observation + interpretation keeps projection and JobSnapshot semantic identity across runtime times', () => {
  const observation = structuredObservation();
  const interpretation = deriveMarketInterpretation(observation);
  const first = projectMarketToJobIntelligence(observation, interpretation, {
    projectedAt: '2026-08-15T19:02:00.000Z',
  });
  const repeated = projectMarketToJobIntelligence(observation, interpretation, {
    projectedAt: '2026-08-15T20:02:00.000Z',
  });

  assert.equal(first.projection.id, repeated.projection.id);
  assert.equal(first.projection.contentSha256, repeated.projection.contentSha256);
  assert.equal(first.jobSnapshot.id, repeated.jobSnapshot.id);
  assert.equal(first.jobSnapshot.contentSha256, repeated.jobSnapshot.contentSha256);
  assert.notEqual(first.projection.projectedAt, repeated.projection.projectedAt);
});

test('full projection validation rejects source text not authorized by observation + interpretation', () => {
  const observation = structuredObservation();
  const interpretation = deriveMarketInterpretation(observation);
  const result = projectMarketToJobIntelligence(observation, interpretation);
  const tampered = {
    ...result.projection,
    sourceText: `${result.projection.sourceText}\nMust have Kubernetes`,
  };

  assert.throws(
    () => validateMarketJobProjection(tampered, observation, interpretation),
    /sourceTextSha256 does not match sourceText|deterministic authorization policy/,
  );
});

test('durable projection history is idempotent for the same semantic projection', async () => {
  const repository = new MemoryProjectionHistoryRepository();
  const observation = structuredObservation();
  const interpretation = deriveMarketInterpretation(observation);
  const first = projectMarketToJobIntelligence(observation, interpretation, {
    projectedAt: '2026-08-15T19:02:00.000Z',
  });
  const repeated = projectMarketToJobIntelligence(observation, interpretation, {
    projectedAt: '2026-08-15T20:02:00.000Z',
  });

  const persisted = await persistMarketJobProjection({
    projection: first.projection,
    jobSnapshot: first.jobSnapshot,
    repository,
  });
  const replay = await persistMarketJobProjection({
    projection: repeated.projection,
    jobSnapshot: repeated.jobSnapshot,
    repository,
  });

  assert.equal(persisted.recordAdded, true);
  assert.equal(replay.recordAdded, false);
  assert.equal(replay.snapshot.revision, 1);
  assert.equal(replay.snapshot.records.length, 1);
});

test('runtime requires the durable M4B-04 interpretation instead of deriving it silently', async () => {
  const observationRepository = new MemoryObservationHistoryRepository();
  const interpretationRepository = new MemoryInterpretationHistoryRepository();
  const projectionRepository = new MemoryProjectionHistoryRepository();
  const observation = textObservation();
  await persistMarketObservationHistory({ observation, repository: observationRepository });

  await assert.rejects(
    projectDurableMarketObservationToJobIntelligence(observation.id, {
      observationRepository,
      interpretationRepository,
      projectionRepository,
    }),
    (error: unknown) => error instanceof MarketJobProjectionSourceNotFoundError
      && error.kind === 'DERIVED_MARKET_INTERPRETATION',
  );
});

test('runtime resolves durable observation + interpretation and reload-verifies projection history', async () => {
  const observationRepository = new MemoryObservationHistoryRepository();
  const interpretationRepository = new MemoryInterpretationHistoryRepository();
  const projectionRepository = new MemoryProjectionHistoryRepository();
  const observation = structuredObservation();
  const interpretation = deriveMarketInterpretation(observation, { generatedAt: '2026-08-15T19:01:00.000Z' });
  await persistMarketObservationHistory({ observation, repository: observationRepository });
  await persistDerivedMarketInterpretation({ observation, interpretation, repository: interpretationRepository });

  const result = await projectDurableMarketObservationToJobIntelligence(observation.id, {
    observationRepository,
    interpretationRepository,
    projectionRepository,
    projectedAt: '2026-08-15T19:02:00.000Z',
  });

  assert.equal(result.persistence, 'DURABLE_MARKET_JOB_PROJECTION_M4B_05');
  assert.equal(result.projectionHistory.recordAdded, true);
  assert.equal(result.projectionHistory.snapshot.revision, 1);
  assert.equal(result.jobSnapshot.marketProvenance?.marketObservationId, observation.id);
  assert.equal(result.scopeBoundary, 'DURABLE_JOB_INTELLIGENCE_PROJECTION_NOT_CANDIDATE_TRUTH_OR_MATCH');
});

test('runtime rejects unknown durable observation ids', async () => {
  const observationRepository = new MemoryObservationHistoryRepository();
  const interpretationRepository = new MemoryInterpretationHistoryRepository();
  const projectionRepository = new MemoryProjectionHistoryRepository();

  await assert.rejects(
    projectDurableMarketObservationToJobIntelligence(
      'market-observation:00000000000000000000000000000000' as MarketObservationId,
      { observationRepository, interpretationRepository, projectionRepository },
    ),
    (error: unknown) => error instanceof MarketJobProjectionSourceNotFoundError
      && error.kind === 'MARKET_OBSERVATION',
  );
});

test('missing Upstash configuration fails closed for durable projection history', () => {
  assert.throws(
    () => createMarketJobProjectionHistoryRepositoryFromEnv({}),
    /required for durable market job projection history/,
  );
});

test('M4B-05 bridge has no candidate, matching, opportunity, or resume execution dependency', () => {
  const projectionService = source('lib/application/market/MarketJobProjectionService.ts');
  const runtime = source('lib/application/market/MarketJobProjectionRuntime.ts');
  const route = source('app/api/market-job-projection/route.ts');
  const combined = `${projectionService}\n${runtime}\n${route}`;

  assert.doesNotMatch(combined, /CareerEvidence|CareerAssertion|CandidateProfile/);
  assert.doesNotMatch(combined, /JobMatchEngine|matchJobToCandidate|OpportunityAssessment|OpportunitySpace/);
  assert.doesNotMatch(combined, /ResumeVersion|generateResume/);
});

test('public bridge route accepts only MarketObservation identity and keeps parser inputs server-owned', () => {
  const route = source('app/api/market-job-projection/route.ts');
  const sizeAt = route.indexOf("request.headers.get('content-length')");
  const rateAt = route.indexOf("rateLimitPublicApiRequest(request.headers, 'market-job-projection')");
  const jsonAt = route.indexOf('await request.json()');
  const projectAt = route.indexOf('await projectDurableMarketObservationToJobIntelligence');

  assert.ok(sizeAt >= 0 && rateAt >= 0 && jsonAt >= 0 && projectAt >= 0);
  assert.ok(sizeAt < rateAt && rateAt < jsonAt && jsonAt < projectAt);
  assert.match(route, /marketObservationId:/);
  assert.doesNotMatch(route, /sourceText:\s*z\.|description:\s*z\.|requirements:\s*z\.|analyzerVersion:\s*z\.|policyVersion:\s*z\./);
});
