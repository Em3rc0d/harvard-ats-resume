import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resumeRequestSchema } from '@/lib/schemas';
import { sanitizeResumeData } from '@/lib/gemini';
import { buildLegacyTruthContext } from '@/lib/application/legacy/LegacyResumeAdapter';
import { analyzeJobDescription } from '@/lib/application/job/JobIntelligenceEngine';
import { matchJobToCandidate } from '@/lib/application/matching/JobMatchEngine';
import { toExplainableJobMatch } from '@/lib/application/product/ExplainableJobMatchMapper';
import { assessOpportunity } from '@/lib/application/opportunity/OpportunityAssessment';
import { deriveCareerVaultIdentity } from '@/lib/application/career-vault/CareerVaultIdentity';
import {
  buildOpportunityHistoryArtifacts,
  OpportunityHistoryIntegrityError,
  OpportunityHistoryUnavailableError,
  persistOpportunityAssessmentHistory,
} from '@/lib/application/opportunity/OpportunityHistory';
import { createOpportunityHistoryRepositoryFromEnv } from '@/lib/infrastructure/persistence/UpstashOpportunityHistoryRepository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const opportunityAssessmentInputSchema = resumeRequestSchema.extend({
  careerVaultId: z.string().uuid('Career Vault identity must be an opaque UUID capability.'),
});

/**
 * POST /api/assess-opportunity
 *
 * Market v0.1 Application Intelligence boundary. It compares one immutable
 * CareerSnapshot with one immutable JobSnapshot before any generative resume
 * work runs, then durably records the derived assessment. Job requirements stay
 * market truth and never become candidate evidence.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = opportunityAssessmentInputSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Career data must be complete enough for a trustworthy opportunity assessment.',
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

    const { careerVaultId, ...resumeData } = validation.data;
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

    const capturedAt = new Date().toISOString();
    const vaultIdentity = deriveCareerVaultIdentity(data, careerVaultId);
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
          headers: { 'Cache-Control': 'no-store, max-age=0' },
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
          headers: { 'Cache-Control': 'no-store, max-age=0' },
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

    let historyRepository;
    try {
      historyRepository = createOpportunityHistoryRepositoryFromEnv();
    } catch (storageError) {
      if (storageError instanceof OpportunityHistoryUnavailableError) {
        return NextResponse.json(
          {
            success: false,
            error: 'Opportunity history storage is not configured. CV Engine will not claim a durable assessment without durable storage.',
            persistence: { status: 'UNAVAILABLE' },
          },
          {
            status: 503,
            headers: { 'Cache-Control': 'no-store, max-age=0' },
          },
        );
      }
      throw storageError;
    }

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
          },
        },
        {
          status: integrityFailure ? 500 : 503,
          headers: { 'Cache-Control': 'no-store, max-age=0' },
        },
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          assessment,
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
        headers: { 'Cache-Control': 'no-store, max-age=0' },
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
