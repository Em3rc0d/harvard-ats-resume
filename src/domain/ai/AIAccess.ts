import { z } from "zod";

export const AIAccessModeSchema = z.enum([
  "PLATFORM_GEMINI",
  "BYOK_GEMINI",
  "BYOK_OPENAI",
  "BYOK_ANTHROPIC",
  "LOCAL_BROWSER",
  "NO_CLOUD_AI",
]);

export type AIAccessMode = z.infer<typeof AIAccessModeSchema>;

export const PUBLIC_AI_ACCESS_MODES = [
  "BYOK_GEMINI",
  "BYOK_OPENAI",
  "BYOK_ANTHROPIC",
  "LOCAL_BROWSER",
] as const satisfies readonly AIAccessMode[];

export type BYOKProvider = "GEMINI" | "OPENAI" | "ANTHROPIC";

export function byokProviderForAccessMode(mode: AIAccessMode): BYOKProvider | null {
  if (mode === "BYOK_GEMINI") return "GEMINI";
  if (mode === "BYOK_OPENAI") return "OPENAI";
  if (mode === "BYOK_ANTHROPIC") return "ANTHROPIC";
  return null;
}

export function isPublicAIAccessMode(mode: AIAccessMode): boolean {
  return (PUBLIC_AI_ACCESS_MODES as readonly string[]).includes(mode);
}

/**
 * Durable preference only. Raw BYOK credentials are intentionally impossible
 * to represent in this schema.
 */
export const AIAccessPreferenceSchema = z.object({ mode: AIAccessModeSchema }).strict();
export type AIAccessPreference = z.infer<typeof AIAccessPreferenceSchema>;

export const BYOKCredentialInputSchema = z
  .string()
  .trim()
  .min(16, "API key is too short")
  .max(1024, "API key is too long");

/** Backwards-compatible name for existing contracts/tests. */
export const GeminiCredentialInputSchema = BYOKCredentialInputSchema;

export type BrowserOriginLike = Readonly<{ protocol: string; hostname: string }>;
const LOCAL_BYOK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function isByokTransportAllowed(origin: BrowserOriginLike): boolean {
  if (origin.protocol === "https:") return true;
  if (origin.protocol !== "http:") return false;
  return LOCAL_BYOK_HOSTS.has(origin.hostname.toLowerCase());
}

export const AI_ACCESS_COPY: Readonly<Record<AIAccessMode, { title: string; description: string }>> = {
  PLATFORM_GEMINI: {
    title: "CV Engine managed AI",
    description: "Private/internal platform AI. This mode is not offered to public users.",
  },
  BYOK_GEMINI: {
    title: "Google Gemini",
    description: "Use your own Gemini API key. Provider usage and cost belong to your account.",
  },
  BYOK_OPENAI: {
    title: "OpenAI",
    description: "Use your own OpenAI API key. Provider usage and cost belong to your account.",
  },
  BYOK_ANTHROPIC: {
    title: "Anthropic Claude",
    description: "Use your own Anthropic API key. Provider usage and cost belong to your account.",
  },
  LOCAL_BROWSER: {
    title: "Run AI on this device",
    description: "Use a browser-local model so inference runs on your computer instead of CV Engine infrastructure.",
  },
  NO_CLOUD_AI: {
    title: "Legacy no-cloud mode",
    description: "Legacy compatibility mode. New sessions should choose browser-local AI instead.",
  },
};
