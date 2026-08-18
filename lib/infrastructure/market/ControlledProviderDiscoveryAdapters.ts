import { z } from 'zod';
import {
  ControlledSourceAcquisitionError,
  MAX_SOURCE_ACQUISITION_RESPONSE_BYTES,
  SOURCE_ACQUISITION_TIMEOUT_MS,
  type ControlledSourceAcquisitionRequest,
} from '../../application/market/ControlledSourceAcquisition';
import {
  CONTROLLED_PROVIDER_DISCOVERY_POLICY_VERSION,
  LEVER_DISCOVERY_PAGE_SIZE,
  validateProviderDiscoveryBudget,
  type ControlledProviderDiscoveryRequest,
  type ControlledProviderDiscoveryResult,
  type DiscoveredProviderLocator,
  type ProviderDiscoveryBudget,
} from '../../application/market/ControlledProviderDiscovery';

const SAFE_PROVIDER_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const GREENHOUSE_JOB_ID = /^[0-9]{1,32}$/;

const greenhouseListSchema = z.object({
  jobs: z.array(z.object({
    id: z.union([z.number(), z.string()]),
  }).passthrough()),
}).passthrough();

const leverListSchema = z.array(z.object({
  id: z.string(),
}).passthrough());

const ashbyListSchema = z.object({
  apiVersion: z.string(),
  jobs: z.array(z.object({
    jobUrl: z.string(),
    isListed: z.boolean().optional(),
  }).passthrough()),
}).passthrough();

function requireSafeSegment(value: string, label: string): string {
  const trimmed = value.trim();
  if (!SAFE_PROVIDER_SEGMENT.test(trimmed)) {
    throw new ControlledSourceAcquisitionError(
      'INVALID_LOCATOR',
      `${label} must be a provider-native identifier containing only letters, numbers, underscore, or hyphen.`,
    );
  }
  return trimmed;
}

function canonicalAshbyJobUrl(value: string, boardName: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new ControlledSourceAcquisitionError('SOURCE_RESPONSE_INVALID', 'Ashby discovery returned an invalid jobUrl.');
  }
  if (
    parsed.protocol !== 'https:'
    || parsed.hostname !== 'jobs.ashbyhq.com'
    || parsed.username
    || parsed.password
    || parsed.port
  ) {
    throw new ControlledSourceAcquisitionError('SOURCE_RESPONSE_INVALID', 'Ashby discovery jobUrl violates the fixed hosted-job URL policy.');
  }
  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length < 2) {
    throw new ControlledSourceAcquisitionError('SOURCE_RESPONSE_INVALID', 'Ashby discovery jobUrl does not identify a hosted job.');
  }
  let decodedBoardName: string;
  try {
    decodedBoardName = decodeURIComponent(segments[0]);
  } catch {
    throw new ControlledSourceAcquisitionError('SOURCE_RESPONSE_INVALID', 'Ashby discovery jobUrl contains invalid path encoding.');
  }
  if (decodedBoardName !== boardName) {
    throw new ControlledSourceAcquisitionError('SOURCE_RESPONSE_INVALID', 'Ashby discovery returned a job outside the requested job board.');
  }
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
}

async function readBoundedBody(response: Response): Promise<string> {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength) {
    const bytes = Number(declaredLength);
    if (Number.isFinite(bytes) && bytes > MAX_SOURCE_ACQUISITION_RESPONSE_BYTES) {
      throw new ControlledSourceAcquisitionError(
        'SOURCE_RESPONSE_TOO_LARGE',
        `Provider discovery response exceeds ${MAX_SOURCE_ACQUISITION_RESPONSE_BYTES} bytes.`,
        response.status,
      );
    }
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    received += value.byteLength;
    if (received > MAX_SOURCE_ACQUISITION_RESPONSE_BYTES) {
      await reader.cancel();
      throw new ControlledSourceAcquisitionError(
        'SOURCE_RESPONSE_TOO_LARGE',
        `Provider discovery response exceeds ${MAX_SOURCE_ACQUISITION_RESPONSE_BYTES} bytes.`,
        response.status,
      );
    }
    chunks.push(value);
  }
  const body = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

async function fetchDiscoveryJson(url: string, fetcher: typeof fetch): Promise<unknown> {
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password || parsedUrl.port) {
    throw new ControlledSourceAcquisitionError('INVALID_LOCATOR', 'Provider discovery URL failed the fixed HTTPS safety policy.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SOURCE_ACQUISITION_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetcher(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'cv-engine-market-discovery/1.0',
      },
      redirect: 'error',
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError'
      ? 'Provider discovery timed out.'
      : 'Provider discovery request failed.';
    throw new ControlledSourceAcquisitionError('SOURCE_UNAVAILABLE', message);
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 404) {
    throw new ControlledSourceAcquisitionError('SOURCE_NOT_FOUND', 'Provider discovery source was not found.', response.status);
  }
  if (response.status === 429) {
    throw new ControlledSourceAcquisitionError('SOURCE_RATE_LIMITED', 'Provider discovery rate limit was reached.', response.status);
  }
  if (!response.ok) {
    throw new ControlledSourceAcquisitionError('SOURCE_UNAVAILABLE', 'Provider discovery returned an unsuccessful response.', response.status);
  }
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) {
    throw new ControlledSourceAcquisitionError('SOURCE_RESPONSE_INVALID', 'Provider discovery response must be JSON.', response.status);
  }
  const body = await readBoundedBody(response);
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new ControlledSourceAcquisitionError('SOURCE_RESPONSE_INVALID', 'Provider discovery returned malformed JSON.', response.status);
  }
}

function result(
  provider: ControlledProviderDiscoveryResult['provider'],
  locators: readonly DiscoveredProviderLocator[],
  providerRequestCount: number,
  truncated: boolean,
): ControlledProviderDiscoveryResult {
  return {
    policyVersion: CONTROLLED_PROVIDER_DISCOVERY_POLICY_VERSION,
    provider,
    locators,
    providerRequestCount,
    truncated,
    scopeBoundary: 'DISCOVERY_LOCATORS_ONLY_NOT_MARKET_FACT_OR_JOB_REQUIREMENT',
  };
}

async function discoverGreenhouse(
  request: Extract<ControlledProviderDiscoveryRequest, { provider: 'GREENHOUSE' }>,
  budget: ProviderDiscoveryBudget,
  fetcher: typeof fetch,
): Promise<ControlledProviderDiscoveryResult> {
  const boardToken = requireSafeSegment(request.boardToken, 'Greenhouse boardToken');
  const sourceUrl = `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs`;
  const raw = await fetchDiscoveryJson(sourceUrl, fetcher);
  const parsed = greenhouseListSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ControlledSourceAcquisitionError('SOURCE_RESPONSE_INVALID', 'Greenhouse discovery response did not match the public board jobs shape.');
  }

  const locators: DiscoveredProviderLocator[] = [];
  const seen = new Set<string>();
  for (const job of parsed.data.jobs) {
    const jobId = String(job.id);
    if (!GREENHOUSE_JOB_ID.test(jobId)) {
      throw new ControlledSourceAcquisitionError('SOURCE_RESPONSE_INVALID', 'Greenhouse discovery returned a non-numeric job-post id.');
    }
    if (seen.has(jobId)) continue;
    seen.add(jobId);
    if (locators.length >= budget.maxListings) break;
    locators.push({
      provider: 'GREENHOUSE',
      acquisitionRequest: { provider: 'GREENHOUSE', boardToken, jobId },
      discoverySourceUrl: sourceUrl,
      discoveryOrdinal: locators.length,
    });
  }
  return result('GREENHOUSE', locators, 1, parsed.data.jobs.length > locators.length);
}

async function discoverLever(
  request: Extract<ControlledProviderDiscoveryRequest, { provider: 'LEVER' }>,
  budget: ProviderDiscoveryBudget,
  fetcher: typeof fetch,
): Promise<ControlledProviderDiscoveryResult> {
  const site = requireSafeSegment(request.site, 'Lever site');
  const region = request.region ?? 'GLOBAL';
  const host = region === 'EU' ? 'api.eu.lever.co' : 'api.lever.co';
  const locators: DiscoveredProviderLocator[] = [];
  const seen = new Set<string>();
  let providerRequestCount = 0;
  let truncated = false;

  for (let page = 0; page < budget.maxPages && locators.length < budget.maxListings; page += 1) {
    const remaining = budget.maxListings - locators.length;
    const limit = Math.min(LEVER_DISCOVERY_PAGE_SIZE, remaining);
    const skip = page * LEVER_DISCOVERY_PAGE_SIZE;
    const sourceUrl = `https://${host}/v0/postings/${site}?mode=json&skip=${skip}&limit=${limit}`;
    const raw = await fetchDiscoveryJson(sourceUrl, fetcher);
    providerRequestCount += 1;
    const parsed = leverListSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ControlledSourceAcquisitionError('SOURCE_RESPONSE_INVALID', 'Lever discovery response did not match the public postings list shape.');
    }
    for (const posting of parsed.data) {
      const postingId = requireSafeSegment(posting.id, 'Lever discovered postingId');
      if (seen.has(postingId)) continue;
      seen.add(postingId);
      if (locators.length >= budget.maxListings) break;
      const acquisitionRequest: ControlledSourceAcquisitionRequest = {
        provider: 'LEVER',
        site,
        postingId,
        ...(region === 'EU' ? { region: 'EU' as const } : {}),
      };
      locators.push({
        provider: 'LEVER',
        acquisitionRequest,
        discoverySourceUrl: sourceUrl,
        discoveryOrdinal: locators.length,
      });
    }
    if (parsed.data.length < limit) return result('LEVER', locators, providerRequestCount, false);
    if (locators.length >= budget.maxListings || page === budget.maxPages - 1) truncated = true;
  }

  return result('LEVER', locators, providerRequestCount, truncated);
}

async function discoverAshby(
  request: Extract<ControlledProviderDiscoveryRequest, { provider: 'ASHBY' }>,
  budget: ProviderDiscoveryBudget,
  fetcher: typeof fetch,
): Promise<ControlledProviderDiscoveryResult> {
  const jobBoardName = requireSafeSegment(request.jobBoardName, 'Ashby jobBoardName');
  const sourceUrl = `https://api.ashbyhq.com/posting-api/job-board/${jobBoardName}?includeCompensation=false`;
  const raw = await fetchDiscoveryJson(sourceUrl, fetcher);
  const parsed = ashbyListSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ControlledSourceAcquisitionError('SOURCE_RESPONSE_INVALID', 'Ashby discovery response did not match the public job-board shape.');
  }
  const listedJobs = parsed.data.jobs.filter((job) => job.isListed !== false);
  const locators: DiscoveredProviderLocator[] = [];
  const seen = new Set<string>();
  for (const job of listedJobs) {
    const jobUrl = canonicalAshbyJobUrl(job.jobUrl, jobBoardName);
    if (seen.has(jobUrl)) continue;
    seen.add(jobUrl);
    if (locators.length >= budget.maxListings) break;
    locators.push({
      provider: 'ASHBY',
      acquisitionRequest: { provider: 'ASHBY', jobBoardName, jobUrl },
      discoverySourceUrl: sourceUrl,
      discoveryOrdinal: locators.length,
    });
  }
  return result('ASHBY', locators, 1, listedJobs.length > locators.length);
}

export async function discoverProviderLocators(
  request: ControlledProviderDiscoveryRequest,
  budget: ProviderDiscoveryBudget,
  fetcher: typeof fetch = fetch,
): Promise<ControlledProviderDiscoveryResult> {
  validateProviderDiscoveryBudget(budget);
  switch (request.provider) {
    case 'GREENHOUSE':
      return await discoverGreenhouse(request, budget, fetcher);
    case 'LEVER':
      return await discoverLever(request, budget, fetcher);
    case 'ASHBY':
      return await discoverAshby(request, budget, fetcher);
  }
}
