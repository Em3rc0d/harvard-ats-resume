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

const commonManifest = {
  sourceResumePlanId: uuid(3), sourceResumePlanSemanticKey: sha("a"), plannerVersion: "b9-deterministic-resume-plan-v2",
  composerVersion: "b9-deterministic-resume-composition-v2" as const,
  rendererContractVersion: "b9-ats-safe-single-column-v1" as const, careerEvidenceFingerprintSha256: sha("b"),
  jobSnapshotId: null, opportunityAssessmentId: null,
  receipts: [
    { id: uuid(30), ordinal: 1, sourcePlanItemId: uuid(10), evidenceId: uuid(20), evidenceRevision: 1, evidenceTextSha256: sha("d"), presentationRevisionId: null, presentationTextSha256: null, renderedTextSha256: sha("d"), section: "PROFILE" as const, selectionReason: "GENERAL_VERIFIED" as const },
    { id: uuid(31), ordinal: 2, sourcePlanItemId: uuid(11), evidenceId: uuid(21), evidenceRevision: 1, evidenceTextSha256: sha("e"), presentationRevisionId: null, presentationTextSha256: null, renderedTextSha256: sha("e"), section: "PROJECTS" as const, selectionReason: "GENERAL_VERIFIED" as const },
    { id: uuid(32), ordinal: 3, sourcePlanItemId: uuid(12), evidenceId: uuid(22), evidenceRevision: 1, evidenceTextSha256: sha("f"), presentationRevisionId: null, presentationTextSha256: null, renderedTextSha256: sha("f"), section: "SKILLS" as const, selectionReason: "GENERAL_VERIFIED" as const },
    { id: uuid(33), ordinal: 4, sourcePlanItemId: uuid(13), evidenceId: uuid(23), evidenceRevision: 1, evidenceTextSha256: sha("1"), presentationRevisionId: null, presentationTextSha256: null, renderedTextSha256: sha("1"), section: "SKILLS" as const, selectionReason: "GENERAL_VERIFIED" as const },
  ],
};

const commonContent = {
  professionalSummary: { text: "Construí sistemas de producción.", sourcePlanItemIds: [uuid(10)], evidenceSources: [{ evidenceId: uuid(20), evidenceRevision: 1 }] },
  sections: [
    { section: "PROJECTS" as const, layout: "BULLETS" as const, entries: [{ sourcePlanItemId: uuid(11), evidenceId: uuid(21), evidenceRevision: 1, renderedText: "Implementé una API con trazabilidad." }] },
    { section: "SKILLS" as const, layout: "INLINE_LIST" as const, entries: [
      { sourcePlanItemId: uuid(12), evidenceId: uuid(22), evidenceRevision: 1, renderedText: "PostgreSQL" },
      { sourcePlanItemId: uuid(13), evidenceId: uuid(23), evidenceRevision: 1, renderedText: "Spring Boot" },
    ] },
  ],
};

const legacyArtifact = ResumeArtifactSchema.parse({
  id: uuid(1), ownerUserId: uuid(2), mode: "GENERAL",
  sourceResumePlanId: uuid(3), sourceResumePlanSemanticKey: sha("a"),
  artifactVersion: "b9-canonical-resume-artifact-v1", composerVersion: "b9-deterministic-resume-composition-v2",
  rendererContractVersion: "b9-ats-safe-single-column-v1", careerEvidenceFingerprintSha256: sha("b"), artifactSemanticSha256: sha("c"),
  content: { header: { status: "UNAVAILABLE", displayName: null, headline: null, contactLines: [] }, ...commonContent },
  manifest: { ...commonManifest, artifactVersion: "b9-canonical-resume-artifact-v1", resumeProfileRevision: null, resumeProfileSemanticSha256: null },
  createdAt: "2026-09-04T01:45:00.000Z",
});

const artifact = ResumeArtifactSchema.parse({
  ...legacyArtifact,
  id: uuid(4),
  artifactVersion: "b9-canonical-resume-artifact-v2",
  artifactSemanticSha256: sha("2"),
  content: {
    ...commonContent,
    header: {
      status: "AVAILABLE",
      displayName: "Synthetic Candidate",
      headline: "Backend Engineer",
      contactLines: ["Synthetic City | https://example.test/profile"],
    },
  },
  manifest: {
    ...commonManifest,
    artifactVersion: "b9-canonical-resume-artifact-v2",
    resumeProfileRevision: 2,
    resumeProfileSemanticSha256: sha("3"),
  },
});

describe("B9 multi-format artifact renderers", () => {
  it("renders TXT from the canonical semantic sequence including the profile header", () => {
    expect(renderResumeArtifactText(artifact)).toBe(
      "Synthetic Candidate\nBackend Engineer\nSynthetic City | https://example.test/profile\n\nProfessional Summary\nConstruí sistemas de producción.\n\nProjects\n- Implementé una API con trazabilidad.\n\nSkills\nPostgreSQL | Spring Boot\n",
    );
  });

  it("keeps one canonical semantic sequence for all format adapters", () => {
    expect(buildResumeSemanticLines(artifact)).toEqual([
      { kind: "NAME", text: "Synthetic Candidate" },
      { kind: "META", text: "Backend Engineer" },
      { kind: "META", text: "Synthetic City | https://example.test/profile" },
      { kind: "HEADING", text: "Professional Summary" },
      { kind: "BODY", text: "Construí sistemas de producción." },
      { kind: "HEADING", text: "Projects" },
      { kind: "BULLET", text: "Implementé una API con trazabilidad." },
      { kind: "HEADING", text: "Skills" },
      { kind: "BODY", text: "PostgreSQL | Spring Boot" },
    ]);
  });

  it("preserves approved multiline evidence as one bullet plus canonical continuation lines in every export", () => {
    const multiline = structuredClone(artifact);
    multiline.content.sections[0]!.entries[0]!.renderedText = "Project Alpha\nBuilt API.\nAdded tests.";

    const semantic = buildResumeSemanticLines(multiline);
    const projectHeading = semantic.findIndex((line) => line.kind === "HEADING" && line.text === "Projects");
    expect(semantic.slice(projectHeading, projectHeading + 4)).toEqual([
      { kind: "HEADING", text: "Projects" },
      { kind: "BULLET", text: "Project Alpha" },
      { kind: "BODY", text: "Built API." },
      { kind: "BODY", text: "Added tests." },
    ]);

    expect(renderResumeArtifactText(multiline)).toContain("Projects\n- Project Alpha\nBuilt API.\nAdded tests.");

    const docx = new TextDecoder().decode(renderResumeArtifactDocx(multiline));
    expect(docx).toContain("• Project Alpha");
    expect(docx).toContain("Built API.");
    expect(docx).toContain("Added tests.");
    expect(docx.indexOf("• Project Alpha")).toBeLessThan(docx.indexOf("Built API."));
    expect(docx.indexOf("Built API.")).toBeLessThan(docx.indexOf("Added tests."));

    const pdf = new TextDecoder().decode(renderResumeArtifactPdf(multiline));
    expect(pdf).toContain("(- Project Alpha) Tj");
    expect(pdf).toContain("(Built API.) Tj");
    expect(pdf).toContain("(Added tests.) Tj");
  });

  it("renders valid OpenXML DOCX with exact Unicode header and claims", () => {
    const bytes = renderResumeArtifactDocx(artifact);
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const raw = new TextDecoder().decode(bytes);
    expect(raw).toContain("word/document.xml");
    expect(raw).toContain("Synthetic Candidate");
    expect(raw).toContain("Construí sistemas de producción.");
    expect(raw).toContain("Implementé una API con trazabilidad.");
    expect(raw).toContain("PostgreSQL | Spring Boot");
  });

  it("renders a textual PDF carrying the same supported semantic content", () => {
    const bytes = renderResumeArtifactPdf(artifact);
    const raw = new TextDecoder().decode(bytes);
    expect(raw.startsWith("%PDF-1.4")).toBe(true);
    expect(raw).toContain("Synthetic Candidate");
    expect(raw).toContain("Backend Engineer");
    expect(raw).toContain("PostgreSQL | Spring Boot");
    expect(raw).toContain("Implement\\351 una API con trazabilidad.");
  });

  it("preserves readability for historical v1 artifacts without fabricating a header", () => {
    expect(renderResumeArtifactText(legacyArtifact).startsWith("Professional Summary")).toBe(true);
    expect(renderResumeArtifactText(legacyArtifact)).not.toContain("Synthetic Candidate");
  });

  it("fails closed when PDF text cannot be represented without substitution", () => {
    const unsupported = structuredClone(artifact);
    unsupported.content.sections[0]!.entries[0]!.renderedText = "Construí un sistema 🚀";
    expect(() => renderResumeArtifactPdf(unsupported)).toThrow("B9_PDF_UNSUPPORTED_CHARACTER");
  });

  it("exports exact durable profile and evidence provenance", () => {
    const parsed = JSON.parse(renderResumeArtifactProvenanceJson(artifact));
    expect(parsed.schemaVersion).toBe("b9-resume-artifact-provenance-v2");
    expect(parsed.artifactId).toBe(artifact.id);
    expect(parsed.artifactSemanticSha256).toBe(artifact.artifactSemanticSha256);
    expect(parsed.manifest.resumeProfileRevision).toBe(2);
    expect(parsed.manifest.resumeProfileSemanticSha256).toBe(sha("3"));
    expect(parsed.manifest.receipts).toEqual(artifact.manifest.receipts);
  });
});
