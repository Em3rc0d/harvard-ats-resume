import { z } from "zod";

export const B9_PRESENTATION_VALIDATOR_VERSION = "b9-presentation-validator-v1" as const;

export const PresentationValidationReasonCodeSchema = z.enum([
  "FACT_ADDED",
  "FACT_REMOVED_MATERIALLY",
  "METRIC_ADDED",
  "METRIC_CHANGED",
  "EMPLOYER_CHANGED",
  "TITLE_CHANGED",
  "DATE_CHANGED",
  "SKILL_ADDED",
  "CERTIFICATION_ADDED",
  "OWNERSHIP_STRENGTHENED",
  "SENIORITY_STRENGTHENED",
  "SCOPE_STRENGTHENED",
  "NEGATION_CHANGED",
  "UNSUPPORTED_SUPERLATIVE",
  "SOURCE_NOT_PRESERVED",
]);

export const PresentationValidationResultSchema = z.object({
  status: z.literal("PASS"),
  reasonCodes: z.array(PresentationValidationReasonCodeSchema).length(0),
}).strict();

export const PresentationProviderProvenanceSchema = z.object({
  provider: z.enum(["gemini", "ollama"]),
  model: z.string().trim().min(1).max(200),
  capability: z.literal("INLINE_WORDING_OPTIMIZATION"),
  contractVersion: z.string().trim().min(1).max(200),
  attempt: z.number().int().positive().max(3),
  fallbackUsed: z.boolean(),
  credentialMode: z.enum(["PLATFORM", "BYOK", "LOCAL_ONLY"]),
  requestId: z.string().trim().min(1).max(200),
}).strict();

export const PresentationRevisionStatusSchema = z.enum([
  "PROPOSED",
  "APPROVED",
  "REJECTED",
]);

export const PresentationRevisionSchema = z.object({
  id: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  evidenceId: z.string().uuid(),
  evidenceRevision: z.number().int().positive(),
  sourceTextSha256: z.string().regex(/^[0-9a-f]{64}$/),
  proposedText: z.string().trim().min(1).max(10_000),
  proposedTextSha256: z.string().regex(/^[0-9a-f]{64}$/),
  provenance: PresentationProviderProvenanceSchema,
  validatorVersion: z.literal(B9_PRESENTATION_VALIDATOR_VERSION),
  validationResult: PresentationValidationResultSchema,
  status: PresentationRevisionStatusSchema,
  createdAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().nullable(),
}).superRefine((value, context) => {
  if (value.status === "PROPOSED" && value.resolvedAt !== null) {
    context.addIssue({
      code: "custom",
      path: ["resolvedAt"],
      message: "PROPOSED presentation revisions cannot be resolved.",
    });
  }
  if (value.status !== "PROPOSED" && value.resolvedAt === null) {
    context.addIssue({
      code: "custom",
      path: ["resolvedAt"],
      message: "Terminal presentation revisions require resolvedAt.",
    });
  }
});

export const RecordPresentationProposalInputSchema = z.object({
  evidenceId: z.string().uuid(),
  evidenceRevision: z.number().int().positive(),
  sourceTextSha256: z.string().regex(/^[0-9a-f]{64}$/),
  proposedText: z.string().trim().min(1).max(10_000),
  proposedTextSha256: z.string().regex(/^[0-9a-f]{64}$/),
  provenance: PresentationProviderProvenanceSchema,
  validatorVersion: z.literal(B9_PRESENTATION_VALIDATOR_VERSION),
  validationResult: PresentationValidationResultSchema,
}).strict();

export const ResolvePresentationRevisionInputSchema = z.object({
  presentationRevisionId: z.string().uuid(),
  decision: z.enum(["APPROVE", "REJECT"]),
}).strict();

export type PresentationValidationReasonCode = z.infer<typeof PresentationValidationReasonCodeSchema>;
export type PresentationValidationResult = z.infer<typeof PresentationValidationResultSchema>;
export type PresentationProviderProvenance = z.infer<typeof PresentationProviderProvenanceSchema>;
export type PresentationRevisionStatus = z.infer<typeof PresentationRevisionStatusSchema>;
export type PresentationRevision = z.infer<typeof PresentationRevisionSchema>;
export type RecordPresentationProposalInput = z.infer<typeof RecordPresentationProposalInputSchema>;
export type ResolvePresentationRevisionInput = z.infer<typeof ResolvePresentationRevisionInputSchema>;
