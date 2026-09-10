import { describe, expect, it } from "vitest";
import type { ResumeImprovementRun } from "./resume/ResumeImprovementRun";
import { B9_RENDERER_CONTRACT_VERSION } from "./resume/ResumeArtifact";
import { renderResumeImprovementRunArtifact } from "../application/resume/ResumeImprovementArtifactAdapter";

const owner = "12000000-0000-4000-8000-000000000101";
const runId = "12000000-0000-4000-8000-000000000102";
const sourceReceiptId = "12000000-0000-4000-8000-000000000103";
const sourceDocumentId = "12000000-0000-4000-8000-000000000104";
const sourceSha = "1".repeat(64);
const semanticSha = "2".repeat(64);
const generatedSha = "3".repeat(64);
const guardianSha = "4".repeat(64);
const ref = (ordinal: number) => ({
  proposalId: `12000000-0000-4000-8000-${String(ordinal).padStart(12, "0")}`,
  ordinal,
  sourceLine: ordinal,
  sourceTextSha256: String(ordinal).repeat(64).slice(0, 64),
});

function run(guardianDecision: "PASS" | "REPAIRED_PASS" | "REJECTED" = "PASS"): ResumeImprovementRun {
  const generatedDocumentJson = {
    id: "12000000-0000-4000-8000-000000000105",
    ownerUserId: owner,
    sourceDocumentId,
    sourceReceiptId,
    sourceDocumentSha256: sourceSha,
    documentVersion: "v12-generated-resume-document-v1",
    editorStatus: "AI_EDITED",
    locale: "en-US",
    header: {
      displayName: { text: "Ada Candidate", sourceRefs: [ref(1)] },
      headline: { text: "Software Engineer", sourceRefs: [ref(2)] },
      contactLines: [{ text: "ada@example.test", sourceRefs: [ref(3)] }],
      sourceRefs: [ref(1), ref(2), ref(3)],
    },
    summary: { text: "Builds reliable systems.", sourceRefs: [ref(4)] },
    experience: [{
      title: { text: "Software Engineer", sourceRefs: [ref(5)] },
      subtitle: { text: "Example Labs", sourceRefs: [ref(6)] },
      metaLines: [],
      summary: null,
      bullets: [{ text: "Built a deterministic evidence pipeline.", sourceRefs: [ref(7)] }],
      sourceRefs: [ref(5), ref(6), ref(7)],
    }],
    projects: [], education: [], certifications: [],
    skillGroups: [{ label: "Core", items: [{ text: "TypeScript", sourceRefs: [ref(8)] }], sourceRefs: [ref(8)] }],
    languageGroups: [], otherGroups: [], omittedSourceOrdinals: [],
    sourceProvenanceIndex: [1,2,3,4,5,6,7,8].map(ref),
    createdAt: "2026-09-10T03:00:00.000Z",
  };
  const guardianReportJson = {
    schemaVersion: "v12-fact-guardian-report-v1",
    decision: guardianDecision,
    passes: [{
      passNumber: 1,
      providerProvenance: {
        provider: "gemini",
        model: "gemini-3.5-flash-lite",
        requestId: "12000000-0000-4000-8000-000000000106",
        contractVersion: "b6-ai-runtime-v1",
        attempt: 1,
        fallbackUsed: false,
        credentialMode: "PLATFORM",
      },
      reviewedPaths: ["header.displayName"],
      reviewedSourceOrdinals: [1,2,3,4,5,6,7,8],
      findings: [{ generatedPath: "header.displayName", generatedTextSha256: "5".repeat(64), classification: "SOURCE_PRESERVED", sourceOrdinals: [1], reasonCode: "EXACT_SOURCE_MEANING" }],
    }],
    repairedPaths: [],
    createdAt: "2026-09-10T03:01:00.000Z",
  };
  return {
    id: runId,
    ownerUserId: owner,
    sourceReceiptId,
    sourceSha256: sourceSha,
    semanticDocumentJson: { version: "candidate" },
    semanticDocumentSha256: semanticSha,
    editorProvenanceJson: {
      provider: "gemini", model: "gemini-3.7-flash", requestId: "editor-1",
      contractVersion: "b6-ai-runtime-v1", attempt: 1, fallbackUsed: false, credentialMode: "PLATFORM",
    },
    generatedDocumentJson,
    generatedDocumentSha256: generatedSha,
    guardianReportJson,
    guardianReportSha256: guardianSha,
    status: "IMPROVED",
    targetJobSnapshotId: null,
    targetTextHash: null,
    createdAt: "2026-09-10T03:02:00.000Z",
  };
}

describe("v1.2 improvement artifact adapter", () => {
  it("renders the guarded semantic result through the exact shared ATS renderer contract", () => {
    const bundle = renderResumeImprovementRunArtifact(run());
    expect(bundle.artifact.manifest.rendererContractVersion).toBe(B9_RENDERER_CONTRACT_VERSION);
    expect(bundle.artifact.manifest.sourceDocumentSha256).toBe(sourceSha);
    expect(bundle.artifact.manifest.semanticDocumentSha256).toBe(semanticSha);
    expect(bundle.artifact.manifest.generatedDocumentSha256).toBe(generatedSha);
    expect(bundle.artifact.manifest.guardianReportSha256).toBe(guardianSha);
    expect(bundle.artifact.manifest.editorProvenance).toMatchObject({ provider: "gemini", model: "gemini-3.7-flash", requestId: "editor-1" });
    expect(bundle.text).toContain("Ada Candidate\nSoftware Engineer\nada@example.test");
    expect(bundle.text).toContain("Professional Summary\nBuilds reliable systems.");
    expect(bundle.text).toContain("Experience\nSoftware Engineer | Example Labs\n- Built a deterministic evidence pipeline.");
    expect(bundle.text).toContain("Skills\nCore: TypeScript");
    expect(new TextDecoder().decode(bundle.pdf)).not.toContain("/Subtype /Image");
  });

  it("replays TXT, DOCX, PDF and provenance byte-for-byte from the same durable run", () => {
    const first = renderResumeImprovementRunArtifact(run());
    const second = renderResumeImprovementRunArtifact(run());
    expect(second.text).toBe(first.text);
    expect([...second.docx]).toEqual([...first.docx]);
    expect([...second.pdf]).toEqual([...first.pdf]);
    expect(second.provenanceJson).toBe(first.provenanceJson);
    expect(second.artifact.manifest.replayIdentitySha256).toBe(first.artifact.manifest.replayIdentitySha256);
    expect(second.artifact.artifactSemanticSha256).toBe(first.artifact.artifactSemanticSha256);
  });

  it("adds only deterministic structural labels/separators around already-approved generated text", () => {
    const text = renderResumeImprovementRunArtifact(run()).text;
    for (const factual of ["Ada Candidate", "Software Engineer", "ada@example.test", "Builds reliable systems.", "Example Labs", "Built a deterministic evidence pipeline.", "TypeScript"]) {
      expect(text).toContain(factual);
    }
    expect(text).not.toContain("10x");
    expect(text).not.toContain("Senior");
    expect(text).not.toContain("AI expert");
  });

  it("refuses to render a run rejected by the independent Guardian", () => {
    expect(() => renderResumeImprovementRunArtifact(run("REJECTED"))).toThrow("V12_ARTIFACT_GUARDIAN_REJECTED");
  });

  it("refuses a generated document whose durable source binding differs from the run", () => {
    const invalid = run();
    invalid.generatedDocumentJson = { ...invalid.generatedDocumentJson!, sourceDocumentSha256: "9".repeat(64) };
    expect(() => renderResumeImprovementRunArtifact(invalid)).toThrow("V12_ARTIFACT_SOURCE_BINDING_MISMATCH");
  });
});
