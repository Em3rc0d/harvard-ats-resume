import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { optimizeCandidateText } from '@/lib/application/presentation/CandidateTextOptimizer';
import { OllamaCandidateTextOptimizer } from '@/lib/infrastructure/ai/OllamaCandidateTextOptimizer';
import { getRateLimitHeaders, rateLimitPublicApiRequest } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  summary: z.string().min(10).max(12_000),
});

/**
 * Fact-preserving inline rewrite for the legacy Optimize buttons.
 *
 * The local model may improve presentation, but the application layer validates
 * that the rewrite did not introduce unsupported structured facts or novel
 * domain vocabulary. Unsafe/unavailable model output falls back to deterministic
 * presentation cleanup rather than silently becoming candidate truth.
 */
export async function POST(request: NextRequest) {
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Content must contain between 10 and 12,000 characters.' },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } },
      );
    }

    const rateLimitResult = await rateLimitPublicApiRequest(request.headers, 'optimize-content');
    const rateLimitHeaders = getRateLimitHeaders(rateLimitResult);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded. Please try content optimization again later.',
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

    const result = await optimizeCandidateText(
      parsed.data.summary,
      new OllamaCandidateTextOptimizer(),
    );

    return NextResponse.json(
      {
        output: result.output,
        mode: result.mode,
        changed: result.changed,
        policyVersion: result.policyVersion,
      },
      {
        headers: {
          ...rateLimitHeaders,
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    );
  } catch (error) {
    console.error('Inline optimization error:', error);
    return NextResponse.json(
      { error: 'Unable to optimize content safely.' },
      { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  }
}
