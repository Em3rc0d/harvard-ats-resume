import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { candidateProfileIdFromCareerVaultCapability } from '@/lib/application/career-vault/CareerVaultCapabilityIdentity';
import { registerDurableMarketOpportunityLifecycle } from '@/lib/application/market/MarketOpportunityLifecycleRuntime';
import {
  validateOpportunityHistorySnapshot,
  type PersistedOpportunityAssessment,
} from '@/lib/application/opportunity/OpportunityHistory';
import { buildOpportunitySpace } from '@/lib/application/opportunity/OpportunitySpaceService';
import { persistOpportunitySpace } from '@/lib/application/opportunity/OpportunitySpaceHistory';
import { validateCareerTargetPortfolio } from '@/lib/application/target/CareerTargetPortfolio';
import { createOpportunityHistoryRepositoryFromEnv } from '@/lib/infrastructure/persistence/UpstashOpportunityHistoryRepository';
import { createCareerTargetRepositoryFromEnv } from '@/lib/infrastructure/persistence/UpstashCareerTargetRepository';
import { createOpportunitySpaceRepositoryFromEnv } from '@/lib/infrastructure/persistence/UpstashOpportunitySpaceRepository';
import { createMarketObservationHistoryRepositoryFromEnv } from '@/lib/infrastructure/persistence/UpstashMarketObservationHistoryRepository';
import { createMarketOpportunityIndexRepositoryFromEnv } from '@/lib/infrastructure/persistence/UpstashMarketOpportunityIndexRepository';
import { getRateLimitHeaders, rateLimitPublicApiRequest } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const inputSchema = z.object({
  careerVaultId: z.string().uuid('Career Vault identity must be an opaque UUID capability.'),
  opportunityAssessmentIds: z.array(z.string().min(1)).min(2).max(10),
});

/**
 * POST /api/opportunity-space
 *
 * M4B-07 preserves historical evidence readiness while adding current-market
 * lifecycle guards. CLOSED, STALE, or materially superseded market assessments
 * cannot remain top current priorities without a fresh source observation and,
 * when content changed, a fresh assessment.
 */
export async function POST(request: NextRequest) {
  try {
    const validation = inputSchema.safeParse(await request.json());
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Select between 2 and 10 durable opportunity assessments to build an Opportunity Space.',
          issues: validation.error.issues.map((issue) => ({
            fieldPath: issue.path.length > 0 ? issue.path.join('.') : 'request',
            message: issue.message,
          })),
        },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } },
      );
    }

    const { careerVaultId, opportunityAssessmentIds } = validation.data;
    if (new Set(opportunityAssessmentIds).size !== opportunityAssessmentIds.length) {
      return NextResponse.json(
        { success: false, error: 'Opportunity Space cannot contain duplicate assessments.' },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } },
      );
    }

    const rateLimitResult = await rateLimitPublicApiRequest(request.headers, 'opportunity-space');
    const rateLimitHeaders = getRateLimitHeaders(rateLimitResult);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Rate limit exceeded. Please rebuild the Opportunity Space later.',
          retryAfter: new Date(rateLimitResult.reset).toISOString(),
        },
        { status: 429, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
      );
    }

    const candidateProfileId = candidateProfileIdFromCareerVaultCapability(careerVaultId);

    let opportunityHistoryRepository;
    let targetRepository;
    let spaceRepository;
    let marketObservationRepository;
    let marketOpportunityIndexRepository;
    try {
      opportunityHistoryRepository = createOpportunityHistoryRepositoryFromEnv();
      targetRepository = createCareerTargetRepositoryFromEnv();
      spaceRepository = createOpportunitySpaceRepositoryFromEnv();
      marketObservationRepository = createMarketObservationHistoryRepositoryFromEnv();
      marketOpportunityIndexRepository = createMarketOpportunityIndexRepositoryFromEnv();
    } catch (storageError) {
      console.error('OpportunitySpace storage configuration error:', storageError);
      return NextResponse.json(
        {
          success: false,
          error: 'Durable Opportunity Space and market lifecycle storage are not configured. CV Engine will not emit a non-durable current ranking.',
          persistence: { status: 'UNAVAILABLE' },
        },
        { status: 503, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
      );
    }

    const [history, targetPortfolio] = await Promise.all([
      opportunityHistoryRepository.load(candidateProfileId),
      targetRepository.load(candidateProfileId),
    ]);
    if (!history || !targetPortfolio) {
      return NextResponse.json(
        { success: false, error: 'Opportunity Space requires durable opportunity history and an active Career Target.' },
        { status: 422, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
      );
    }

    validateOpportunityHistorySnapshot(history);
    validateCareerTargetPortfolio(targetPortfolio);
    const activeTarget = targetPortfolio.targets.find((target) => target.id === targetPortfolio.activeTargetId);
    if (!activeTarget) {
      return NextResponse.json(
        { success: false, error: 'The active Career Target could not be resolved.' },
        { status: 422, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
      );
    }

    const assessmentsById = new Map<string, PersistedOpportunityAssessment>(
      history.assessments.map((assessment) => [assessment.id, assessment]),
    );
    const jobSnapshotsById = new Map(history.jobSnapshots.map((snapshot) => [snapshot.id, snapshot]));
    const generatedAt = new Date().toISOString();
    const candidates = [];

    for (const assessmentId of opportunityAssessmentIds) {
      const assessmentRecord = assessmentsById.get(assessmentId);
      if (!assessmentRecord) throw new Error(`OpportunitySpace selection references unknown durable assessment: ${assessmentId}`);
      const evaluation = targetPortfolio.opportunityEvaluations.find((item) => (
        item.careerTargetId === activeTarget.id && item.opportunityAssessmentId === assessmentRecord.id
      ));
      if (!evaluation) throw new Error(`OpportunitySpace selection lacks active-target relevance for assessment: ${assessmentId}`);

      const jobSnapshot = jobSnapshotsById.get(assessmentRecord.jobSnapshotId);
      if (!jobSnapshot) throw new Error(`OpportunitySpace assessment references unknown JobSnapshot: ${assessmentRecord.jobSnapshotId}`);

      if (jobSnapshot.marketProvenance) {
        const lifecycleResult = await registerDurableMarketOpportunityLifecycle(
          jobSnapshot.marketProvenance.marketObservationId,
          {
            observationRepository: marketObservationRepository,
            opportunityIndexRepository: marketOpportunityIndexRepository,
            evaluatedAt: generatedAt,
          },
        );
        candidates.push({
          assessmentRecord,
          targetRelevance: evaluation.relevance,
          marketLifecycle: lifecycleResult.lifecycle,
          marketAssessmentObservationId: jobSnapshot.marketProvenance.marketObservationId,
        });
      } else {
        candidates.push({ assessmentRecord, targetRelevance: evaluation.relevance });
      }
    }

    const careerSnapshotId = candidates[0].assessmentRecord.careerSnapshotId;
    const space = buildOpportunitySpace({
      candidateProfileId,
      careerSnapshotId,
      careerTargetId: activeTarget.id,
      candidates,
      generatedAt,
    });
    const durableHistory = await persistOpportunitySpace(spaceRepository, space, generatedAt);

    return NextResponse.json(
      {
        success: true,
        data: {
          opportunitySpace: space,
          persistence: { status: 'DURABLE_OPPORTUNITY_SPACE', revision: durableHistory.revision },
          scopeBoundary: 'PRIORITY_DOES_NOT_CHANGE_JOB_MATCH_OR_CANDIDATE_EVIDENCE',
        },
      },
      { status: 200, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch (error) {
    console.error('OpportunitySpace error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error && error.message.startsWith('OpportunitySpace')
          ? error.message
          : 'Opportunity Space could not be completed safely.',
      },
      { status: 422, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  }
}

export async function GET() {
  return NextResponse.json({ success: false, error: 'Method not allowed' }, { status: 405 });
}
