import { NextRequest, NextResponse } from 'next/server';
import { resumeRequestSchema } from '@/lib/schemas';
import { generateResumeWithGemini, sanitizeResumeData } from '@/lib/gemini';
import { extractKeywords, calculateATSScore, generateSuggestions } from '@/lib/ats-scoring';
import { rateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { buildLegacyTruthContext } from '@/lib/application/legacy/LegacyResumeAdapter';
import { validateGeneratedResumeGrounding } from '@/lib/application/grounding/GroundingValidator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/generate-resume
 *
 * Main endpoint for generating ATS-optimized Harvard-style resumes
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
          error: 'Rate limit exceeded. You can generate 5 resumes per hour. Please try again later.',
          retryAfter: new Date(rateLimitResult.reset).toISOString(),
        },
        {
          status: 429,
          headers: rateLimitHeaders,
        }
      );
    }

    const body = await request.json();
    const validationResult = resumeRequestSchema.safeParse(body);

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

    const data = validationResult.data;
    const sanitizedData = sanitizeResumeData(data);

    // ATS v2 candidate-truth boundary. Job requirements are structurally
    // excluded from evidence/claims by LegacyResumeAdapter.
    const truthContext = buildLegacyTruthContext(sanitizedData, {
      projectionKey: `request:${Date.now()}`,
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

    const jobKeywords = data.jobDescription
      ? extractKeywords(data.jobDescription)
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

    // ATS v2 grounding gate: probabilistic output is a proposal until this
    // deterministic hard-fact validation approves it.
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
      ...data.skills.hardSkills,
      ...data.skills.softSkills,
    ];

    const atsScoreResult = calculateATSScore(
      jobKeywords,
      geminiResult.formattedResume,
      allSkills
    );

    const suggestions = generateSuggestions(
      atsScoreResult.atsScore,
      atsScoreResult.missingKeywords,
      data.experience
    );

    const allSuggestions = [
      ...suggestions,
      ...(geminiResult.suggestions || []),
    ];

    return NextResponse.json(
      {
        success: true,
        data: {
          formattedResume: geminiResult.formattedResume,
          atsScore: atsScoreResult.atsScore,
          matchedKeywords: atsScoreResult.matchedKeywords,
          missingKeywords: atsScoreResult.missingKeywords,
          suggestions: allSuggestions.slice(0, 10),
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