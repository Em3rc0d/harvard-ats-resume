import { describe, expect, it } from "vitest";
import { ResumeArtifactSchema } from "../../domain/resume/ResumeArtifact";
import {
  buildResumeSemanticLines,
  renderResumeArtifactDocx,
  renderResumeArtifactPdf,
  renderResumeArtifactProvenanceJson,
  renderResumeArtifactText,
} from "./ResumeArtifactRenderer";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sha = (c: string) => c.repeat(64);

const artifact = ResumeArtifactSchema.parse({
  id: uuid(1), ownerUserId: uuid(2), mode: "GENERAL",
  sourceResumePlanId: uuid(3), sourceResumePlanSemanticKey: sha("a"),
  artifactVersion: "b9-canonical-resume-artifact-v1", composerVersion: "b9-deterministic-resume-composition-v2",
  rendererContractVersion: "b9-ats-safe-single-column-v1", careerEvidenceFingerprintSha256: sha("b"), artifactSemanticSha256: sha("c"),
  content: {
    header: { status: "UNAVAILABLE", displayName: null, headline: null, contactLines: [] },
    professionalSummary: { text: "Construí sistemas de producción.", sourcePlanItemIds: [uuid(10)], evidenceSources: [{ evidenceId: uuid(20), evidenceRevision: 1 }] },
    sections: [
      { section: "PROJECTS", layout: "BULLETS", entries: [{ sourcePlanItemId: uuid(11), evidenceId: uuid(21), evidenceRevision: 1, renderedText: "Implementé una API con trazabilidad." }] },
      { section: "SKILLS", layout: "INLINE_LIST", entries: [
        { sourcePlanItemId: uuid(12), evidenceId: uuid(22), evidenceRevision: 1, renderedText: "PostgreSQL" },
        { sourcePlanItemId: uuid(13), evidenceId: uuid(23), evidenceRevision: 1, renderedText: "Spring Boot" },
      ] },
    ],
  },
  manifest: {
    sourceResumePlanId: uuid(3), sourceResumePlanSemanticKey: sha("a"), plannerVersion: "b9-deterministic-resume-plan-v2",
    composerVersion: "b9-deterministic-resume-composition-v2", artifactVersion: "b9-canonical-resume-artifact-v1",
    rendererContractVersion: "b9-ats-safe-single-column-v1", careerEvidenceFingerprintSha256: sha("b"), jobSnapshotId: null, opportunityAssessmentId: null,
    receipts: [
      { id: uuid(30), ordinal: 1, sourcePlanItemId: uuid(10), evidenceId: uuid(20), evidenceRevision: 1, evidenceTextSha256: sha("d"), presentationRevisionId: null, presentationTextSha256: null, renderedTextSha256: sha("d"), section: "PROFILE", selectionReason: "GENERAL_VERIFIED" },
      { id: uuid(31), ordinal: 2, sourcePlanItemId: uuid(11), evidenceId: uuid(21), evidenceRevision: 1, evidenceTextSha256: sha("e"), presentationRevisionId: null, presentationTextSha256: null, renderedTextSha256: sha("e"), section: "PROJECTS", selectionReason: "GENERAL_VERIFIED" },
      { id: uuid(32), ordinal: 3, sourcePlanItemId: uuid(12), evidenceId: uuid(22), evidenceRevision: 1, evidenceTextSha256: sha("f"), presentationRevisionId: null, presentationTextSha256: null, renderedTextSha256: sha("f"), section: "SKILLS", selectionReason: "GENERAL_VERIFIED" },
      { id: uuid(33), ordinal: 4, sourcePlanItemId: uuid(13), evidenceId: uuid(23), evidenceRevision: 1, evidenceTextSha256: sha("1"), presentationRevisionId: null, presentationTextSha256: null, renderedTextSha256: sha("1"), section: "SKILLS", selectionReason: "GENERAL_VERIFIED" },
    ],
  }, createdAt: "2026-09-04T01:45:00.000Z",
});

describe("B9.5 multi-format artifact renderers", () => {
  it("renders TXT from the canonical semantic sequence only", () => {
    expect(renderResumeArtifactText(artifact)).toBe("Professional Summary\nConstruí sistemas de producción.\n\nProjects\n- Implementé una API con trazabilidad.\n\nSkills\nPostgreSQL | Spring Boot\n");
  });

  it("keeps a single canonical semantic sequence for all format adapters", () => {
    expect(buildResumeSemanticLines(artifact)).toEqual([
      { kind: "HEADING", text: "Professional Summary" },
      { kind: "BODY", text: "Construí sistemas de producción." },
      { kind: "HEADING", text: "Projects" },
      { kind: "BULLET", text: "Implementé una API con trazabilidad." },
      { kind: "HEADING", text: "Skills" },
      { kind: "BODY", text: "PostgreSQL | Spring Boot" },
    ]);
  });

  it("renders a valid stored OpenXML DOCX containing the exact Unicode claims", () => {
    const bytes = renderResumeArtifactDocx(artifact);
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const raw = new TextDecoder().decode(bytes);
    expect(raw).toContain("word/document.xml");
    expect(raw).toContain("Construí sistemas de producción.");
    expect(raw).toContain("Implementé una API con trazabilidad.");
    expect(raw).toContain("PostgreSQL | Spring Boot");
    expect(raw).not.toContain("UNAVAILABLE");
  });

  it("renders a textual PDF with the same Latin-1/WinAnsi semantic claims", () => {
    const bytes = renderResumeArtifactPdf(artifact);
    const raw = new TextDecoder().decode(bytes);
    expect(raw.startsWith("%PDF-1.4")).toBe(true);
    expect(raw).toContain("Professional Summary");
    expect(raw).toContain("PostgreSQL | Spring Boot");
    expect(raw).toContain("Implement\\351 una API con trazabilidad.");
    expect(raw).not.toContain("UNAVAILABLE");
  });

  it("fails closed when PDF text cannot be represented without substitution", () => {
    const unsupported = structuredClone(artifact);
    unsupported.content.sections[0]!.entries[0]!.renderedText = "Construí un sistema 🚀";
    expect(() => renderResumeArtifactPdf(unsupported)).toThrow("B9_PDF_UNSUPPORTED_CHARACTER");
  });

  it("exports the exact durable manifest in provenance JSON", () => {
    const parsed = JSON.parse(renderResumeArtifactProvenanceJson(artifact));
    expect(parsed.schemaVersion).toBe("b9-resume-artifact-provenance-v1");
    expect(parsed.artifactId).toBe(artifact.id);
    expect(parsed.artifactSemanticSha256).toBe(artifact.artifactSemanticSha256);
    expect(parsed.manifest).toEqual(artifact.manifest);
  });
});
