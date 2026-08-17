import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { MarketObservationId } from '@/lib/domain';
import {
  MarketOpportunitySourceNotFoundError,
  registerDurableMarketOpportunityLifecycle,
} from '@/lib/application/market/MarketOpportunityLifecycleRuntime';
import {
  MarketOpportunityIndexIntegrityError,
  MarketOpportunityIndexUnavailableError,
} from '@/lib/application/market/MarketOpportunityIndexHistory';
import { MarketObservationHistoryUnavailableError } from '@/lib/application/market/MarketObservationHistory';
import { createMarketObservationHistoryRepositoryFromEnv } from '@/lib/infrastructure/persistence/UpstashMarketObservationHistoryRepository';
import { createMarketOpportunityIndexRepositoryFromEnv } from '@/lib/infrastructure/persistence/UpstashMarketOpportunityIndexRepository';
import { getRateLimitHeaders, rateLimitPublicApiRequest } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_REQUEST_BYTES = 8 * 1024;
const inputSchema = z.object({
  marketObservationId: z.string().regex(
    /^market-observation:[a-f0-9]{32}$/,
    'marketObservationId must be a canonical content-addressed MarketObservation id.',
  ),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const declaredLength = Number(request.headers.get('content-length') ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
      return NextResponse.json(
        { success: false, error: 'Request body is too large.' },
        { status: 413, headers: { 'Cache-Control': 'no-store, max-age=0' } },
      );
    }

    const rateLimitResult = await rateLimitPublicApiRequest(request.headers, 'market-opportunity-lifecycle');
    const rateLimitHeaders = getRateLimitHeaders(rateLimitResult);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Rate limit exceeded. Please retry the market opportunity lifecycle request later.',
          retryAfter: new Date(rateLimitResult.reset).toISOString(),
        },
        { status: 429, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Request body must be valid JSON.' },
        { status: 400, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
      );
    }
    const validation = inputSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Only a canonical MarketObservation identity may cross the M4B-07 public boundary.',
          issues: validation.error.issues,
        },
        { status: 400, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
      );
    }

    const observationRepository = createMarketObservationHistoryRepositoryFromEnv();
    const opportunityIndexRepository = createMarketOpportunityIndexRepositoryFromEnv();
    const result = await registerDurableMarketOpportunityLifecycle(
      validation.data.marketObservationId as MarketObservationId,
      {
        observationRepository,
        opportunityIndexRepository,
        evaluatedAt: new Date().toISOString(),
      },
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          marketOpportunityId: result.lifecycle.marketOpportunityId,
          lifecycle: result.lifecycle,
          index: {
            persistence: result.persistence,
            revision: result.indexSnapshot.revision,
            linksAdded: result.linksAdded,
          },
          scopeBoundary: result.scopeBoundary,
        },
      },
      { status: 200, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch (error) {
    if (error instanceof MarketOpportunitySourceNotFoundError) {
      return NextResponse.json(
        { success: false, error: 'The requested MarketObservation does not exist in durable market history.' },
        { status: 404, headers: { 'Cache-Control': 'no-store, max-age=0' } },
      );
    }
    if (
      error instanceof MarketOpportunityIndexUnavailableError
      || error instanceof MarketObservationHistoryUnavailableError
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'Durable market opportunity lifecycle storage is not configured. CV Engine will not emit an ungrounded current-state claim.',
        },
        { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } },
      );
    }
    if (error instanceof MarketOpportunityIndexIntegrityError) {
      return NextResponse.json(
        { success: false, error: 'CV Engine rejected an invalid logical opportunity history.' },
        { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } },
      );
    }
    console.error('Market opportunity lifecycle error:', error);
    return NextResponse.json(
      { success: false, error: 'Market opportunity lifecycle could not be completed safely.' },
      { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  }
}

export async function GET() {
  return NextResponse.json({ success: false, error: 'Method not allowed' }, { status: 405 });
}
