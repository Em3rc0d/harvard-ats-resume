import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedSupabaseContext } from "../../../../../../application/auth/requireAuthenticatedUser";
import {
  executeAICapability,
  getAIExecutionBudget,
  type SafeAIEvent,
} from "../../../../../../application/ai/AIGatewayRuntime";
import { buildProviderAttemptPlan } from "../../../../../../application/ai/AIGatewayFoundation";
import {
  assertProviderEconomicsWithinPolicy,
  geminiActualPaidCostUsd,
} from "../../../../../../application/ai/AIProviderEconomics";
import { listCurrentCareerEvidence } from "../../../../../../application/career/CareerEvidenceRepository";
import {
  DEFAULT_PRESENTATION_OBJECTIVE,
  PresentationObjectiveSchema,
  proposePresentationRevision,
} from "../../../../../../application/presentation/PresentationProposalService";
import {
  listPresentationRevisions,
  recordPresentationProposal,
} from "../../../../../../application/presentation/PresentationRevisionRepository";
import {
  AIAccessModeSchema,
  type AIAccessMode,
} from "../../../../../../domain/ai/AIAccess";
import {
  AIRequestPolicyError,
  resolveAIRequestCredential,
} from "../../../../../../application/ai/RequestScopedAIConfig";
import { CURRENT_TRUST_DISCLOSURE_VERSION } from "../../../../../../domain/trust/FirstRunTrust";

const EvidenceIdSchema = z.string().uuid();
const ProposalInputSchema = z.object({
  objective: PresentationObjectiveSchema.optional(),
}).strict();

type RouteContext = { params: Promise<{ evidenceId: string }> };

function safeLogger(event: SafeAIEvent) {
  console.info("CV_ENGINE_AI_EVENT", JSON.stringify(event));
}

function providerStatus(failureCode: string) {
  if (failureCode === "INPUT_BUDGET_EXCEEDED") return 413;
  if (failureCode === "PROVIDER_RATE_LIMITED") return 429;
  return 503;
}

function actualPaidCostUsd(
  attempts: readonly {
    provider: string;
    model: string;
    inputTokens: number | null;
    outputTokens: number | null;
  }[],
) {
  return attempts.reduce((total, attempt) => {
    if (attempt.provider !== "GEMINI" || attempt.credentialMode !== "PLATFORM") return total;
    const estimate = geminiActualPaidCostUsd(
      attempt.model,
      attempt.inputTokens,
      attempt.outputTokens,
    );
    return estimate === null ? total : total + estimate;
  }, 0);
}

async function loadAIAccessMode(
  client: Awaited<ReturnType<typeof requireAuthenticatedSupabaseContext>>["client"],
  ownerUserId: string,
) {
  const consent = await client
    .from("consent_receipts")
    .select("ai_access_mode_preference, acknowledged_at")
    .eq("owner_user_id", ownerUserId)
    .eq("disclosure_version", CURRENT_TRUST_DISCLOSURE_VERSION)
    .order("acknowledged_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (consent.error) throw new Error("AI_CONSENT_READ_FAILED");
  return AIAccessModeSchema.safeParse(
    consent.data?.ai_access_mode_preference,
  );
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { evidenceId: rawEvidenceId } = await params;
  const evidenceId = EvidenceIdSchema.safeParse(rawEvidenceId);
  if (!evidenceId.success) {
    return NextResponse.json(
      { error: "INVALID_PRESENTATION_EVIDENCE_ID" },
      { status: 400 },
    );
  }

  try {
    const { user, client } = await requireAuthenticatedSupabaseContext();
    const revisions = await listPresentationRevisions(
      client,
      user.userId,
      evidenceId.data,
    );
    return NextResponse.json(
      { revisions },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "PRESENTATION_PROPOSAL_LIST_FAILED" },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  const { evidenceId: rawEvidenceId } = await params;
  const evidenceId = EvidenceIdSchema.safeParse(rawEvidenceId);
  const body = await request.json().catch(() => ({}));
  const input = ProposalInputSchema.safeParse(body);

  if (!evidenceId.success || !input.success) {
    return NextResponse.json(
      { error: "INVALID_PRESENTATION_PROPOSAL_INPUT" },
      { status: 400 },
    );
  }

  try {
    const { user, client } = await requireAuthenticatedSupabaseContext();
    const evidence = (await listCurrentCareerEvidence(client, user.userId))
      .find((item) => item.id === evidenceId.data);

    if (!evidence) {
      return NextResponse.json(
        { error: "CAREER_EVIDENCE_NOT_FOUND" },
        { status: 404 },
      );
    }
    if (evidence.verificationStatus !== "VERIFIED") {
      return NextResponse.json(
        { error: "PRESENTATION_REQUIRES_VERIFIED_EVIDENCE" },
        { status: 409 },
      );
    }

    const accessModeResult = await loadAIAccessMode(client, user.userId);
    if (!accessModeResult.success) {
      return NextResponse.json(
        { error: "AI_ACCESS_MODE_NOT_CONFIGURED" },
        { status: 409 },
      );
    }
    const accessMode = accessModeResult.data;
    if (accessMode === "NO_CLOUD_AI") {
      return NextResponse.json(
        { error: "PRESENTATION_AI_NOT_ENABLED" },
        { status: 409 },
      );
    }

    let resolved;
    try {
      resolved = resolveAIRequestCredential(request, accessMode);
    } catch (error) {
      const code = error instanceof AIRequestPolicyError
        ? error.code
        : "AI_ACCESS_REQUEST_INVALID";
      return NextResponse.json(
        { error: code },
        { status: code === "PLATFORM_AI_NOT_ENTITLED" ? 403 : 400 },
      );
    }

    const credentialMode = resolved.credentialMode;
    const budget = getAIExecutionBudget("INLINE_WORDING_OPTIMIZATION");
    const plannedAttempts = buildProviderAttemptPlan(
      "INLINE_WORDING_OPTIMIZATION",
      credentialMode,
      resolved.byokProvider,
    );

    let economics;
    try {
      economics = assertProviderEconomicsWithinPolicy(
        "INLINE_WORDING_OPTIMIZATION",
        plannedAttempts,
        budget,
      );
    } catch (error) {
      const code = error instanceof Error
        ? error.message
        : "AI_ECONOMICS_POLICY_FAILED";
      return NextResponse.json(
        { error: "AI_ASSIST_UNAVAILABLE", failureCode: code },
        {
          status: 503,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }

    const production = process.env.NODE_ENV === "production";
    const ollamaBaseUrl =
      process.env.OLLAMA_BASE_URL?.trim()
      || (production ? "http://127.0.0.1:9" : "http://127.0.0.1:11434");

    const outcome = await proposePresentationRevision(
      {
        evidence,
        objective: input.data.objective ?? DEFAULT_PRESENTATION_OBJECTIVE,
        credentialMode,
      },
      {
        executeAI: (aiInput) => executeAICapability(aiInput, {
          platformGeminiKey: process.env.GEMINI_API_KEY?.trim() || null,
          byokGeminiKey: resolved.byokGeminiKey,
          byokProvider: resolved.byokProvider,
          byokProviderKey: resolved.byokProviderKey,
          byokModelOverride: resolved.byokModelOverride,
          geminiBaseUrl: resolved.geminiBaseUrl,
          openaiBaseUrl: resolved.openaiBaseUrl,
          anthropicBaseUrl: resolved.anthropicBaseUrl,
          ollamaBaseUrl,
          ollamaApiKey: process.env.OLLAMA_API_KEY?.trim() || null,
          logger: safeLogger,
        }),
        record: (recordInput) =>
          recordPresentationProposal(client, user.userId, recordInput),
      },
    );

    if (!outcome.ok) {
      if (outcome.kind === "EVIDENCE_NOT_VERIFIED") {
        return NextResponse.json(
          { error: "PRESENTATION_REQUIRES_VERIFIED_EVIDENCE" },
          { status: 409 },
        );
      }

      if (outcome.kind === "AI_FAILURE") {
        return NextResponse.json(
          {
            error: "AI_ASSIST_UNAVAILABLE",
            failureCode: outcome.ai.failureCode,
            requestId: outcome.ai.requestId,
            attempts: outcome.ai.attempts,
            economics,
          },
          {
            status: providerStatus(outcome.ai.failureCode),
            headers: { "Cache-Control": "private, no-store" },
          },
        );
      }

      if (outcome.kind === "INVALID_AI_PROVENANCE") {
        return NextResponse.json(
          {
            error: "PRESENTATION_AI_PROVENANCE_INVALID",
            requestId: outcome.ai.requestId,
          },
          {
            status: 502,
            headers: { "Cache-Control": "private, no-store" },
          },
        );
      }

      return NextResponse.json(
        {
          error: "PRESENTATION_PROPOSAL_REJECTED",
          validation: outcome.validation,
          requestId: outcome.ai.requestId,
          provenance: outcome.ai.provenance,
          attempts: outcome.ai.attempts,
          economics: {
            ...economics,
            estimatedPaidCostUsd: actualPaidCostUsd(outcome.ai.attempts),
          },
        },
        {
          status: 422,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }

    return NextResponse.json(
      {
        revision: outcome.revision,
        validation: outcome.validation,
        requestId: outcome.ai.requestId,
        provenance: outcome.ai.provenance,
        attempts: outcome.ai.attempts,
        economics: {
          ...economics,
          estimatedPaidCostUsd: actualPaidCostUsd(outcome.ai.attempts),
        },
      },
      {
        status: 201,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "PRESENTATION_PROPOSAL_INTERNAL_FAILURE" },
      {
        status: 500,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
