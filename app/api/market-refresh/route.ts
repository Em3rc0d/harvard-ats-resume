import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { MarketObservationHistoryUnavailableError } from '@/lib/application/market/MarketObservationHistory';
import { MarketOpportunityIndexUnavailableError } from '@/lib/application/market/MarketOpportunityIndexHistory';
import { MarketOpportunitySourceNotFoundError } from '@/lib/application/market/MarketOpportunityLifecycleRuntime';
import { refreshDurableMarketOpportunity } from '@/lib/application/market/ControlledProviderRefresh';
import type { MarketObservationId } from '@/lib/domain';
import { acquireProviderMarketIntake } from '@/lib/infrastructure/market/ControlledProviderSourceAdapters';
import { resolveControlledProviderRefreshLocator } from '@/lib/infrastructure/market/ControlledProviderRefreshLocator';
import { createMarketObservationHistoryRepositoryFromEnv } from '@/lib/infrastructure/persistence/UpstashMarketObservationHistoryRepository';
import { createMarketOpportunityIndexRepositoryFromEnv } from '@/lib/infrastructure/persistence/UpstashMarketOpportunityIndexRepository';
import { getRateLimitHeaders, rateLimitPublicApiRequest } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_MARKET_REFRESH_REQUEST_BYTES = 8 * 1024;
const refreshSchema = z.object({
  marketObservationId: z.string().regex(
    /^market-observation:[a-f0-9]{32}$/,
    'marketObservationId must be a canonical MarketObservation identifier.',
  ),
}).strict();

function refreshFailureStatus(code: string): number {
  switch (code) {
    case 'INVALID_LOCATOR': return 400;
    case 'SOURCE_NOT_FOUND': return 404;
    case 'SOURCE_RATE_LIMITED': return 503;
    case 'SOURCE_UNAVAILABLE':
    case 'SOURCE_RESPONSE_INVALID':
    case 'SOURCE_RESPONSE_TOO_LARGE':
      return 502;
    default:
      return 500;
  }
}

/**
 * POST /api/market-refresh
 *
 * Caller supplies only one durable MarketObservation id. The server resolves
 * logical opportunity lifecycle and the provider-native locator. OPEN jobs are
 * not refreshed before the lifecycle freshness window; STALE direct-provider
 * jobs are re-observed through M4B-03. A failed refresh never becomes CLOSED.
 */
export async function POST(request: NextRequest) {
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const bytes = Number(contentLength);
    if (Number.isFinite(bytes) && bytes > MAX_MARKET_REFRESH_REQUEST_BYTES) {
      return NextResponse.json(
        { success: false, error: 'Market refresh request exceeds the allowed size.' },
        { status: 413, headers: { 'Cache-Control': 'no-store, max-age=0' } },
      );
    }
  }

  const rateLimitResult = await rateLimitPublicApiRequest(request.headers, 'market-refresh');
  const rateLimitHeaders = getRateLimitHeaders(rateLimitResult);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { success: false, error: 'Rate limit exceeded. Please try market refresh again later.' },
      { status: 429, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Market refresh request must contain valid JSON.' },
      { status: 400, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
    );
  }
  const validation = refreshSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { success: false, error: 'Market refresh input is invalid.' },
      { status: 400, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
    );
  }

  try {
    const observationRepository = createMarketObservationHistoryRepositoryFromEnv();
    const opportunityIndexRepository = createMarketOpportunityIndexRepositoryFromEnv();
    const marketObservationId = validation.data.marketObservationId as MarketObservationId;
    const result = await refreshDurableMarketOpportunity(marketObservationId, {
      observationRepository,
      opportunityIndexRepository,
      acquirer: (sourceRequest) => acquireProviderMarketIntake(sourceRequest, fetch),
      locatorResolver: resolveControlledProviderRefreshLocator,
    });

    const status = result.outcome === 'REFRESH_FAILED' && result.failure
      ? refreshFailureStatus(result.failure.code)
      : 200;
    return NextResponse.json(
      { success: result.outcome !== 'REFRESH_FAILED', data: result },
      { status, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch (error) {
    console.error('Controlled market refresh error:', error);
    const unavailable = error instanceof MarketObservationHistoryUnavailableError
      || error instanceof MarketOpportunityIndexUnavailableError;
    const status = error instanceof MarketOpportunitySourceNotFoundError
      ? 404
      : unavailable
        ? 503
        : 500;
    const message = error instanceof MarketOpportunitySourceNotFoundError
      ? 'The requested durable market observation was not found.'
      : unavailable
        ? 'Durable market state is temporarily unavailable.'
        : 'Market refresh could not be completed safely.';
    return NextResponse.json(
      { success: false, error: message },
      { status, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
    );
  }
}

export async function GET() {
  return NextResponse.json({ success: false, error: 'Method not allowed' }, { status: 405 });
}
