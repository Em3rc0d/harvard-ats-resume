import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MarketObservationId } from '../../lib/domain';
import { createMarketObservation } from '../../lib/application/market/MarketObservationService';
import {
  persistMarketObservationHistory,
  type MarketObservationHistoryRepository,
  type MarketObservationHistorySnapshot,
} from '../../lib/application/market/MarketObservationHistory';
import {
  createMarketOpportunityLink,
  deriveMarketOpportunityId,
  deriveMarketOpportunityLifecycle,
  MARKET_OPPORTUNITY_DIRECT_FRESHNESS_HOURS,
} from '../../lib/application/market/MarketOpportunityIdentityLifecycleService';
import {
  persistMarketOpportunityLink,
  type MarketOpportunityIndexRepository,
  type MarketOpportunityIndexSnapshot,
} from '../../lib/application/market/MarketOpportunityIndexHistory';
import { registerDurableMarketOpportunityLifecycle } from '../../lib/application/market/MarketOpportunityLifecycleRuntime';
import { createMarketOpportunityIndexRepositoryFromEnv } from '../../lib/infrastructure/persistence/UpstashMarketOpportunityIndexRepository';
import { classifyOpportunityPriority } from '../../lib/application/opportunity/OpportunitySpaceService';
import type { OpportunityAssessment } from '../../lib/application/opportunity/OpportunityAssessment';
import type { CareerTargetRelevance } from '../../lib/application/target/CareerTargetService';

class MemoryObservationRepository implements MarketObservationHistoryRepository {
  state: MarketObservationHistorySnapshot | null = null;
  async load() { return this.state; }
  async save(snapshot: MarketObservationHistorySnapshot) { this.state = snapshot; }
}

class MemoryOpportunityIndexRepository implements MarketOpportunityIndexRepository {
  state: MarketOpportunityIndexSnapshot | null = null;
  async load() { return this.state; }
  async save(snapshot: MarketOpportunityIndexSnapshot) { this.state = snapshot; }
}

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

function providerObservation(input: {
  externalId?: string;
  title?: string;
  description?: string;
  observedAt?: string;
  expiresAt?: string;
}) {
  const externalId = input.externalId ?? 'job-1';
  const title = input.title ?? 'Platform Engineer';
  const description = input.description ?? 'Requirements: TypeScript and AWS.';
  return createMarketObservation({
    source: { type: 'PROVIDER_API', provider: 'TEST_PROVIDER', label: 'Test provider board' },
    payload: {
      format: 'JSON',
      content: JSON.stringify({ id: externalId, title, description, expiresAt: input.expiresAt }),
    },
    explicitFields: {
      roleTitle: { value: title, evidence: { origin: 'SOURCE_EXPLICIT', sourcePath: '$.title' } },
      description: { value: description, evidence: { origin: 'SOURCE_EXPLICIT', sourcePath: '$.description' } },
      ...(input.expiresAt ? {
        expiresAt: { value: input.expiresAt, evidence: { origin: 'SOURCE_EXPLICIT' as const, sourcePath: '$.expiresAt' } },
      } : {}),
    },
    provenance: {
      captureMethod: 'PROVIDER_ADAPTER',
      sourceUrl: `https://api.example.test/jobs/${externalId}`,
      externalId,
      adapter: { adapterId: 'test-provider', adapterVersion: '1.0.0' },
    },
    observedAt: input.observedAt ?? '2026-08-16T12:00:00.000Z',
  });
}

function manualObservation(text: string, observedAt: string) {
  return createMarketObservation({
    source: { type: 'MANUAL_TEXT', label: 'Manual text' },
    payload: { format: 'TEXT', content: text },
    provenance: { captureMethod: 'USER_SUPPLIED_TEXT' },
    observedAt,
  });
}

const strongAssessment: OpportunityAssessment = {
  policyVersion: 'market-opportunity-assessment-v1',
  recommendation: 'READY_NOW',
  shouldApply: 'YES',
  nextAction: 'APPLY',
  eligibility: 'CLEAR',
  evidenceStrength: 'STRONG',
  rationale: 'fixture',
  jobMatchScore: 90,
  requiredCoverage: 100,
  preferredCoverage: 100,
  strongEvidence: [],
  transferableEvidence: [],
  criticalGaps: [],
  optionalGaps: [],
  uncertainties: [],
  basis: { totalRequirements: 2, requiredRequirements: 2, preferredRequirements: 0, unknownNecessityRequirements: 0 },
  scopeBoundary: 'Evidence-based application guidance only. This is not a hiring probability, recruiter decision, or score from a commercial ATS.',
};

const highRelevance: CareerTargetRelevance = {
  policyVersion: 'career-target-v1',
  level: 'HIGH',
  role: 'ALIGNED',
  seniority: 'UNKNOWN',
  location: 'NOT_CONSTRAINED',
  workModel: 'NOT_CONSTRAINED',
  employmentType: 'NOT_CONSTRAINED',
  reasons: ['fixture'],
  scopeBoundary: 'PREFERENCE_ALIGNMENT_NOT_CAPABILITY_EVIDENCE',
};

test('same provider-native listing keeps one logical opportunity across material source changes', () => {
  const first = providerObservation({ description: 'Requires TypeScript.' });
  const changed = providerObservation({ description: 'Requires TypeScript and AWS.', observedAt: '2026-08-16T13:00:00.000Z' });

  assert.notEqual(first.id, changed.id);
  assert.equal(deriveMarketOpportunityId(first), deriveMarketOpportunityId(changed));
  assert.notEqual(createMarketOpportunityLink(first).id, createMarketOpportunityLink(changed).id);
});

test('same title text with different provider-native identity never fuzzy-merges', () => {
  const first = providerObservation({ externalId: 'job-1', title: 'Platform Engineer' });
  const second = providerObservation({ externalId: 'job-2', title: 'Platform Engineer' });
  assert.notEqual(deriveMarketOpportunityId(first), deriveMarketOpportunityId(second));
});

test('manual observations without strong provider identity remain observation-bound', () => {
  const first = manualObservation('Platform Engineer role version one', '2026-08-16T12:00:00.000Z');
  const changed = manualObservation('Platform Engineer role version two', '2026-08-16T13:00:00.000Z');
  assert.notEqual(first.id, changed.id);
  assert.notEqual(deriveMarketOpportunityId(first), deriveMarketOpportunityId(changed));
});

test('recent direct provider observation is OPEN and ages to STALE after the v1 freshness window', async () => {
  const observationRepository = new MemoryObservationRepository();
  const indexRepository = new MemoryOpportunityIndexRepository();
  const observation = providerObservation({ observedAt: '2026-08-16T12:00:00.000Z' });
  await persistMarketObservationHistory({ observation, repository: observationRepository });
  const link = createMarketOpportunityLink(observation);
  await persistMarketOpportunityLink({ link, repository: indexRepository });

  const open = deriveMarketOpportunityLifecycle({
    marketOpportunityId: link.marketOpportunityId,
    links: indexRepository.state!.links,
    observationHistory: observationRepository.state!,
    evaluatedAt: '2026-08-16T13:00:00.000Z',
  });
  assert.equal(open.status, 'OPEN');
  assert.equal(open.basis, 'RECENT_DIRECT_SOURCE_OBSERVATION');

  const staleAt = new Date(Date.parse(observation.observedAt) + (MARKET_OPPORTUNITY_DIRECT_FRESHNESS_HOURS + 1) * 60 * 60 * 1000).toISOString();
  const stale = deriveMarketOpportunityLifecycle({
    marketOpportunityId: link.marketOpportunityId,
    links: indexRepository.state!.links,
    observationHistory: observationRepository.state!,
    evaluatedAt: staleAt,
  });
  assert.equal(stale.status, 'STALE');
  assert.equal(stale.basis, 'DIRECT_SOURCE_OBSERVATION_AGED_OUT');
});

test('source-explicit expiry can close an opportunity without rewriting source truth', async () => {
  const observationRepository = new MemoryObservationRepository();
  const indexRepository = new MemoryOpportunityIndexRepository();
  const observation = providerObservation({
    expiresAt: '2026-08-16',
    observedAt: '2026-08-16T12:00:00.000Z',
  });
  await persistMarketObservationHistory({ observation, repository: observationRepository });
  const link = createMarketOpportunityLink(observation);
  await persistMarketOpportunityLink({ link, repository: indexRepository });
  const lifecycle = deriveMarketOpportunityLifecycle({
    marketOpportunityId: link.marketOpportunityId,
    links: indexRepository.state!.links,
    observationHistory: observationRepository.state!,
    evaluatedAt: '2026-08-17T01:00:00.000Z',
  });
  assert.equal(lifecycle.status, 'CLOSED');
  assert.equal(lifecycle.basis, 'SOURCE_EXPLICIT_EXPIRY_PASSED');
});

test('re-observing unchanged provider content refreshes recency without creating a material state', async () => {
  const observationRepository = new MemoryObservationRepository();
  const indexRepository = new MemoryOpportunityIndexRepository();
  const first = providerObservation({ observedAt: '2026-08-16T12:00:00.000Z' });
  const repeated = providerObservation({ observedAt: '2026-08-18T12:00:00.000Z' });
  assert.equal(first.id, repeated.id);
  await persistMarketObservationHistory({ observation: first, repository: observationRepository });
  await persistMarketObservationHistory({ observation: repeated, repository: observationRepository });
  await persistMarketOpportunityLink({ link: createMarketOpportunityLink(first), repository: indexRepository });

  const lifecycle = deriveMarketOpportunityLifecycle({
    marketOpportunityId: deriveMarketOpportunityId(first),
    links: indexRepository.state!.links,
    observationHistory: observationRepository.state!,
    evaluatedAt: '2026-08-18T13:00:00.000Z',
  });
  assert.equal(lifecycle.materialStateCount, 1);
  assert.equal(lifecycle.lastObservedAt, repeated.observedAt);
  assert.equal(lifecycle.status, 'OPEN');
});

test('runtime auto-links every durable material version of the same provider-native opportunity', async () => {
  const observationRepository = new MemoryObservationRepository();
  const indexRepository = new MemoryOpportunityIndexRepository();
  const first = providerObservation({ description: 'Requires TypeScript.', observedAt: '2026-08-16T12:00:00.000Z' });
  const changed = providerObservation({ description: 'Requires TypeScript and AWS.', observedAt: '2026-08-16T13:00:00.000Z' });
  await persistMarketObservationHistory({ observation: first, repository: observationRepository });
  await persistMarketObservationHistory({ observation: changed, repository: observationRepository });

  const result = await registerDurableMarketOpportunityLifecycle(changed.id, {
    observationRepository,
    opportunityIndexRepository: indexRepository,
    evaluatedAt: '2026-08-16T14:00:00.000Z',
  });
  assert.equal(result.linksAdded, 2);
  assert.equal(result.lifecycle.materialStateCount, 2);
  assert.deepEqual(new Set(result.lifecycle.observationIds), new Set([first.id, changed.id]));
  assert.equal(result.lifecycle.currentMarketObservationId, changed.id);

  const replay = await registerDurableMarketOpportunityLifecycle(changed.id, {
    observationRepository,
    opportunityIndexRepository: indexRepository,
    evaluatedAt: '2026-08-16T14:00:00.000Z',
  });
  assert.equal(replay.linksAdded, 0);
  assert.equal(replay.indexSnapshot.revision, result.indexSnapshot.revision);
});

test('OpportunitySpace never promotes CLOSED, STALE, or superseded market assessments', () => {
  const baseLifecycle = {
    policyVersion: 'market-opportunity-lifecycle-v1' as const,
    marketOpportunityId: 'market-opportunity:00000000000000000000000000000000' as never,
    currentMarketObservationId: 'market-observation:00000000000000000000000000000000' as MarketObservationId,
    observationIds: ['market-observation:00000000000000000000000000000000' as MarketObservationId],
    materialStateCount: 1,
    status: 'OPEN' as const,
    basis: 'RECENT_DIRECT_SOURCE_OBSERVATION' as const,
    firstObservedAt: '2026-08-16T12:00:00.000Z',
    lastObservedAt: '2026-08-16T12:00:00.000Z',
    evaluatedAt: '2026-08-16T13:00:00.000Z',
    ageHours: 1,
    scopeBoundary: 'DERIVED_MARKET_LIFECYCLE_NOT_SOURCE_FACT_OR_APPLICATION_DECISION' as const,
  };

  assert.equal(classifyOpportunityPriority(strongAssessment, highRelevance, { ...baseLifecycle, status: 'CLOSED', basis: 'SOURCE_EXPLICIT_EXPIRY_PASSED' }), 'DEPRIORITIZE');
  assert.equal(classifyOpportunityPriority(strongAssessment, highRelevance, { ...baseLifecycle, status: 'STALE', basis: 'DIRECT_SOURCE_OBSERVATION_AGED_OUT' }), 'INSUFFICIENT_SIGNAL');
  assert.equal(classifyOpportunityPriority(strongAssessment, highRelevance, baseLifecycle, false), 'INSUFFICIENT_SIGNAL');
  assert.equal(classifyOpportunityPriority(strongAssessment, highRelevance, baseLifecycle, true), 'PRIORITIZE_NOW');
});

test('missing Upstash configuration fails closed for logical opportunity identity storage', () => {
  assert.throws(() => createMarketOpportunityIndexRepositoryFromEnv({}), /required for durable market opportunity identity/);
});

test('M4B-07 route and identity service do not accept fuzzy company/title identity or candidate truth', () => {
  const identityService = source('lib/application/market/MarketOpportunityIdentityLifecycleService.ts');
  const lifecycleRoute = source('app/api/market-opportunity-lifecycle/route.ts');
  const spaceRoute = source('app/api/opportunity-space/route.ts');
  assert.doesNotMatch(identityService, /similarity|levenshtein|fuzzy|companyName.*roleTitle|roleTitle.*companyName/i);
  assert.doesNotMatch(`${identityService}\n${lifecycleRoute}`, /CareerEvidence|CareerAssertion|CandidateProfile|matchJobToCandidate|assessOpportunity/);
  assert.match(lifecycleRoute, /marketObservationId:/);
  assert.doesNotMatch(lifecycleRoute, /marketOpportunityId:\s*z\.|status:\s*z\.|provider:\s*z\.|externalId:\s*z\./);
  assert.match(spaceRoute, /registerDurableMarketOpportunityLifecycle/);
  assert.match(spaceRoute, /jobSnapshot\.marketProvenance\.marketObservationId/);
});
