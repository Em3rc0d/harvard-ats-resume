import { NextResponse } from "next/server";
import { executeAICapability } from "../../../../../application/ai/AIGatewayRuntime";

export async function GET() {
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ error: "DIAGNOSTIC_DISABLED_IN_PRODUCTION" }, { status: 404 });
  }

  const platformGeminiConfigured = Boolean(process.env.GEMINI_API_KEY?.trim());
  if (!platformGeminiConfigured) {
    return NextResponse.json({
      platformGeminiConfigured: false,
      outcome: "NOT_RUN",
    }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const outcome = await executeAICapability({
    capability: "INLINE_WORDING_OPTIMIZATION",
    credentialMode: "PLATFORM_KEY",
    prompt: "Rewrite this sentence more concisely while preserving every fact: Built a synthetic inventory API using Java Spring Boot and PostgreSQL.",
    systemInstruction: "Return only the rewritten sentence. Do not add facts, metrics, tools, scope, or outcomes.",
  }, {
    platformGeminiKey: process.env.GEMINI_API_KEY?.trim() || null,
    byokGeminiKey: null,
    geminiBaseUrl: process.env.GEMINI_API_BASE_URL?.trim() || "https://generativelanguage.googleapis.com",
    ollamaBaseUrl: "http://127.0.0.1:9",
    ollamaApiKey: null,
  });

  if (!outcome.ok) {
    return NextResponse.json({
      platformGeminiConfigured: true,
      outcome: "FAIL",
      failureCode: outcome.failureCode,
      attempts: outcome.attempts.map((attempt) => ({
        provider: attempt.provider,
        model: attempt.model,
        status: attempt.status,
        failureCode: attempt.failureCode,
        durationMs: attempt.durationMs,
      })),
      durationMs: outcome.durationMs,
    }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }

  return NextResponse.json({
    platformGeminiConfigured: true,
    outcome: "PASS",
    provider: outcome.provenance.provider,
    model: outcome.provenance.model,
    durationMs: outcome.durationMs,
    attempts: outcome.attempts.map((attempt) => ({
      provider: attempt.provider,
      model: attempt.model,
      status: attempt.status,
      failureCode: attempt.failureCode,
      durationMs: attempt.durationMs,
    })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
