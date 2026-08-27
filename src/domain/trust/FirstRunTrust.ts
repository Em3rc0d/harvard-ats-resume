import { z } from "zod";
import { AIAccessModeSchema } from "../ai/AIAccess";

export const CURRENT_TRUST_DISCLOSURE_VERSION = "cv-engine-trust-v1" as const;

export const TrustDisclosureSchema = z
  .object({
    version: z.literal(CURRENT_TRUST_DISCLOSURE_VERSION),
    aiCanBeWrong: z.literal(true),
    userReviewRequired: z.literal(true),
    jobDescriptionCannotCreateCandidateTruth: z.literal(true),
    cloudProcessingDisclosed: z.literal(true),
    byokIsTransient: z.literal(true),
  })
  .strict();

export const CURRENT_TRUST_DISCLOSURE = TrustDisclosureSchema.parse({
  version: CURRENT_TRUST_DISCLOSURE_VERSION,
  aiCanBeWrong: true,
  userReviewRequired: true,
  jobDescriptionCannotCreateCandidateTruth: true,
  cloudProcessingDisclosed: true,
  byokIsTransient: true,
});

export const ConsentReceiptSchema = z
  .object({
    ownerUserId: z.string().uuid(),
    disclosureVersion: z.literal(CURRENT_TRUST_DISCLOSURE_VERSION),
    acknowledgedAt: z.string().datetime(),
    aiAccessModePreference: AIAccessModeSchema.optional(),
  })
  .strict();

export type ConsentReceipt = z.infer<typeof ConsentReceiptSchema>;
