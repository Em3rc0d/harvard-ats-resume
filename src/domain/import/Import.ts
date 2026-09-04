import { z } from "zod";
import { CareerEvidenceKindSchema } from "../career/CareerEvidence";

export const B5_EXTRACTOR_VERSION = "b5-mechanical-resume-extractor-v1" as const;
export const B5_PROPOSAL_VERSION = "b5-line-proposals-v1" as const;

export const ImportMediaTypeSchema = z.enum(["PDF", "DOCX"]);
export const ImportReceiptStatusSchema = z.enum(["EXTRACTED", "UNSUPPORTED", "EMPTY", "REJECTED"]);
export const ImportProposalStatusSchema = z.enum(["PENDING", "ACCEPTED", "DISMISSED"]);

export const ImportProposalSchema = z.object({
  id: z.string().uuid(),
  receiptId: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  ordinal: z.number().int().positive(),
  sourceLine: z.number().int().positive(),
  canonicalText: z.string().trim().min(1).max(1_000),
  sourceTextSha256: z.string().regex(/^[0-9a-f]{64}$/),
  status: ImportProposalStatusSchema,
  acceptedEvidenceId: z.string().uuid().nullable(),
  createdAt: z.iso.datetime(),
});

export const ImportReceiptSchema = z.object({
  id: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  sourceName: z.string().trim().min(1).max(255),
  mediaType: ImportMediaTypeSchema,
  sourceSizeBytes: z.number().int().positive().max(5 * 1024 * 1024),
  sourceSha256: z.string().regex(/^[0-9a-f]{64}$/),
  extractedTextSha256: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  extractorVersion: z.literal(B5_EXTRACTOR_VERSION),
  proposalVersion: z.literal(B5_PROPOSAL_VERSION),
  status: ImportReceiptStatusSchema,
  warningCode: z.string().trim().min(1).max(100).nullable(),
  proposalCount: z.number().int().nonnegative().max(100),
  proposals: z.array(ImportProposalSchema).max(100),
  createdAt: z.iso.datetime(),
}).superRefine((value, context) => {
  if (value.proposalCount !== value.proposals.length) {
    context.addIssue({ code: "custom", path: ["proposalCount"], message: "Receipt proposal count must match proposals." });
  }
  if (value.status === "EXTRACTED" && (value.extractedTextSha256 === null || value.proposals.length === 0)) {
    context.addIssue({ code: "custom", path: ["status"], message: "EXTRACTED imports require extracted-text hash and review proposals." });
  }
  if (value.status !== "EXTRACTED" && value.proposals.length > 0) {
    context.addIssue({ code: "custom", path: ["proposals"], message: "Non-extracted imports cannot carry proposals." });
  }
});

export const AcceptImportProposalInputSchema = z.object({
  kind: CareerEvidenceKindSchema,
}).strict();

const ImportProposalGroupIdsSchema = z.array(z.string().uuid()).min(2).max(20).superRefine((ids, context) => {
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", message: "Grouped proposal ids must be unique." });
  }
});

export const AcceptImportProposalGroupInputSchema = z.object({
  proposalIds: ImportProposalGroupIdsSchema,
  kind: CareerEvidenceKindSchema,
}).strict();

export type ImportMediaType = z.infer<typeof ImportMediaTypeSchema>;
export type ImportReceiptStatus = z.infer<typeof ImportReceiptStatusSchema>;
export type ImportProposal = z.infer<typeof ImportProposalSchema>;
export type ImportReceipt = z.infer<typeof ImportReceiptSchema>;
