import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resumeRequestSchema } from '@/lib/schemas';
import { resumeImportContextSchema } from '@/lib/application/import/ResumeImportProvider';
import { generationValidationIssues } from '@/lib/application/product/GenerationReadiness';
import { generateResumeWithAI, sanitizeResumeData } from '@/lib/local-ai';
import { extractKeywords, calculateATSScore } from '@/lib/ats-scoring';
import { rateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { buildLegacyTruthContext } from '@/lib/application/legacy/LegacyResumeAdapter';
import { validateGeneratedResumeGrounding } from '@/lib/application/grounding/GroundingValidator';
import { evaluateGeneratedResumeSemanticGrounding } from '@/lib/application/grounding/SemanticEntailmentEvaluator';
import { analyzeJobDescription } from '@/lib/application/job/JobIntelligenceEngine';
import { matchJobToCandidate } from '@/lib/application/matching/JobMatchEngine';
import { evaluateProductResume } from '@/lib/application/product/ProductEvaluationService';
import { deriveTrustedAdvice } from '@/lib/application/product/TrustedAdviceService';
import { composeApprovedResumeVersion } from '@/lib/application/resume/ResumeCompositionService';
import { deriveCareerVaultIdentity } from '@/lib/application/career-vault/CareerVaultIdentity';
import {
  CareerVaultIntegrityError,
  persistCareerVault,
} from '@/lib/application/career-vault/CareerVaultService';
import { createCareerVaultRepository } from '@/lib/infrastructure/persistence/UpstashCareerVaultRepository';
import {
  createDurableRedisRuntimeFromEnv,
  DurablePersistenceUnavailableError,
} from '@/lib/infrastructure/persistence/DurableRedisRuntime';
import {
  aiProviderFailureHttpStatus,
  aiProviderFailureMessage,
} from '@/lib/application/ai/AIProviderFailure';
import {
  OLLAMA_RESUME_CONTRACT_VERSION,
  OLLAMA_RESUME_MODEL,
  OLLAMA_RESUME_PROVIDER,
} from '@/lib/infrastructure/ai/OllamaResumeProvider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const resumeGenerationInputSchema = resumeRequestSchema.extend({
  sourceContext: resumeImportContextSchema.optional(),
  careerVaultId: z.string().uuid('Career Vault identity must be an opaque UUID capability.'),
});

/**
 * POST /api/generate-resume
 *
 * Main endpoint for generating evidence-bound resumes. Local model output is
 * always an untrusted proposal: grounding, semantic grounding, claim
 * traceability, and Career Vault integrity remain the authorities that decide
 * whether a trusted ResumeVersion can be emitted.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validationResult = resumeGenerationInputSchema.safeParse(body);

    if (!validationResult.success) {
      const issues = generationValidationIssues(validationResult.error.issues);
      console.warn(
        'Resume generation input rejected:',
        issues.map((issue) => `${issue.fieldPath}: ${issue.message}`),
      );
      const summary = issues
        .slice(0, 5)
        .map((issue) => `${issue.fieldPath} — ${issue.message}`)
        .join('; ');

      return NextResponse.json(
        {
          success: false,
          error: summary
            ? `Review required before generation: ${summary}`
            : 'Review required before generation because the request is incomplete.',
          inputValidation: {
            status: 'REVIEW_REQUIRED',
            issues,
          },
        },
        {
          status: 400,
          headers: { 'Cache-Control': 'no-store, max-age=0' },
        },
      );
    }

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
        { status: 429, headers: rateLimitHeaders },
      );
    }

    const { sourceContext, careerVaultId, ...resumeData } = validationResult.data;
    const sanitizedData = sanitizeResumeData(resumeData);
    const capturedAt = new Date().toISOString();
    const vaultIdentity = deriveCareerVaultIdentity(sanitizedData, careerVaultId, sourceContext);

    let careerVaultRepository;
    try {
      const durableRuntime = createDurableRedisRuntimeFromEnv();
      await durableRuntime.assertReady();
      careerVaultRepository = createCareerVaultRepository(durableRuntime.redis);
    } catch (storageError) {
      if (storageError instanceof DurablePersistenceUnavailableError) {
        console.error('Durable persistence preflight failed for resume generation:', {
          reason: storageError.reason,
        });
        return NextResponse.json(
          {
            success: false,
            error: 'Durable storage is temporarily unavailable. Resume generation was not started because CV Engine cannot make a false persistence claim.',
            persistence: {
              status: 'UNAVAILABLE',
              stage: 'PREFLIGHT',
              reason: storageError.reason,
              retryable: storageError.reason === 'BACKEND_UNAVAILABLE',
            },
          },
          {
            status: 503,
            headers: {
              ...rateLimitHeaders,
              'Cache-Control': 'no-store, max-age=0',
            },
          },
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
        { status: 400, headers: rateLimitHeaders },
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

    const jobKeywords = sanitizedData.jobDescription?.trim()
      ? extractKeywords(sanitizedData.jobDescription)
      : [];

    const localAIResult = await generateResumeWithAI(sanitizedData);

    if (!localAIResult.success || !localAIResult.formattedResume) {
      if (localAIResult.providerFailure) {
        const providerFailure = localAIResult.providerFailure;
        return NextResponse.json(
          {
            success: false,
            error: aiProviderFailureMessage(providerFailure, 'resume generation'),
            provider: providerFailure.toView(),
          },
          {
            status: aiProviderFailureHttpStatus(providerFailure),
            headers: {
              ...rateLimitHeaders,
              'Cache-Control': 'no-store, max-age=0',
            },
          },
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: localAIResult.error || 'Failed to generate resume',
        },
        { status: 500, headers: rateLimitHeaders },
      );
    }

    const groundingReport = validateGeneratedResumeGrounding(
      sanitizedData,
      localAIResult.formattedResume,
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
        },
      );
    }

    const semanticGroundingReport = evaluateGeneratedResumeSemanticGrounding(
      localAIResult.formattedResume,
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
        },
      );
    }

    let resumeComposition;
    try {
      resumeComposition = composeApprovedResumeVersion({
        formattedResume: localAIResult.formattedResume,
        candidateProfileId: truthContext.candidateProfile.id,
        assertions: truthContext.assertions,
        targetedJobDescriptionId: jobIntelligence?.jobDescription.id,
        targetJobDescription: jobIntelligence?.jobDescription.sourceText,
        matchReportId: jobMatch?.report.id,
        generation: {
          provider: OLLAMA_RESUME_PROVIDER,
          model: OLLAMA_RESUME_MODEL,
          contractVersion: OLLAMA_RESUME_CONTRACT_VERSION,
        },
        createdAt: capturedAt,
      });
    } catch (compositionError) {
      console.error('Resume composition traceability error:', compositionError);
      return NextResponse.json(
        {
          success: false,
          error: 'ATS v2 approved the generated wording but could not establish complete claim provenance. No resume version was emitted.',
          composition: { status: 'UNTRACEABLE' },
        },
        {
          status: 422,
          headers: {
            ...rateLimitHeaders,
            'Cache-Control': 'no-store, max-age=0',
          },
        },
      );
    }

    const allSkills = [
      ...sanitizedData.skills.hardSkills,
      ...sanitizedData.skills.softSkills,
    ];

    const atsScoreResult = calculateATSScore(
      jobKeywords,
      localAIResult.formattedResume,
      allSkills,
    );

    const assertionsById = new Map(truthContext.assertions.map((assertion) => [assertion.id, assertion]));
    const productEvaluation = evaluateProductResume(sanitizedData, localAIResult.formattedResume);

    const adviceJobMatch = jobMatch
      ? {
          score: jobMatch.score,
          requirements: jobMatch.requirements.map((requirement, index) => ({
            statement: requirement.statement,
            necessity: requirement.necessity,
            status: jobMatch.report.matches[index]?.status ?? 'UNKNOWN',
          })),
        }
      : undefined;

    const trustedAdvice = deriveTrustedAdvice(sanitizedData, productEvaluation, {
      now: new Date(capturedAt),
      jobMatch: adviceJobMatch,
    });

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
            stage: 'COMMIT_VERIFY',
          },
        },
        {
          status: integrityFailure ? 500 : 503,
          headers: {
            ...rateLimitHeaders,
            'Cache-Control': 'no-store, max-age=0',
          },
        },
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          formattedResume: localAIResult.formattedResume,
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
          trustedAdvice,
          suggestions: trustedAdvice.slice(0, 10).map((advice) => advice.message),
          atsScore: atsScoreResult.atsScore,
          matchedKeywords: atsScoreResult.matchedKeywords,
          missingKeywords: atsScoreResult.missingKeywords,
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
      },
    );
  } catch (error) {
    console.error('API Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'An unexpected error occurred. Please try again.',
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { success: false, error: 'Method not allowed' },
    { status: 405 },
  );
}

export async function PUT() {
  return NextResponse.json(
    { success: false, error: 'Method not allowed' },
    { status: 405 },
  );
}

export async function DELETE() {
  return NextResponse.json(
    { success: false, error: 'Method not allowed' },
    { status: 405 },
  );
}
