import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ControlledSourceAcquisitionError,
  type AcquiredProviderMarketIntake,
  type ControlledSourceAcquisitionRequest,
} from '../../lib/application/market/ControlledSourceAcquisition';
import { acquireControlledMarketSource } from '../../lib/application/market/ControlledSourceAcquisitionService';
import {
  CONTROLLED_PROVIDER_DISCOVERY_POLICY_VERSION,
  type ControlledProviderDiscoveryResult,
  type ProviderDiscoveryBudget,
} from '../../lib/application/market/ControlledProviderDiscovery';
import { discoverAndAcquireControlledMarketSources } from '../../lib/application/market/ControlledProviderDiscoveryService';
import {
  deriveMarketRefreshDecision,
  refreshDurableMarketOpportunity,
} from '../../lib/application/market/ControlledProviderRefresh';
import type {
  AppendMarketObservationHistoryEvent,
  MarketObservationHistoryRepository,
  MarketObservationHistorySnapshot,
} from '../../lib/application/market/MarketObservationHistory';
import type {
  MarketOpportunityIndexRepository,
  MarketOpportunityIndexSnapshot,
} from '../../lib/application/market/MarketOpportunityIndexHistory';
import {
  discoverProviderLocators,
} from '../../lib/infrastructure/market/ControlledProviderDiscoveryAdapters';
import { resolveControlledProviderRefreshLocator } from '../../lib/infrastructure/market/ControlledProviderRefreshLocator';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

class AppendMemoryObservationRepository implements MarketObservationHistoryRepository {
  private readonly observations = new Map<string, AppendMarketObservationHistoryEvent['observation']>();
  private readonly occurrences = new Map<string, AppendMarketObservationHistoryEvent['occurrence']>();

  async load(): Promise<MarketObservationHistorySnapshot | null> {
    if (this.occurrences.size === 0) return null;
    const observations = [...this.observations.values()].sort((a, b) => (
      Date.parse(a.observedAt) - Date.parse(b.observedAt) || a.id.localeCompare(b.id)
    ));
    const occurrences = [...this.occurrences.values()].sort((a, b) => (
      Date.parse(a.observedAt) - Date.parse(b.observedAt) || a.id.localeCompare(b.id)
    ));
    return {
      schemaVersion: 'market-observation-history-v1',
      observations,
      occurrences,
      revision: occurrences.length,
      createdAt: occurrences[0].observedAt,
      updatedAt: occurrences[occurrences.length - 1].observedAt,
    };
  }

  async append(event: AppendMarketObservationHistoryEvent): Promise<void> {
    const priorObservation = this.observations.get(event.observation.id);
    if (priorObservation && priorObservation.contentSha256 !== event.observation.contentSha256) {
      throw new Error('Observation id collision.');
    }
    const priorOccurrence = this.occurrences.get(event.occurrence.id);
    if (priorOccurrence && priorOccurrence.contentSha256 !== event.occurrence.contentSha256) {
      throw new Error('Occurrence id collision.');
    }
    this.observations.set(event.observation.id, event.observation);
    this.occurrences.set(event.occurrence.id, event.occurrence);
  }

  async save(snapshot: MarketObservationHistorySnapshot): Promise<void> {
    snapshot.observations.forEach((item) => this.observations.set(item.id, item));
    snapshot.occurrences.forEach((item) => this.occurrences.set(item.id, item));
  }
}

class MemoryOpportunityIndexRepository implements MarketOpportunityIndexRepository {
  state: MarketOpportunityIndexSnapshot | null = null;

  async load(): Promise<MarketOpportunityIndexSnapshot | null> {
    return this.state;
  }

  async save(snapshot: MarketOpportunityIndexSnapshot): Promise<void> {
    this.state = snapshot;
  }
}

function discoveryBudget(overrides: Partial<ProviderDiscoveryBudget> = {}): ProviderDiscoveryBudget {
  return {
    maxListings: 50,
    maxPages: 5,
    maxConcurrentAcquisitions: 4,
    ...overrides,
  };
}

function acquiredGreenhouse(
  request: Extract<ControlledSourceAcquisitionRequest, { provider: 'GREENHOUSE' }>,
  description = 'Build reliable APIs.',
): AcquiredProviderMarketIntake {
  const sourceUrl = `https://boards-api.greenhouse.io/v1/boards/${request.boardToken}/jobs/${request.jobId}`;
  return {
    provider: 'GREENHOUSE',
    sourceLabel: `Greenhouse board ${request.boardToken}`,
    payloadContent: JSON.stringify({
      id: Number(request.jobId),
      title: `Backend Engineer ${request.jobId}`,
      content: description,
    }),
    explicitFields: {
      roleTitle: {
        value: `Backend Engineer ${request.jobId}`,
        evidence: { origin: 'SOURCE_EXPLICIT', sourcePath: '$.title' },
      },
      description: {
        value: description,
        evidence: { origin: 'SOURCE_EXPLICIT', sourcePath: '$.content' },
      },
    },
    sourceUrl,
    externalId: request.jobId,
    adapterId: 'greenhouse-job-board',
    adapterVersion: '1.0.0',
  };
}

test('Greenhouse discovery emits existing single-job locators and obeys the listing budget', async () => {
  const expected = 'https://boards-api.greenhouse.io/v1/boards/acme/jobs';
  const fetcher = (async (input: string | URL | Request) => {
    assert.equal(String(input), expected);
    return jsonResponse({ jobs: [{ id: 101 }, { id: 102 }, { id: 103 }] });
  }) as typeof fetch;

  const result = await discoverProviderLocators(
    { provider: 'GREENHOUSE', boardToken: 'acme' },
    discoveryBudget({ maxListings: 2 }),
    fetcher,
  );
  assert.equal(result.policyVersion, CONTROLLED_PROVIDER_DISCOVERY_POLICY_VERSION);
  assert.equal(result.providerRequestCount, 1);
  assert.equal(result.locators.length, 2);
  assert.equal(result.truncated, true);
  assert.deepEqual(result.locators[0].acquisitionRequest, {
    provider: 'GREENHOUSE',
    boardToken: 'acme',
    jobId: '101',
  });
});

test('Lever discovery paginates only inside the page/listing budget and preserves EU region identity', async () => {
  const calls: string[] = [];
  const first = Array.from({ length: 20 }, (_, index) => ({ id: `post-${index}` }));
  const second = [{ id: 'post-20' }, { id: 'post-21' }];
  const fetcher = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (calls.length === 1) {
      assert.equal(url, 'https://api.eu.lever.co/v0/postings/acme?mode=json&skip=0&limit=20');
      return jsonResponse(first);
    }
    assert.equal(url, 'https://api.eu.lever.co/v0/postings/acme?mode=json&skip=20&limit=5');
    return jsonResponse(second);
  }) as typeof fetch;

  const result = await discoverProviderLocators(
    { provider: 'LEVER', site: 'acme', region: 'EU' },
    discoveryBudget({ maxListings: 25, maxPages: 2 }),
    fetcher,
  );
  assert.equal(result.locators.length, 22);
  assert.equal(result.providerRequestCount, 2);
  assert.equal(result.truncated, false);
  assert.deepEqual(result.locators[21].acquisitionRequest, {
    provider: 'LEVER', site: 'acme', postingId: 'post-21', region: 'EU',
  });
});

test('Ashby discovery uses the public board endpoint and does not surface isListed=false direct-link jobs', async () => {
  const expected = 'https://api.ashbyhq.com/posting-api/job-board/Acme?includeCompensation=false';
  const fetcher = (async (input: string | URL | Request) => {
    assert.equal(String(input), expected);
    return jsonResponse({
      apiVersion: '1',
      jobs: [
        { jobUrl: 'https://jobs.ashbyhq.com/Acme/listed', isListed: true },
        { jobUrl: 'https://jobs.ashbyhq.com/Acme/direct-only', isListed: false },
      ],
    });
  }) as typeof fetch;

  const result = await discoverProviderLocators(
    { provider: 'ASHBY', jobBoardName: 'Acme' },
    discoveryBudget(),
    fetcher,
  );
  assert.equal(result.locators.length, 1);
  assert.deepEqual(result.locators[0].acquisitionRequest, {
    provider: 'ASHBY',
    jobBoardName: 'Acme',
    jobUrl: 'https://jobs.ashbyhq.com/Acme/listed',
  });
});

test('bounded batch acquisition preserves successes when one discovered listing fails and respects concurrency', async () => {
  const repository = new AppendMemoryObservationRepository();
  const locators = ['101', '102', '103', '104'].map((jobId, discoveryOrdinal) => ({
    provider: 'GREENHOUSE' as const,
    acquisitionRequest: { provider: 'GREENHOUSE' as const, boardToken: 'acme', jobId },
    discoverySourceUrl: 'https://boards-api.greenhouse.io/v1/boards/acme/jobs',
    discoveryOrdinal,
  }));
  const discovery: ControlledProviderDiscoveryResult = {
    policyVersion: CONTROLLED_PROVIDER_DISCOVERY_POLICY_VERSION,
    provider: 'GREENHOUSE',
    locators,
    providerRequestCount: 1,
    truncated: false,
    scopeBoundary: 'DISCOVERY_LOCATORS_ONLY_NOT_MARKET_FACT_OR_JOB_REQUIREMENT',
  };
  let inFlight = 0;
  let maxInFlight = 0;

  const result = await discoverAndAcquireControlledMarketSources(
    { provider: 'GREENHOUSE', boardToken: 'acme' },
    {
      repository,
      observedAt: '2026-08-17T12:00:00.000Z',
      budget: discoveryBudget({ maxConcurrentAcquisitions: 2 }),
      discoverer: async () => discovery,
      acquirer: async (request) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise<void>((resolve) => setTimeout(resolve, 2));
        inFlight -= 1;
        if (request.provider === 'GREENHOUSE' && request.jobId === '103') {
          throw new ControlledSourceAcquisitionError('SOURCE_NOT_FOUND', 'Listing disappeared.', 404);
        }
        return acquiredGreenhouse(request as Extract<ControlledSourceAcquisitionRequest, { provider: 'GREENHOUSE' }>);
      },
    },
  );

  assert.equal(maxInFlight, 2);
  assert.equal(result.discovered, 4);
  assert.equal(result.succeeded, 3);
  assert.equal(result.failed, 1);
  assert.equal(result.failures[0].code, 'SOURCE_NOT_FOUND');
  assert.equal(result.failures[0].scopeBoundary, 'ACQUISITION_FAILURE_NOT_MARKET_CLOSURE');
  assert.equal((await repository.load())?.observations.length, 3);
});

test('refresh policy separates lifecycle from refresh eligibility', () => {
  const base = {
    policyVersion: 'market-opportunity-lifecycle-v1' as const,
    marketOpportunityId: 'market-opportunity:11111111111111111111111111111111' as const,
    currentMarketObservationId: 'market-observation:22222222222222222222222222222222' as const,
    observationIds: ['market-observation:22222222222222222222222222222222' as const],
    materialStateCount: 1,
    firstObservedAt: '2026-08-15T00:00:00.000Z',
    lastObservedAt: '2026-08-15T00:00:00.000Z',
    evaluatedAt: '2026-08-16T00:00:00.000Z',
    ageHours: 24,
    scopeBoundary: 'DERIVED_MARKET_LIFECYCLE_NOT_SOURCE_FACT_OR_APPLICATION_DECISION' as const,
  };

  const open = deriveMarketRefreshDecision({
    ...base,
    status: 'OPEN',
    basis: 'RECENT_DIRECT_SOURCE_OBSERVATION',
  });
  assert.equal(open.state, 'NOT_DUE');
  assert.equal(open.nextEligibleRefreshAt, '2026-08-18T00:00:00.000Z');

  const stale = deriveMarketRefreshDecision({
    ...base,
    status: 'STALE',
    basis: 'DIRECT_SOURCE_OBSERVATION_AGED_OUT',
  });
  assert.equal(stale.state, 'DUE');

  const unknown = deriveMarketRefreshDecision({
    ...base,
    status: 'UNKNOWN',
    basis: 'NON_DIRECT_SOURCE_NOT_CURRENTLY_VERIFIED',
  });
  assert.equal(unknown.state, 'INELIGIBLE');
});

test('refresh resolver reconstructs the exact controlled provider locator from durable provenance', async () => {
  const repository = new AppendMemoryObservationRepository();
  const request = { provider: 'GREENHOUSE', boardToken: 'acme', jobId: '777' } as const;
  const acquired = await acquireControlledMarketSource(request, {
    repository,
    observedAt: '2026-08-10T00:00:00.000Z',
    acquirer: async () => acquiredGreenhouse(request),
  });

  assert.deepEqual(resolveControlledProviderRefreshLocator(acquired.observation), request);
});

test('stale provider opportunity refresh reuses M4B-03 and unchanged content creates only a new occurrence', async () => {
  const observationRepository = new AppendMemoryObservationRepository();
  const opportunityIndexRepository = new MemoryOpportunityIndexRepository();
  const request = { provider: 'GREENHOUSE', boardToken: 'acme', jobId: '888' } as const;
  const first = await acquireControlledMarketSource(request, {
    repository: observationRepository,
    observedAt: '2026-08-10T00:00:00.000Z',
    acquirer: async () => acquiredGreenhouse(request),
  });

  const refreshed = await refreshDurableMarketOpportunity(first.observation.id, {
    observationRepository,
    opportunityIndexRepository,
    evaluatedAt: '2026-08-14T00:00:00.000Z',
    locatorResolver: resolveControlledProviderRefreshLocator,
    acquirer: async () => acquiredGreenhouse(request),
  });

  assert.equal(refreshed.decision.state, 'DUE');
  assert.equal(refreshed.outcome, 'REFRESHED');
  assert.equal(refreshed.observationId, first.observation.id);
  assert.equal(refreshed.lifecycle?.status, 'OPEN');
  assert.equal(refreshed.lifecycle?.materialStateCount, 1);
  const history = await observationRepository.load();
  assert.equal(history?.observations.length, 1);
  assert.equal(history?.occurrences.length, 2);
});

test('changed provider content refresh preserves prior observation and advances the same logical opportunity', async () => {
  const observationRepository = new AppendMemoryObservationRepository();
  const opportunityIndexRepository = new MemoryOpportunityIndexRepository();
  const request = { provider: 'GREENHOUSE', boardToken: 'acme', jobId: '999' } as const;
  const first = await acquireControlledMarketSource(request, {
    repository: observationRepository,
    observedAt: '2026-08-10T00:00:00.000Z',
    acquirer: async () => acquiredGreenhouse(request, 'Original description.'),
  });

  const refreshed = await refreshDurableMarketOpportunity(first.observation.id, {
    observationRepository,
    opportunityIndexRepository,
    evaluatedAt: '2026-08-14T00:00:00.000Z',
    locatorResolver: resolveControlledProviderRefreshLocator,
    acquirer: async () => acquiredGreenhouse(request, 'Materially changed description.'),
  });

  assert.equal(refreshed.outcome, 'REFRESHED');
  assert.notEqual(refreshed.observationId, first.observation.id);
  assert.equal(refreshed.lifecycle?.status, 'OPEN');
  assert.equal(refreshed.lifecycle?.materialStateCount, 2);
  const history = await observationRepository.load();
  assert.equal(history?.observations.length, 2);
  assert.equal(history?.occurrences.length, 2);
});

test('provider refresh failure preserves STALE lifecycle and never manufactures CLOSED', async () => {
  const observationRepository = new AppendMemoryObservationRepository();
  const opportunityIndexRepository = new MemoryOpportunityIndexRepository();
  const request = { provider: 'GREENHOUSE', boardToken: 'acme', jobId: '1000' } as const;
  const first = await acquireControlledMarketSource(request, {
    repository: observationRepository,
    observedAt: '2026-08-10T00:00:00.000Z',
    acquirer: async () => acquiredGreenhouse(request),
  });

  const result = await refreshDurableMarketOpportunity(first.observation.id, {
    observationRepository,
    opportunityIndexRepository,
    evaluatedAt: '2026-08-14T00:00:00.000Z',
    locatorResolver: resolveControlledProviderRefreshLocator,
    acquirer: async () => {
      throw new ControlledSourceAcquisitionError('SOURCE_NOT_FOUND', 'Provider returned 404.', 404);
    },
  });

  assert.equal(result.outcome, 'REFRESH_FAILED');
  assert.equal(result.lifecycle?.status, 'STALE');
  assert.equal(result.failure?.scopeBoundary, 'REFRESH_FAILURE_NOT_MARKET_CLOSURE');
  assert.notEqual(result.lifecycle?.status, 'CLOSED');
  assert.equal((await observationRepository.load())?.occurrences.length, 1);
});

test('M4B-09 public surfaces keep budgets, locators, lifecycle state and downstream intelligence server-owned', () => {
  const discoveryRoute = source('app/api/market-discovery/route.ts');
  assert.match(discoveryRoute, /DEFAULT_PROVIDER_DISCOVERY_BUDGET/);
  assert.match(discoveryRoute, /rateLimitPublicApiRequest\(request\.headers, 'market-discovery'\)/);
  assert.doesNotMatch(discoveryRoute, /maxListings:\s*z\.|maxPages:\s*z\.|maxConcurrentAcquisitions:\s*z\./);
  assert.doesNotMatch(discoveryRoute, /sourceUrl:\s*z\.|jobUrl:\s*z\./);

  const refreshRoute = source('app/api/market-refresh/route.ts');
  assert.match(refreshRoute, /marketObservationId/);
  assert.match(refreshRoute, /resolveControlledProviderRefreshLocator/);
  assert.doesNotMatch(refreshRoute, /status:\s*z\.|provider:\s*z\.|sourceUrl:\s*z\.|externalId:\s*z\./);

  const discoveryService = source('lib/application/market/ControlledProviderDiscoveryService.ts');
  const refreshService = source('lib/application/market/ControlledProviderRefresh.ts');
  for (const text of [discoveryService, refreshService, discoveryRoute, refreshRoute]) {
    assert.doesNotMatch(text, /analyzeJobDescription|matchJobToCandidate|OpportunityAssessment|ResumeVersion|generateResume/);
  }
  assert.doesNotMatch(discoveryService, /infrastructure\//);
});
