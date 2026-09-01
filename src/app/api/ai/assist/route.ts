import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedSupabaseContext } from "../../../../application/auth/requireAuthenticatedUser";
import { executeAICapability, type SafeAIEvent } from "../../../../application/ai/AIGatewayRuntime";
import { AICapabilityNameSchema } from "../../../../application/ai/AIGatewayFoundation";
import { GeminiCredentialInputSchema, type AIAccessMode } from "../../../../domain/ai/AIAccess";
import type { CredentialMode } from "../../../../domain/ai/AICapability";
import { CURRENT_TRUST_DISCLOSURE_VERSION } from "../../../../domain/trust/FirstRunTrust";

const AssistInputSchema = z.object({
  capability: AICapabilityNameSchema,
  prompt: z.string().trim().min(1).max(20_000),
}).strict();

const SYSTEM_INSTRUCTIONS: Readonly<Record<z.infer<typeof AICapabilityNameSchema>, string>> = {
  RESUME_IMPORT_FRAGMENT: "You are a bounded resume-import assistant. Work only from supplied source text. Suggest possible structure or interpretation, never invent candidate facts, metrics, employers, dates, skills, achievements or credentials. Your output is a review proposal, never Career Evidence.",
  JOB_DESCRIPTION_INTERPRETATION: "You are a bounded employer-text interpretation assistant. Work only from supplied Job Truth. You may explain or classify employer requirements, but never convert job requirements into candidate evidence and never claim the candidate has a capability that is not present in Career Evidence.",
  OPPORTUNITY_EXPLANATION: "You explain a deterministic CV Engine opportunity assessment. Preserve MATCH/POTENTIAL_MATCH/GAP/UNKNOWN distinctions, explicitly preserve uncertainty, never estimate hiring probability, never invent candidate facts, and never upgrade unsupported evidence. The deterministic assessment remains authoritative; your response is explanatory only.",
  INLINE_WORDING_OPTIMIZATION: "You provide optional wording suggestions that preserve the exact supplied facts and metrics. Do not add, infer, strengthen or fabricate facts. The suggestion is not authoritative and must remain source-preserving.",
};

function credentialModeForAccess(mode: AIAccessMode): CredentialMode {
  if (mode === "PLATFORM_GEMINI") return "PLATFORM_KEY";
  if (mode === "BYOK_GEMINI") return "BYOK_REQUEST_SCOPED";
  return "NO_CLOUD_AI";
}

function safeLogger(event: SafeAIEvent) {
  console.info("CV_ENGINE_AI_EVENT", JSON.stringify(event));
}

function providerStatus(failureCode: string) {
  if (failureCode === "INPUT_BUDGET_EXCEEDED") return 413;
  if (failureCode === "PROVIDER_RATE_LIMITED") return 429;
  if (failureCode === "CREDENTIAL_UNAVAILABLE") return 503;
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

    const suppliedByok = request.headers.get("x-cvengine-byok-key");
    if (accessMode !== "BYOK_GEMINI" && suppliedByok) {
      return NextResponse.json({ error: "UNEXPECTED_BYOK_CREDENTIAL" }, { status: 400 });
    }

    let byokGeminiKey: string | null = null;
    if (accessMode === "BYOK_GEMINI") {
      const key = GeminiCredentialInputSchema.safeParse(suppliedByok);
      if (!key.success) return NextResponse.json({ error: "BYOK_CREDENTIAL_REQUIRED" }, { status: 400 });
      byokGeminiKey = key.data;
    }

    const outcome = await executeAICapability({
      capability: parsed.data.capability,
      credentialMode: credentialModeForAccess(accessMode),
      prompt: parsed.data.prompt,
      systemInstruction: SYSTEM_INSTRUCTIONS[parsed.data.capability],
    }, {
      platformGeminiKey: process.env.GEMINI_API_KEY?.trim() || null,
      byokGeminiKey,
      geminiBaseUrl: process.env.GEMINI_API_BASE_URL?.trim() || "https://generativelanguage.googleapis.com",
      ollamaBaseUrl: process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434",
      ollamaApiKey: process.env.OLLAMA_API_KEY?.trim() || null,
      logger: safeLogger,
    });

    if (!outcome.ok) {
      return NextResponse.json({
        error: "AI_ASSIST_UNAVAILABLE",
        failureCode: outcome.failureCode,
        requestId: outcome.requestId,
        attempts: outcome.attempts,
      }, { status: providerStatus(outcome.failureCode), headers: { "Cache-Control": "private, no-store" } });
    }

    return NextResponse.json({
      proposal: outcome.proposal,
      provenance: outcome.provenance,
      attempts: outcome.attempts,
      requestId: outcome.requestId,
      resultSha256: outcome.resultSha256,
      usage: { inputTokens: outcome.inputTokens, outputTokens: outcome.outputTokens },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "AI_ASSIST_INTERNAL_FAILURE" }, { status: 500, headers: { "Cache-Control": "private, no-store" } });
  }
}
