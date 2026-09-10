import { describe, expect, it } from "vitest";
import { ResumeImprovementRunSchema } from "./resume/ResumeImprovementRun";

const uuid = "00000000-0000-4000-8000-000000000101";
const sha = "a".repeat(64);

function base() {
  return {
    id: uuid,
    ownerUserId: uuid,
    sourceReceiptId: "00000000-0000-4000-8000-000000000102",
    sourceSha256: sha,
    semanticDocumentJson: { version: "candidate-resume-document-v1" },
    semanticDocumentSha256: sha,
    editorProvenanceJson: { provider: "gemini", model: "quality-model" },
    generatedDocumentJson: { summary: "Improved source-faithful summary." },
    generatedDocumentSha256: sha,
    guardianReportJson: { unsupportedNewClaims: 0 },
    guardianReportSha256: sha,
    status: "IMPROVED" as const,
    targetJobSnapshotId: null,
    targetTextHash: null,
    createdAt: "2026-09-10T00:00:00.000Z",
  };
}

describe("v1.2 ResumeImprovementRun", () => {
  it("accepts a fully traced improved run", () => {
    expect(ResumeImprovementRunSchema.parse(base()).status).toBe("IMPROVED");
  });

  it("requires editor provenance for actual improvements", () => {
    const parsed = ResumeImprovementRunSchema.safeParse({ ...base(), editorProvenanceJson: null });
    expect(parsed.success).toBe(false);
  });

  it("allows AI-unavailable original preservation without pretending an editor ran", () => {
    const parsed = ResumeImprovementRunSchema.parse({
      ...base(),
      status: "ORIGINAL_PRESERVED_AI_UNAVAILABLE",
      editorProvenanceJson: null,
      generatedDocumentJson: { mode: "ORIGINAL_PRESERVED" },
      guardianReportJson: { mode: "DETERMINISTIC_ORIGINAL_PRESERVATION" },
    });
    expect(parsed.editorProvenanceJson).toBeNull();
  });

  it("does not allow an unreadable-source failure to carry invented semantic output", () => {
    const parsed = ResumeImprovementRunSchema.safeParse({
      ...base(),
      status: "FAILED_SOURCE_UNREADABLE",
      semanticDocumentJson: { invented: true },
      semanticDocumentSha256: sha,
      editorProvenanceJson: null,
      generatedDocumentJson: null,
      generatedDocumentSha256: null,
      guardianReportJson: null,
      guardianReportSha256: null,
    });
    expect(parsed.success).toBe(false);
  });

  it("requires every durable JSON payload to travel with its hash", () => {
    const parsed = ResumeImprovementRunSchema.safeParse({ ...base(), generatedDocumentSha256: null });
    expect(parsed.success).toBe(false);
  });
});
