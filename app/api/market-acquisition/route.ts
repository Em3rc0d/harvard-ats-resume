import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  ControlledSourceAcquisitionError,
  type ControlledSourceAcquisitionRequest,
} from '@/lib/application/market/ControlledSourceAcquisition';
import { acquireControlledMarketSource } from '@/lib/application/market/ControlledSourceAcquisitionService';
import { MarketObservationHistoryUnavailableError } from '@/lib/application/market/MarketObservationHistory';
import { createMarketObservationHistoryRepositoryFromEnv } from '@/lib/infrastructure/persistence/UpstashMarketObservationHistoryRepository';
import { getRateLimitHeaders, rateLimitPublicApiRequest } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_MARKET_ACQUISITION_REQUEST_BYTES = 32 * 1024;
const providerSegment = z.string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'Provider identifier contains unsupported characters.');

const greenhouseSchema = z.object({
  provider: z.literal('GREENHOUSE'),
  boardToken: providerSegment,
  jobId: z.string().regex(/^[0-9]{1,32}$/, 'Greenhouse jobId must be numeric.'),
}).strict();

const leverSchema = z.object({
  provider: z.literal('LEVER'),
  site: providerSegment,
  postingId: providerSegment,
  region: z.enum(['GLOBAL', 'EU']).optional(),
}).strict();

const ashbySchema = z.object({
  provider: z.literal('ASHBY'),
  jobBoardName: providerSegment,
  jobUrl: z.string().max(2_048).refine((value) => {
    try {
      const parsed = new URL(value.trim());
      return parsed.protocol === 'https:'
        && parsed.hostname === 'jobs.ashbyhq.com'
        && !parsed.username
        && !parsed.password
        && !parsed.port;
    } catch {
      return false;
    }
  }, 'Ashby jobUrl must be an HTTPS jobs.ashbyhq.com URL without credentials or a custom port.'),
}).strict();

const acquisitionSchema = z.discriminatedUnion('provider', [
  greenhouseSchema,
  leverSchema,
  ashbySchema,
]);

function acquisitionErrorStatus(error: ControlledSourceAcquisitionError): number {
  switch (error.code) {
    case 'INVALID_LOCATOR':
      return 400;
    case 'SOURCE_NOT_FOUND':
      return 404;
    case 'SOURCE_RATE_LIMITED':
      return 503;
    case 'SOURCE_UNAVAILABLE':
    case 'SOURCE_RESPONSE_INVALID':
    case 'SOURCE_RESPONSE_TOO_LARGE':
      return 502;
  }
}

/**
 * POST /api/market-acquisition
 *
 * M4B-03 accepts only provider-native locators for three explicitly supported
 * public job-posting APIs. The server constructs the outbound URL; callers never
 * choose an arbitrary fetch destination. One request acquires one listing and
 * must pass Provider Adapter -> Canonical Market Intake -> MarketObservation ->
 * ObservationOccurrence History before HTTP 200.
 */
export async function POST(request: NextRequest) {
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const bytes = Number(contentLength);
    if (Number.isFinite(bytes) && bytes > MAX_MARKET_ACQUISITION_REQUEST_BYTES) {
      return NextResponse.json(
        { success: false, error: 'Market acquisition request exceeds the allowed size.' },
        { status: 413, headers: { 'Cache-Control': 'no-store, max-age=0' } },
      );
    }
  }

  const rateLimitResult = await rateLimitPublicApiRequest(request.headers, 'market-acquisition');
  const rateLimitHeaders = getRateLimitHeaders(rateLimitResult);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'Rate limit exceeded. Please try market acquisition again later.',
        retryAfter: new Date(rateLimitResult.reset).toISOString(),
      },
      {
        status: 429,
        headers: {
          ...rateLimitHeaders,
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Market acquisition request must contain valid JSON.' },
      {
        status: 400,
        headers: {
          ...rateLimitHeaders,
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    );
  }

  const validation = acquisitionSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'Market acquisition input is invalid.',
        issues: validation.error.issues.map((issue) => ({
          fieldPath: issue.path.length > 0 ? issue.path.join('.') : 'request',
          message: issue.message,
        })),
      },
      {
        status: 400,
        headers: {
          ...rateLimitHeaders,
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    );
  }

  try {
    const repository = createMarketObservationHistoryRepositoryFromEnv();
    const result = await acquireControlledMarketSource(
      validation.data as ControlledSourceAcquisitionRequest,
      { repository },
    );

    return NextResponse.json(
      { success: true, data: result },
      {
        status: 200,
        headers: {
          ...rateLimitHeaders,
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    );
  } catch (error) {
    console.error('Controlled market acquisition error:', error);

    const status = error instanceof ControlledSourceAcquisitionError
      ? acquisitionErrorStatus(error)
      : error instanceof MarketObservationHistoryUnavailableError
        ? 503
        : 500;

    const message = error instanceof ControlledSourceAcquisitionError
      ? error.message
      : error instanceof MarketObservationHistoryUnavailableError
        ? 'Durable market observation history is temporarily unavailable.'
        : 'Market acquisition could not be completed safely.';

    return NextResponse.json(
      { success: false, error: message },
      {
        status,
        headers: {
          ...rateLimitHeaders,
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    );
  }
}

export async function GET() {
  return NextResponse.json({ success: false, error: 'Method not allowed' }, { status: 405 });
}
