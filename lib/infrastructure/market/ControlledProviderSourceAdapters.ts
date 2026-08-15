import { z } from 'zod';
import type { ObservedJobFields, ObservedMarketField } from '../../domain';
import {
  ControlledSourceAcquisitionError,
  MAX_SOURCE_ACQUISITION_RESPONSE_BYTES,
  SOURCE_ACQUISITION_TIMEOUT_MS,
  type AcquiredProviderMarketIntake,
  type AshbySourceAcquisitionRequest,
  type ControlledSourceAcquisitionRequest,
  type GreenhouseSourceAcquisitionRequest,
  type LeverSourceAcquisitionRequest,
} from '../../application/market/ControlledSourceAcquisition';

const SAFE_PROVIDER_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const GREENHOUSE_JOB_ID = /^[0-9]{1,32}$/;

const greenhouseJobSchema = z.object({
  id: z.union([z.number(), z.string()]),
  title: z.string(),
  location: z.object({ name: z.string() }).passthrough().optional(),
  content: z.string().optional(),
  absolute_url: z.string().optional(),
}).passthrough();

const leverPostingSchema = z.object({
  id: z.string(),
  text: z.string(),
  categories: z.object({
    location: z.string().optional(),
    commitment: z.string().optional(),
    team: z.string().optional(),
    department: z.string().optional(),
  }).passthrough().optional(),
  descriptionPlain: z.string().optional(),
  workplaceType: z.string().optional(),
  salaryDescriptionPlain: z.string().optional(),
  hostedUrl: z.string().optional(),
}).passthrough();

const ashbyJobSchema = z.object({
  title: z.string(),
  location: z.string().optional(),
  isListed: z.boolean().optional(),
  workplaceType: z.string().optional(),
  descriptionPlain: z.string().optional(),
  publishedAt: z.string().optional(),
  employmentType: z.string().optional(),
  jobUrl: z.string(),
  compensation: z.object({
    compensationTierSummary: z.string().optional(),
    scrapeableCompensationSalarySummary: z.string().optional(),
  }).passthrough().optional(),
}).passthrough();

const ashbyBoardSchema = z.object({
  apiVersion: z.string(),
  jobs: z.array(ashbyJobSchema),
}).passthrough();

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

function requireGreenhouseJobId(value: string): string {
  const trimmed = value.trim();
  if (!GREENHOUSE_JOB_ID.test(trimmed)) {
    throw new ControlledSourceAcquisitionError('INVALID_LOCATOR', 'Greenhouse jobId must be a numeric job-post identifier.');
  }
  return trimmed;
}

function field(value: string | undefined, sourcePath: string): ObservedMarketField | undefined {
  if (value === undefined || !value.trim()) return undefined;
  return {
    value,
    evidence: {
      origin: 'SOURCE_EXPLICIT',
      sourcePath,
    },
  };
}

function compactFields(fields: ObservedJobFields): ObservedJobFields {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as ObservedJobFields;
}

async function readBoundedBody(response: Response): Promise<string> {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength) {
    const bytes = Number(declaredLength);
    if (Number.isFinite(bytes) && bytes > MAX_SOURCE_ACQUISITION_RESPONSE_BYTES) {
      throw new ControlledSourceAcquisitionError(
        'SOURCE_RESPONSE_TOO_LARGE',
        `Provider response exceeds ${MAX_SOURCE_ACQUISITION_RESPONSE_BYTES} bytes.`,
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
        `Provider response exceeds ${MAX_SOURCE_ACQUISITION_RESPONSE_BYTES} bytes.`,
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

async function fetchProviderJson(url: string, fetcher: typeof fetch): Promise<unknown> {
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password || parsedUrl.port) {
    throw new ControlledSourceAcquisitionError('INVALID_LOCATOR', 'Provider acquisition URL failed the fixed HTTPS safety policy.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SOURCE_ACQUISITION_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetcher(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'cv-engine-market-acquisition/1.0',
      },
      redirect: 'error',
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError'
      ? 'Provider acquisition timed out.'
      : 'Provider acquisition request failed.';
    throw new ControlledSourceAcquisitionError('SOURCE_UNAVAILABLE', message);
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 404) {
    throw new ControlledSourceAcquisitionError('SOURCE_NOT_FOUND', 'Provider listing was not found.', response.status);
  }
  if (response.status === 429) {
    throw new ControlledSourceAcquisitionError('SOURCE_RATE_LIMITED', 'Provider rate limit was reached.', response.status);
  }
  if (!response.ok) {
    throw new ControlledSourceAcquisitionError('SOURCE_UNAVAILABLE', 'Provider returned an unsuccessful response.', response.status);
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) {
    throw new ControlledSourceAcquisitionError(
      'SOURCE_RESPONSE_INVALID',
      'Provider response must be JSON.',
      response.status,
    );
  }

  const body = await readBoundedBody(response);
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new ControlledSourceAcquisitionError(
      'SOURCE_RESPONSE_INVALID',
      'Provider returned malformed JSON.',
      response.status,
    );
  }
}

function invalidProviderShape(provider: string): ControlledSourceAcquisitionError {
  return new ControlledSourceAcquisitionError(
    'SOURCE_RESPONSE_INVALID',
    `${provider} response did not match the documented public job-posting shape.`,
  );
}

export async function acquireGreenhouseSource(
  request: GreenhouseSourceAcquisitionRequest,
  fetcher: typeof fetch = fetch,
): Promise<AcquiredProviderMarketIntake> {
  const boardToken = requireSafeSegment(request.boardToken, 'Greenhouse boardToken');
  const jobId = requireGreenhouseJobId(request.jobId);
  const sourceUrl = `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs/${jobId}`;
  const raw = await fetchProviderJson(sourceUrl, fetcher);
  const parsed = greenhouseJobSchema.safeParse(raw);
  if (!parsed.success) throw invalidProviderShape('Greenhouse');
  if (String(parsed.data.id) !== jobId) {
    throw new ControlledSourceAcquisitionError('SOURCE_RESPONSE_INVALID', 'Greenhouse response identity does not match the requested jobId.');
  }

  return {
    provider: 'GREENHOUSE',
    sourceLabel: `Greenhouse board ${boardToken}`,
    payloadContent: stableJson(parsed.data),
    explicitFields: compactFields({
      roleTitle: field(parsed.data.title, '$.title'),
      location: field(parsed.data.location?.name, '$.location.name'),
      description: field(parsed.data.content, '$.content'),
    }),
    sourceUrl,
    externalId: jobId,
    adapterId: 'greenhouse-job-board',
    adapterVersion: '1.0.0',
  };
}

export async function acquireLeverSource(
  request: LeverSourceAcquisitionRequest,
  fetcher: typeof fetch = fetch,
): Promise<AcquiredProviderMarketIntake> {
  const site = requireSafeSegment(request.site, 'Lever site');
  const postingId = requireSafeSegment(request.postingId, 'Lever postingId');
  const region = request.region ?? 'GLOBAL';
  const host = region === 'EU' ? 'api.eu.lever.co' : 'api.lever.co';
  const sourceUrl = `https://${host}/v0/postings/${site}/${postingId}?mode=json`;
  const raw = await fetchProviderJson(sourceUrl, fetcher);
  const parsed = leverPostingSchema.safeParse(raw);
  if (!parsed.success) throw invalidProviderShape('Lever');
  if (parsed.data.id !== postingId) {
    throw new ControlledSourceAcquisitionError('SOURCE_RESPONSE_INVALID', 'Lever response identity does not match the requested postingId.');
  }

  return {
    provider: 'LEVER',
    sourceLabel: `Lever site ${site}${region === 'EU' ? ' (EU)' : ''}`,
    payloadContent: stableJson(parsed.data),
    explicitFields: compactFields({
      roleTitle: field(parsed.data.text, '$.text'),
      location: field(parsed.data.categories?.location, '$.categories.location'),
      workModel: field(parsed.data.workplaceType, '$.workplaceType'),
      employmentType: field(parsed.data.categories?.commitment, '$.categories.commitment'),
      compensation: field(parsed.data.salaryDescriptionPlain, '$.salaryDescriptionPlain'),
      description: field(parsed.data.descriptionPlain, '$.descriptionPlain'),
    }),
    sourceUrl,
    externalId: postingId,
    adapterId: 'lever-postings-api',
    adapterVersion: '1.0.0',
  };
}

function canonicalAshbyJobUrl(value: string, boardName: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new ControlledSourceAcquisitionError('INVALID_LOCATOR', 'Ashby jobUrl must be an absolute Ashby hosted job URL.');
  }

  if (
    parsed.protocol !== 'https:'
    || parsed.hostname !== 'jobs.ashbyhq.com'
    || parsed.username
    || parsed.password
    || parsed.port
  ) {
    throw new ControlledSourceAcquisitionError('INVALID_LOCATOR', 'Ashby jobUrl must use https://jobs.ashbyhq.com with no credentials or custom port.');
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length < 2 || decodeURIComponent(segments[0]) !== boardName) {
    throw new ControlledSourceAcquisitionError('INVALID_LOCATOR', 'Ashby jobUrl must belong to the requested job board.');
  }

  const pathname = parsed.pathname.replace(/\/+$/, '');
  return `${parsed.origin}${pathname}`;
}

export async function acquireAshbySource(
  request: AshbySourceAcquisitionRequest,
  fetcher: typeof fetch = fetch,
): Promise<AcquiredProviderMarketIntake> {
  const jobBoardName = requireSafeSegment(request.jobBoardName, 'Ashby jobBoardName');
  const requestedJobUrl = canonicalAshbyJobUrl(request.jobUrl, jobBoardName);
  const sourceUrl = `https://api.ashbyhq.com/posting-api/job-board/${jobBoardName}?includeCompensation=true`;
  const raw = await fetchProviderJson(sourceUrl, fetcher);
  const parsed = ashbyBoardSchema.safeParse(raw);
  if (!parsed.success) throw invalidProviderShape('Ashby');

  const job = parsed.data.jobs.find((item) => {
    try {
      return canonicalAshbyJobUrl(item.jobUrl, jobBoardName) === requestedJobUrl;
    } catch {
      return false;
    }
  });
  if (!job) {
    throw new ControlledSourceAcquisitionError('SOURCE_NOT_FOUND', 'Ashby board did not contain the requested published job.');
  }

  return {
    provider: 'ASHBY',
    sourceLabel: `Ashby job board ${jobBoardName}`,
    payloadContent: stableJson(job),
    explicitFields: compactFields({
      roleTitle: field(job.title, '$.title'),
      location: field(job.location, '$.location'),
      workModel: field(job.workplaceType, '$.workplaceType'),
      employmentType: field(job.employmentType, '$.employmentType'),
      compensation: field(job.compensation?.compensationTierSummary, '$.compensation.compensationTierSummary'),
      description: field(job.descriptionPlain, '$.descriptionPlain'),
    }),
    sourceUrl,
    externalId: requestedJobUrl,
    adapterId: 'ashby-public-job-posting-api',
    adapterVersion: '1.0.0',
  };
}

export async function acquireProviderMarketIntake(
  request: ControlledSourceAcquisitionRequest,
  fetcher: typeof fetch = fetch,
): Promise<AcquiredProviderMarketIntake> {
  switch (request.provider) {
    case 'GREENHOUSE':
      return await acquireGreenhouseSource(request, fetcher);
    case 'LEVER':
      return await acquireLeverSource(request, fetcher);
    case 'ASHBY':
      return await acquireAshbySource(request, fetcher);
  }
}
