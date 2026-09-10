import { z } from "zod";

export const FACT_GUARDIAN_REPORT_VERSION = "v12-fact-guardian-report-v1" as const;

export const FactGuardianClassificationSchema = z.enum([
  "SOURCE_PRESERVED",
  "SAFE_REPHRASE",
  "SAFE_RESTRUCTURE",
  "SOURCE_OMISSION",
  "POSSIBLE_NEW_CLAIM",
  "UNSUPPORTED_NEW_CLAIM",
  "SOURCE_CONFLICT",
]);

export const FactGuardianReasonCodeSchema = z.enum([
  "EXACT_SOURCE_MEANING",
  "SUPPORTED_REPHRASE",
  "SUPPORTED_RESTRUCTURE",
  "SOURCE_NOT_RENDERED",
  "SUPPORT_AMBIGUOUS",
  "FACT_NOT_IN_SOURCE",
  "CONTRADICTS_SOURCE",
]);

export const FactGuardianFindingSchema = z.object({
  generatedPath: z.string().trim().min(1).max(300).nullable(),
  generatedTextSha256: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  classification: FactGuardianClassificationSchema,
  sourceOrdinals: z.array(z.number().int().min(1).max(100)).max(100),
  reasonCode: FactGuardianReasonCodeSchema,
}).strict().superRefine((finding, context) => {
  if (finding.classification === "SOURCE_OMISSION") {
    if (finding.generatedPath !== null || finding.generatedTextSha256 !== null || finding.sourceOrdinals.length === 0) {
      context.addIssue({ code: "custom", message: "Source omissions require source ordinals and no generated unit." });
    }
  } else if (finding.generatedPath === null || finding.generatedTextSha256 === null) {
    context.addIssue({ code: "custom", message: "Generated-unit findings require path and generated text hash." });
  }
});

export const FactGuardianProviderProvenanceSchema = z.object({
  provider: z.enum(["gemini", "ollama"]),
  model: z.string().trim().min(1).max(200),
  requestId: z.string().uuid(),
  contractVersion: z.string().trim().min(1).max(100),
  attempt: z.number().int().positive(),
  fallbackUsed: z.boolean(),
  credentialMode: z.enum(["PLATFORM", "BYOK", "LOCAL_ONLY"]),
}).strict();

export const FactGuardianPassSchema = z.object({
  passNumber: z.number().int().min(1).max(2),
  providerProvenance: FactGuardianProviderProvenanceSchema,
  reviewedPaths: z.array(z.string().trim().min(1).max(300)).max(500),
  reviewedSourceOrdinals: z.array(z.number().int().min(1).max(100)).max(100),
  findings: z.array(FactGuardianFindingSchema).max(600),
}).strict();

export const FactGuardianReportSchema = z.object({
  schemaVersion: z.literal(FACT_GUARDIAN_REPORT_VERSION),
  decision: z.enum(["PASS", "REPAIRED_PASS", "REJECTED"]),
  passes: z.array(FactGuardianPassSchema).min(1).max(2),
  repairedPaths: z.array(z.string().trim().min(1).max(300)).max(500),
  createdAt: z.iso.datetime(),
}).strict().superRefine((report, context) => {
  if (report.decision === "PASS" && (report.passes.length !== 1 || report.repairedPaths.length !== 0)) {
    context.addIssue({ code: "custom", message: "PASS requires one clean pass and no repairs." });
  }
  if (report.decision === "REPAIRED_PASS" && (report.passes.length !== 2 || report.repairedPaths.length === 0)) {
    context.addIssue({ code: "custom", message: "REPAIRED_PASS requires a repair and bounded second pass." });
  }
  if (new Set(report.repairedPaths).size !== report.repairedPaths.length) {
    context.addIssue({ code: "custom", path: ["repairedPaths"], message: "Repaired paths must be unique." });
  }
});

export type FactGuardianClassification = z.infer<typeof FactGuardianClassificationSchema>;
export type FactGuardianFinding = z.infer<typeof FactGuardianFindingSchema>;
export type FactGuardianPass = z.infer<typeof FactGuardianPassSchema>;
export type FactGuardianReport = z.infer<typeof FactGuardianReportSchema>;
