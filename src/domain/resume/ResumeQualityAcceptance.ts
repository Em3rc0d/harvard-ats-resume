import { z } from "zod";

export const REAL_CV_QUALITY_RECEIPT_VERSION = "v12-real-cv-quality-receipt-v1" as const;

export const ResumeQualityScoreSchema = z.number().int().min(1).max(5);

export const ResumeQualityScoresSchema = z.object({
  factualFidelity: ResumeQualityScoreSchema,
  atsStructure: ResumeQualityScoreSchema,
  clarity: ResumeQualityScoreSchema,
  concision: ResumeQualityScoreSchema,
  professionalPositioning: ResumeQualityScoreSchema,
  redundancyReduction: ResumeQualityScoreSchema,
  readability: ResumeQualityScoreSchema,
  downloadValidity: ResumeQualityScoreSchema,
}).strict();

export const REAL_CV_QUALITY_THRESHOLDS = Object.freeze({
  factualFidelity: 5,
  atsStructure: 4,
  clarity: 4,
  concision: 4,
  professionalPositioning: 4,
  redundancyReduction: 4,
  readability: 4,
  downloadValidity: 5,
} as const);

export const RealCvHardGatesSchema = z.object({
  sourceParsedSuccessfully: z.boolean(),
  semanticEntitiesMateriallyCorrect: z.boolean(),
  candidateAssertionsRemainUsable: z.boolean(),
  unsupportedNewClaims: z.number().int().nonnegative(),
  inventedMetrics: z.number().int().nonnegative(),
  inventedEmployersRolesDates: z.number().int().nonnegative(),
  docxValid: z.boolean(),
  pdfValid: z.boolean(),
  sourceToOutputProvenancePresent: z.boolean(),
}).strict();

export const RealCvQualityReceiptSchema = z.object({
  schemaVersion: z.literal(REAL_CV_QUALITY_RECEIPT_VERSION),
  sourceSha256: z.string().regex(/^[0-9a-f]{64}$/),
  runId: z.string().uuid(),
  generatedDocumentSha256: z.string().regex(/^[0-9a-f]{64}$/),
  guardianReportSha256: z.string().regex(/^[0-9a-f]{64}$/),
  artifactManifestSha256: z.string().regex(/^[0-9a-f]{64}$/),
  evaluator: z.enum(["HUMAN_REVIEW", "AUTOMATED_REPRESENTATIVE_FIXTURE"]),
  hardGates: RealCvHardGatesSchema,
  scores: ResumeQualityScoresSchema,
  evaluatedAt: z.iso.datetime(),
  accepted: z.boolean(),
  notes: z.array(z.string().trim().min(1).max(500)).max(20),
}).strict().superRefine((receipt, context) => {
  const expected = realCvQualityAccepted(receipt);
  if (receipt.accepted !== expected) {
    context.addIssue({
      code: "custom",
      path: ["accepted"],
      message: "Acceptance must equal the deterministic hard-gate and rubric decision.",
    });
  }
});

export type ResumeQualityScores = z.infer<typeof ResumeQualityScoresSchema>;
export type RealCvHardGates = z.infer<typeof RealCvHardGatesSchema>;
export type RealCvQualityReceipt = z.infer<typeof RealCvQualityReceiptSchema>;

type AcceptanceInput = Pick<RealCvQualityReceipt, "hardGates" | "scores">;

export function realCvQualityAccepted(receipt: AcceptanceInput) {
  const hard = receipt.hardGates;
  if (
    !hard.sourceParsedSuccessfully ||
    !hard.semanticEntitiesMateriallyCorrect ||
    !hard.candidateAssertionsRemainUsable ||
    hard.unsupportedNewClaims !== 0 ||
    hard.inventedMetrics !== 0 ||
    hard.inventedEmployersRolesDates !== 0 ||
    !hard.docxValid ||
    !hard.pdfValid ||
    !hard.sourceToOutputProvenancePresent
  ) {
    return false;
  }

  const scores = receipt.scores;
  return (
    scores.factualFidelity >= REAL_CV_QUALITY_THRESHOLDS.factualFidelity &&
    scores.atsStructure >= REAL_CV_QUALITY_THRESHOLDS.atsStructure &&
    scores.clarity >= REAL_CV_QUALITY_THRESHOLDS.clarity &&
    scores.concision >= REAL_CV_QUALITY_THRESHOLDS.concision &&
    scores.professionalPositioning >= REAL_CV_QUALITY_THRESHOLDS.professionalPositioning &&
    scores.redundancyReduction >= REAL_CV_QUALITY_THRESHOLDS.redundancyReduction &&
    scores.readability >= REAL_CV_QUALITY_THRESHOLDS.readability &&
    scores.downloadValidity >= REAL_CV_QUALITY_THRESHOLDS.downloadValidity
  );
}
