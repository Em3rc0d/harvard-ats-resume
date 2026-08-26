import { z } from "zod";

export const CareerEvidenceKindSchema = z.enum([
  "EMPLOYMENT",
  "PROJECT",
  "ACHIEVEMENT",
  "EDUCATION",
  "CERTIFICATION",
  "SKILL",
  "LANGUAGE",
  "METRIC",
]);

export const CareerEvidenceSourceSchema = z.enum([
  "MANUAL",
  "IMPORTED_RESUME",
  "IMPORTED_CERTIFICATE",
  "USER_CONFIRMED",
  "SYSTEM_DERIVED_DETERMINISTIC",
]);

export const VerificationStatusSchema = z.enum([
  "UNVERIFIED",
  "NEEDS_REVIEW",
  "VERIFIED",
]);

export const CareerEvidenceSchema = z.object({
  id: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  kind: CareerEvidenceKindSchema,
  source: CareerEvidenceSourceSchema,
  verificationStatus: VerificationStatusSchema,
  canonicalText: z.string().trim().min(1).max(10_000),
  revision: z.number().int().positive(),
  sourceDocumentId: z.string().uuid().optional(),
  createdAt: z.iso.datetime(),
});

export type CareerEvidence = z.infer<typeof CareerEvidenceSchema>;
