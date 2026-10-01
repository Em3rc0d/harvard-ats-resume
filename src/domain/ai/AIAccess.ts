import { z } from "zod";

export const AIAccessModeSchema = z.enum([
  "PLATFORM_GEMINI",
  "BYOK_GEMINI",
  "NO_CLOUD_AI",
]);

export type AIAccessMode = z.infer<typeof AIAccessModeSchema>;

export const UserAIProviderSchema = z.enum(["GEMINI", "OPENAI", "ANTHROPIC"]);
export type UserAIProvider = z.infer<typeof UserAIProviderSchema>;

/**
 * Durable preference only. Raw BYOK credentials and provider credentials are
 * intentionally impossible to represent in this schema.
 */
export const AIAccessPreferenceSchema = z
  .object({
    mode: AIAccessModeSchema,
  })
  .strict();

export type AIAccessPreference = z.infer<typeof AIAccessPreferenceSchema>;

export const ProviderCredentialInputSchema = z
  .string()
  .trim()
  .min(16, "API key is too short")
  .max(1_024, "API key is too long");

// Backward-compatible export for existing Gemini contracts.
export const GeminiCredentialInputSchema = ProviderCredentialInputSchema;

export type BrowserOriginLike = Readonly<{
  protocol: string;
  hostname: string;
}>;

const LOCAL_BYOK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * BYOK may cross the network only over HTTPS. Plain HTTP is permitted solely
 * for explicit loopback development origins.
 */
export function isByokTransportAllowed(origin: BrowserOriginLike): boolean {
  if (origin.protocol === "https:") return true;
  if (origin.protocol !== "http:") return false;
  return LOCAL_BYOK_HOSTS.has(origin.hostname.toLowerCase());
}

export const USER_AI_PROVIDER_COPY: Readonly<Record<UserAIProvider, { title: string; keyLabel: string; description: string }>> = {
  GEMINI: {
    title: "Google Gemini",
    keyLabel: "Gemini API key",
    description: "Use your own Google AI Studio / Gemini API quota.",
  },
  OPENAI: {
    title: "OpenAI",
    keyLabel: "OpenAI API key",
    description: "Use your own OpenAI API account and quota.",
  },
  ANTHROPIC: {
    title: "Anthropic Claude",
    keyLabel: "Anthropic API key",
    description: "Use your own Anthropic API account and quota.",
  },
};

export const AI_ACCESS_COPY: Readonly<Record<AIAccessMode, { title: string; description: string }>> = {
  PLATFORM_GEMINI: {
    title: "CV Engine managed AI",
    description: "Internal/private platform route. It is not offered as a public entitlement.",
  },
  BYOK_GEMINI: {
    title: "Use my AI provider",
    description: "Connect Gemini, OpenAI, or Claude with your own API key for this browser session.",
  },
  NO_CLOUD_AI: {
    title: "Run AI on this device",
    description: "Download a small model in your browser and use your own CPU/GPU instead of CV Engine inference infrastructure.",
  },
};
