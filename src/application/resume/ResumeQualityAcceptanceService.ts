import { createHash } from "node:crypto";
import { FactGuardianReportSchema } from "../../domain/resume/FactGuardian";
import {
  REAL_CV_QUALITY_RECEIPT_VERSION,
  RealCvQualityReceiptSchema,
  realCvQualityAccepted,
  type RealCvQualityReceipt,
  type ResumeQualityScores,
} from "../../domain/resume/ResumeQualityAcceptance";
import { ResumeImprovementRunSchema, type ResumeImprovementRun } from "../../domain/resume/ResumeImprovementRun";
import type { ResumeImprovementArtifactBundle } from "./ResumeImprovementArtifactAdapter";

export type RealCvQualityHumanAssessment = Readonly<{
  semanticEntitiesMateriallyCorrect: boolean;
  candidateAssertionsRemainUsable: boolean;
  inventedMetrics: number;
  inventedEmployersRolesDates: number;
  scores: ResumeQualityScores;
  evaluator: "HUMAN_REVIEW" | "AUTOMATED_REPRESENTATIVE_FIXTURE";
  notes?: readonly string[];
  evaluatedAt: string;
}>;

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isDocx(bytes: Uint8Array) {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function isPdf(bytes: Uint8Array) {
  return bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
}

function unsupportedCount(run: ResumeImprovementRun) {
  if (run.guardianReportJson === null) return Number.MAX_SAFE_INTEGER;
  const report = FactGuardianReportSchema.parse(run.guardianReportJson);
  const finalPass = report.passes.at(-1);
  if (!finalPass || report.decision === "REJECTED") return Number.MAX_SAFE_INTEGER;
  return finalPass.findings.filter((finding) =>
    finding.classification === "POSSIBLE_NEW_CLAIM" ||
    finding.classification === "UNSUPPORTED_NEW_CLAIM" ||
    finding.classification === "SOURCE_CONFLICT"
  ).length;
}

function provenancePresent(bundle: ResumeImprovementArtifactBundle, run: ResumeImprovementRun) {
  try {
    const parsed = JSON.parse(bundle.provenanceJson) as {
      artifact?: { manifest?: { runId?: string; sourceDocumentSha256?: string; generatedDocumentSha256?: string; guardianReportSha256?: string } };
      fileHashes?: { docxSha256?: string; pdfSha256?: string; textSha256?: string };
    };
    return parsed.artifact?.manifest?.runId === run.id &&
      parsed.artifact?.manifest?.sourceDocumentSha256 === run.sourceSha256 &&
      parsed.artifact?.manifest?.generatedDocumentSha256 === run.generatedDocumentSha256 &&
      parsed.artifact?.manifest?.guardianReportSha256 === run.guardianReportSha256 &&
      typeof parsed.fileHashes?.docxSha256 === "string" &&
      typeof parsed.fileHashes?.pdfSha256 === "string" &&
      typeof parsed.fileHashes?.textSha256 === "string";
  } catch {
    return false;
  }
}

export function buildRealCvQualityReceipt(
  inputRun: ResumeImprovementRun,
  bundle: ResumeImprovementArtifactBundle,
  assessment: RealCvQualityHumanAssessment,
): RealCvQualityReceipt {
  const run = ResumeImprovementRunSchema.parse(inputRun);
  const hardGates = {
    sourceParsedSuccessfully: run.status !== "FAILED_SOURCE_UNREADABLE",
    semanticEntitiesMateriallyCorrect: assessment.semanticEntitiesMateriallyCorrect,
    candidateAssertionsRemainUsable: assessment.candidateAssertionsRemainUsable,
    unsupportedNewClaims: unsupportedCount(run),
    inventedMetrics: assessment.inventedMetrics,
    inventedEmployersRolesDates: assessment.inventedEmployersRolesDates,
    docxValid: isDocx(bundle.docx),
    pdfValid: isPdf(bundle.pdf),
    sourceToOutputProvenancePresent: provenancePresent(bundle, run),
  } as const;

  const partial = {
    schemaVersion: REAL_CV_QUALITY_RECEIPT_VERSION,
    sourceSha256: run.sourceSha256,
    runId: run.id,
    generatedDocumentSha256: run.generatedDocumentSha256 ?? "0".repeat(64),
    guardianReportSha256: run.guardianReportSha256 ?? "0".repeat(64),
    artifactManifestSha256: sha256(JSON.stringify(bundle.artifact.manifest)),
    evaluator: assessment.evaluator,
    hardGates,
    scores: assessment.scores,
    evaluatedAt: assessment.evaluatedAt,
    notes: [...(assessment.notes ?? [])],
  };

  return RealCvQualityReceiptSchema.parse({
    ...partial,
    accepted: realCvQualityAccepted(partial),
  });
}
