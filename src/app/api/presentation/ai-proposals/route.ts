import { NextResponse } from "next/server";
import { requireAuthenticatedSupabaseContext } from "../../../../application/auth/requireAuthenticatedUser";
import {
  createAIPresentationProposal,
  CreateAIPresentationProposalInputSchema,
} from "../../../../application/presentation/AIPresentationProposalService";
import { getAIExecutionBudget, type SafeAIEvent } from "../../../../application/ai/AIGatewayRuntime";
import { buildProviderAttemptPlan } from "../../../../application/ai/AIGatewayFoundation";
import { assertProviderEconomicsWithinPolicy } from "../../../../application/ai/AIProviderEconomics";
import { GeminiCredentialInputSchema, type AIAccessMode } from "../../../../domain/ai/AIAccess";
import type { CredentialMode } from "../../../../domain/ai/AICapability";
import { CURRENT_TRUST_DISCLOSURE_VERSION } from "../../../../domain/trust/FirstRunTrust";
import { createSupabaseAdminClient } from "../../../../infrastructure/supabase/admin";

function credentialModeForAccess(mode: AIAccessMode): CredentialMode {
  if (mode === "PLATFORM_GEMINI") return "PLATFORM_KEY";
  if (mode === "BYOK_GEMINI") return "BYOK_REQUEST_SCOPED";
  return "NO_CLOUD_AI";
}

function safeLogger(event: SafeAIEvent) {
  console.info("CV_ENGINE_AI_EVENT", JSON.stringify(event));
}

function errorStatus(message: string) {
  if (message.includes("P1_PRESENTATION_PLAN_NOT_FOUND")) return 404;
  if (message.includes("P1_AI_EVIDENCE_NOT_SELECTED") || message.includes("P1_AI_EVIDENCE_NOT_VERIFIED")) return 409;
  if (message.includes("P1_AI_PROPOSAL_REJECTED_BY_DETERMINISTIC_GUARD")) return 422;
  if (message.includes("INPUT_BUDGET_EXCEEDED")) return 413;
  if (message.includes("PROVIDER_RATE_LIMITED")) return 429;
  if (message.includes("P1_AI_WORDING_UNAVAILABLE")) return 503;
  if (message.includes("SUPABASE_SERVICE_ROLE_KEY_MISSING")) return 503;
  return 500;
}

export async function POST(request: Request) {
  const parsed = CreateAIPresentationProposalInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_P1_AI_PROPOSAL_INPUT", issues: parsed.error.issues },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  try {
    const { user, client } = await requireAuthenticatedSupabaseContext();
    const consent = await client
      .from("consent_receipts")
      .select("ai_access_mode_preference,acknowledged_at")
      .eq("owner_user_id", user.userId)
      .eq("disclosure_version", CURRENT_TRUST_DISCLOSURE_VERSION)
      .order("acknowledged_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (consent.error) throw new Error("AI_CONSENT_READ_FAILED");
    const accessMode = consent.data?.ai_access_mode_preference as AIAccessMode | null | undefined;
    if (!accessMode) {
      return NextResponse.json(
        { error: "AI_ACCESS_MODE_NOT_CONFIGURED" },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const suppliedByok = request.headers.get("x-cvengine-byok-key");
    if (accessMode !== "BYOK_GEMINI" && suppliedByok) {
      return NextResponse.json(
        { error: "UNEXPECTED_BYOK_CREDENTIAL" },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    let byokGeminiKey: string | null = null;
    if (accessMode === "BYOK_GEMINI") {
      const key = GeminiCredentialInputSchema.safeParse(suppliedByok);
      if (!key.success) {
        return NextResponse.json(
          { error: "BYOK_CREDENTIAL_REQUIRED" },
          { status: 400, headers: { "Cache-Control": "private, no-store" } },
        );
      }
      byokGeminiKey = key.data;
    }

    const credentialMode = credentialModeForAccess(accessMode);
    const budget = getAIExecutionBudget("INLINE_WORDING_OPTIMIZATION");
    const attempts = buildProviderAttemptPlan("INLINE_WORDING_OPTIMIZATION", credentialMode);
    try {
      assertProviderEconomicsWithinPolicy("INLINE_WORDING_OPTIMIZATION", attempts, budget);
    } catch (error) {
      const failureCode = error instanceof Error ? error.message : "AI_ECONOMICS_POLICY_FAILED";
      return NextResponse.json(
        { error: "P1_AI_WORDING_UNAVAILABLE", failureCode },
        { status: 503, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const production = process.env.NODE_ENV === "production";
    const result = await createAIPresentationProposal(
      client,
      createSupabaseAdminClient(),
      user.userId,
      parsed.data,
      {
        credentialMode,
        platformGeminiKey: process.env.GEMINI_API_KEY?.trim() || null,
        byokGeminiKey,
        geminiBaseUrl: process.env.GEMINI_API_BASE_URL?.trim() || "https://generativelanguage.googleapis.com",
        ollamaBaseUrl: process.env.OLLAMA_BASE_URL?.trim() || (production ? "http://127.0.0.1:9" : "http://127.0.0.1:11434"),
        ollamaApiKey: process.env.OLLAMA_API_KEY?.trim() || null,
        logger: safeLogger,
      },
    );

    return NextResponse.json({
      presentationRevisionId: result.presentationRevisionId,
      reviewStatus: result.reviewStatus,
      proposal: { text: result.proposalText },
      provenance: result.provenance,
    }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "P1_AI_PROPOSAL_INTERNAL_FAILURE";
    return NextResponse.json(
      { error: message.startsWith("P1_") ? message.split(":")[0] : "P1_AI_PROPOSAL_INTERNAL_FAILURE" },
      { status: errorStatus(message), headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
