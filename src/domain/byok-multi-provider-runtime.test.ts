import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { executeAICapability } from "../application/ai/AIGatewayRuntime";
import type { AIExecutionBudget } from "./ai/AICapability";
import type { UserAIProvider } from "./ai/AIAccess";

const SECRET = "cvengine-user-provider-secret-canary";
const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
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
    capability: "OPPORTUNITY_EXPLANATION",
    capabilityClass: "DERIVED_ANALYSIS_ASSIST",
    maxGeminiAttempts: 1,
    maxOllamaAttempts: 1,
    maxInputTokens: 2_000,
    maxOutputTokens: 200,
    perAttemptTimeoutMs: 1_000,
    wholeOperationDeadlineMs: 3_000,
    allowQualityEscalation: false,
  };
}

function config(provider: UserAIProvider, baseUrl: string, ollamaBaseUrl: string) {
  return {
    platformGeminiKey: null,
    byokGeminiKey: provider === "GEMINI" ? SECRET : null,
    byokProvider: provider,
    byokProviderKey: SECRET,
    geminiBaseUrl: baseUrl,
    openaiBaseUrl: baseUrl,
    anthropicBaseUrl: baseUrl,
    ollamaBaseUrl,
    ollamaApiKey: null,
    budgetOverrides: { OPPORTUNITY_EXPLANATION: budget() },
  };
}

describe("BYOK multi-provider runtime", () => {
  it("uses the user's OpenAI key only for the OpenAI Responses request", async () => {
    let path = "";
    let auth = "";
    const provider = await listen((request, response) => {
      path = request.url ?? "";
      auth = String(request.headers.authorization ?? "");
      json(response, 200, {
        output: [{ content: [{ type: "output_text", text: "OpenAI BYOK result." }] }],
        usage: { input_tokens: 12, output_tokens: 6 },
      });
    });
    const ollama = await listen((_request, response) => json(response, 500, {}));

    const outcome = await executeAICapability({
      capability: "OPPORTUNITY_EXPLANATION",
      credentialMode: "BYOK_REQUEST_SCOPED",
      prompt: "Explain safely.",
      systemInstruction: null,
    }, config("OPENAI", provider, ollama));

    expect(outcome.ok).toBe(true);
    expect(path).toBe("/v1/responses");
    expect(auth).toBe(`Bearer ${SECRET}`);
    expect(JSON.stringify(outcome)).not.toContain(SECRET);
    if (outcome.ok) {
      expect(outcome.provenance.provider).toBe("openai");
      expect(outcome.provenance.credentialMode).toBe("BYOK");
      expect(outcome.proposal.text).toBe("OpenAI BYOK result.");
    }
  });

  it("uses the user's Anthropic key only for the Messages request", async () => {
    let path = "";
    let apiKey = "";
    const provider = await listen((request, response) => {
      path = request.url ?? "";
      apiKey = String(request.headers["x-api-key"] ?? "");
      json(response, 200, {
        content: [{ type: "text", text: "Anthropic BYOK result." }],
        usage: { input_tokens: 11, output_tokens: 5 },
      });
    });
    const ollama = await listen((_request, response) => json(response, 500, {}));

    const outcome = await executeAICapability({
      capability: "OPPORTUNITY_EXPLANATION",
      credentialMode: "BYOK_REQUEST_SCOPED",
      prompt: "Explain safely.",
      systemInstruction: null,
    }, config("ANTHROPIC", provider, ollama));

    expect(outcome.ok).toBe(true);
    expect(path).toBe("/v1/messages");
    expect(apiKey).toBe(SECRET);
    expect(JSON.stringify(outcome)).not.toContain(SECRET);
    if (outcome.ok) {
      expect(outcome.provenance.provider).toBe("anthropic");
      expect(outcome.provenance.credentialMode).toBe("BYOK");
      expect(outcome.proposal.text).toBe("Anthropic BYOK result.");
    }
  });

  it("honors a runtime model override without changing provider routing", async () => {
    let requestBody = "";
    const provider = await listen((request, response) => {
      request.setEncoding("utf8");
      request.on("data", (chunk) => { requestBody += String(chunk); });
      request.on("end", () => {
        json(response, 200, {
          output: [{ content: [{ type: "output_text", text: "Configured model result." }] }],
        });
      });
    });
    const ollama = await listen((_request, response) => json(response, 500, {}));
    const cfg = {
      ...config("OPENAI", provider, ollama),
      byokModelOverride: "customer-accessible-model",
    };

    const outcome = await executeAICapability({
      capability: "OPPORTUNITY_EXPLANATION",
      credentialMode: "BYOK_REQUEST_SCOPED",
      prompt: "Use configured model.",
      systemInstruction: null,
    }, cfg);

    expect(outcome.ok).toBe(true);
    expect(JSON.parse(requestBody).model).toBe("customer-accessible-model");
    if (outcome.ok) expect(outcome.provenance.model).toBe("customer-accessible-model");
  });
});
