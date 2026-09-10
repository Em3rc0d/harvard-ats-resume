import { z } from "zod";

export const ResumeImprovementRunStatusSchema = z.enum([
  "IMPROVED",
  "PARTIALLY_IMPROVED",
  "ORIGINAL_PRESERVED_AI_UNAVAILABLE",
  "FAILED_SOURCE_UNREADABLE",
]);

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const JsonRecordSchema = z.record(z.string(), z.unknown());

export const ResumeImprovementRunSchema = z.object({
  id: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  sourceReceiptId: z.string().uuid(),
  sourceSha256: Sha256Schema,
  semanticDocumentJson: JsonRecordSchema.nullable(),
  semanticDocumentSha256: Sha256Schema.nullable(),
  editorProvenanceJson: JsonRecordSchema.nullable(),
  generatedDocumentJson: JsonRecordSchema.nullable(),
  generatedDocumentSha256: Sha256Schema.nullable(),
  guardianReportJson: JsonRecordSchema.nullable(),
  guardianReportSha256: Sha256Schema.nullable(),
  status: ResumeImprovementRunStatusSchema,
  targetJobSnapshotId: z.string().uuid().nullable(),
  targetTextHash: Sha256Schema.nullable(),
  createdAt: z.iso.datetime(),
}).strict().superRefine((run, context) => {
  const semanticPair = (run.semanticDocumentJson === null) === (run.semanticDocumentSha256 === null);
  const generatedPair = (run.generatedDocumentJson === null) === (run.generatedDocumentSha256 === null);
  const guardianPair = (run.guardianReportJson === null) === (run.guardianReportSha256 === null);
  if (!semanticPair) context.addIssue({ code: "custom", path: ["semanticDocumentSha256"], message: "Semantic document and hash must appear together." });
  if (!generatedPair) context.addIssue({ code: "custom", path: ["generatedDocumentSha256"], message: "Generated document and hash must appear together." });
  if (!guardianPair) context.addIssue({ code: "custom", path: ["guardianReportSha256"], message: "Guardian report and hash must appear together." });

  if (run.status === "FAILED_SOURCE_UNREADABLE") {
    if (run.semanticDocumentJson !== null || run.editorProvenanceJson !== null || run.generatedDocumentJson !== null || run.guardianReportJson !== null) {
      context.addIssue({ code: "custom", path: ["status"], message: "Unreadable-source runs cannot claim semantic/editor/guardian outputs." });
    }
    return;
  }

  if (run.semanticDocumentJson === null || run.generatedDocumentJson === null || run.guardianReportJson === null) {
    context.addIssue({ code: "custom", path: ["status"], message: "Readable terminal runs require semantic, generated and guardian documents." });
  }

  if (["IMPROVED", "PARTIALLY_IMPROVED"].includes(run.status) && run.editorProvenanceJson === null) {
    context.addIssue({ code: "custom", path: ["editorProvenanceJson"], message: "Improved runs require editor provenance." });
  }
});

export type ResumeImprovementRunStatus = z.infer<typeof ResumeImprovementRunStatusSchema>;
export type ResumeImprovementRun = z.infer<typeof ResumeImprovementRunSchema>;
