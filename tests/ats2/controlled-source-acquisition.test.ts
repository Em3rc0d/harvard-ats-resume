import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_SOURCE_ACQUISITION_RESPONSE_BYTES } from '../../lib/application/market/ControlledSourceAcquisition';
import type {
  MarketObservationHistoryRepository,
  MarketObservationHistorySnapshot,
} from '../../lib/application/market/MarketObservationHistory';
import { acquireControlledMarketSource } from '../../lib/application/market/ControlledSourceAcquisitionService';
import {
  acquireAshbySource,
  acquireGreenhouseSource,
  acquireLeverSource,
} from '../../lib/infrastructure/market/ControlledProviderSourceAdapters';

class MemoryHistoryRepository implements MarketObservationHistoryRepository {
  state: MarketObservationHistorySnapshot | null = null;

  async load(): Promise<MarketObservationHistorySnapshot | null> {
    return this.state;
  }

  async save(snapshot: MarketObservationHistorySnapshot): Promise<void> {
    this.state = snapshot;
  }
}

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

function jsonFetcher(
  expectedUrl: string,
  payload: unknown,
  options: { status?: number; contentType?: string } = {},
): typeof fetch {
  return (async (input: string | URL | Request) => {
    const actual = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    assert.equal(actual, expectedUrl);
    return new Response(JSON.stringify(payload), {
      status: options.status ?? 200,
      headers: {
        'content-type': options.contentType ?? 'application/json; charset=utf-8',
      },
    });
  }) as typeof fetch;
}

const greenhousePayload = {
  id: 12345,
  title: 'Senior Backend Engineer',
  location: { name: 'Lima, Peru' },
  updated_at: '2026-08-15T10:00:00Z',
  absolute_url: 'https://example.com/jobs/12345',
  content: '<p>Build APIs with TypeScript.</p>',
};

const leverPayload = {
  id: 'abc-123',
  text: 'Platform Engineer',
  categories: {
    location: 'Remote - Peru',
    commitment: 'Full-time',
    team: 'Platform',
  },
  descriptionPlain: 'Own platform reliability and internal tooling.',
  workplaceType: 'remote',
  salaryDescriptionPlain: 'USD 70,000 - 90,000',
  hostedUrl: 'https://jobs.lever.co/acme/abc-123',
};

const ashbyPayload = {
  apiVersion: '1',
  jobs: [
    {
      title: 'Product Engineer',
      location: 'New York, NY',
      workplaceType: 'Hybrid',
      descriptionPlain: 'Build product surfaces.',
      publishedAt: '2026-08-10T10:00:00Z',
      employmentType: 'FullTime',
      isListed: true,
      jobUrl: 'https://jobs.ashbyhq.com/Acme/job-one',
    },
    {
      title: 'AI Systems Engineer',
      location: 'Remote',
      workplaceType: 'Remote',
      descriptionPlain: 'Build applied AI systems.',
      publishedAt: '2026-08-12T10:00:00Z',
      employmentType: 'FullTime',
      isListed: true,
      compensation: {
        compensationTierSummary: '$100K - $130K',
      },
      jobUrl: 'https://jobs.ashbyhq.com/Acme/job-two',
    },
  ],
};

test('Greenhouse adapter constructs only the official single-job endpoint and preserves explicit source facts', async () => {
  const expectedUrl = 'https://boards-api.greenhouse.io/v1/boards/acme/jobs/12345';
  const result = await acquireGreenhouseSource(
    { provider: 'GREENHOUSE', boardToken: 'acme', jobId: '12345' },
    jsonFetcher(expectedUrl, greenhousePayload),
  );

  assert.equal(result.provider, 'GREENHOUSE');
  assert.equal(result.sourceUrl, expectedUrl);
  assert.equal(result.externalId, '12345');
  assert.equal(result.explicitFields.roleTitle?.value, 'Senior Backend Engineer');
  assert.equal(result.explicitFields.location?.value, 'Lima, Peru');
  assert.equal(result.explicitFields.description?.value, '<p>Build APIs with TypeScript.</p>');
  assert.equal(result.explicitFields.postedAt, undefined);
  assert.equal(result.adapterId, 'greenhouse-job-board');
});

test('Lever adapter supports the documented EU host and maps only provider-explicit fields', async () => {
  const expectedUrl = 'https://api.eu.lever.co/v0/postings/acme/abc-123?mode=json';
  const result = await acquireLeverSource(
    { provider: 'LEVER', site: 'acme', postingId: 'abc-123', region: 'EU' },
    jsonFetcher(expectedUrl, leverPayload),
  );

  assert.equal(result.sourceUrl, expectedUrl);
  assert.equal(result.explicitFields.roleTitle?.value, 'Platform Engineer');
  assert.equal(result.explicitFields.location?.value, 'Remote - Peru');
  assert.equal(result.explicitFields.workModel?.value, 'remote');
  assert.equal(result.explicitFields.employmentType?.value, 'Full-time');
  assert.equal(result.explicitFields.compensation?.value, 'USD 70,000 - 90,000');
  assert.equal(result.explicitFields.description?.value, 'Own platform reliability and internal tooling.');
});

test('Ashby jobUrl is a selector only; acquisition fetches the fixed board API and selects one published job', async () => {
  const expectedUrl = 'https://api.ashbyhq.com/posting-api/job-board/Acme?includeCompensation=true';
  const result = await acquireAshbySource(
    {
      provider: 'ASHBY',
      jobBoardName: 'Acme',
      jobUrl: 'https://jobs.ashbyhq.com/Acme/job-two?utm_source=test#detail',
    },
    jsonFetcher(expectedUrl, ashbyPayload),
  );

  assert.equal(result.sourceUrl, expectedUrl);
  assert.equal(result.externalId, 'https://jobs.ashbyhq.com/Acme/job-two');
  assert.equal(result.explicitFields.roleTitle?.value, 'AI Systems Engineer');
  assert.equal(result.explicitFields.workModel?.value, 'Remote');
  assert.equal(result.explicitFields.compensation?.value, '$100K - $130K');
  assert.equal(result.explicitFields.postedAt, undefined);
  assert.match(result.payloadContent, /AI Systems Engineer/);
  assert.doesNotMatch(result.payloadContent, /Product Engineer/);
});

test('invalid provider-native locators fail before any network request can happen', async () => {
  let calls = 0;
  const fetcher = (async () => {
    calls += 1;
    throw new Error('network must not be reached');
  }) as typeof fetch;

  await assert.rejects(
    acquireGreenhouseSource(
      { provider: 'GREENHOUSE', boardToken: '../../internal', jobId: '12345' },
      fetcher,
    ),
    /provider-native identifier/,
  );

  await assert.rejects(
    acquireAshbySource(
      {
        provider: 'ASHBY',
        jobBoardName: 'Acme',
        jobUrl: 'https://169.254.169.254/latest/meta-data',
      },
      fetcher,
    ),
    /jobs\.ashbyhq\.com/,
  );

  await assert.rejects(
    acquireAshbySource(
      {
        provider: 'ASHBY',
        jobBoardName: 'Acme',
        jobUrl: 'https://jobs.ashbyhq.com/%E0%A4%A/job',
      },
      fetcher,
    ),
    /invalid URL path encoding/,
  );

  assert.equal(calls, 0);
});

test('provider network fetch applies GET, no-store, redirect rejection and abortable timeout policy', async () => {
  const expectedUrl = 'https://boards-api.greenhouse.io/v1/boards/acme/jobs/12345';
  let capturedInit: RequestInit = {};
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const actual = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    assert.equal(actual, expectedUrl);
    capturedInit = init ?? {};
    return new Response(JSON.stringify(greenhousePayload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  await acquireGreenhouseSource(
    { provider: 'GREENHOUSE', boardToken: 'acme', jobId: '12345' },
    fetcher,
  );

  assert.equal(capturedInit.method, 'GET');
  assert.equal(capturedInit.redirect, 'error');
  assert.equal(capturedInit.cache, 'no-store');
  assert.ok(capturedInit.signal instanceof AbortSignal);
  const headers = new Headers(capturedInit.headers);
  assert.equal(headers.get('accept'), 'application/json');
});

test('provider response declared above the 2 MiB ceiling is rejected before canonical intake', async () => {
  const expectedUrl = 'https://boards-api.greenhouse.io/v1/boards/acme/jobs/12345';
  const fetcher = (async (input: string | URL | Request) => {
    const actual = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    assert.equal(actual, expectedUrl);
    return new Response('{}', {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'content-length': String(MAX_SOURCE_ACQUISITION_RESPONSE_BYTES + 1),
      },
    });
  }) as typeof fetch;

  await assert.rejects(
    acquireGreenhouseSource(
      { provider: 'GREENHOUSE', boardToken: 'acme', jobId: '12345' },
      fetcher,
    ),
    /Provider response exceeds/,
  );
});

test('provider responses must be JSON and must match the requested provider identity', async () => {
  await assert.rejects(
    acquireLeverSource(
      { provider: 'LEVER', site: 'acme', postingId: 'abc-123' },
      jsonFetcher(
        'https://api.lever.co/v0/postings/acme/abc-123?mode=json',
        leverPayload,
        { contentType: 'text/html' },
      ),
    ),
    /must be JSON/,
  );

  await assert.rejects(
    acquireGreenhouseSource(
      { provider: 'GREENHOUSE', boardToken: 'acme', jobId: '12345' },
      jsonFetcher(
        'https://boards-api.greenhouse.io/v1/boards/acme/jobs/12345',
        { ...greenhousePayload, id: 99999 },
      ),
    ),
    /identity does not match/,
  );
});

test('controlled acquisition passes provider material through canonical intake and durable occurrence history', async () => {
  const repository = new MemoryHistoryRepository();
  const request = { provider: 'GREENHOUSE', boardToken: 'acme', jobId: '12345' } as const;
  const expectedUrl = 'https://boards-api.greenhouse.io/v1/boards/acme/jobs/12345';

  const first = await acquireControlledMarketSource(request, {
    repository,
    observedAt: '2026-08-15T10:00:00.000Z',
    acquirer: (sourceRequest) => acquireGreenhouseSource(
      sourceRequest as typeof request,
      jsonFetcher(expectedUrl, greenhousePayload),
    ),
  });

  const repeated = await acquireControlledMarketSource(request, {
    repository,
    observedAt: '2026-08-15T11:00:00.000Z',
    acquirer: (sourceRequest) => acquireGreenhouseSource(
      sourceRequest as typeof request,
      jsonFetcher(expectedUrl, greenhousePayload),
    ),
  });

  assert.equal(first.observation.id, repeated.observation.id);
  assert.notEqual(first.occurrenceId, repeated.occurrenceId);
  assert.equal(repeated.history.observationCount, 1);
  assert.equal(repeated.history.occurrenceCount, 2);
  assert.equal(repeated.observation.source.type, 'PROVIDER_API');
  assert.equal(repeated.observation.source.provider, 'GREENHOUSE');
  assert.equal(repeated.observation.provenance.captureMethod, 'PROVIDER_ADAPTER');
  assert.equal(repeated.observation.provenance.adapter?.adapterId, 'greenhouse-job-board');
  assert.equal(repeated.persistence, 'DURABLE_OBSERVATION_HISTORY_M4B_02B');
});

test('changed provider content creates a new MarketObservation and preserves the prior state', async () => {
  const repository = new MemoryHistoryRepository();
  const request = { provider: 'GREENHOUSE', boardToken: 'acme', jobId: '12345' } as const;
  const expectedUrl = 'https://boards-api.greenhouse.io/v1/boards/acme/jobs/12345';

  const first = await acquireControlledMarketSource(request, {
    repository,
    observedAt: '2026-08-15T10:00:00.000Z',
    acquirer: () => acquireGreenhouseSource(request, jsonFetcher(expectedUrl, greenhousePayload)),
  });
  const changed = await acquireControlledMarketSource(request, {
    repository,
    observedAt: '2026-08-15T12:00:00.000Z',
    acquirer: () => acquireGreenhouseSource(
      request,
      jsonFetcher(expectedUrl, { ...greenhousePayload, content: '<p>Build APIs and distributed systems.</p>' }),
    ),
  });

  assert.notEqual(first.observation.id, changed.observation.id);
  assert.equal(changed.history.observationCount, 2);
  assert.equal(changed.history.occurrenceCount, 2);
  assert.equal(repository.state?.observations.some((item) => item.id === first.observation.id), true);
  assert.equal(repository.state?.observations.some((item) => item.id === changed.observation.id), true);
});

test('application acquisition service remains infrastructure-agnostic', () => {
  const service = source('lib/application/market/ControlledSourceAcquisitionService.ts');
  assert.doesNotMatch(service, /infrastructure\//);
  assert.match(service, /dependencies\.acquirer/);
});

test('public acquisition route is bounded, rate-limited, server-owned and does not expose arbitrary URL fetching', () => {
  const route = source('app/api/market-acquisition/route.ts');
  const sizeAt = route.indexOf("request.headers.get('content-length')");
  const rateAt = route.indexOf("rateLimitPublicApiRequest(request.headers, 'market-acquisition')");
  const jsonAt = route.indexOf('await request.json()');
  const acquireAt = route.indexOf('await acquireControlledMarketSource');

  assert.ok(sizeAt >= 0 && rateAt >= 0 && jsonAt >= 0 && acquireAt >= 0);
  assert.ok(sizeAt < rateAt);
  assert.ok(rateAt < jsonAt);
  assert.ok(jsonAt < acquireAt);
  assert.match(route, /32 \* 1024/);
  assert.doesNotMatch(route, /observedAt:/);
  assert.doesNotMatch(route, /sourceUrl:\s*z\./);
  assert.doesNotMatch(route, /analyzeJobDescription|matchJobToCandidate|OpportunityAssessment|OpportunitySpace/);
});
