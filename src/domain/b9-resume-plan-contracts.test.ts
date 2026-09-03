import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  B9_RESUME_DENSITY_POLICY_VERSION,
  B9_RESUME_PLANNER_VERSION,
  CreateResumePlanInputSchema,
  ResumePlanSchema,
} from "./resume/ResumePlan";

const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
const hash = "a".repeat(64);

const base = {
  id: id("1"),
  ownerUserId: id("2"),
  plannerVersion: B9_RESUME_PLANNER_VERSION,
  sectionOrder: ["PROFILE","EXPERIENCE","PROJECTS","EDUCATION","CERTIFICATIONS","SKILLS","LANGUAGES"],
  densityPolicy: {
    policyVersion: B9_RESUME_DENSITY_POLICY_VERSION,
    targetPages: 1,
    maxItems: 20,
  },
  careerEvidenceFingerprintSha256: hash,
  semanticKey: hash,
  items: [{
    id: id("3"),
    ordinal: 1,
    section: "PROJECTS",
    evidenceId: id("4"),
    evidenceRevision: 2,
    evidenceKind: "PROJECT",
    evidenceTextSha256: hash,
    presentationRevisionId: id("5"),
    presentationTextSha256: hash,
    renderedText: "Built and tested a deterministic evidence pipeline.",
    selectionReason: "GENERAL_VERIFIED",
  }],
  createdAt: "2026-09-03T22:00:00.000Z",
};

describe("B9.4 ResumePlan contracts", () => {
  it("keeps GENERAL plans free of target bindings", () => {
    expect(ResumePlanSchema.safeParse({
      ...base,
      mode: "GENERAL",
      jobSnapshotId: null,
      opportunityAssessmentId: null,
    }).success).toBe(true);
    expect(CreateResumePlanInputSchema.safeParse({ mode: "GENERAL", jobSnapshotId: id("6") }).success).toBe(false);
  });

  it("requires an exact Assessment binding for TARGETED plans", () => {
    expect(CreateResumePlanInputSchema.safeParse({
      mode: "TARGETED",
      jobSnapshotId: id("6"),
      opportunityAssessmentId: id("7"),
    }).success).toBe(true);
    expect(CreateResumePlanInputSchema.safeParse({ mode: "TARGETED", jobSnapshotId: id("6") }).success).toBe(false);
  });

  it("requires presentation id and hash together", () => {
    const invalid = {
      ...base,
      mode: "GENERAL",
      jobSnapshotId: null,
      opportunityAssessmentId: null,
      items: [{ ...base.items[0], presentationTextSha256: null }],
    };
    expect(ResumePlanSchema.safeParse(invalid).success).toBe(false);
  });

  it("locks B9.4 DB selection behind verified evidence, approved presentation, and stale-assessment guards", () => {
    const migration = readFileSync("supabase/migrations/20260903225000_b9_resume_plans.sql", "utf8");
    expect(migration).toContain("B9_TARGET_ASSESSMENT_REQUIRED");
    expect(migration).toContain("B9_TARGET_ASSESSMENT_STALE");
    expect(migration).toContain("rm.status in ('MATCH','POTENTIAL_MATCH')");
    expect(migration).toContain("p.status = 'APPROVED'");
    expect(migration).toContain("B9_RESUME_PLAN_UNAPPROVED_REWRITE");
    expect(migration).toContain("grant select on public.resume_plans to authenticated");
    expect(migration).toContain("grant execute on function public.cv_engine_create_resume_plan");
  });

  it("extends account lifecycle additively without changing the B8 export envelope", () => {
    const lifecycle = readFileSync("supabase/migrations/20260903225100_b9_resume_plan_lifecycle.sql", "utf8");
    expect(lifecycle).toContain("'schemaVersion', 'b8-account-export-v1'");
    expect(lifecycle).toContain("'resumePlans'");
    expect(lifecycle).toContain("'resumePlanItems'");
    expect(lifecycle).toContain("delete from public.resume_plan_items");
    expect(lifecycle).toContain("delete from public.resume_plans");
  });
});
