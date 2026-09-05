import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { executeAICapability, type SafeAIEvent } from "../application/ai/AIGatewayRuntime";
import type { AIExecutionBudget } from "./ai/AICapability";

const SECRET = "cvengine-gemini-secret-canary-DO-NOT-LEAK-2026";
const OLLAMA_SECRET = "ollama-separate-secret-canary";
const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function listen(handler: (request: IncomingMessage, response: ServerResponse) => void) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("TEST_SERVER_ADDRESS_INVALID");
  return `http://127.0.0.1:${address.port}`;
}

function json(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

function config(geminiBaseUrl: string, ollamaBaseUrl: string, logger?: (event: SafeAIEvent) => void, budget?: AIExecutionBudget) {
  return {
    platformGeminiKey: SECRET,
    byokGeminiKey: SECRET,
    geminiBaseUrl,
    ollamaBaseUrl,
    ollamaApiKey: OLLAMA_SECRET,
    ...(logger ? { logger } : {}),
    ...(budget ? { budgetOverrides: { OPPORTUNITY_EXPLANATION: budget } } : {}),
  };
}

function smallBudget(timeoutMs = 500): AIExecutionBudget {
  return {
    capability: "OPPORTUNITY_EXPLANATION",
    capabilityClass: "DERIVED_ANALYSIS_ASSIST",
    maxGeminiAttempts: 2,
    maxOllamaAttempts: 1,
    maxInputTokens: 2_000,
    maxOutputTokens: 200,
    perAttemptTimeoutMs: timeoutMs,
    wholeOperationDeadlineMs: timeoutMs * 4,
    allowQualityEscalation: true,
  };
}

describe("B6 AI runtime", () => {
  it("uses the Gemini secret only on the Gemini request and never exposes it in provenance/logs", async () => {
    let geminiKey: string | undefined;
    const gemini = await listen((request, response) => {
      geminiKey = request.headers["x-goog-api-key"] as string | undefined;
      json(response, 200, {
        candidates: [{ content: { parts: [{ text: "Evidence-based explanation proposal." }] } }],
        usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 5 },
      });
    });
    const ollama = await listen((_request, response) => json(response, 500, { error: "should not be reached" }));
    const events: SafeAIEvent[] = [];

    const outcome = await executeAICapability({
      capability: "OPPORTUNITY_EXPLANATION",
      credentialMode: "PLATFORM_KEY",
      prompt: "Explain this derived assessment without inventing candidate facts.",
      systemInstruction: "Return a bounded suggestion only.",
    }, config(gemini, ollama, (event) => events.push(event), smallBudget()));

    expect(outcome.ok).toBe(true);
    expect(geminiKey).toBe(SECRET);
    const serialized = JSON.stringify({ outcome, events });
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain(OLLAMA_SECRET);
    if (outcome.ok) {
      expect(outcome.provenance.provider).toBe("gemini");
      expect(outcome.provenance.credentialMode).toBe("PLATFORM");
      expect(outcome.proposal.text).toBe("Evidence-based explanation proposal.");
    }
  });

  it("falls back to Ollama after Gemini failures without forwarding any Gemini credential", async () => {
    let geminiHits = 0;
    let ollamaHeaders: IncomingMessage["headers"] | null = null;
    let ollamaBody = "";
    const gemini = await listen((request, response) => {
      geminiHits += 1;
      expect(request.headers["x-goog-api-key"]).toBe(SECRET);
      json(response, 503, { error: `provider failure accidentally echoed ${SECRET}` });
    });
    const ollama = await listen((request, response) => {
      ollamaHeaders = request.headers;
      request.setEncoding("utf8");
      request.on("data", (chunk) => { ollamaBody += String(chunk); });
      request.on("end", () => json(response, 200, {
        response: "Local bounded fallback proposal.",
        prompt_eval_count: 7,
        eval_count: 6,
      }));
    });

    const outcome = await executeAICapability({
      capability: "OPPORTUNITY_EXPLANATION",
      credentialMode: "BYOK_REQUEST_SCOPED",
      prompt: "Explain evidence gaps.",
      systemInstruction: null,
    }, config(gemini, ollama, undefined, smallBudget()));

    expect(outcome.ok).toBe(true);
    expect(geminiHits).toBe(2);
    expect(JSON.stringify(ollamaHeaders)).not.toContain(SECRET);
    expect(ollamaBody).not.toContain(SECRET);
    expect(JSON.stringify(ollamaHeaders)).toContain(OLLAMA_SECRET);
    if (outcome.ok) {
      expect(outcome.provenance.provider).toBe("ollama");
      expect(outcome.provenance.credentialMode).toBe("LOCAL_ONLY");
      expect(outcome.provenance.fallbackUsed).toBe(true);
      expect(outcome.attempts).toHaveLength(3);
    }
  });

  it("NO_CLOUD_AI never touches Gemini and can execute only the local fallback route", async () => {
    let geminiHits = 0;
    const gemini = await listen((_request, response) => {
      geminiHits += 1;
      json(response, 500, {});
    });
    const ollama = await listen((_request, response) => json(response, 200, { response: "Local-only suggestion." }));

    const outcome = await executeAICapability({
      capability: "OPPORTUNITY_EXPLANATION",
      credentialMode: "NO_CLOUD_AI",
      prompt: "Explain locally.",
      systemInstruction: null,
    }, config(gemini, ollama, undefined, smallBudget()));

    expect(geminiHits).toBe(0);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.provenance.provider).toBe("ollama");
  });

  it("normalizes provider errors and never echoes provider bodies or credentials", async () => {
    const geminiErrorMarker = "provider-body-invalid-canary";
    const ollamaErrorMarker = "provider-body-bad-canary";
    const gemini = await listen((_request, response) => json(response, 401, { error: `${geminiErrorMarker} ${SECRET}` }));
    const ollama = await listen((_request, response) => json(response, 500, { error: `${ollamaErrorMarker} ${SECRET} ${OLLAMA_SECRET}` }));

    const outcome = await executeAICapability({
      capability: "OPPORTUNITY_EXPLANATION",
      credentialMode: "PLATFORM_KEY",
      prompt: "Explain safely.",
      systemInstruction: null,
    }, config(gemini, ollama, undefined, smallBudget()));

    expect(outcome.ok).toBe(false);
    const serialized = JSON.stringify(outcome);
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain(OLLAMA_SECRET);
    expect(serialized).not.toContain(geminiErrorMarker);
    expect(serialized).not.toContain(ollamaErrorMarker);
    if (!outcome.ok) expect(outcome.attempts.every((attempt) => attempt.failureCode !== null)).toBe(true);
  });

  it("aborts a timed-out Gemini attempt and safely degrades to Ollama", async () => {
    const gemini = await listen((_request, response) => {
      setTimeout(() => json(response, 200, { candidates: [{ content: { parts: [{ text: "too late" }] } }] }), 250);
    });
    const ollama = await listen((_request, response) => json(response, 200, { response: "Fallback after timeout." }));
    const budget = smallBudget(40);

    const outcome = await executeAICapability({
      capability: "OPPORTUNITY_EXPLANATION",
      credentialMode: "PLATFORM_KEY",
      prompt: "Timeout test.",
      systemInstruction: null,
    }, config(gemini, ollama, undefined, budget));

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.provenance.provider).toBe("ollama");
      expect(outcome.attempts.filter((attempt) => attempt.provider === "GEMINI").every((attempt) => attempt.failureCode === "PROVIDER_TIMEOUT")).toBe(true);
    }
  });

  it("rejects oversized input before any provider receives career content", async () => {
    let hits = 0;
    const gemini = await listen((_request, response) => { hits += 1; json(response, 200, {}); });
    const ollama = await listen((_request, response) => { hits += 1; json(response, 200, {}); });
    const budget = { ...smallBudget(), maxInputTokens: 8 };

    const outcome = await executeAICapability({
      capability: "OPPORTUNITY_EXPLANATION",
      credentialMode: "PLATFORM_KEY",
      prompt: "This input is intentionally larger than eight UTF-8 bytes.",
      systemInstruction: null,
    }, config(gemini, ollama, undefined, budget));

    expect(hits).toBe(0);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.failureCode).toBe("INPUT_BUDGET_EXCEEDED");
  });
});
