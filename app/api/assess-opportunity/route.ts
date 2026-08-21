import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resumeRequestSchema } from '@/lib/schemas';
import { sanitizeResumeData } from '@/lib/application/resume/ResumeInputSanitizer';
import { buildLegacyTruthContext } from '@/lib/application/legacy/LegacyResumeAdapter';
import { analyzeJobDescription } from '@/lib/application/job/JobIntelligenceEngine';
import { matchJobToCandidate } from '@/lib/application/matching/JobMatchEngine';
import { toExplainableJobMatch } from '@/lib/application/product/ExplainableJobMatchMapper';
import { assessOpportunity } from '@/lib/application/opportunity/OpportunityAssessment';
import { deriveCareerVaultIdentity } from '@/lib/application/career-vault/CareerVaultIdentity';
import {
  buildOpportunityHistoryArtifacts,
  OpportunityHistoryIntegrityError,
  persistOpportunityAssessmentHistory,
} from '@/lib/application/opportunity/OpportunityHistory';
import {
  assessCareerTargetRelevance,
  createCareerTarget,
} from '@/lib/application/target/CareerTargetService';
import {
  persistCareerTarget,
  recordTargetOpportunityEvaluation,
} from '@/lib/application/target/CareerTargetPortfolio';
import { createOpportunityHistoryRepository } from '@/lib/infrastructure/persistence/UpstashOpportunityHistoryRepository';
import { createCareerTargetRepository } from '@/lib/infrastructure/persistence/UpstashCareerTargetRepository';
import {
  createDurableRedisRuntimeFromEnv,
  DurablePersistenceUnavailableError,
} from '@/lib/infrastructure/persistence/DurableRedisRuntime';
import { getRateLimitHeaders, rateLimitPublicApiRequest } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

const opportunityAssessmentInputSchema = resumeRequestSchema.extend({
  careerVaultId: z.string().uuid('Career Vault identity must be an opaque UUID capability.'),
  careerTarget: careerTargetSchema,
});

/**
 * POST /api/assess-opportunity
 *
 * Evidence fit and candidate intent remain independent dimensions:
 *
 * Career Truth + Job Truth -> OpportunityAssessment (can I defend this?)
 * CareerTarget + Job Truth  -> Target Relevance      (do I want this direction?)
 *
 * Neither target preferences nor job requirements become candidate evidence.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = opportunityAssessmentInputSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Career data and Career Target must be complete enough for a trustworthy opportunity assessment.',
          issues: validation.error.issues.map((issue) => ({
            fieldPath: issue.path.length > 0 ? issue.path.join('.') : 'request',
            message: issue.message,
          })),
        },
        {
          status: 400,
          headers: { 'Cache-Control': 'no-store, max-age=0' },
        },
      );
    }

    const { careerVaultId, careerTarget: targetInput, ...resumeData } = validation.data;
    const data = sanitizeResumeData(resumeData);
    const jobDescription = data.jobDescription?.trim() ?? '';

    if (jobDescription.length < 20) {
      return NextResponse.json(
        {
          success: false,
          error: 'Paste a substantive job description before assessing the opportunity.',
        },
        {
          status: 400,
          headers: { 'Cache-Control': 'no-store, max-age=0' },
        },
      );
    }

    const rateLimitResult = await rateLimitPublicApiRequest(request.headers, 'assess-opportunity');
    const rateLimitHeaders = getRateLimitHeaders(rateLimitResult);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Rate limit exceeded. Please try the opportunity assessment again later.',
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

    // Career Target and Opportunity History share one physical durable backend.
    // Probe it once before deriving/committing any durable decision artifact.
    let durableRuntime;
    try {
      durableRuntime = createDurableRedisRuntimeFromEnv();
      await durableRuntime.assertReady();
    } catch (storageError) {
      if (storageError instanceof DurablePersistenceUnavailableError) {
        console.error('Durable persistence preflight failed for opportunity assessment:', {
          reason: storageError.reason,
        });
        return NextResponse.json(
          {
            success: false,
            error: 'Durable storage is unavailable. Opportunity assessment was not started because its target and history could not be committed safely.',
            persistence: {
              status: 'UNAVAILABLE',
              stage: 'PREFLIGHT',
              reason: storageError.reason,
              retryable: storageError.reason === 'BACKEND_UNAVAILABLE',
            },
          },
          {
            status: 503,
            headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' },
          },
        );
      }
      throw storageError;
    }

    const capturedAt = new Date().toISOString();
    const vaultIdentity = deriveCareerVaultIdentity(data, careerVaultId);
    const careerTarget = createCareerTarget(vaultIdentity.candidateProfileId, targetInput, capturedAt);
    const targetRelevance = assessCareerTargetRelevance(careerTarget, jobDescription);
    const targetRepository = createCareerTargetRepository(durableRuntime.redis);
    const historyRepository = createOpportunityHistoryRepository(durableRuntime.redis);

    try {
      await persistCareerTarget(targetRepository, careerTarget, capturedAt);
    } catch (targetPersistenceError) {
      console.error('Career Target persistence error:', targetPersistenceError);
      return NextResponse.json(
        {
          success: false,
          error: 'Career Target could not be durably committed. CV Engine will not treat an unpersisted preference as the active target.',
          targetPersistence: { status: 'FAILED', stage: 'COMMIT_VERIFY' },
        },
        {
          status: 503,
          headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' },
        },
      );
    }

    const truthContext = buildLegacyTruthContext(data, {
      projectionKey: vaultIdentity.candidateProjectionKey,
      candidateProfileId: vaultIdentity.candidateProfileId,
      capturedAt,
      truthClass: 'CANDIDATE_ASSERTED',
    });

    if (truthContext.assertions.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No evidence-backed career assertions are available for comparison.',
        },
        {
          status: 422,
          headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' },
        },
      );
    }

    const jobIntelligence = analyzeJobDescription(jobDescription, {
      projectionKey: vaultIdentity.jobProjectionKey!,
      capturedAt,
    });

    if (jobIntelligence.requirements.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'The current Job Intelligence rules could not extract enough explicit requirements to make a defensible application recommendation.',
          assessment: { status: 'INSUFFICIENT_JOB_SIGNAL' },
        },
        {
          status: 422,
          headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' },
        },
      );
    }

    const jobMatch = matchJobToCandidate(jobIntelligence, truthContext.assertions, {
      projectionKey: vaultIdentity.matchProjectionKey!,
      generatedAt: capturedAt,
    });
    const explainableJobMatch = toExplainableJobMatch(
      jobMatch,
      jobIntelligence,
      truthContext.assertions,
    );
    const assessment = assessOpportunity(explainableJobMatch);

    const historyInput = {
      repository: historyRepository,
      candidate: truthContext.candidateProfile,
      sources: truthContext.sources,
      evidence: truthContext.evidence,
      assertions: truthContext.assertions,
      jobIntelligence,
      jobMatch,
      assessment,
      capturedAt,
    } as const;
    const artifacts = buildOpportunityHistoryArtifacts(historyInput);

    let history;
    try {
      history = await persistOpportunityAssessmentHistory(historyInput);
    } catch (persistenceError) {
      console.error('Opportunity history persistence error:', persistenceError);
      const integrityFailure = persistenceError instanceof OpportunityHistoryIntegrityError;
      return NextResponse.json(
        {
          success: false,
          error: integrityFailure
            ? 'CV Engine refused to persist an opportunity history graph that failed snapshot integrity validation.'
            : 'Opportunity history could not be durably committed and verified. No durability claim was emitted.',
          persistence: {
            status: integrityFailure ? 'INTEGRITY_REJECTED' : 'FAILED',
            stage: 'COMMIT_VERIFY',
          },
        },
        {
          status: integrityFailure ? 500 : 503,
          headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' },
        },
      );
    }

    let targetPortfolio;
    try {
      targetPortfolio = await recordTargetOpportunityEvaluation(
        targetRepository,
        careerTarget,
        artifacts.assessmentRecord.id,
        targetRelevance,
        capturedAt,
      );
    } catch (linkError) {
      console.error('Career Target opportunity-link persistence error:', linkError);
      return NextResponse.json(
        {
          success: false,
          error: 'The assessment was preserved, but its Career Target relevance could not be durably linked. Retry the assessment before using it to make a target-aware decision.',
          targetPersistence: { status: 'LINK_FAILED', stage: 'COMMIT_VERIFY' },
        },
        {
          status: 503,
          headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' },
        },
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          assessment,
          careerTarget: {
            target: careerTarget,
            relevance: targetRelevance,
            portfolioRevision: targetPortfolio.revision,
            scopeBoundary: 'TARGET_PREFERENCE_DOES_NOT_CHANGE_JOB_MATCH',
          },
          opportunityHistory: {
            persistence: 'DURABLE_OPPORTUNITY_HISTORY',
            assessmentId: artifacts.assessmentRecord.id,
            careerSnapshotId: artifacts.careerSnapshot.id,
            jobSnapshotId: artifacts.jobSnapshot.id,
            revision: history.revision,
          },
        },
      },
      {
        status: 200,
        headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' },
      },
    );
  } catch (error) {
    console.error('Opportunity assessment error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Opportunity assessment could not be completed safely.',
      },
      { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  }
}

export async function GET() {
  return NextResponse.json({ success: false, error: 'Method not allowed' }, { status: 405 });
}
