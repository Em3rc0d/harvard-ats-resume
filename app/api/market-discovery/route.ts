import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  ControlledSourceAcquisitionError,
} from '@/lib/application/market/ControlledSourceAcquisition';
import {
  DEFAULT_PROVIDER_DISCOVERY_BUDGET,
  type ControlledProviderDiscoveryRequest,
} from '@/lib/application/market/ControlledProviderDiscovery';
import { discoverAndAcquireControlledMarketSources } from '@/lib/application/market/ControlledProviderDiscoveryService';
import { MarketObservationHistoryUnavailableError } from '@/lib/application/market/MarketObservationHistory';
import { acquireProviderMarketIntake } from '@/lib/infrastructure/market/ControlledProviderSourceAdapters';
import { discoverProviderLocators } from '@/lib/infrastructure/market/ControlledProviderDiscoveryAdapters';
import { createMarketObservationHistoryRepositoryFromEnv } from '@/lib/infrastructure/persistence/UpstashMarketObservationHistoryRepository';
import { getRateLimitHeaders, rateLimitPublicApiRequest } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_MARKET_DISCOVERY_REQUEST_BYTES = 32 * 1024;
const providerSegment = z.string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'Provider identifier contains unsupported characters.');

const discoverySchema = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('GREENHOUSE'), boardToken: providerSegment }).strict(),
  z.object({
    provider: z.literal('LEVER'),
    site: providerSegment,
    region: z.enum(['GLOBAL', 'EU']).optional(),
  }).strict(),
  z.object({ provider: z.literal('ASHBY'), jobBoardName: providerSegment }).strict(),
]);

function upstreamStatus(error: ControlledSourceAcquisitionError): number {
  switch (error.code) {
    case 'INVALID_LOCATOR': return 400;
    case 'SOURCE_NOT_FOUND': return 404;
    case 'SOURCE_RATE_LIMITED': return 503;
    case 'SOURCE_UNAVAILABLE':
    case 'SOURCE_RESPONSE_INVALID':
    case 'SOURCE_RESPONSE_TOO_LARGE':
      return 502;
  }
}

/**
 * POST /api/market-discovery
 *
 * M4B-09 accepts one provider-native board/site locator. Budgets are server-owned.
 * Discovery emits existing M4B-03 listing locators, then bounded workers acquire
 * each listing through canonical MarketObservation durability. Per-listing
 * acquisition failure is returned as partial batch evidence, never as closure.
 */
export async function POST(request: NextRequest) {
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const bytes = Number(contentLength);
    if (Number.isFinite(bytes) && bytes > MAX_MARKET_DISCOVERY_REQUEST_BYTES) {
      return NextResponse.json(
        { success: false, error: 'Market discovery request exceeds the allowed size.' },
        { status: 413, headers: { 'Cache-Control': 'no-store, max-age=0' } },
      );
    }
  }

  const rateLimitResult = await rateLimitPublicApiRequest(request.headers, 'market-discovery');
  const rateLimitHeaders = getRateLimitHeaders(rateLimitResult);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { success: false, error: 'Rate limit exceeded. Please try market discovery again later.' },
      { status: 429, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Market discovery request must contain valid JSON.' },
      { status: 400, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
    );
  }
  const validation = discoverySchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'Market discovery input is invalid.',
        issues: validation.error.issues.map((issue) => ({
          fieldPath: issue.path.length > 0 ? issue.path.join('.') : 'request',
          message: issue.message,
        })),
      },
      { status: 400, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
    );
  }

  try {
    const repository = createMarketObservationHistoryRepositoryFromEnv();
    const result = await discoverAndAcquireControlledMarketSources(
      validation.data as ControlledProviderDiscoveryRequest,
      {
        repository,
        budget: DEFAULT_PROVIDER_DISCOVERY_BUDGET,
        discoverer: (sourceRequest, budget) => discoverProviderLocators(sourceRequest, budget, fetch),
        acquirer: (sourceRequest) => acquireProviderMarketIntake(sourceRequest, fetch),
      },
    );
    return NextResponse.json(
      { success: true, data: result },
      { status: 200, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch (error) {
    console.error('Controlled market discovery error:', error);
    const status = error instanceof ControlledSourceAcquisitionError
      ? upstreamStatus(error)
      : error instanceof MarketObservationHistoryUnavailableError
        ? 503
        : 500;
    const message = error instanceof ControlledSourceAcquisitionError
      ? error.message
      : error instanceof MarketObservationHistoryUnavailableError
        ? 'Durable market observation history is temporarily unavailable.'
        : 'Market discovery could not be completed safely.';
    return NextResponse.json(
      { success: false, error: message },
      { status, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
    );
  }
}

export async function GET() {
  return NextResponse.json({ success: false, error: 'Method not allowed' }, { status: 405 });
}
