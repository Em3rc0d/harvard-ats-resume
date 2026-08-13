import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  MAX_MARKET_INTAKE_DESCRIPTION_CHARS,
  MAX_MARKET_INTAKE_FIELD_CHARS,
  MAX_MARKET_INTAKE_TEXT_CHARS,
  MAX_MARKET_SOURCE_URL_CHARS,
} from '@/lib/application/market/MarketIntake';
import { intakeMarketObservation } from '@/lib/application/market/MarketIntakeService';
import { getRateLimitHeaders, rateLimitPublicApiRequest } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_MARKET_INTAKE_REQUEST_BYTES = 512 * 1024;

const nonBlankField = (maximum: number) => z.string()
  .max(maximum)
  .refine((value) => value.trim().length > 0, 'Value cannot be blank.');

const sourceUrlSchema = z.string()
  .max(MAX_MARKET_SOURCE_URL_CHARS)
  .refine((value) => {
    try {
      const parsed = new URL(value.trim());
      return (parsed.protocol === 'https:' || parsed.protocol === 'http:')
        && !parsed.username
        && !parsed.password;
    } catch {
      return false;
    }
  }, 'Source URL must be an absolute HTTP(S) URL without embedded credentials.');

const observedAtSchema = z.string()
  .refine((value) => Number.isFinite(Date.parse(value)), 'observedAt must be a valid timestamp.');

const structuredJobSchema = z.object({
  companyName: nonBlankField(MAX_MARKET_INTAKE_FIELD_CHARS).optional(),
  roleTitle: nonBlankField(MAX_MARKET_INTAKE_FIELD_CHARS).optional(),
  location: nonBlankField(MAX_MARKET_INTAKE_FIELD_CHARS).optional(),
  workModel: nonBlankField(MAX_MARKET_INTAKE_FIELD_CHARS).optional(),
  employmentType: nonBlankField(MAX_MARKET_INTAKE_FIELD_CHARS).optional(),
  seniority: nonBlankField(MAX_MARKET_INTAKE_FIELD_CHARS).optional(),
  compensation: nonBlankField(MAX_MARKET_INTAKE_FIELD_CHARS).optional(),
  postedAt: nonBlankField(MAX_MARKET_INTAKE_FIELD_CHARS).optional(),
  expiresAt: nonBlankField(MAX_MARKET_INTAKE_FIELD_CHARS).optional(),
  description: nonBlankField(MAX_MARKET_INTAKE_DESCRIPTION_CHARS).optional(),
}).strict().refine(
  (job) => Object.values(job).some((value) => value !== undefined),
  'Structured payload must contain at least one explicit job field.',
);

const marketIntakeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('MANUAL_TEXT'),
    text: nonBlankField(MAX_MARKET_INTAKE_TEXT_CHARS),
    sourceUrl: sourceUrlSchema.optional(),
    observedAt: observedAtSchema.optional(),
  }).strict(),
  z.object({
    kind: z.literal('STRUCTURED_PAYLOAD'),
    job: structuredJobSchema,
    sourceUrl: sourceUrlSchema.optional(),
    observedAt: observedAtSchema.optional(),
  }).strict(),
]);

/**
 * POST /api/market-intake
 *
 * M4B-02A converts controlled user-supplied market inputs into the canonical
 * MarketObservation truth boundary. This route does not fetch URLs, invoke Job
 * Intelligence, compare a candidate, or claim persistence.
 */
export async function POST(request: NextRequest) {
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const requestBytes = Number(contentLength);
    if (Number.isFinite(requestBytes) && requestBytes > MAX_MARKET_INTAKE_REQUEST_BYTES) {
      return NextResponse.json(
        { success: false, error: 'Market intake request exceeds the allowed size.' },
        { status: 413, headers: { 'Cache-Control': 'no-store, max-age=0' } },
      );
    }
  }

  const rateLimitResult = await rateLimitPublicApiRequest(request.headers, 'market-intake');
  const rateLimitHeaders = getRateLimitHeaders(rateLimitResult);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'Rate limit exceeded. Please try market intake again later.',
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
      { success: false, error: 'Market intake request must contain valid JSON.' },
      {
        status: 400,
        headers: {
          ...rateLimitHeaders,
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    );
  }

  const validation = marketIntakeSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'Market intake input is invalid.',
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
    const result = intakeMarketObservation(validation.data);
    return NextResponse.json(
      {
        success: true,
        data: result,
      },
      {
        status: 200,
        headers: {
          ...rateLimitHeaders,
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    );
  } catch (error) {
    console.error('Market intake error:', error);
    const isInputError = error instanceof Error && error.message.startsWith('MarketIntake validation:');
    return NextResponse.json(
      {
        success: false,
        error: isInputError ? error.message : 'Market intake could not be completed safely.',
      },
      {
        status: isInputError ? 400 : 500,
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
