import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedSupabaseContext } from "../../../../application/auth/requireAuthenticatedUser";
import { executeAICapability, getAIExecutionBudget, type SafeAIEvent } from "../../../../application/ai/AIGatewayRuntime";
import { buildProviderAttemptPlan } from "../../../../application/ai/AIGatewayFoundation";
import {
  assertProviderEconomicsWithinPolicy,
  geminiActualPaidCostUsd,
} from "../../../../application/ai/AIProviderEconomics";
import type { AIAccessMode } from "../../../../domain/ai/AIAccess";
import {
  AIRequestPolicyError,
  resolveAIRequestCredential,
} from "../../../../application/ai/RequestScopedAIConfig";
import { CURRENT_TRUST_DISCLOSURE_VERSION } from "../../../../domain/trust/FirstRunTrust";

const PublicAssistCapabilitySchema = z.enum([
  "RESUME_IMPORT_FRAGMENT",
  "JOB_DESCRIPTION_INTERPRETATION",
  "OPPORTUNITY_EXPLANATION",
  "INLINE_WORDING_OPTIMIZATION",
]);

const AssistInputSchema = z.object({
  capability: PublicAssistCapabilitySchema,
  prompt: z.string().trim().min(1).max(20_000),
}).strict();

const SYSTEM_INSTRUCTIONS: Readonly<Record<z.infer<typeof PublicAssistCapabilitySchema>, string>> = {
  RESUME_IMPORT_FRAGMENT: "You are a bounded resume-import assistant. Work only from supplied source text. Suggest possible structure or interpretation, never invent candidate facts, metrics, employers, dates, skills, achievements or credentials. Your output is a review proposal, never Career Evidence.",
  JOB_DESCRIPTION_INTERPRETATION: "You are a bounded employer-text interpretation assistant. Work only from supplied Job Truth. You may explain or classify employer requirements, but never convert job requirements into candidate evidence and never claim the candidate has a capability that is not present in Career Evidence.",
  OPPORTUNITY_EXPLANATION: "You explain a deterministic CV Engine opportunity assessment. Preserve MATCH/POTENTIAL_MATCH/GAP/UNKNOWN distinctions, explicitly preserve uncertainty, never estimate hiring probability, never invent candidate facts, and never upgrade unsupported evidence. The deterministic assessment remains authoritative; your response is explanatory only.",
  INLINE_WORDING_OPTIMIZATION: "You provide optional wording suggestions that preserve the exact supplied facts and metrics. Do not add, infer, strengthen or fabricate facts. The suggestion is not authoritative and must remain source-preserving.",
};

function safeLogger(event: SafeAIEvent) {
  console.info("CV_ENGINE_AI_EVENT", JSON.stringify(event));
}

function providerStatus(failureCode: string) {
  if (failureCode === "INPUT_BUDGET_EXCEEDED") return 413;
  if (failureCode === "PROVIDER_RATE_LIMITED") return 429;
  return 503;
}

export async function POST(request: Request) {
  const parsed = AssistInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_AI_ASSIST_INPUT", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const { user, client } = await requireAuthenticatedSupabaseContext();
    const consent = await client
      .from("consent_receipts")
      .select("ai_access_mode_preference, acknowledged_at")
      .eq("owner_user_id", user.userId)
      .eq("disclosure_version", CURRENT_TRUST_DISCLOSURE_VERSION)
      .order("acknowledged_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (consent.error) throw new Error("AI_CONSENT_READ_FAILED");
    const accessMode = consent.data?.ai_access_mode_preference as AIAccessMode | null | undefined;
    if (!accessMode) {
      return NextResponse.json({ error: "AI_ACCESS_MODE_NOT_CONFIGURED" }, { status: 409 });
    }

    if (accessMode === "NO_CLOUD_AI") {
      return NextResponse.json({ error: "AI_ASSIST_BROWSER_LOCAL_ONLY" }, { status: 409 });
    }

    let resolved;
    try {
      resolved = resolveAIRequestCredential(request, accessMode);
    } catch (error) {
      const code = error instanceof AIRequestPolicyError ? error.code : "AI_ACCESS_REQUEST_INVALID";
      return NextResponse.json({ error: code }, { status: code === "PLATFORM_AI_NOT_ENTITLED" ? 403 : 400 });
    }

    const credentialMode = resolved.credentialMode;
    const budget = getAIExecutionBudget(parsed.data.capability);
    const plannedAttempts = buildProviderAttemptPlan(
      parsed.data.capability,
      credentialMode,
      resolved.byokProvider,
    );
    let economics;
    try {
      economics = assertProviderEconomicsWithinPolicy(parsed.data.capability, plannedAttempts, budget);
    } catch (error) {
      const code = error instanceof Error ? error.message : "AI_ECONOMICS_POLICY_FAILED";
      return NextResponse.json({ error: "AI_ASSIST_UNAVAILABLE", failureCode: code }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
    }

    const production = process.env.NODE_ENV === "production";
    const ollamaBaseUrl = process.env.OLLAMA_BASE_URL?.trim() || (production ? "http://127.0.0.1:9" : "http://127.0.0.1:11434");

    const outcome = await executeAICapability({
      capability: parsed.data.capability,
      credentialMode,
      prompt: parsed.data.prompt,
      systemInstruction: SYSTEM_INSTRUCTIONS[parsed.data.capability],
    }, {
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
    });

    if (!outcome.ok) {
      return NextResponse.json({
        error: "AI_ASSIST_UNAVAILABLE",
        failureCode: outcome.failureCode,
        requestId: outcome.requestId,
        attempts: outcome.attempts,
        economics,
      }, { status: providerStatus(outcome.failureCode), headers: { "Cache-Control": "private, no-store" } });
    }

    const estimatedPaidCostUsd = outcome.attempts.reduce((total, attempt) => {
      if (attempt.provider !== "GEMINI" || attempt.credentialMode !== "PLATFORM") return total;
      const estimate = geminiActualPaidCostUsd(attempt.model, attempt.inputTokens, attempt.outputTokens);
      return estimate === null ? total : total + estimate;
    }, 0);

    return NextResponse.json({
      proposal: outcome.proposal,
      provenance: outcome.provenance,
      attempts: outcome.attempts,
      requestId: outcome.requestId,
      resultSha256: outcome.resultSha256,
      usage: { inputTokens: outcome.inputTokens, outputTokens: outcome.outputTokens },
      economics: { ...economics, estimatedPaidCostUsd },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "AI_ASSIST_INTERNAL_FAILURE" }, { status: 500, headers: { "Cache-Control": "private, no-store" } });
  }
}
