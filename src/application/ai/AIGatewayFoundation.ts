import { z } from "zod";
import {
  CredentialModeSchema,
  type CredentialMode,
} from "../../domain/ai/AICapability";
import {
  UserAIProviderSchema,
  type UserAIProvider,
} from "../../domain/ai/AIAccess";

export const AICapabilityNameSchema = z.enum([
  "RESUME_IMPORT_FRAGMENT",
  "RESUME_SEMANTIC_UNDERSTANDING",
  "RESUME_HOLISTIC_IMPROVEMENT",
  "RESUME_FACT_GUARD",
  "JOB_DESCRIPTION_INTERPRETATION",
  "OPPORTUNITY_EXPLANATION",
  "INLINE_WORDING_OPTIMIZATION",
]);

export type AICapabilityName = z.infer<typeof AICapabilityNameSchema>;

export const AIProviderSchema = z.enum(["GEMINI", "OPENAI", "ANTHROPIC", "OLLAMA"]);
export type AIProvider = z.infer<typeof AIProviderSchema>;

export type ModelRoute = Readonly<{
  capability: AICapabilityName;
  geminiModels: readonly string[];
  openaiModels: readonly string[];
  anthropicModels: readonly string[];
  ollamaModel: string;
  allowGeminiQualityEscalation: boolean;
}>;

const ROUTES: Readonly<Record<AICapabilityName, ModelRoute>> = {
  RESUME_IMPORT_FRAGMENT: {
    capability: "RESUME_IMPORT_FRAGMENT",
    geminiModels: ["gemini-3.5-flash-lite", "gemini-3.6-flash"],
    openaiModels: ["gpt-6-luna"],
    anthropicModels: ["claude-sonnet-5-5"],
    ollamaModel: "cv-engine-import",
    allowGeminiQualityEscalation: true,
  },
  RESUME_SEMANTIC_UNDERSTANDING: {
    capability: "RESUME_SEMANTIC_UNDERSTANDING",
    geminiModels: ["gemini-3.5-flash-lite", "gemini-3.6-flash"],
    openaiModels: ["gpt-6-luna"],
    anthropicModels: ["claude-sonnet-5-5"],
    ollamaModel: "cv-engine-import",
    allowGeminiQualityEscalation: true,
  },
  RESUME_HOLISTIC_IMPROVEMENT: {
    capability: "RESUME_HOLISTIC_IMPROVEMENT",
    geminiModels: ["gemini-3.5-flash-lite", "gemini-3.6-flash"],
    openaiModels: ["gpt-6-luna"],
    anthropicModels: ["claude-sonnet-5-5"],
    ollamaModel: "cv-engine-resume-editor",
    allowGeminiQualityEscalation: true,
  },
  RESUME_FACT_GUARD: {
    capability: "RESUME_FACT_GUARD",
    geminiModels: ["gemini-3.5-flash-lite", "gemini-3.6-flash"],
    openaiModels: ["gpt-6-luna"],
    anthropicModels: ["claude-sonnet-5-5"],
    ollamaModel: "cv-engine-fact-guard",
    allowGeminiQualityEscalation: true,
  },
  JOB_DESCRIPTION_INTERPRETATION: {
    capability: "JOB_DESCRIPTION_INTERPRETATION",
    geminiModels: ["gemini-3.5-flash-lite", "gemini-3.6-flash"],
    openaiModels: ["gpt-6-luna"],
    anthropicModels: ["claude-sonnet-5-5"],
    ollamaModel: "cv-engine-analysis",
    allowGeminiQualityEscalation: true,
  },
  OPPORTUNITY_EXPLANATION: {
    capability: "OPPORTUNITY_EXPLANATION",
    geminiModels: ["gemini-3.5-flash-lite", "gemini-3.6-flash"],
    openaiModels: ["gpt-6-luna"],
    anthropicModels: ["claude-sonnet-5-5"],
    ollamaModel: "cv-engine-analysis",
    allowGeminiQualityEscalation: true,
  },
  INLINE_WORDING_OPTIMIZATION: {
    capability: "INLINE_WORDING_OPTIMIZATION",
    geminiModels: ["gemini-3.5-flash-lite"],
    openaiModels: ["gpt-6-luna"],
    anthropicModels: ["claude-sonnet-5-5"],
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
  provider: "gemini" | "openai" | "anthropic" | "ollama";
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

function modelsForUserProvider(route: ModelRoute, provider: UserAIProvider): readonly string[] {
  const parsed = UserAIProviderSchema.parse(provider);
  if (parsed === "OPENAI") return route.openaiModels;
  if (parsed === "ANTHROPIC") return route.anthropicModels;
  return route.geminiModels;
}

/**
 * Builds the provider/model attempt order only. PLATFORM_KEY remains Gemini-only
 * and private. BYOK_REQUEST_SCOPED routes solely through the provider selected
 * by the user. NO_CLOUD_AI never emits a cloud attempt.
 */
export function buildProviderAttemptPlan(
  capability: AICapabilityName,
  credentialModeInput: CredentialMode,
  byokProviderInput: UserAIProvider = "GEMINI",
): readonly AIProviderAttemptPlan[] {
  const credentialMode = CredentialModeSchema.parse(credentialModeInput);
  const route = getModelRoute(capability);
  const attempts: AIProviderAttemptPlan[] = [];

  if (credentialMode === "PLATFORM_KEY") {
    for (const model of route.geminiModels) {
      attempts.push({ provider: "GEMINI", model, credentialMode });
    }
    // Private/internal platform operation may retain the legacy self-hosted
    // fallback. Public users never enter PLATFORM_KEY without entitlement.
    attempts.push({
      provider: "OLLAMA",
      model: route.ollamaModel,
      credentialMode: "NO_CLOUD_AI",
    });
    return attempts;
  }

  if (credentialMode === "BYOK_REQUEST_SCOPED") {
    const byokProvider = UserAIProviderSchema.parse(byokProviderInput);
    for (const model of modelsForUserProvider(route, byokProvider)) {
      attempts.push({ provider: byokProvider, model, credentialMode });
    }
    // BYOK is user-funded by definition. Never fall through to CV Engine
    // compute when the user's provider is unavailable.
    return attempts;
  }

  attempts.push({
    provider: "OLLAMA",
    model: route.ollamaModel,
    credentialMode: "NO_CLOUD_AI",
  });
  return attempts;
}
