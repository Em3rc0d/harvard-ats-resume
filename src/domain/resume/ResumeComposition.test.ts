import { describe, expect, it } from "vitest";
import {
  B9_RESUME_DENSITY_POLICY_VERSION,
  B9_RESUME_PLANNER_VERSION,
  ResumePlanSchema,
} from "./ResumePlan";
import {
  B9_RESUME_COMPOSER_VERSION,
  composeResumePlan,
} from "./ResumeComposition";

const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
const hash = (char: string) => char.repeat(64);

const plan = ResumePlanSchema.parse({
  id: id("1"),
  ownerUserId: id("2"),
  mode: "GENERAL",
  jobSnapshotId: null,
  opportunityAssessmentId: null,
  plannerVersion: B9_RESUME_PLANNER_VERSION,
  sectionOrder: ["PROFILE", "EXPERIENCE", "PROJECTS", "EDUCATION", "CERTIFICATIONS", "SKILLS", "LANGUAGES"],
  densityPolicy: {
    policyVersion: B9_RESUME_DENSITY_POLICY_VERSION,
    targetPages: 1,
    maxItems: 20,
  },
  careerEvidenceFingerprintSha256: hash("a"),
  semanticKey: hash("b"),
  items: [
    {
      id: id("11"), ordinal: 3, section: "SKILLS", evidenceId: id("21"), evidenceRevision: 1,
      evidenceKind: "SKILL", evidenceTextSha256: hash("c"), presentationRevisionId: null,
      presentationTextSha256: null, renderedText: "Kubernetes", selectionReason: "GENERAL_VERIFIED",
    },
    {
      id: id("12"), ordinal: 1, section: "PROJECTS", evidenceId: id("22"), evidenceRevision: 2,
      evidenceKind: "PROJECT", evidenceTextSha256: hash("d"), presentationRevisionId: id("32"),
      presentationTextSha256: hash("e"), renderedText: "Built and tested a deterministic evidence pipeline.", selectionReason: "GENERAL_VERIFIED",
    },
    {
      id: id("13"), ordinal: 2, section: "EXPERIENCE", evidenceId: id("23"), evidenceRevision: 1,
      evidenceKind: "EXPERIENCE", evidenceTextSha256: hash("f"), presentationRevisionId: null,
      presentationTextSha256: null, renderedText: "Developed production web services.", selectionReason: "GENERAL_VERIFIED",
    },
  ],
  sourceReceipts: [
    { id: id("41"), evidenceId: id("21"), evidenceRevision: 1, evidenceKind: "SKILL", evidenceTextSha256: hash("c"), section: "SKILLS", decision: "INCLUDED", targetMatchStatus: null, selectedItemId: id("11") },
    { id: id("42"), evidenceId: id("22"), evidenceRevision: 2, evidenceKind: "PROJECT", evidenceTextSha256: hash("d"), section: "PROJECTS", decision: "INCLUDED", targetMatchStatus: null, selectedItemId: id("12") },
    { id: id("43"), evidenceId: id("23"), evidenceRevision: 1, evidenceKind: "EXPERIENCE", evidenceTextSha256: hash("f"), section: "EXPERIENCE", decision: "INCLUDED", targetMatchStatus: null, selectedItemId: id("13") },
  ],
  createdAt: "2026-09-03T23:00:00.000Z",
});

describe("B9.4b deterministic resume composition", () => {
  it("groups content by canonical section order without creating text", () => {
    const composition = composeResumePlan(plan);
    expect(composition.composerVersion).toBe(B9_RESUME_COMPOSER_VERSION);
    expect(composition.sections.map((section) => section.section)).toEqual([
      "EXPERIENCE",
      "PROJECTS",
      "SKILLS",
    ]);
    expect(composition.sections.flatMap((section) => section.entries.map((entry) => entry.renderedText))).toEqual([
      "Developed production web services.",
      "Built and tested a deterministic evidence pipeline.",
      "Kubernetes",
    ]);
  });

  it("preserves exact ResumePlan item provenance one-to-one", () => {
    const composition = composeResumePlan(plan);
    const composed = composition.sections.flatMap((section) => section.entries);
    expect(new Set(composed.map((entry) => entry.sourcePlanItemId)).size).toBe(plan.items.length);
    for (const item of plan.items) {
      const entry = composed.find((candidate) => candidate.sourcePlanItemId === item.id);
      expect(entry).toEqual({
        sourcePlanItemId: item.id,
        evidenceId: item.evidenceId,
        evidenceRevision: item.evidenceRevision,
        renderedText: item.renderedText,
      });
    }
  });

  it("uses deterministic layout hints without rewriting content", () => {
    const composition = composeResumePlan(plan);
    expect(composition.sections.find((section) => section.section === "EXPERIENCE")?.layout).toBe("BULLETS");
    expect(composition.sections.find((section) => section.section === "PROJECTS")?.layout).toBe("BULLETS");
    expect(composition.sections.find((section) => section.section === "SKILLS")?.layout).toBe("INLINE_LIST");
  });

  it("is deterministic for the same immutable ResumePlan", () => {
    expect(composeResumePlan(plan)).toEqual(composeResumePlan(plan));
  });

  it("carries target bindings through composition instead of recomputing them", () => {
    const targeted = ResumePlanSchema.parse({
      ...plan,
      mode: "TARGETED",
      jobSnapshotId: id("51"),
      opportunityAssessmentId: id("52"),
      items: plan.items.map((item) => ({ ...item, selectionReason: "TARGET_MATCH" })),
      sourceReceipts: plan.sourceReceipts.map((receipt) => ({ ...receipt, targetMatchStatus: "MATCH" })),
    });
    const composition = composeResumePlan(targeted);
    expect(composition.jobSnapshotId).toBe(id("51"));
    expect(composition.opportunityAssessmentId).toBe(id("52"));
  });
});
