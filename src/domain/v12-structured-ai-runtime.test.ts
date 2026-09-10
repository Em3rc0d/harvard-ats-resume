import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { executeAICapability } from "../application/ai/AIGatewayRuntime";
import type { AIExecutionBudget } from "./ai/AICapability";

const SECRET = "v12-structured-secret-canary";
const servers: ReturnType<typeof createServer>[] = [];

const RESPONSE_SCHEMA = {
  type: "object",
  properties: { answer: { type: "string" } },
  required: ["answer"],
  additionalProperties: false,
} as const;

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

function budget(): AIExecutionBudget {
  return {
    capability: "RESUME_SEMANTIC_UNDERSTANDING",
    capabilityClass: "BOUNDED_ASSIST",
    maxGeminiAttempts: 2,
    maxOllamaAttempts: 1,
    maxInputTokens: 4_000,
    maxOutputTokens: 500,
    perAttemptTimeoutMs: 1_000,
    wholeOperationDeadlineMs: 4_000,
    allowQualityEscalation: true,
  };
}

function config(geminiBaseUrl: string, ollamaBaseUrl: string) {
  return {
    platformGeminiKey: SECRET,
    byokGeminiKey: null,
    geminiBaseUrl,
    ollamaBaseUrl,
    ollamaApiKey: null,
    budgetOverrides: { RESUME_SEMANTIC_UNDERSTANDING: budget() },
  };
}

function validateAnswer(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value) || (value as { answer?: unknown }).answer !== "ok") {
    throw new Error("INVALID_TEST_OUTPUT");
  }
}

describe("v1.2 structured AI runtime", () => {
  it("sends JSON Schema through Gemini generationConfig without exposing secrets", async () => {
    let requestBody: Record<string, unknown> | null = null;
    const gemini = await listen((request, response) => {
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => { body += String(chunk); });
      request.on("end", () => {
        requestBody = JSON.parse(body) as Record<string, unknown>;
        json(response, 200, {
          candidates: [{ content: { parts: [{ text: JSON.stringify({ answer: "ok" }) }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
        });
      });
    });
    const ollama = await listen((_request, response) => json(response, 500, {}));

    const outcome = await executeAICapability({
      capability: "RESUME_SEMANTIC_UNDERSTANDING",
      credentialMode: "PLATFORM_KEY",
      prompt: "Understand this resume.",
      systemInstruction: "Return only the requested semantic structure.",
      responseJsonSchema: RESPONSE_SCHEMA,
      structuredOutputValidator: validateAnswer,
    }, config(gemini, ollama));

    expect(outcome.ok).toBe(true);
    const generationConfig = requestBody?.generationConfig as Record<string, unknown> | undefined;
    const responseFormat = generationConfig?.responseFormat as Record<string, unknown> | undefined;
    const text = responseFormat?.text as Record<string, unknown> | undefined;
    expect(text?.mimeType).toBe("application/json");
    expect(text?.schema).toEqual(RESPONSE_SCHEMA);
    expect(JSON.stringify({ outcome, requestBody })).not.toContain(SECRET);
  });

  it("classifies invalid structured provider output as OUTPUT_VALIDATION_FAILED and tries the next model", async () => {
    let hits = 0;
    const gemini = await listen((_request, response) => {
      hits += 1;
      const text = hits === 1 ? JSON.stringify({ wrong: true }) : JSON.stringify({ answer: "ok" });
      json(response, 200, { candidates: [{ content: { parts: [{ text }] } }] });
    });
    const ollama = await listen((_request, response) => json(response, 500, {}));

    const outcome = await executeAICapability({
      capability: "RESUME_SEMANTIC_UNDERSTANDING",
      credentialMode: "PLATFORM_KEY",
      prompt: "Understand this resume.",
      systemInstruction: null,
      responseJsonSchema: RESPONSE_SCHEMA,
      structuredOutputValidator: validateAnswer,
    }, config(gemini, ollama));

    expect(outcome.ok).toBe(true);
    expect(hits).toBe(2);
    if (outcome.ok) {
      expect(outcome.attempts[0]?.failureCode).toBe("OUTPUT_VALIDATION_FAILED");
      expect(outcome.attempts[1]?.status).toBe("SUCCESS");
      expect(outcome.provenance.model).toBe("gemini-3.5-flash-lite");
    }
  });

  it("passes the same JSON Schema to Ollama format in local-only mode", async () => {
    let requestBody: Record<string, unknown> | null = null;
    const gemini = await listen((_request, response) => json(response, 500, {}));
    const ollama = await listen((request, response) => {
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => { body += String(chunk); });
      request.on("end", () => {
        requestBody = JSON.parse(body) as Record<string, unknown>;
        json(response, 200, { response: JSON.stringify({ answer: "ok" }) });
      });
    });

    const outcome = await executeAICapability({
      capability: "RESUME_SEMANTIC_UNDERSTANDING",
      credentialMode: "NO_CLOUD_AI",
      prompt: "Understand locally.",
      systemInstruction: null,
      responseJsonSchema: RESPONSE_SCHEMA,
      structuredOutputValidator: validateAnswer,
    }, config(gemini, ollama));

    expect(outcome.ok).toBe(true);
    expect(requestBody?.format).toEqual(RESPONSE_SCHEMA);
    if (outcome.ok) expect(outcome.provenance.provider).toBe("ollama");
  });
});
