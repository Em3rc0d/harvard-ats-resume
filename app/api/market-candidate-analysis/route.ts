import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resumeRequestSchema } from '@/lib/schemas';
import { sanitizeResumeData } from '@/lib/gemini';
import { deriveCareerVaultIdentity } from '@/lib/application/career-vault/CareerVaultIdentity';
import { buildLegacyTruthContext } from '@/lib/application/legacy/LegacyResumeAdapter';
import {
  analyzeSelectedMarketCandidates,
  MarketCandidateAnalysisUnavailableError,
} from '@/lib/application/market/MarketCandidateAnalysisService';
import { validateCareerTargetPortfolio } from '@/lib/application/target/CareerTargetPortfolio';
import { createMarketObservationHistoryRepositoryFromEnv } from '@/lib/infrastructure/persistence/UpstashMarketObservationHistoryRepository';
import { createDerivedMarketInterpretationHistoryRepositoryFromEnv } from '@/lib/infrastructure/persistence/UpstashDerivedMarketInterpretationHistoryRepository';
import { createMarketJobProjectionHistoryRepositoryFromEnv } from '@/lib/infrastructure/persistence/UpstashMarketJobProjectionHistoryRepository';
import { createOpportunityHistoryRepositoryFromEnv } from '@/lib/infrastructure/persistence/UpstashOpportunityHistoryRepository';
import { createCareerTargetRepositoryFromEnv } from '@/lib/infrastructure/persistence/UpstashCareerTargetRepository';
import { createMarketOpportunityIndexRepositoryFromEnv } from '@/lib/infrastructure/persistence/UpstashMarketOpportunityIndexRepository';
import { createOpportunitySpaceRepositoryFromEnv } from '@/lib/infrastructure/persistence/UpstashOpportunitySpaceRepository';
import { getRateLimitHeaders, rateLimitPublicApiRequest } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_MARKET_CANDIDATE_ANALYSIS_REQUEST_BYTES = 512 * 1024;

const inputSchema = resumeRequestSchema
  .omit({ jobDescription: true })
  .extend({
    careerVaultId: z.string().uuid('Career Vault identity must be an opaque UUID capability.'),
  })
  .strict();

/**
 * POST /api/market-candidate-analysis
 *
 * M4B-11 resolves the durable active CareerTarget and M4B-10 current selection
 * server-side, then runs only a bounded subset through the existing trusted
 * interpretation -> projection -> assessment -> OpportunitySpace chain.
 */
export async function POST(request: NextRequest) {
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const bytes = Number(contentLength);
    if (Number.isFinite(bytes) && bytes > MAX_MARKET_CANDIDATE_ANALYSIS_REQUEST_BYTES) {
      return NextResponse.json(
        { success: false, error: 'Market candidate analysis request exceeds the allowed size.' },
        { status: 413, headers: { 'Cache-Control': 'no-store, max-age=0' } },
      );
    }
  }

  const rateLimitResult = await rateLimitPublicApiRequest(request.headers, 'market-candidate-analysis');
  const rateLimitHeaders = getRateLimitHeaders(rateLimitResult);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'Rate limit exceeded. Please try selected market analysis again later.',
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
      { success: false, error: 'Market candidate analysis request must contain valid JSON.' },
      { status: 400, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
    );
  }

  const validation = inputSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'Candidate data and Career Vault identity are required for selected market analysis.',
        issues: validation.error.issues.map((issue) => ({
          fieldPath: issue.path.length > 0 ? issue.path.join('.') : 'request',
          message: issue.message,
        })),
      },
      { status: 400, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
    );
  }

  const generatedAt = new Date().toISOString();
  const { careerVaultId, ...candidateInput } = validation.data;
  const data = sanitizeResumeData(candidateInput);
  const vaultIdentity = deriveCareerVaultIdentity(data, careerVaultId);
  const truthContext = buildLegacyTruthContext(data, {
    projectionKey: vaultIdentity.candidateProjectionKey,
    candidateProfileId: vaultIdentity.candidateProfileId,
    capturedAt: generatedAt,
    truthClass: 'CANDIDATE_ASSERTED',
  });

  if (truthContext.assertions.length === 0) {
    return NextResponse.json(
      { success: false, error: 'No evidence-backed career assertions are available for selected market analysis.' },
      { status: 422, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
    );
  }

  let observationRepository;
  let interpretationRepository;
  let projectionRepository;
  let opportunityHistoryRepository;
  let targetRepository;
  let opportunityIndexRepository;
  let opportunitySpaceRepository;
  try {
    observationRepository = createMarketObservationHistoryRepositoryFromEnv();
    interpretationRepository = createDerivedMarketInterpretationHistoryRepositoryFromEnv();
    projectionRepository = createMarketJobProjectionHistoryRepositoryFromEnv();
    opportunityHistoryRepository = createOpportunityHistoryRepositoryFromEnv();
    targetRepository = createCareerTargetRepositoryFromEnv();
    opportunityIndexRepository = createMarketOpportunityIndexRepositoryFromEnv();
    opportunitySpaceRepository = createOpportunitySpaceRepositoryFromEnv();
  } catch (error) {
    console.error('Market candidate analysis storage configuration error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Durable market analysis storage is not configured. CV Engine will not report a non-durable deep-analysis result.',
      },
      { status: 503, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
    );
  }

  try {
    const targetPortfolio = await targetRepository.load(vaultIdentity.candidateProfileId);
    if (!targetPortfolio) {
      return NextResponse.json(
        { success: false, error: 'Selected market analysis requires a durable active Career Target.' },
        { status: 422, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
      );
    }
    validateCareerTargetPortfolio(targetPortfolio);
    const activeTarget = targetPortfolio.targets.find((target) => target.id === targetPortfolio.activeTargetId);
    if (!activeTarget) {
      throw new MarketCandidateAnalysisUnavailableError('Active CareerTarget could not be resolved after portfolio validation.');
    }

    const result = await analyzeSelectedMarketCandidates(
      {
        candidate: truthContext.candidateProfile,
        sources: truthContext.sources,
        evidence: truthContext.evidence,
        assertions: truthContext.assertions,
        candidateSnapshotSha256: vaultIdentity.candidateSnapshotSha256,
        target: activeTarget,
        generatedAt,
      },
      {
        observationRepository,
        interpretationRepository,
        projectionRepository,
        opportunityHistoryRepository,
        targetRepository,
        opportunityIndexRepository,
        opportunitySpaceRepository,
      },
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          analysisRun: result.run,
          opportunitySpace: result.opportunitySpace,
        },
      },
      { status: 200, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch (error) {
    console.error('Market candidate analysis error:', error);
    const boundedFailure = error instanceof MarketCandidateAnalysisUnavailableError;
    return NextResponse.json(
      {
        success: false,
        error: boundedFailure
          ? error.message
          : 'Selected market candidate analysis could not be completed safely.',
      },
      { status: boundedFailure ? 422 : 503, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
    );
  }
}

export async function GET() {
  return NextResponse.json({ success: false, error: 'Method not allowed' }, { status: 405 });
}
