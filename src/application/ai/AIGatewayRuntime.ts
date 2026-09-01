import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  AIExecutionBudgetSchema,
  CredentialModeSchema,
  type AIExecutionBudget,
  type CredentialMode,
} from "../../domain/ai/AICapability";
import {
  AICapabilityNameSchema,
  buildProviderAttemptPlan,
  type AICapabilityName,
  type AIExecutionProvenance,
  type AIProvider,
  type AIProviderAttemptPlan,
} from "./AIGatewayFoundation";

export const B6_RUNTIME_CONTRACT_VERSION = "b6-ai-runtime-v1" as const;

export const AIProposalSchema = z.object({
  text: z.string().trim().min(1).max(10_000),
}).strict();

export const AIExecutionFailureCodeSchema = z.enum([
  "INPUT_BUDGET_EXCEEDED",
  "CREDENTIAL_UNAVAILABLE",
  "PROVIDER_AUTH_FAILED",
  "PROVIDER_RATE_LIMITED",
  "PROVIDER_TIMEOUT",
  "PROVIDER_UNAVAILABLE",
  "MODEL_UNAVAILABLE",
  "INVALID_PROVIDER_RESPONSE",
  "OUTPUT_VALIDATION_FAILED",
  "OPERATION_DEADLINE_EXCEEDED",
  "TOTAL_PROVIDER_OUTAGE",
]);

export type AIExecutionFailureCode = z.infer<typeof AIExecutionFailureCodeSchema>;

export const AIProviderAttemptReceiptSchema = z.object({
  provider: z.enum(["GEMINI", "OLLAMA"]),
  model: z.string().min(1).max(200),
  attempt: z.number().int().positive(),
  credentialMode: z.enum(["PLATFORM", "BYOK", "LOCAL_ONLY"]),
  status: z.enum(["SUCCESS", "FAILED"]),
  failureCode: AIExecutionFailureCodeSchema.nullable(),
  durationMs: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
}).strict();

export type AIProviderAttemptReceipt = z.infer<typeof AIProviderAttemptReceiptSchema>;

export type AIExecutionSuccess = Readonly<{
  ok: true;
  requestId: string;
  capability: AICapabilityName;
  proposal: { text: string };
  resultSha256: string;
  provenance: AIExecutionProvenance;
  attempts: readonly AIProviderAttemptReceipt[];
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
}>;

export type AIExecutionFailure = Readonly<{
  ok: false;
  requestId: string;
  capability: AICapabilityName;
  failureCode: AIExecutionFailureCode;
  attempts: readonly AIProviderAttemptReceipt[];
  durationMs: number;
}>;

export type AIExecutionOutcome = AIExecutionSuccess | AIExecutionFailure;

export type SafeAIEvent = Readonly<{
  requestId: string;
  capability: AICapabilityName;
  provider: AIProvider | null;
  model: string | null;
  attempt: number;
  status: "START" | "SUCCESS" | "FAILED" | "COMPLETE";
  failureCode: AIExecutionFailureCode | null;
  durationMs: number;
}>;

export type SafeAILogger = (event: SafeAIEvent) => void;

export type AIGatewayRuntimeConfig = Readonly<{
  platformGeminiKey: string | null;
  byokGeminiKey: string | null;
  geminiBaseUrl: string;
  ollamaBaseUrl: string;
  ollamaApiKey: string | null;
  fetchImpl?: typeof fetch;
  logger?: SafeAILogger;
  now?: () => number;
  budgetOverrides?: Partial<Record<AICapabilityName, AIExecutionBudget>>;
}>;

export type AIExecutionInput = Readonly<{
  capability: AICapabilityName;
  credentialMode: CredentialMode;
  prompt: string;
  systemInstruction: string | null;
}>;

type ProviderExecutionResult = Readonly<{
  text: string;
  inputTokens: number | null;
  outputTokens: number | null;
}>;

class ProviderHttpFailure extends Error {
  readonly provider: AIProvider;
  readonly status: number;

  constructor(provider: AIProvider, status: number) {
    super(`${provider}_HTTP_${status}`);
    this.name = "ProviderHttpFailure";
    this.provider = provider;
    this.status = status;
  }
}

class ProviderResponseFailure extends Error {
  readonly provider: AIProvider;

  constructor(provider: AIProvider) {
    super(`${provider}_INVALID_RESPONSE`);
    this.name = "ProviderResponseFailure";
    this.provider = provider;
  }
}

const BUDGETS: Readonly<Record<AICapabilityName, AIExecutionBudget>> = {
  RESUME_IMPORT_FRAGMENT: {
    capability: "RESUME_IMPORT_FRAGMENT",
    capabilityClass: "BOUNDED_ASSIST",
    maxGeminiAttempts: 2,
    maxOllamaAttempts: 1,
    maxInputTokens: 8_000,
    maxOutputTokens: 800,
    perAttemptTimeoutMs: 12_000,
    wholeOperationDeadlineMs: 28_000,
    allowQualityEscalation: true,
  },
  JOB_DESCRIPTION_INTERPRETATION: {
    capability: "JOB_DESCRIPTION_INTERPRETATION",
    capabilityClass: "DERIVED_ANALYSIS_ASSIST",
    maxGeminiAttempts: 2,
    maxOllamaAttempts: 1,
    maxInputTokens: 16_000,
    maxOutputTokens: 1_500,
    perAttemptTimeoutMs: 15_000,
    wholeOperationDeadlineMs: 34_000,
    allowQualityEscalation: true,
  },
  OPPORTUNITY_EXPLANATION: {
    capability: "OPPORTUNITY_EXPLANATION",
    capabilityClass: "DERIVED_ANALYSIS_ASSIST",
    maxGeminiAttempts: 2,
    maxOllamaAttempts: 1,
    maxInputTokens: 10_000,
    maxOutputTokens: 1_200,
    perAttemptTimeoutMs: 15_000,
    wholeOperationDeadlineMs: 34_000,
    allowQualityEscalation: true,
  },
  INLINE_WORDING_OPTIMIZATION: {
    capability: "INLINE_WORDING_OPTIMIZATION",
    capabilityClass: "OPTIONAL_ENHANCEMENT",
    maxGeminiAttempts: 1,
    maxOllamaAttempts: 1,
    maxInputTokens: 3_000,
    maxOutputTokens: 500,
    perAttemptTimeoutMs: 10_000,
    wholeOperationDeadlineMs: 18_000,
    allowQualityEscalation: false,
  },
};

function safeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function conservativeTokenUpperBound(value: string) {
  // Both provider tokenizers ultimately consume encoded text. Treating every UTF-8 byte
  // as a possible token is deliberately conservative and fail-closed for preflight cost control.
  return Math.max(1, Buffer.byteLength(value, "utf8"));
}

function outputHash(text: string) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function credentialLabel(plan: AIProviderAttemptPlan): "PLATFORM" | "BYOK" | "LOCAL_ONLY" {
  if (plan.provider === "OLLAMA") return "LOCAL_ONLY";
  return plan.credentialMode === "PLATFORM_KEY" ? "PLATFORM" : "BYOK";
}

function credentialForGemini(plan: AIProviderAttemptPlan, config: AIGatewayRuntimeConfig): string | null {
  if (plan.provider !== "GEMINI") return null;
  if (plan.credentialMode === "PLATFORM_KEY") return config.platformGeminiKey;
  if (plan.credentialMode === "BYOK_REQUEST_SCOPED") return config.byokGeminiKey;
  return null;
}

function mapHttpFailure(status: number): AIExecutionFailureCode {
  if (status === 401 || status === 403) return "PROVIDER_AUTH_FAILED";
  if (status === 404) return "MODEL_UNAVAILABLE";
  if (status === 408 || status === 504) return "PROVIDER_TIMEOUT";
  if (status === 429) return "PROVIDER_RATE_LIMITED";
  return "PROVIDER_UNAVAILABLE";
}

function normalizeFailure(error: unknown): AIExecutionFailureCode {
  if (error instanceof ProviderHttpFailure) return mapHttpFailure(error.status);
  if (error instanceof ProviderResponseFailure) return "INVALID_PROVIDER_RESPONSE";
  if (error instanceof DOMException && error.name === "AbortError") return "PROVIDER_TIMEOUT";
  if (error instanceof Error && error.name === "AbortError") return "PROVIDER_TIMEOUT";
  return "PROVIDER_UNAVAILABLE";
}

function attemptPlanForBudget(capability: AICapabilityName, credentialMode: CredentialMode, budget: AIExecutionBudget) {
  let gemini = 0;
  let ollama = 0;
  return buildProviderAttemptPlan(capability, credentialMode).filter((attempt) => {
    if (attempt.provider === "GEMINI") {
      gemini += 1;
      return gemini <= budget.maxGeminiAttempts;
    }
    ollama += 1;
    return ollama <= budget.maxOllamaAttempts;
  });
}

async function executeGemini(
  fetchImpl: typeof fetch,
  config: AIGatewayRuntimeConfig,
  plan: AIProviderAttemptPlan,
  input: AIExecutionInput,
  budget: AIExecutionBudget,
  signal: AbortSignal,
): Promise<ProviderExecutionResult> {
  const apiKey = credentialForGemini(plan, config);
  if (!apiKey) throw new Error("CREDENTIAL_UNAVAILABLE");

  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: input.prompt }] }],
    generationConfig: { maxOutputTokens: budget.maxOutputTokens },
  };
  if (input.systemInstruction) body.systemInstruction = { parts: [{ text: input.systemInstruction }] };

  const response = await fetchImpl(
    `${normalizeBaseUrl(config.geminiBaseUrl)}/v1beta/models/${encodeURIComponent(plan.model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal,
      cache: "no-store",
    },
  );

  if (!response.ok) throw new ProviderHttpFailure("GEMINI", response.status);
  const payload = asRecord(await response.json().catch(() => null));
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  const candidate = asRecord(candidates[0]);
  const content = asRecord(candidate?.content);
  const parts = Array.isArray(content?.parts) ? content.parts : [];
  const text = parts.map((part) => asRecord(part)?.text).filter((part): part is string => typeof part === "string").join("").trim();
  if (!text) throw new ProviderResponseFailure("GEMINI");

  const usage = asRecord(payload?.usageMetadata);
  return {
    text,
    inputTokens: safeInteger(usage?.promptTokenCount),
    outputTokens: safeInteger(usage?.candidatesTokenCount),
  };
}

async function executeOllama(
  fetchImpl: typeof fetch,
  config: AIGatewayRuntimeConfig,
  plan: AIProviderAttemptPlan,
  input: AIExecutionInput,
  budget: AIExecutionBudget,
  signal: AbortSignal,
): Promise<ProviderExecutionResult> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.ollamaApiKey) headers.Authorization = `Bearer ${config.ollamaApiKey}`;

  const body: Record<string, unknown> = {
    model: plan.model,
    prompt: input.prompt,
    stream: false,
    options: { num_predict: budget.maxOutputTokens },
  };
  if (input.systemInstruction) body.system = input.systemInstruction;

  const response = await fetchImpl(`${normalizeBaseUrl(config.ollamaBaseUrl)}/api/generate`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw new ProviderHttpFailure("OLLAMA", response.status);
  const payload = asRecord(await response.json().catch(() => null));
  const text = typeof payload?.response === "string" ? payload.response.trim() : "";
  if (!text) throw new ProviderResponseFailure("OLLAMA");
  return {
    text,
    inputTokens: safeInteger(payload?.prompt_eval_count),
    outputTokens: safeInteger(payload?.eval_count),
  };
}

export function getAIExecutionBudget(
  capabilityInput: AICapabilityName,
  overrides: Partial<Record<AICapabilityName, AIExecutionBudget>> = {},
): AIExecutionBudget {
  const capability = AICapabilityNameSchema.parse(capabilityInput);
  return AIExecutionBudgetSchema.parse(overrides[capability] ?? BUDGETS[capability]);
}

export async function executeAICapability(
  inputValue: AIExecutionInput,
  config: AIGatewayRuntimeConfig,
): Promise<AIExecutionOutcome> {
  const input: AIExecutionInput = {
    capability: AICapabilityNameSchema.parse(inputValue.capability),
    credentialMode: CredentialModeSchema.parse(inputValue.credentialMode),
    prompt: z.string().trim().min(1).max(20_000).parse(inputValue.prompt),
    systemInstruction: inputValue.systemInstruction === null ? null : z.string().trim().min(1).max(4_000).parse(inputValue.systemInstruction),
  };
  const budget = getAIExecutionBudget(input.capability, config.budgetOverrides ?? {});
  const now = config.now ?? Date.now;
  const fetchImpl = config.fetchImpl ?? fetch;
  const logger = config.logger ?? (() => undefined);
  const requestId = randomUUID();
  const startedAt = now();
  const attempts: AIProviderAttemptReceipt[] = [];

  if (conservativeTokenUpperBound(`${input.systemInstruction ?? ""}\n${input.prompt}`) > budget.maxInputTokens) {
    return {
      ok: false,
      requestId,
      capability: input.capability,
      failureCode: "INPUT_BUDGET_EXCEEDED",
      attempts,
      durationMs: Math.max(0, now() - startedAt),
    };
  }

  const plans = attemptPlanForBudget(input.capability, input.credentialMode, budget);
  let lastFailure: AIExecutionFailureCode = "TOTAL_PROVIDER_OUTAGE";

  for (const [index, plan] of plans.entries()) {
    const elapsed = Math.max(0, now() - startedAt);
    const remaining = budget.wholeOperationDeadlineMs - elapsed;
    if (remaining <= 0) {
      lastFailure = "OPERATION_DEADLINE_EXCEEDED";
      break;
    }

    const attemptNumber = index + 1;
    const credentialMode = credentialLabel(plan);
    if (plan.provider === "GEMINI" && !credentialForGemini(plan, config)) {
      const receipt: AIProviderAttemptReceipt = {
        provider: plan.provider,
        model: plan.model,
        attempt: attemptNumber,
        credentialMode,
        status: "FAILED",
        failureCode: "CREDENTIAL_UNAVAILABLE",
        durationMs: 0,
        inputTokens: null,
        outputTokens: null,
      };
      attempts.push(receipt);
      lastFailure = "CREDENTIAL_UNAVAILABLE";
      logger({ requestId, capability: input.capability, provider: plan.provider, model: plan.model, attempt: attemptNumber, status: "FAILED", failureCode: lastFailure, durationMs: 0 });
      continue;
    }

    const controller = new AbortController();
    const timeoutMs = Math.min(budget.perAttemptTimeoutMs, remaining);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const attemptStartedAt = now();
    logger({ requestId, capability: input.capability, provider: plan.provider, model: plan.model, attempt: attemptNumber, status: "START", failureCode: null, durationMs: 0 });

    try {
      const result = plan.provider === "GEMINI"
        ? await executeGemini(fetchImpl, config, plan, input, budget, controller.signal)
        : await executeOllama(fetchImpl, config, plan, input, budget, controller.signal);
      const proposal = AIProposalSchema.parse({ text: result.text });
      const durationMs = Math.max(0, now() - attemptStartedAt);
      const receipt: AIProviderAttemptReceipt = {
        provider: plan.provider,
        model: plan.model,
        attempt: attemptNumber,
        credentialMode,
        status: "SUCCESS",
        failureCode: null,
        durationMs,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      };
      attempts.push(receipt);
      logger({ requestId, capability: input.capability, provider: plan.provider, model: plan.model, attempt: attemptNumber, status: "SUCCESS", failureCode: null, durationMs });

      const provenance: AIExecutionProvenance = {
        provider: plan.provider === "GEMINI" ? "gemini" : "ollama",
        model: plan.model,
        capability: input.capability,
        contractVersion: B6_RUNTIME_CONTRACT_VERSION,
        attempt: attemptNumber,
        fallbackUsed: index > 0,
        credentialMode,
        requestId,
      };
      const operationDuration = Math.max(0, now() - startedAt);
      logger({ requestId, capability: input.capability, provider: plan.provider, model: plan.model, attempt: attemptNumber, status: "COMPLETE", failureCode: null, durationMs: operationDuration });
      return {
        ok: true,
        requestId,
        capability: input.capability,
        proposal,
        resultSha256: outputHash(proposal.text),
        provenance,
        attempts,
        durationMs: operationDuration,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      };
    } catch (error) {
      const durationMs = Math.max(0, now() - attemptStartedAt);
      const failureCode = error instanceof Error && error.message === "CREDENTIAL_UNAVAILABLE"
        ? "CREDENTIAL_UNAVAILABLE"
        : normalizeFailure(error);
      lastFailure = failureCode;
      attempts.push({
        provider: plan.provider,
        model: plan.model,
        attempt: attemptNumber,
        credentialMode,
        status: "FAILED",
        failureCode,
        durationMs,
        inputTokens: null,
        outputTokens: null,
      });
      logger({ requestId, capability: input.capability, provider: plan.provider, model: plan.model, attempt: attemptNumber, status: "FAILED", failureCode, durationMs });
    } finally {
      clearTimeout(timeout);
    }
  }

  const durationMs = Math.max(0, now() - startedAt);
  const deadlineExceeded = durationMs >= budget.wholeOperationDeadlineMs;
  const failureCode: AIExecutionFailureCode = deadlineExceeded ? "OPERATION_DEADLINE_EXCEEDED" : (lastFailure === "CREDENTIAL_UNAVAILABLE" && attempts.some((attempt) => attempt.provider === "OLLAMA") ? "TOTAL_PROVIDER_OUTAGE" : lastFailure);
  logger({ requestId, capability: input.capability, provider: null, model: null, attempt: attempts.length, status: "COMPLETE", failureCode, durationMs });
  return { ok: false, requestId, capability: input.capability, failureCode, attempts, durationMs };
}
