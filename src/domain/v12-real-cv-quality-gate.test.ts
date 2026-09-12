import { describe, expect, it } from "vitest";
import {
  RealCvQualityReceiptSchema,
  realCvQualityAccepted,
  type RealCvQualityReceipt,
} from "./resume/ResumeQualityAcceptance";

const baseReceipt: RealCvQualityReceipt = {
  schemaVersion: "v12-real-cv-quality-receipt-v1",
  sourceSha256: "a".repeat(64),
  runId: "12000000-0000-4000-8000-000000000901",
  generatedDocumentSha256: "b".repeat(64),
  guardianReportSha256: "c".repeat(64),
  artifactManifestSha256: "d".repeat(64),
  evaluator: "AUTOMATED_REPRESENTATIVE_FIXTURE",
  hardGates: {
    sourceParsedSuccessfully: true,
    semanticEntitiesMateriallyCorrect: true,
    candidateAssertionsRemainUsable: true,
    unsupportedNewClaims: 0,
    inventedMetrics: 0,
    inventedEmployersRolesDates: 0,
    docxValid: true,
    pdfValid: true,
    sourceToOutputProvenancePresent: true,
  },
  scores: {
    factualFidelity: 5,
    atsStructure: 4,
    clarity: 4,
    concision: 4,
    professionalPositioning: 4,
    redundancyReduction: 4,
    readability: 4,
    downloadValidity: 5,
  },
  evaluatedAt: "2026-09-12T16:00:00.000Z",
  accepted: true,
  notes: ["Representative fixture contains profile, employment, projects, dense technologies, education, certifications and languages."],
};

describe("v1.2 real-CV quality gate", () => {
  it("accepts only when every factual hard gate and every rubric threshold passes", () => {
    expect(realCvQualityAccepted(baseReceipt)).toBe(true);
    expect(RealCvQualityReceiptSchema.safeParse(baseReceipt).success).toBe(true);
  });

  it("blocks release on even one unsupported new claim regardless of writing quality", () => {
    const receipt = {
      ...baseReceipt,
      hardGates: { ...baseReceipt.hardGates, unsupportedNewClaims: 1 },
      accepted: false,
    };
    expect(realCvQualityAccepted(receipt)).toBe(false);
    expect(RealCvQualityReceiptSchema.safeParse(receipt).success).toBe(true);
  });

  it("blocks release when the output is factual but not materially better", () => {
    const receipt = {
      ...baseReceipt,
      scores: { ...baseReceipt.scores, clarity: 3 },
      accepted: false,
    };
    expect(realCvQualityAccepted(receipt)).toBe(false);
    expect(RealCvQualityReceiptSchema.safeParse(receipt).success).toBe(true);
  });

  it("cannot falsely label a failing receipt as accepted", () => {
    const invalid = {
      ...baseReceipt,
      hardGates: { ...baseReceipt.hardGates, inventedMetrics: 1 },
      accepted: true,
    };
    expect(RealCvQualityReceiptSchema.safeParse(invalid).success).toBe(false);
  });

  it("keeps private source text and candidate PII outside the receipt schema", () => {
    const leaking = {
      ...baseReceipt,
      sourceText: "candidate private resume text",
      email: "candidate@example.invalid",
    };
    expect(RealCvQualityReceiptSchema.safeParse(leaking).success).toBe(false);
  });
});
