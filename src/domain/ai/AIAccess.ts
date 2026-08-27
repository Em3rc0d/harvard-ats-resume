import { z } from "zod";

export const AIAccessModeSchema = z.enum([
  "PLATFORM_GEMINI",
  "BYOK_GEMINI",
  "NO_CLOUD_AI",
]);

export type AIAccessMode = z.infer<typeof AIAccessModeSchema>;

/**
 * Durable preference only. Raw BYOK credentials are intentionally impossible
 * to represent in this schema.
 */
export const AIAccessPreferenceSchema = z
  .object({
    mode: AIAccessModeSchema,
  })
  .strict();

export type AIAccessPreference = z.infer<typeof AIAccessPreferenceSchema>;

export const GeminiCredentialInputSchema = z
  .string()
  .trim()
  .min(16, "Gemini API key is too short")
  .max(512, "Gemini API key is too long");

export const AI_ACCESS_COPY: Readonly<Record<AIAccessMode, { title: string; description: string }>> = {
  PLATFORM_GEMINI: {
    title: "Use CV Engine AI",
    description: "Use CV Engine's server-side Gemini access under platform quotas and safeguards.",
  },
  BYOK_GEMINI: {
    title: "Use my Gemini API key",
    description: "Keep your Gemini key in this browser session only. CV Engine does not intentionally persist it.",
  },
  NO_CLOUD_AI: {
    title: "Continue without cloud AI",
    description: "Keep the trusted core available without sending career content to Gemini.",
  },
};
