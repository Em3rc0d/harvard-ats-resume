import { z } from "zod";
import {
  CredentialModeSchema,
  type CredentialMode,
} from "../../domain/ai/AICapability";

export const AICapabilityNameSchema = z.enum([
  "RESUME_IMPORT_FRAGMENT",
  "JOB_DESCRIPTION_INTERPRETATION",
  "OPPORTUNITY_EXPLANATION",
  "INLINE_WORDING_OPTIMIZATION",
]);

export type AICapabilityName = z.infer<typeof AICapabilityNameSchema>;

export const AIProviderSchema = z.enum(["GEMINI", "OLLAMA"]);
export type AIProvider = z.infer<typeof AIProviderSchema>;

export type ModelRoute = Readonly<{
  capability: AICapabilityName;
  geminiModels: readonly string[];
  ollamaModel: string;
  allowGeminiQualityEscalation: boolean;
}>;

const ROUTES: Readonly<Record<AICapabilityName, ModelRoute>> = {
  RESUME_IMPORT_FRAGMENT: {
    capability: "RESUME_IMPORT_FRAGMENT",
    geminiModels: ["gemini-3.5-flash-lite", "gemini-3.7-flash"],
    ollamaModel: "cv-engine-import",
    allowGeminiQualityEscalation: true,
  },
  JOB_DESCRIPTION_INTERPRETATION: {
    capability: "JOB_DESCRIPTION_INTERPRETATION",
    geminiModels: ["gemini-3.5-flash-lite", "gemini-3.7-flash"],
    ollamaModel: "cv-engine-analysis",
    allowGeminiQualityEscalation: true,
  },
  OPPORTUNITY_EXPLANATION: {
    capability: "OPPORTUNITY_EXPLANATION",
    geminiModels: ["gemini-3.5-flash-lite", "gemini-3.7-flash"],
    ollamaModel: "cv-engine-analysis",
    allowGeminiQualityEscalation: true,
  },
  INLINE_WORDING_OPTIMIZATION: {
    capability: "INLINE_WORDING_OPTIMIZATION",
    geminiModels: ["gemini-3.5-flash-lite"],
    ollamaModel: "cv-engine-optimize",
    allowGeminiQualityEscalation: false,
  },
};

export type AIProviderAttemptPlan = Readonly<{
  provider: AIProvider;
  model: string;
  credentialMode: CredentialMode;
}>;

export type AIExecutionProvenance = Readonly<{
  provider: "gemini" | "ollama";
  model: string;
  capability: AICapabilityName;
  contractVersion: string;
  attempt: number;
  fallbackUsed: boolean;
  credentialMode: "PLATFORM" | "BYOK" | "LOCAL_ONLY";
  requestId: string;
}>;

export interface AIGatewayAdapter<Input, Output> {
  readonly provider: AIProvider;
  execute(input: Input, attempt: AIProviderAttemptPlan): Promise<Output>;
}

export interface AICapabilityValidator<Output> {
  validate(output: Output): Promise<Output> | Output;
}

export function getModelRoute(capability: AICapabilityName): ModelRoute {
  return ROUTES[capability];
}

/**
 * Builds the provider/model attempt order only. B6 owns network execution,
 * retry classification, provider adapters, deadlines, cost accounting and
 * runtime fallback behavior.
 */
export function buildProviderAttemptPlan(
  capability: AICapabilityName,
  credentialModeInput: CredentialMode,
): readonly AIProviderAttemptPlan[] {
  const credentialMode = CredentialModeSchema.parse(credentialModeInput);
  const route = getModelRoute(capability);
  const attempts: AIProviderAttemptPlan[] = [];

  if (credentialMode !== "NO_CLOUD_AI") {
    for (const model of route.geminiModels) {
      attempts.push({ provider: "GEMINI", model, credentialMode });
    }
  }

  attempts.push({
    provider: "OLLAMA",
    model: route.ollamaModel,
    credentialMode: "NO_CLOUD_AI",
  });

  return attempts;
}
