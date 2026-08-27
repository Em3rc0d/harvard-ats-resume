import { z } from "zod";
import {
  CareerEvidenceKindSchema,
  VerificationStatusSchema,
} from "./CareerEvidence";

export const CreateManualCareerEvidenceInputSchema = z
  .object({
    kind: CareerEvidenceKindSchema,
    canonicalText: z.string().trim().min(1).max(10_000),
    verificationStatus: VerificationStatusSchema.default("UNVERIFIED"),
  })
  .strict();

export const ReviseCareerEvidenceInputSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    canonicalText: z.string().trim().min(1).max(10_000),
    verificationStatus: VerificationStatusSchema,
  })
  .strict();

export type CreateManualCareerEvidenceInput = z.infer<
  typeof CreateManualCareerEvidenceInputSchema
>;
export type ReviseCareerEvidenceInput = z.infer<typeof ReviseCareerEvidenceInputSchema>;

export const CareerEvidenceCurrentSchema = z.object({
  id: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  vaultId: z.string().uuid(),
  kind: CareerEvidenceKindSchema,
  source: z.literal("MANUAL").or(
    z.enum([
      "IMPORTED_RESUME",
      "IMPORTED_CERTIFICATE",
      "USER_CONFIRMED",
      "SYSTEM_DERIVED_DETERMINISTIC",
    ]),
  ),
  verificationStatus: VerificationStatusSchema,
  canonicalText: z.string().trim().min(1).max(10_000),
  revision: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type CareerEvidenceCurrent = z.infer<typeof CareerEvidenceCurrentSchema>;
