import { describe, expect, it } from "vitest";
import { ResumeArtifactSchema } from "../../domain/resume/ResumeArtifact";
import { renderResumeArtifactProvenanceJson, renderResumeArtifactText } from "./ResumeArtifactRenderer";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sha = (c: string) => c.repeat(64);

const artifact = ResumeArtifactSchema.parse({
  id: uuid(1), ownerUserId: uuid(2), mode: "GENERAL",
  sourceResumePlanId: uuid(3), sourceResumePlanSemanticKey: sha("a"),
  artifactVersion: "b9-canonical-resume-artifact-v1",
  composerVersion: "b9-deterministic-resume-composition-v2",
  rendererContractVersion: "b9-ats-safe-single-column-v1",
  careerEvidenceFingerprintSha256: sha("b"), artifactSemanticSha256: sha("c"),
  content: {
    header: { status: "UNAVAILABLE", displayName: null, headline: null, contactLines: [] },
    professionalSummary: {
      text: "Construí sistemas de producción.",
      sourcePlanItemIds: [uuid(10)],
      evidenceSources: [{ evidenceId: uuid(20), evidenceRevision: 1 }],
    },
    sections: [
      {
        section: "PROJECTS", layout: "BULLETS",
        entries: [{ sourcePlanItemId: uuid(11), evidenceId: uuid(21), evidenceRevision: 1, renderedText: "Implementé una API con trazabilidad." }],
      },
      {
        section: "SKILLS", layout: "INLINE_LIST",
        entries: [
          { sourcePlanItemId: uuid(12), evidenceId: uuid(22), evidenceRevision: 1, renderedText: "PostgreSQL" },
          { sourcePlanItemId: uuid(13), evidenceId: uuid(23), evidenceRevision: 1, renderedText: "Spring Boot" },
        ],
      },
    ],
  },
  manifest: {
    sourceResumePlanId: uuid(3), sourceResumePlanSemanticKey: sha("a"), plannerVersion: "b9-deterministic-resume-plan-v2",
    composerVersion: "b9-deterministic-resume-composition-v2", artifactVersion: "b9-canonical-resume-artifact-v1",
    rendererContractVersion: "b9-ats-safe-single-column-v1", careerEvidenceFingerprintSha256: sha("b"),
    jobSnapshotId: null, opportunityAssessmentId: null,
    receipts: [
      { id: uuid(30), ordinal: 1, sourcePlanItemId: uuid(10), evidenceId: uuid(20), evidenceRevision: 1, evidenceTextSha256: sha("d"), presentationRevisionId: null, presentationTextSha256: null, renderedTextSha256: sha("d"), section: "PROFILE", selectionReason: "GENERAL_VERIFIED" },
      { id: uuid(31), ordinal: 2, sourcePlanItemId: uuid(11), evidenceId: uuid(21), evidenceRevision: 1, evidenceTextSha256: sha("e"), presentationRevisionId: null, presentationTextSha256: null, renderedTextSha256: sha("e"), section: "PROJECTS", selectionReason: "GENERAL_VERIFIED" },
      { id: uuid(32), ordinal: 3, sourcePlanItemId: uuid(12), evidenceId: uuid(22), evidenceRevision: 1, evidenceTextSha256: sha("f"), presentationRevisionId: null, presentationTextSha256: null, renderedTextSha256: sha("f"), section: "SKILLS", selectionReason: "GENERAL_VERIFIED" },
      { id: uuid(33), ordinal: 4, sourcePlanItemId: uuid(13), evidenceId: uuid(23), evidenceRevision: 1, evidenceTextSha256: sha("1"), presentationRevisionId: null, presentationTextSha256: null, renderedTextSha256: sha("1"), section: "SKILLS", selectionReason: "GENERAL_VERIFIED" },
    ],
  },
  createdAt: "2026-09-04T01:45:00.000Z",
});

describe("B9.5 TXT and provenance JSON renderers", () => {
  it("renders selectable ATS-safe plain text from canonical artifact content only", () => {
    const text = renderResumeArtifactText(artifact);
    expect(text).toBe(
      "Professional Summary\nConstruí sistemas de producción.\n\nProjects\n- Implementé una API con trazabilidad.\n\nSkills\nPostgreSQL | Spring Boot\n",
    );
    for (const claim of ["Construí sistemas de producción.", "Implementé una API con trazabilidad.", "PostgreSQL", "Spring Boot"]) {
      expect(text).toContain(claim);
    }
  });

  it("does not emit unavailable identity data or invented claim text", () => {
    const text = renderResumeArtifactText(artifact);
    expect(text).not.toContain("UNAVAILABLE");
    expect(text).not.toContain("email");
    expect(text).not.toContain("phone");
    expect(text).not.toContain("expert");
  });

  it("exports the exact durable manifest in provenance JSON", () => {
    const parsed = JSON.parse(renderResumeArtifactProvenanceJson(artifact));
    expect(parsed.schemaVersion).toBe("b9-resume-artifact-provenance-v1");
    expect(parsed.artifactId).toBe(artifact.id);
    expect(parsed.artifactSemanticSha256).toBe(artifact.artifactSemanticSha256);
    expect(parsed.manifest).toEqual(artifact.manifest);
  });
});
