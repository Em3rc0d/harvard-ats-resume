import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { MarketObservationId } from '@/lib/domain';
import {
  DerivedMarketInterpretationHistoryUnavailableError,
} from '@/lib/application/market/DerivedMarketInterpretationHistory';
import {
  MarketObservationNotFoundForInterpretationError,
  interpretMarketObservation,
} from '@/lib/application/market/MarketInterpretationService';
import { MarketObservationHistoryUnavailableError } from '@/lib/application/market/MarketObservationHistory';
import { createDerivedMarketInterpretationHistoryRepositoryFromEnv } from '@/lib/infrastructure/persistence/UpstashDerivedMarketInterpretationHistoryRepository';
import { createMarketObservationHistoryRepositoryFromEnv } from '@/lib/infrastructure/persistence/UpstashMarketObservationHistoryRepository';
import { getRateLimitHeaders, rateLimitPublicApiRequest } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_MARKET_INTERPRETATION_REQUEST_BYTES = 8 * 1024;

const interpretationRequestSchema = z.object({
  marketObservationId: z.string().regex(
    /^market-observation:[a-f0-9]{32}$/,
    'marketObservationId must be a canonical content-addressed MarketObservation id.',
  ),
}).strict();

/**
 * POST /api/market-interpretation
 *
 * Resolves an already-durable MarketObservation by canonical id. Public callers
 * cannot provide derived values, policy versions, evidence, or timestamps.
 */
export async function POST(request: NextRequest) {
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const bytes = Number(contentLength);
    if (Number.isFinite(bytes) && bytes > MAX_MARKET_INTERPRETATION_REQUEST_BYTES) {
      return NextResponse.json(
        { success: false, error: 'Market interpretation request exceeds the allowed size.' },
        { status: 413, headers: { 'Cache-Control': 'no-store, max-age=0' } },
      );
    }
  }

  const rateLimitResult = await rateLimitPublicApiRequest(request.headers, 'market-interpretation');
  const rateLimitHeaders = getRateLimitHeaders(rateLimitResult);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'Rate limit exceeded. Please try market interpretation again later.',
        retryAfter: new Date(rateLimitResult.reset).toISOString(),
      },
      {
        status: 429,
        headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Market interpretation request must contain valid JSON.' },
      {
        status: 400,
        headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' },
      },
    );
  }

  const validation = interpretationRequestSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'Market interpretation input is invalid.',
        issues: validation.error.issues.map((issue) => ({
          fieldPath: issue.path.length > 0 ? issue.path.join('.') : 'request',
          message: issue.message,
        })),
      },
      {
        status: 400,
        headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' },
      },
    );
  }

  try {
    const result = await interpretMarketObservation(
      validation.data.marketObservationId as MarketObservationId,
      {
        observationRepository: createMarketObservationHistoryRepositoryFromEnv(),
        interpretationRepository: createDerivedMarketInterpretationHistoryRepositoryFromEnv(),
      },
    );

    return NextResponse.json(
      { success: true, data: result },
      {
        status: 200,
        headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' },
      },
    );
  } catch (error) {
    console.error('Market interpretation error:', error);

    const notFound = error instanceof MarketObservationNotFoundForInterpretationError;
    const unavailable = error instanceof MarketObservationHistoryUnavailableError
      || error instanceof DerivedMarketInterpretationHistoryUnavailableError;

    return NextResponse.json(
      {
        success: false,
        error: notFound
          ? 'MarketObservation was not found.'
          : unavailable
            ? 'Durable market interpretation storage is temporarily unavailable.'
            : 'Market interpretation could not be completed safely.',
      },
      {
        status: notFound ? 404 : unavailable ? 503 : 500,
        headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' },
      },
    );
  }
}

export async function GET() {
  return NextResponse.json({ success: false, error: 'Method not allowed' }, { status: 405 });
}
