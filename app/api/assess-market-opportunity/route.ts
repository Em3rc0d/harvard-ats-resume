import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { JobSnapshotId } from '@/lib/domain';
import { resumeRequestSchema } from '@/lib/schemas';
import { sanitizeResumeData } from '@/lib/application/resume/ResumeInputSanitizer';
import { deriveCareerVaultIdentity } from '@/lib/application/career-vault/CareerVaultIdentity';
import { buildLegacyTruthContext } from '@/lib/application/legacy/LegacyResumeAdapter';
import { MarketJobProjectionHistoryUnavailableError } from '@/lib/application/market/MarketJobProjectionHistory';
import {
  MarketAssessmentJobSnapshotNotFoundError,
  assessDurableMarketJobSnapshot,
} from '@/lib/application/opportunity/MarketOpportunityAssessmentRuntime';
import { MarketOpportunityAssessmentUnavailableError } from '@/lib/application/opportunity/MarketOpportunityAssessmentService';
import {
  OpportunityHistoryIntegrityError,
  OpportunityHistoryUnavailableError,
} from '@/lib/application/opportunity/OpportunityHistory';
import {
  assessCareerTargetRelevance,
  createCareerTarget,
} from '@/lib/application/target/CareerTargetService';
import {
  persistCareerTarget,
  recordTargetOpportunityEvaluation,
} from '@/lib/application/target/CareerTargetPortfolio';
import { createMarketJobProjectionHistoryRepositoryFromEnv } from '@/lib/infrastructure/persistence/UpstashMarketJobProjectionHistoryRepository';
import { createOpportunityHistoryRepositoryFromEnv } from '@/lib/infrastructure/persistence/UpstashOpportunityHistoryRepository';
import { createCareerTargetRepositoryFromEnv } from '@/lib/infrastructure/persistence/UpstashCareerTargetRepository';
import { getRateLimitHeaders, rateLimitPublicApiRequest } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_MARKET_ASSESSMENT_REQUEST_BYTES = 512 * 1024;

const careerTargetSchema = z.object({
  roleTitle: z.string().trim().min(2).max(120),
  jobFamily: z.string().trim().max(120).optional(),
  preferredSeniority: z.enum(['ENTRY', 'JUNIOR', 'MID', 'SENIOR', 'LEAD', 'STAFF', 'PRINCIPAL', 'MANAGER', 'DIRECTOR', 'ANY']).default('ANY'),
  preferredLocations: z.array(z.string().trim().min(2).max(120)).max(5).default([]),
  workModels: z.array(z.enum(['REMOTE', 'HYBRID', 'ONSITE', 'FLEXIBLE'])).min(1).max(4).default(['FLEXIBLE']),
  employmentTypes: z.array(z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'ANY'])).min(1).max(5).default(['ANY']),
  industries: z.array(z.string().trim().min(2).max(120)).max(10).default([]),
  relocation: z.enum(['OPEN', 'NOT_OPEN', 'UNSPECIFIED']).default('UNSPECIFIED'),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).default(3),
});

const marketOpportunityAssessmentInputSchema = resumeRequestSchema
  .omit({ jobDescription: true })
  .extend({
    careerVaultId: z.string().uuid('Career Vault identity must be an opaque UUID capability.'),
    careerTarget: careerTargetSchema,
    jobSnapshotId: z.string().regex(
      /^job-snapshot:[a-f0-9]{32}$/,
      'jobSnapshotId must be a canonical content-addressed JobSnapshot id.',
    ),
  })
  .strict();

/**
 * POST /api/assess-market-opportunity
 *
 * Candidate truth is supplied on the candidate side. Job truth is selected only
 * by exact durable M4B-05 JobSnapshot id. Public callers cannot submit or
 * override job description text, requirements, parser version, or market
 * provenance in this route.
 */
export async function POST(request: NextRequest) {
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const bytes = Number(contentLength);
    if (Number.isFinite(bytes) && bytes > MAX_MARKET_ASSESSMENT_REQUEST_BYTES) {
      return NextResponse.json(
        { success: false, error: 'Market opportunity assessment request exceeds the allowed size.' },
        { status: 413, headers: { 'Cache-Control': 'no-store, max-age=0' } },
      );
    }
  }

  const rateLimitResult = await rateLimitPublicApiRequest(request.headers, 'assess-market-opportunity');
  const rateLimitHeaders = getRateLimitHeaders(rateLimitResult);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'Rate limit exceeded. Please try the market opportunity assessment again later.',
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
      { success: false, error: 'Market opportunity assessment request must contain valid JSON.' },
      { status: 400, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
    );
  }

  const validation = marketOpportunityAssessmentInputSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'Candidate data, Career Target, and an exact market JobSnapshot id are required.',
        issues: validation.error.issues.map((issue) => ({
          fieldPath: issue.path.length > 0 ? issue.path.join('.') : 'request',
          message: issue.message,
        })),
      },
      { status: 400, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
    );
  }

  const capturedAt = new Date().toISOString();
  const {
    careerVaultId,
    careerTarget: targetInput,
    jobSnapshotId,
    ...candidateInput
  } = validation.data;
  const data = sanitizeResumeData(candidateInput);
  const vaultIdentity = deriveCareerVaultIdentity(data, careerVaultId);
  const truthContext = buildLegacyTruthContext(data, {
    projectionKey: vaultIdentity.candidateProjectionKey,
    candidateProfileId: vaultIdentity.candidateProfileId,
    capturedAt,
    truthClass: 'CANDIDATE_ASSERTED',
  });

  if (truthContext.assertions.length === 0) {
    return NextResponse.json(
      { success: false, error: 'No evidence-backed career assertions are available for comparison.' },
      { status: 422, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
    );
  }

  const careerTarget = createCareerTarget(vaultIdentity.candidateProfileId, targetInput, capturedAt);

  let targetRepository;
  try {
    targetRepository = createCareerTargetRepositoryFromEnv();
    await persistCareerTarget(targetRepository, careerTarget, capturedAt);
  } catch (targetPersistenceError) {
    console.error('Market assessment Career Target persistence error:', targetPersistenceError);
    return NextResponse.json(
      {
        success: false,
        error: 'Career Target could not be durably committed. CV Engine will not treat an unpersisted preference as the active target.',
        targetPersistence: { status: 'FAILED' },
      },
      { status: 503, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
    );
  }

  try {
    const result = await assessDurableMarketJobSnapshot(
      {
        candidate: truthContext.candidateProfile,
        sources: truthContext.sources,
        evidence: truthContext.evidence,
        assertions: truthContext.assertions,
        candidateSnapshotSha256: vaultIdentity.candidateSnapshotSha256,
        jobSnapshotId: jobSnapshotId as JobSnapshotId,
        capturedAt,
      },
      {
        marketProjectionRepository: createMarketJobProjectionHistoryRepositoryFromEnv(),
        opportunityHistoryRepository: createOpportunityHistoryRepositoryFromEnv(),
      },
    );

    const targetSourceText = [
      result.jobSnapshot.jobDescription.title,
      result.jobSnapshot.jobDescription.sourceText,
    ].filter((value): value is string => Boolean(value?.trim())).join('\n');
    const targetRelevance = assessCareerTargetRelevance(careerTarget, targetSourceText);

    let targetPortfolio;
    try {
      targetPortfolio = await recordTargetOpportunityEvaluation(
        targetRepository,
        careerTarget,
        result.artifacts.assessmentRecord.id,
        targetRelevance,
        capturedAt,
      );
    } catch (linkError) {
      console.error('Market assessment Career Target opportunity-link persistence error:', linkError);
      return NextResponse.json(
        {
          success: false,
          error: 'The market assessment was preserved, but its Career Target relevance could not be durably linked. Retry before using it for target-aware prioritization.',
          targetPersistence: { status: 'LINK_FAILED' },
        },
        { status: 503, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          assessment: result.assessment,
          jobMatch: result.explainableJobMatch,
          marketLineage: {
            jobSnapshotId: result.jobSnapshot.id,
            marketObservationId: result.jobSnapshot.marketProvenance!.marketObservationId,
            derivedMarketInterpretationId: result.jobSnapshot.marketProvenance!.derivedMarketInterpretationId,
            marketJobProjectionId: result.jobSnapshot.marketProvenance!.marketJobProjectionId,
            projectionPolicyVersion: result.jobSnapshot.marketProvenance!.projectionPolicyVersion,
            analyzerVersion: result.jobSnapshot.analyzerVersion,
            matchEngineVersion: result.artifacts.assessmentRecord.matchEngineVersion,
            assessmentPolicyVersion: result.artifacts.assessmentRecord.assessmentPolicyVersion,
          },
          careerTarget: {
            target: careerTarget,
            relevance: targetRelevance,
            portfolioRevision: targetPortfolio.revision,
            scopeBoundary: 'TARGET_PREFERENCE_DOES_NOT_CHANGE_JOB_MATCH',
          },
          opportunityHistory: {
            persistence: result.persistence,
            assessmentId: result.artifacts.assessmentRecord.id,
            careerSnapshotId: result.artifacts.careerSnapshot.id,
            jobSnapshotId: result.artifacts.jobSnapshot.id,
            revision: result.history.revision,
            scopeBoundary: result.historyScopeBoundary,
          },
        },
      },
      { status: 200, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch (error) {
    console.error('Market opportunity assessment error:', error);

    const notFound = error instanceof MarketAssessmentJobSnapshotNotFoundError;
    const insufficientSignal = error instanceof MarketOpportunityAssessmentUnavailableError;
    const unavailable = error instanceof MarketJobProjectionHistoryUnavailableError
      || error instanceof OpportunityHistoryUnavailableError;
    const integrityFailure = error instanceof OpportunityHistoryIntegrityError;

    return NextResponse.json(
      {
        success: false,
        error: notFound
          ? 'The requested market JobSnapshot was not found in durable M4B-05 history.'
          : insufficientSignal
            ? error.message
            : unavailable
              ? 'Durable market assessment storage is temporarily unavailable.'
              : integrityFailure
                ? 'CV Engine refused to persist a market assessment whose snapshot graph failed integrity validation.'
                : 'Market opportunity assessment could not be completed safely.',
      },
      {
        status: notFound ? 404 : insufficientSignal ? 422 : unavailable ? 503 : 500,
        headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' },
      },
    );
  }
}

export async function GET() {
  return NextResponse.json({ success: false, error: 'Method not allowed' }, { status: 405 });
}
