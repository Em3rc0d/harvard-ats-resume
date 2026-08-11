import { NextRequest, NextResponse } from 'next/server';
import { resumeRequestSchema } from '@/lib/schemas';
import { resumeImportContextSchema } from '@/lib/application/import/ResumeImportProvider';
import { generateResumeWithGemini, sanitizeResumeData } from '@/lib/gemini';
import { extractKeywords, calculateATSScore, generateSuggestions } from '@/lib/ats-scoring';
import { rateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { buildLegacyTruthContext } from '@/lib/application/legacy/LegacyResumeAdapter';
import { validateGeneratedResumeGrounding } from '@/lib/application/grounding/GroundingValidator';
import { analyzeJobDescription } from '@/lib/application/job/JobIntelligenceEngine';
import { matchJobToCandidate } from '@/lib/application/matching/JobMatchEngine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const resumeGenerationInputSchema = resumeRequestSchema.extend({
  sourceContext: resumeImportContextSchema.optional(),
});

/**
 * POST /api/generate-resume
 *
 * Main endpoint for generating ATS-optimized Harvard-style resumes.
 * Import provenance is accepted separately from candidate facts and is never
 * forwarded to the LLM or treated as Job Description content.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      'unknown';

    const rateLimitResult = await rateLimit(ip, 50, 60 * 60 * 1000);
    const rateLimitHeaders = getRateLimitHeaders(rateLimitResult);

    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Rate limit exceeded. You can generate 50 resumes per hour. Please try again later.',
          retryAfter: new Date(rateLimitResult.reset).toISOString(),
        },
        {
          status: 429,
          headers: rateLimitHeaders,
        }
      );
    }

    const body = await request.json();
    const validationResult = resumeGenerationInputSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid input data',
          details: validationResult.error.errors,
        },
        {
          status: 400,
          headers: rateLimitHeaders,
        }
      );
    }

    const { sourceContext, ...resumeData } = validationResult.data;
    const sanitizedData = sanitizeResumeData(resumeData);
    const requestProjectionKey = `request:${Date.now()}`;
    const capturedAt = new Date().toISOString();

    // ATS v2 candidate-truth boundary. Job requirements are structurally
    // excluded from evidence/claims. Imported source provenance is consumed
    // only by the truth projection and is never sent to Gemini.
    const truthContext = buildLegacyTruthContext(sanitizedData, {
      projectionKey: requestProjectionKey,
      capturedAt,
      truthClass: 'CANDIDATE_ASSERTED',
      sourceContext,
    });

    if (truthContext.claims.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No evidence-backed resume claims could be created from the supplied candidate data.',
        },
        {
          status: 400,
          headers: rateLimitHeaders,
        }
      );
    }

    // Job truth is analyzed independently from candidate truth. The matching
    // engine can only connect existing JobRequirements to CareerAssertions.
    const jobIntelligence = sanitizedData.jobDescription?.trim()
      ? analyzeJobDescription(sanitizedData.jobDescription, {
          projectionKey: requestProjectionKey,
          capturedAt,
        })
      : undefined;

    const jobMatch = jobIntelligence && jobIntelligence.requirements.length > 0
      ? matchJobToCandidate(jobIntelligence, truthContext.assertions, {
          projectionKey: requestProjectionKey,
          generatedAt: capturedAt,
        })
      : undefined;

    // Legacy keyword analysis remains temporarily for UI compatibility while
    // JobMatch v2 is exposed as a separate explainable report.
    const jobKeywords = sanitizedData.jobDescription
      ? extractKeywords(sanitizedData.jobDescription)
      : [];

    const geminiResult = await generateResumeWithGemini(sanitizedData);

    if (!geminiResult.success || !geminiResult.formattedResume) {
      return NextResponse.json(
        {
          success: false,
          error: geminiResult.error || 'Failed to generate resume',
        },
        {
          status: 500,
          headers: rateLimitHeaders,
        }
      );
    }

    const groundingReport = validateGeneratedResumeGrounding(
      sanitizedData,
      geminiResult.formattedResume,
    );

    if (groundingReport.status !== 'APPROVED') {
      const confirmationDetail = groundingReport.factsToConfirm.length > 0
        ? ` Review these proposed facts and add them to the form only if true: ${groundingReport.factsToConfirm.join(', ')}.`
        : '';
      const errorMessage = groundingReport.status === 'REJECTED'
        ? 'ATS v2 blocked candidate facts that were supported only by the job description. Edit your candidate data only if those facts are genuinely yours, then generate again.'
        : `ATS v2 found generated facts that are not yet supported by your candidate data.${confirmationDetail}`;

      return NextResponse.json(
        {
          success: false,
          error: errorMessage,
          grounding: groundingReport,
        },
        {
          status: 422,
          headers: {
            ...rateLimitHeaders,
            'Cache-Control': 'no-store, max-age=0',
          },
        }
      );
    }

    const allSkills = [
      ...sanitizedData.skills.hardSkills,
      ...sanitizedData.skills.softSkills,
    ];

    const atsScoreResult = calculateATSScore(
      jobKeywords,
      geminiResult.formattedResume,
      allSkills
    );

    const suggestions = generateSuggestions(
      atsScoreResult.atsScore,
      atsScoreResult.missingKeywords,
      sanitizedData.experience
    );

    const allSuggestions = [
      ...suggestions,
      ...(geminiResult.suggestions || []),
    ];

    const explainableJobMatch = jobMatch && jobIntelligence
      ? {
          score: jobMatch.score,
          language: jobIntelligence.language,
          breakdown: jobMatch.breakdown,
          requirements: jobMatch.requirements.map((requirement, index) => ({
            id: requirement.id,
            statement: requirement.statement,
            kind: requirement.kind,
            necessity: requirement.necessity,
            canonicalConcept: requirement.canonicalConcept,
            minimumYears: requirement.minimumYears,
            status: jobMatch.report.matches[index]?.status ?? 'UNKNOWN',
            rationale: jobMatch.report.matches[index]?.rationale ?? 'No match inference available.',
            assertionIds: jobMatch.report.matches[index]?.assertionIds ?? [],
          })),
        }
      : undefined;

    return NextResponse.json(
      {
        success: true,
        data: {
          formattedResume: geminiResult.formattedResume,
          atsScore: atsScoreResult.atsScore,
          matchedKeywords: atsScoreResult.matchedKeywords,
          missingKeywords: atsScoreResult.missingKeywords,
          suggestions: allSuggestions.slice(0, 10),
          jobMatch: explainableJobMatch,
        },
      },
      {
        status: 200,
        headers: {
          ...rateLimitHeaders,
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );

  } catch (error) {
    console.error('API Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'An unexpected error occurred. Please try again.',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { success: false, error: 'Method not allowed' },
    { status: 405 }
  );
}

export async function PUT() {
  return NextResponse.json(
    { success: false, error: 'Method not allowed' },
    { status: 405 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { success: false, error: 'Method not allowed' },
    { status: 405 }
  );
}
