import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { normalizeCandidatePresentationText } from '@/lib/application/presentation/InlineCandidateTextCleanup';
import { getRateLimitHeaders, rateLimitPublicApiRequest } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  summary: z.string().min(10).max(50_000),
});

/**
 * Presentation-only cleanup for the legacy inline Optimize buttons.
 *
 * This endpoint intentionally does NOT use generative AI. Inline edited text is
 * later treated as candidate-supplied data, so allowing an unconstrained model
 * to invent wording here would bypass the ATS v2 grounding boundary. The real
 * fact-preserving AI rewrite remains /api/generate-resume, where deterministic
 * and semantic grounding run before a resume version can be emitted.
 */
export async function POST(request: NextRequest) {
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Content must contain at least 10 characters.' },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } },
      );
    }

    const rateLimitResult = await rateLimitPublicApiRequest(request.headers, 'optimize-content');
    const rateLimitHeaders = getRateLimitHeaders(rateLimitResult);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded. Please try content cleanup again later.',
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

    return NextResponse.json(
      {
        output: normalizeCandidatePresentationText(parsed.data.summary),
        mode: 'PRESENTATION_ONLY',
      },
      {
        headers: {
          ...rateLimitHeaders,
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    );
  } catch (error) {
    console.error('Presentation cleanup error:', error);
    return NextResponse.json(
      { error: 'Unable to clean up content.' },
      { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  }
}
