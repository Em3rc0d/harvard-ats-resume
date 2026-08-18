import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { candidateProfileIdFromCareerVaultCapability } from '@/lib/application/career-vault/CareerVaultCapabilityIdentity';
import {
  buildMarketCandidateSet,
  MarketCandidateRetrievalError,
} from '@/lib/application/market/MarketCandidateRetrievalService';
import { MarketObservationHistoryUnavailableError } from '@/lib/application/market/MarketObservationHistory';
import { validateCareerTargetPortfolio } from '@/lib/application/target/CareerTargetPortfolio';
import { createMarketObservationHistoryRepositoryFromEnv } from '@/lib/infrastructure/persistence/UpstashMarketObservationHistoryRepository';
import { createCareerTargetRepositoryFromEnv } from '@/lib/infrastructure/persistence/UpstashCareerTargetRepository';
import { getRateLimitHeaders, rateLimitPublicApiRequest } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_MARKET_CANDIDATE_RETRIEVAL_REQUEST_BYTES = 8 * 1024;
const retrievalSchema = z.object({
  careerVaultId: z.string().uuid('Career Vault identity must be an opaque UUID capability.'),
}).strict();

/**
 * POST /api/market-candidate-retrieval
 *
 * M4B-10 resolves the candidate-owned active CareerTarget and the durable market
 * observation history server-side. It returns a bounded current retrieval view
 * over source-explicit market fields + lifecycle only. Candidate capability,
 * Job Intelligence, Job Match and OpportunityAssessment are intentionally not
 * executed at this prefilter boundary.
 */
export async function POST(request: NextRequest) {
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const bytes = Number(contentLength);
    if (Number.isFinite(bytes) && bytes > MAX_MARKET_CANDIDATE_RETRIEVAL_REQUEST_BYTES) {
      return NextResponse.json(
        { success: false, error: 'Market candidate retrieval request exceeds the allowed size.' },
        { status: 413, headers: { 'Cache-Control': 'no-store, max-age=0' } },
      );
    }
  }

  const rateLimitResult = await rateLimitPublicApiRequest(request.headers, 'market-candidate-retrieval');
  const rateLimitHeaders = getRateLimitHeaders(rateLimitResult);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'Rate limit exceeded. Please try market candidate retrieval again later.',
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
      { success: false, error: 'Market candidate retrieval request must contain valid JSON.' },
      { status: 400, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
    );
  }

  const validation = retrievalSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'Market candidate retrieval input is invalid.',
        issues: validation.error.issues.map((issue) => ({
          fieldPath: issue.path.length > 0 ? issue.path.join('.') : 'request',
          message: issue.message,
        })),
      },
      { status: 400, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
    );
  }

  try {
    const candidateProfileId = candidateProfileIdFromCareerVaultCapability(validation.data.careerVaultId);
    const targetRepository = createCareerTargetRepositoryFromEnv();
    const marketRepository = createMarketObservationHistoryRepositoryFromEnv();

    const [targetPortfolio, marketHistory] = await Promise.all([
      targetRepository.load(candidateProfileId),
      marketRepository.load(),
    ]);

    if (!targetPortfolio) {
      return NextResponse.json(
        { success: false, error: 'Market candidate retrieval requires a durable active Career Target.' },
        { status: 422, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
      );
    }
    if (!marketHistory) {
      return NextResponse.json(
        { success: false, error: 'No durable market observations are available for retrieval.' },
        { status: 422, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
      );
    }

    validateCareerTargetPortfolio(targetPortfolio);
    const activeTarget = targetPortfolio.targets.find((target) => target.id === targetPortfolio.activeTargetId);
    if (!activeTarget) {
      throw new Error('CareerTarget portfolio active target could not be resolved after validation.');
    }

    const candidateSet = buildMarketCandidateSet({
      target: activeTarget,
      observationHistory: marketHistory,
    });

    return NextResponse.json(
      {
        success: true,
        data: candidateSet,
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
    console.error('Market candidate retrieval error:', error);
    const unavailable = error instanceof MarketObservationHistoryUnavailableError;
    const status = unavailable ? 503 : error instanceof MarketCandidateRetrievalError ? 422 : 500;
    const message = unavailable
      ? 'Durable market observation history is temporarily unavailable.'
      : error instanceof MarketCandidateRetrievalError
        ? error.message
        : 'Market candidate retrieval could not be completed safely.';
    return NextResponse.json(
      { success: false, error: message },
      { status, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
    );
  }
}

export async function GET() {
  return NextResponse.json({ success: false, error: 'Method not allowed' }, { status: 405 });
}
