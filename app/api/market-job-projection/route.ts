import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { MarketObservationId } from '@/lib/domain';
import { DerivedMarketInterpretationHistoryUnavailableError } from '@/lib/application/market/DerivedMarketInterpretationHistory';
import { MarketJobProjectionHistoryUnavailableError } from '@/lib/application/market/MarketJobProjectionHistory';
import {
  MarketJobProjectionSourceNotFoundError,
  projectDurableMarketObservationToJobIntelligence,
} from '@/lib/application/market/MarketJobProjectionRuntime';
import { MarketJobProjectionUnavailableError } from '@/lib/application/market/MarketJobProjectionService';
import { MarketObservationHistoryUnavailableError } from '@/lib/application/market/MarketObservationHistory';
import { createDerivedMarketInterpretationHistoryRepositoryFromEnv } from '@/lib/infrastructure/persistence/UpstashDerivedMarketInterpretationHistoryRepository';
import { createMarketJobProjectionHistoryRepositoryFromEnv } from '@/lib/infrastructure/persistence/UpstashMarketJobProjectionHistoryRepository';
import { createMarketObservationHistoryRepositoryFromEnv } from '@/lib/infrastructure/persistence/UpstashMarketObservationHistoryRepository';
import { getRateLimitHeaders, rateLimitPublicApiRequest } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_MARKET_JOB_PROJECTION_REQUEST_BYTES = 8 * 1024;

const requestSchema = z.object({
  marketObservationId: z.string().regex(
    /^market-observation:[a-f0-9]{32}$/,
    'marketObservationId must be a canonical content-addressed MarketObservation id.',
  ),
}).strict();

/**
 * POST /api/market-job-projection
 *
 * The public caller chooses only a durable MarketObservation identity. Current
 * interpretation policy, authorized text, projection policy, analyzer version,
 * and resulting JobSnapshot are all server-owned.
 */
export async function POST(request: NextRequest) {
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const bytes = Number(contentLength);
    if (Number.isFinite(bytes) && bytes > MAX_MARKET_JOB_PROJECTION_REQUEST_BYTES) {
      return NextResponse.json(
        { success: false, error: 'Market job projection request exceeds the allowed size.' },
        { status: 413, headers: { 'Cache-Control': 'no-store, max-age=0' } },
      );
    }
  }

  const rateLimitResult = await rateLimitPublicApiRequest(request.headers, 'market-job-projection');
  const rateLimitHeaders = getRateLimitHeaders(rateLimitResult);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'Rate limit exceeded. Please try market job projection again later.',
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
      { success: false, error: 'Market job projection request must contain valid JSON.' },
      { status: 400, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
    );
  }

  const validation = requestSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'Market job projection input is invalid.',
        issues: validation.error.issues.map((issue) => ({
          fieldPath: issue.path.length > 0 ? issue.path.join('.') : 'request',
          message: issue.message,
        })),
      },
      { status: 400, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
    );
  }

  try {
    const result = await projectDurableMarketObservationToJobIntelligence(
      validation.data.marketObservationId as MarketObservationId,
      {
        observationRepository: createMarketObservationHistoryRepositoryFromEnv(),
        interpretationRepository: createDerivedMarketInterpretationHistoryRepositoryFromEnv(),
        projectionRepository: createMarketJobProjectionHistoryRepositoryFromEnv(),
      },
    );

    return NextResponse.json(
      { success: true, data: result },
      { status: 200, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch (error) {
    console.error('Market job projection error:', error);

    const sourceNotFound = error instanceof MarketJobProjectionSourceNotFoundError;
    const projectionUnavailable = error instanceof MarketJobProjectionUnavailableError;
    const storageUnavailable = error instanceof MarketObservationHistoryUnavailableError
      || error instanceof DerivedMarketInterpretationHistoryUnavailableError
      || error instanceof MarketJobProjectionHistoryUnavailableError;

    const status = sourceNotFound
      ? error.kind === 'MARKET_OBSERVATION' ? 404 : 409
      : projectionUnavailable ? 422
        : storageUnavailable ? 503
          : 500;
    const message = sourceNotFound
      ? error.kind === 'MARKET_OBSERVATION'
        ? 'MarketObservation was not found.'
        : 'A durable current-policy market interpretation is required before Job Intelligence projection.'
      : projectionUnavailable
        ? 'This market observation does not expose authorized job-description text for Job Intelligence.'
        : storageUnavailable
          ? 'Durable market job projection storage is temporarily unavailable.'
          : 'Market job projection could not be completed safely.';

    return NextResponse.json(
      { success: false, error: message },
      { status, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
    );
  }
}

export async function GET() {
  return NextResponse.json({ success: false, error: 'Method not allowed' }, { status: 405 });
}
