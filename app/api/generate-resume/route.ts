import { NextRequest, NextResponse } from 'next/server';
import { resumeRequestSchema } from '@/lib/schemas';
import { resumeImportContextSchema } from '@/lib/application/import/ResumeImportProvider';
import { generateResumeWithGemini, sanitizeResumeData } from '@/lib/gemini';
import { extractKeywords, calculateATSScore, generateSuggestions } from '@/lib/ats-scoring';
import { rateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { buildLegacyTruthContext } from '@/lib/application/legacy/LegacyResumeAdapter';
import { validateGeneratedResumeGrounding } from '@/lib/application/grounding/GroundingValidator';
import { evaluateGeneratedResumeSemanticGrounding } from '@/lib/application/grounding/SemanticEntailmentEvaluator';
import { analyzeJobDescription } from '@/lib/application/job/JobIntelligenceEngine';
import { matchJobToCandidate } from '@/lib/application/matching/JobMatchEngine';
import { composeApprovedResumeVersion } from '@/lib/application/resume/ResumeCompositionService';
import {
  GEMINI_RESUME_CONTRACT_VERSION,
  GEMINI_RESUME_MODEL,
  GEMINI_RESUME_PROVIDER,
} from '@/lib/infrastructure/ai/GeminiResumeProvider';

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

    // Layer 1: deterministic factual blockers. These remain authoritative and
    // can never be overridden by semantic evaluation.
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

    // Layer 2: conservative semantic drift evaluation. It checks high-risk
    // responsibility/scope wording against candidate assertions only. Job
    // requirements are never accepted as evidence for candidate claims.
    const semanticGroundingReport = evaluateGeneratedResumeSemanticGrounding(
      geminiResult.formattedResume,
      truthContext.assertions,
    );

    if (semanticGroundingReport.status !== 'APPROVED') {
      const proposedClaims = semanticGroundingReport.issues
        .map((issue) => issue.generatedClaim)
        .filter((claim, index, claims) => claims.indexOf(claim) === index)
        .slice(0, 5);
      const confirmationDetail = proposedClaims.length > 0
        ? ` Review these stronger claims and confirm the underlying responsibility/scope in your candidate data if true: ${proposedClaims.join(' | ')}.`
        : '';

      return NextResponse.json(
        {
          success: false,
          error: `ATS v2 detected generated wording that may overstate the candidate evidence.${confirmationDetail}`,
          semanticGrounding: semanticGroundingReport,
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

    // Layer 3: runtime materialization. Only output that passed both grounding
    // gates may become a ResumeVersion. Every material generated claim must be
    // linked back to existing candidate assertions through a complete manifest.
    let resumeComposition;
    try {
      resumeComposition = composeApprovedResumeVersion({
        formattedResume: geminiResult.formattedResume,
        candidateProfileId: truthContext.candidateProfile.id,
        assertions: truthContext.assertions,
        targetedJobDescriptionId: jobIntelligence?.jobDescription.id,
        targetJobDescription: jobIntelligence?.jobDescription.sourceText,
        matchReportId: jobMatch?.report.id,
        generation: {
          provider: GEMINI_RESUME_PROVIDER,
          model: GEMINI_RESUME_MODEL,
          contractVersion: GEMINI_RESUME_CONTRACT_VERSION,
        },
        createdAt: capturedAt,
      });
    } catch (compositionError) {
      console.error('Resume composition traceability error:', compositionError);
      return NextResponse.json(
        {
          success: false,
          error: 'ATS v2 approved the generated wording but could not establish complete claim provenance. No resume version was emitted.',
          composition: {
            status: 'UNTRACEABLE',
          },
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
          resumeVersion: resumeComposition.version,
          resumeManifest: resumeComposition.manifest,
          resumeClaims: resumeComposition.claims,
          resumePersistence: resumeComposition.persistence,
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
