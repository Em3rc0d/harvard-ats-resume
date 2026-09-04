import { describe, expect, it } from "vitest";
import { B9_RESUME_DENSITY_POLICY_VERSION, B9_RESUME_PLANNER_VERSION, ResumePlanSchema } from "./ResumePlan";
import { buildResumeArtifactContent } from "./ResumeArtifact";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sha = (c: string) => c.repeat(64);

const plan = ResumePlanSchema.parse({
  id: uuid(1), ownerUserId: uuid(2), mode: "GENERAL", jobSnapshotId: null, opportunityAssessmentId: null,
  plannerVersion: B9_RESUME_PLANNER_VERSION,
  sectionOrder: ["PROFILE","EXPERIENCE","PROJECTS","EDUCATION","CERTIFICATIONS","SKILLS","LANGUAGES"],
  densityPolicy: { policyVersion: B9_RESUME_DENSITY_POLICY_VERSION, targetPages: 1, maxItems: 20 },
  careerEvidenceFingerprintSha256: sha("a"), semanticKey: sha("b"),
  items: [{ id: uuid(10), ordinal: 1, section: "PROJECTS", evidenceId: uuid(20), evidenceRevision: 1, evidenceKind: "PROJECT", evidenceTextSha256: sha("c"), presentationRevisionId: null, presentationTextSha256: null, renderedText: "Built a deterministic pipeline.", selectionReason: "GENERAL_VERIFIED" }],
  sourceReceipts: [{ id: uuid(30), evidenceId: uuid(20), evidenceRevision: 1, evidenceKind: "PROJECT", evidenceTextSha256: sha("c"), section: "PROJECTS", decision: "INCLUDED", targetMatchStatus: null, selectedItemId: uuid(10) }],
  createdAt: "2026-09-04T01:00:00.000Z",
});

describe("B9.5 canonical ResumeArtifact content", () => {
  it("is a deterministic projection of ResumePlan with no invented identity header", () => {
    const first = buildResumeArtifactContent(plan);
    const second = buildResumeArtifactContent(plan);
    expect(first).toEqual(second);
    expect(first.header).toEqual({ status: "UNAVAILABLE", displayName: null, headline: null, contactLines: [] });
    expect(first.sections[0]?.entries[0]?.renderedText).toBe("Built a deterministic pipeline.");
  });

  it("does not synthesize a professional summary when PROFILE evidence is absent", () => {
    expect(buildResumeArtifactContent(plan).professionalSummary).toBeNull();
  });
});
