import type { CredentialMode } from "../../domain/ai/AICapability";
import {
  ProviderCredentialInputSchema,
  UserAIProviderSchema,
  type AIAccessMode,
  type UserAIProvider,
} from "../../domain/ai/AIAccess";

export class AIRequestPolicyError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "AIRequestPolicyError";
  }
}

export type ResolvedAIRequestCredential = Readonly<{
  credentialMode: CredentialMode;
  byokProvider: UserAIProvider;
  byokProviderKey: string | null;
  byokGeminiKey: string | null;
  byokModelOverride: string | null;
  geminiBaseUrl: string;
  openaiBaseUrl: string;
  anthropicBaseUrl: string;
}>;

export function credentialModeForAccess(mode: AIAccessMode | null): CredentialMode {
  if (mode === "PLATFORM_GEMINI") return "PLATFORM_KEY";
  if (mode === "BYOK_GEMINI") return "BYOK_REQUEST_SCOPED";
  return "NO_CLOUD_AI";
}

function modelOverride(provider: UserAIProvider): string | null {
  const value = provider === "OPENAI"
    ? process.env.CVENGINE_OPENAI_BYOK_MODEL
    : provider === "ANTHROPIC"
      ? process.env.CVENGINE_ANTHROPIC_BYOK_MODEL
      : process.env.CVENGINE_GEMINI_BYOK_MODEL;
  return value?.trim() || null;
}

export function resolveAIRequestCredential(
  request: Request,
  accessMode: AIAccessMode | null,
): ResolvedAIRequestCredential {
  if (
    accessMode === "PLATFORM_GEMINI"
    && process.env.NODE_ENV === "production"
    && process.env.CVENGINE_ALLOW_PLATFORM_AI?.trim() !== "1"
  ) {
    throw new AIRequestPolicyError("PLATFORM_AI_NOT_ENTITLED");
  }

  const suppliedKey = request.headers.get("x-cvengine-byok-key");
  const suppliedProvider = request.headers.get("x-cvengine-ai-provider");

  if (accessMode !== "BYOK_GEMINI" && (suppliedKey || suppliedProvider)) {
    throw new AIRequestPolicyError("UNEXPECTED_BYOK_CREDENTIAL");
  }

  const providerResult = UserAIProviderSchema.safeParse(suppliedProvider ?? "GEMINI");
  if (accessMode === "BYOK_GEMINI" && !providerResult.success) {
    throw new AIRequestPolicyError("BYOK_PROVIDER_INVALID");
  }
  const byokProvider = providerResult.success ? providerResult.data : "GEMINI";

  let byokProviderKey: string | null = null;
  if (accessMode === "BYOK_GEMINI") {
    const parsedKey = ProviderCredentialInputSchema.safeParse(suppliedKey);
    if (!parsedKey.success) throw new AIRequestPolicyError("BYOK_CREDENTIAL_REQUIRED");
    byokProviderKey = parsedKey.data;
  }

  return {
    credentialMode: credentialModeForAccess(accessMode),
    byokProvider,
    byokProviderKey,
    byokGeminiKey: byokProvider === "GEMINI" ? byokProviderKey : null,
    byokModelOverride: accessMode === "BYOK_GEMINI" ? modelOverride(byokProvider) : null,
    geminiBaseUrl: process.env.GEMINI_API_BASE_URL?.trim() || "https://generativelanguage.googleapis.com",
    openaiBaseUrl: process.env.OPENAI_API_BASE_URL?.trim() || "https://api.openai.com",
    anthropicBaseUrl: process.env.ANTHROPIC_API_BASE_URL?.trim() || "https://api.anthropic.com",
  };
}
