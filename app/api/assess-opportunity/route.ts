import { NextRequest, NextResponse } from 'next/server';
import { resumeRequestSchema } from '@/lib/schemas';
import { sanitizeResumeData } from '@/lib/gemini';
import { buildLegacyTruthContext } from '@/lib/application/legacy/LegacyResumeAdapter';
import { analyzeJobDescription } from '@/lib/application/job/JobIntelligenceEngine';
import { matchJobToCandidate } from '@/lib/application/matching/JobMatchEngine';
import { toExplainableJobMatch } from '@/lib/application/product/ExplainableJobMatchMapper';
import { assessOpportunity } from '@/lib/application/opportunity/OpportunityAssessment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/assess-opportunity
 *
 * Market v0.1 Application Intelligence boundary. It compares established
 * candidate truth with one target job before any generative resume work runs.
 * The endpoint is deterministic and does not call the resume LLM or persist a
 * ResumeVersion.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = resumeRequestSchema.safeParse(body);

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

    const data = sanitizeResumeData(validation.data);
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
    const truthContext = buildLegacyTruthContext(data, {
      projectionKey: 'opportunity-assessment-candidate',
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
      projectionKey: 'opportunity-assessment-job',
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
      projectionKey: 'opportunity-assessment-match',
      generatedAt: capturedAt,
    });
    const explainableJobMatch = toExplainableJobMatch(
      jobMatch,
      jobIntelligence,
      truthContext.assertions,
    );
    const assessment = assessOpportunity(explainableJobMatch);

    return NextResponse.json(
      {
        success: true,
        data: { assessment },
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
