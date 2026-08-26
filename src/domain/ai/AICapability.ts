import { z } from "zod";

export const AICapabilityClassSchema = z.enum([
  "OPTIONAL_ENHANCEMENT",
  "BOUNDED_ASSIST",
  "DERIVED_ANALYSIS_ASSIST",
]);

export const CredentialModeSchema = z.enum([
  "PLATFORM_KEY",
  "BYOK_REQUEST_SCOPED",
  "NO_CLOUD_AI",
]);

export const AIExecutionBudgetSchema = z.object({
  capability: z.string().trim().min(1).max(100),
  capabilityClass: AICapabilityClassSchema,
  maxGeminiAttempts: z.number().int().min(0).max(2),
  maxOllamaAttempts: z.number().int().min(0).max(1),
  maxInputTokens: z.number().int().positive(),
  maxOutputTokens: z.number().int().positive(),
  perAttemptTimeoutMs: z.number().int().positive(),
  wholeOperationDeadlineMs: z.number().int().positive(),
  allowQualityEscalation: z.boolean(),
}).superRefine((budget, ctx) => {
  if (budget.perAttemptTimeoutMs > budget.wholeOperationDeadlineMs) {
    ctx.addIssue({
      code: "custom",
      path: ["perAttemptTimeoutMs"],
      message: "Per-attempt timeout cannot exceed whole-operation deadline",
    });
  }
});

export type AICapabilityClass = z.infer<typeof AICapabilityClassSchema>;
export type CredentialMode = z.infer<typeof CredentialModeSchema>;
export type AIExecutionBudget = z.infer<typeof AIExecutionBudgetSchema>;
