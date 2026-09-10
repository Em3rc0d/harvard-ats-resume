import { z } from "zod";
import { CareerEvidenceKindSchema } from "../career/CareerEvidence";

export const IMPORT_REVIEW_STRUCTURE_VERSION = "v1.1-ai-import-structure-v1" as const;

export const ImportReviewKindSchema = z.union([
  CareerEvidenceKindSchema,
  z.enum(["PROFILE", "CONTACT", "NON_EVIDENCE", "UNKNOWN"]),
]);

export const ImportReviewConfidenceSchema = z.enum(["HIGH", "MEDIUM", "LOW"]);
export const ImportReviewDecisionSchema = z.enum([
  "READY",
  "NEEDS_USER_REVIEW",
  "NON_EVIDENCE",
  "DUPLICATE_CANDIDATE",
]);

export const ImportReviewReasonCodeSchema = z.enum([
  "SECTION_HEADING",
  "SECTION_CONTEXT",
  "CONTACT_PATTERN",
  "PROFILE_PATTERN",
  "ROLE_OR_ORG_PATTERN",
  "DATE_PATTERN",
  "BULLET_CONTINUITY",
  "SKILL_LIST_PATTERN",
  "EDUCATION_PATTERN",
  "CERTIFICATION_PATTERN",
  "LANGUAGE_PATTERN",
  "AMBIGUOUS_STRUCTURE",
  "DETERMINISTIC_FALLBACK",
  "CROSS_IMPORT_SIMILARITY",
]);

export const ImportReviewBlockSchema = z.object({
  id: z.string().regex(/^irb_[0-9a-f]{12}$/),
  sourceOrdinals: z.array(z.number().int().min(1).max(100)).min(1).max(20),
  kind: ImportReviewKindSchema,
  confidence: ImportReviewConfidenceSchema,
  decision: ImportReviewDecisionSchema,
  reasonCodes: z.array(ImportReviewReasonCodeSchema).max(12),
  duplicateOf: z.string().trim().min(1).max(120).nullable(),
}).strict().superRefine((block, context) => {
  if (new Set(block.sourceOrdinals).size !== block.sourceOrdinals.length) {
    context.addIssue({ code: "custom", path: ["sourceOrdinals"], message: "Review block ordinals must be unique." });
  }
  if (block.decision === "NON_EVIDENCE" && !["PROFILE", "CONTACT", "NON_EVIDENCE"].includes(block.kind)) {
    context.addIssue({ code: "custom", path: ["decision"], message: "Only non-evidence kinds may be excluded from Career Evidence." });
  }
  if (block.decision === "DUPLICATE_CANDIDATE" && block.duplicateOf === null) {
    context.addIssue({ code: "custom", path: ["duplicateOf"], message: "Duplicate candidates require a comparison target." });
  }
  if (block.decision !== "DUPLICATE_CANDIDATE" && block.duplicateOf !== null) {
    context.addIssue({ code: "custom", path: ["duplicateOf"], message: "Non-duplicate blocks cannot reference a duplicate target." });
  }
});

export const ImportReviewAIRunSchema = z.object({
  requestId: z.string().uuid(),
  status: z.enum(["SUCCESS", "FAILED"]),
  provider: z.enum(["GEMINI", "OLLAMA"]).nullable(),
  model: z.string().trim().min(1).max(200).nullable(),
  resultSha256: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  failureCode: z.string().trim().min(1).max(100).nullable(),
}).strict().superRefine((run, context) => {
  if (run.status === "SUCCESS" && (run.provider === null || run.model === null || run.resultSha256 === null || run.failureCode !== null)) {
    context.addIssue({ code: "custom", message: "Successful AI runs require provider, model and result hash only." });
  }
  if (run.status === "FAILED" && run.failureCode === null) {
    context.addIssue({ code: "custom", path: ["failureCode"], message: "Failed AI runs require a bounded failure code." });
  }
});

export const ImportReviewStructureSchema = z.object({
  id: z.string().uuid(),
  receiptId: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  structureVersion: z.literal(IMPORT_REVIEW_STRUCTURE_VERSION),
  status: z.enum(["AI_STRUCTURED", "HYBRID", "DETERMINISTIC_FALLBACK"]),
  blocks: z.array(ImportReviewBlockSchema).min(1).max(100),
  aiRuns: z.array(ImportReviewAIRunSchema).max(20),
  createdAt: z.iso.datetime(),
}).strict().superRefine((structure, context) => {
  const ordinals = structure.blocks.flatMap((block) => block.sourceOrdinals);
  if (new Set(ordinals).size !== ordinals.length) {
    context.addIssue({ code: "custom", path: ["blocks"], message: "A source proposal may belong to only one review block." });
  }
  if (structure.status === "AI_STRUCTURED" && (structure.aiRuns.length === 0 || structure.aiRuns.some((run) => run.status !== "SUCCESS"))) {
    context.addIssue({ code: "custom", path: ["status"], message: "AI_STRUCTURED requires only successful AI runs." });
  }
  if (structure.status === "DETERMINISTIC_FALLBACK" && structure.aiRuns.some((run) => run.status === "SUCCESS")) {
    context.addIssue({ code: "custom", path: ["status"], message: "Deterministic fallback cannot contain successful AI runs." });
  }
});

export type ImportReviewKind = z.infer<typeof ImportReviewKindSchema>;
export type ImportReviewBlock = z.infer<typeof ImportReviewBlockSchema>;
export type ImportReviewAIRun = z.infer<typeof ImportReviewAIRunSchema>;
export type ImportReviewStructure = z.infer<typeof ImportReviewStructureSchema>;

export function isCareerEvidenceReviewKind(kind: ImportReviewKind): kind is z.infer<typeof CareerEvidenceKindSchema> {
  return CareerEvidenceKindSchema.safeParse(kind).success;
}
