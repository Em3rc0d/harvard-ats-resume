import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
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
import { evaluateProductResume } from '@/lib/application/product/ProductEvaluationService';
import { composeApprovedResumeVersion } from '@/lib/application/resume/ResumeCompositionService';
import { deriveCareerVaultIdentity } from '@/lib/application/career-vault/CareerVaultIdentity';
import {
  CareerVaultIntegrityError,
  persistCareerVault,
} from '@/lib/application/career-vault/CareerVaultService';
import { CareerVaultUnavailableError } from '@/lib/application/career-vault/CareerVaultRepository';
import { createCareerVaultRepositoryFromEnv } from '@/lib/infrastructure/persistence/UpstashCareerVaultRepository';
import {
  GEMINI_RESUME_CONTRACT_VERSION,
  GEMINI_RESUME_MODEL,
  GEMINI_RESUME_PROVIDER,
} from '@/lib/infrastructure/ai/GeminiResumeProvider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const resumeGenerationInputSchema = resumeRequestSchema.extend({
  sourceContext: resumeImportContextSchema.optional(),
  careerVaultId: z.string().uuid('Career Vault identity must be an opaque UUID capability.'),
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

    const { sourceContext, careerVaultId, ...resumeData } = validationResult.data;
    const sanitizedData = sanitizeResumeData(resumeData);
    const capturedAt = new Date().toISOString();
    const vaultIdentity = deriveCareerVaultIdentity(sanitizedData, careerVaultId, sourceContext);

    // G12 requires durable persistence. Unlike rate limiting, Career Vault must
    // never silently fall back to process memory because a successful response
    // is now a durability claim.
    let careerVaultRepository;
    try {
      careerVaultRepository = createCareerVaultRepositoryFromEnv();
    } catch (storageError) {
      if (storageError instanceof CareerVaultUnavailableError) {
        return NextResponse.json(
          {
            success: false,
            error: 'Career Vault storage is not configured. Resume generation is unavailable because ATS v2 cannot make a false durability claim.',
            persistence: { status: 'UNAVAILABLE' },
          },
          {
            status: 503,
            headers: {
              ...rateLimitHeaders,
              'Cache-Control': 'no-store, max-age=0',
            },
          }
        );
      }
      throw storageError;
    }

    const truthContext = buildLegacyTruthContext(sanitizedData, {
      projectionKey: vaultIdentity.candidateProjectionKey,
      candidateProfileId: vaultIdentity.candidateProfileId,
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

    const jobIntelligence = sanitizedData.jobDescription?.trim()
      ? analyzeJobDescription(sanitizedData.jobDescription, {
          projectionKey: vaultIdentity.jobProjectionKey!,
          capturedAt,
        })
      : undefined;

    const jobMatch = jobIntelligence && jobIntelligence.requirements.length > 0
      ? matchJobToCandidate(jobIntelligence, truthContext.assertions, {
          projectionKey: vaultIdentity.matchProjectionKey!,
          generatedAt: capturedAt,
        })
      : undefined;

    // Legacy keyword analysis is retained as a compatibility payload only. G13
    // no longer presents it as the primary product truth or "ATS compatibility".
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

    const assertionsById = new Map(truthContext.assertions.map((assertion) => [assertion.id, assertion]));
    const productEvaluation = evaluateProductResume(sanitizedData, geminiResult.formattedResume);

    const explainableJobMatch = jobMatch && jobIntelligence
      ? {
          score: jobMatch.score,
          language: jobIntelligence.language,
          breakdown: jobMatch.breakdown,
          requirements: jobMatch.requirements.map((requirement, index) => {
            const inference = jobMatch.report.matches[index];
            const assertionIds = inference?.assertionIds ?? [];
            return {
              id: requirement.id,
              statement: requirement.statement,
              kind: requirement.kind,
              necessity: requirement.necessity,
              canonicalConcept: requirement.canonicalConcept,
              minimumYears: requirement.minimumYears,
              status: inference?.status ?? 'UNKNOWN',
              rationale: inference?.rationale ?? 'No match inference available.',
              assertionIds,
              evidence: assertionIds
                .map((id) => assertionsById.get(id))
                .filter((assertion) => Boolean(assertion))
                .map((assertion) => ({
                  assertionId: assertion!.id,
                  statement: assertion!.statement,
                  truthClass: assertion!.truthClass,
                  sourceIds: assertion!.sourceIds,
                  evidenceIds: assertion!.evidenceIds,
                })),
            };
          }),
        }
      : undefined;

    const claimTraceability = resumeComposition.claims.map((claim) => ({
      claimId: claim.id,
      wording: claim.wording,
      assertionIds: claim.assertionIds,
      evidence: claim.assertionIds
        .map((id) => assertionsById.get(id))
        .filter((assertion) => Boolean(assertion))
        .map((assertion) => ({
          assertionId: assertion!.id,
          statement: assertion!.statement,
          truthClass: assertion!.truthClass,
          sourceIds: assertion!.sourceIds,
          evidenceIds: assertion!.evidenceIds,
        })),
    }));

    let careerVault;
    try {
      careerVault = await persistCareerVault({
        repository: careerVaultRepository,
        candidate: truthContext.candidateProfile,
        sources: truthContext.sources,
        evidence: truthContext.evidence,
        assertions: truthContext.assertions,
        jobIntelligence,
        jobMatch,
        resumeComposition,
        persistedAt: capturedAt,
      });
    } catch (persistenceError) {
      console.error('Career Vault persistence error:', persistenceError);
      const integrityFailure = persistenceError instanceof CareerVaultIntegrityError;
      return NextResponse.json(
        {
          success: false,
          error: integrityFailure
            ? 'ATS v2 refused to persist a Career Vault graph that failed provenance integrity validation.'
            : 'Career Vault storage could not durably commit and verify this resume version. No durability claim was emitted.',
          persistence: {
            status: integrityFailure ? 'INTEGRITY_REJECTED' : 'FAILED',
          },
        },
        {
          status: integrityFailure ? 500 : 503,
          headers: {
            ...rateLimitHeaders,
            'Cache-Control': 'no-store, max-age=0',
          },
        }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          formattedResume: geminiResult.formattedResume,
          productEvaluation,
          jobMatch: explainableJobMatch,
          claimTraceability,
          resumeVersion: resumeComposition.version,
          resumeManifest: resumeComposition.manifest,
          resumeClaims: resumeComposition.claims,
          resumePersistence: 'DURABLE_CAREER_VAULT',
          careerVault: {
            schemaVersion: careerVault.schemaVersion,
            candidateProfileId: careerVault.candidate.id,
            revision: careerVault.revision,
            createdAt: careerVault.createdAt,
            updatedAt: careerVault.updatedAt,
          },
          // Compatibility payload: intentionally not used as ATS v2 primary UX.
          atsScore: atsScoreResult.atsScore,
          matchedKeywords: atsScoreResult.matchedKeywords,
          missingKeywords: atsScoreResult.missingKeywords,
          suggestions: allSuggestions.slice(0, 10),
          legacyAnalysis: {
            status: 'LEGACY_COMPATIBILITY_ONLY',
            atsScore: atsScoreResult.atsScore,
            matchedKeywords: atsScoreResult.matchedKeywords,
            missingKeywords: atsScoreResult.missingKeywords,
          },
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
