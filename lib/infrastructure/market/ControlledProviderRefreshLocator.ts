import type { MarketObservation } from '../../domain';
import {
  ControlledSourceAcquisitionError,
  type ControlledSourceAcquisitionRequest,
} from '../../application/market/ControlledSourceAcquisition';

function invalid(message: string): never {
  throw new ControlledSourceAcquisitionError('INVALID_LOCATOR', message);
}

function requireDirectProviderObservation(observation: MarketObservation): void {
  if (
    observation.source.type !== 'PROVIDER_API'
    || observation.provenance.captureMethod !== 'PROVIDER_ADAPTER'
  ) {
    invalid('Only direct provider observations can be refreshed automatically.');
  }
}

export function resolveControlledProviderRefreshLocator(
  observation: MarketObservation,
): ControlledSourceAcquisitionRequest {
  requireDirectProviderObservation(observation);
  const provider = observation.source.provider?.trim().toUpperCase();
  const sourceUrl = observation.provenance.sourceUrl?.trim();
  const externalId = observation.provenance.externalId?.trim();
  if (!provider || !sourceUrl || !externalId) {
    invalid('Provider refresh requires durable sourceUrl and externalId provenance.');
  }

  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    invalid('Provider refresh sourceUrl is invalid.');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) {
    invalid('Provider refresh sourceUrl violates the fixed HTTPS safety policy.');
  }

  if (provider === 'GREENHOUSE') {
    if (parsed.hostname !== 'boards-api.greenhouse.io') invalid('Greenhouse refresh source host changed.');
    const match = /^\/v1\/boards\/([^/]+)\/jobs\/([0-9]{1,32})$/.exec(parsed.pathname);
    if (!match || parsed.search) invalid('Greenhouse refresh sourceUrl does not match the controlled single-job endpoint.');
    const boardToken = decodeURIComponent(match[1]);
    const jobId = match[2];
    if (jobId !== externalId) invalid('Greenhouse refresh externalId does not match sourceUrl job id.');
    return { provider: 'GREENHOUSE', boardToken, jobId };
  }

  if (provider === 'LEVER') {
    const region = parsed.hostname === 'api.eu.lever.co'
      ? 'EU'
      : parsed.hostname === 'api.lever.co'
        ? 'GLOBAL'
        : invalid('Lever refresh source host changed.');
    const match = /^\/v0\/postings\/([^/]+)\/([^/]+)$/.exec(parsed.pathname);
    if (!match || parsed.searchParams.get('mode') !== 'json') {
      invalid('Lever refresh sourceUrl does not match the controlled single-posting endpoint.');
    }
    const site = decodeURIComponent(match[1]);
    const postingId = decodeURIComponent(match[2]);
    if (postingId !== externalId) invalid('Lever refresh externalId does not match sourceUrl posting id.');
    return {
      provider: 'LEVER',
      site,
      postingId,
      ...(region === 'EU' ? { region: 'EU' as const } : {}),
    };
  }

  if (provider === 'ASHBY') {
    if (parsed.hostname !== 'api.ashbyhq.com') invalid('Ashby refresh source host changed.');
    const match = /^\/posting-api\/job-board\/([^/]+)$/.exec(parsed.pathname);
    if (!match || parsed.searchParams.get('includeCompensation') !== 'true') {
      invalid('Ashby refresh sourceUrl does not match the controlled public job-board endpoint.');
    }
    const jobBoardName = decodeURIComponent(match[1]);
    let jobUrl: URL;
    try {
      jobUrl = new URL(externalId);
    } catch {
      invalid('Ashby refresh externalId is not a hosted job URL.');
    }
    if (
      jobUrl.protocol !== 'https:'
      || jobUrl.hostname !== 'jobs.ashbyhq.com'
      || jobUrl.username
      || jobUrl.password
      || jobUrl.port
    ) {
      invalid('Ashby refresh externalId violates the hosted job URL policy.');
    }
    return { provider: 'ASHBY', jobBoardName, jobUrl: externalId };
  }

  return invalid(`Unsupported provider for controlled refresh: ${provider}`);
}
