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
  sourceReceipts: [{
    id: id("6"),
    evidenceId: id("4"),
    evidenceRevision: 2,
    evidenceKind: "PROJECT",
    evidenceTextSha256: hash,
    section: "PROJECTS",
    decision: "INCLUDED",
    targetMatchStatus: null,
    selectedItemId: id("3"),
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
    expect(CreateResumePlanInputSchema.safeParse({ mode: "GENERAL", jobSnapshotId: id("7") }).success).toBe(false);
  });

  it("requires an exact Assessment binding for TARGETED plans", () => {
    expect(CreateResumePlanInputSchema.safeParse({
      mode: "TARGETED",
      jobSnapshotId: id("7"),
      opportunityAssessmentId: id("8"),
    }).success).toBe(true);
    expect(CreateResumePlanInputSchema.safeParse({ mode: "TARGETED", jobSnapshotId: id("7") }).success).toBe(false);
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

  it("requires each v2 plan item to have an exact INCLUDED source receipt", () => {
    expect(ResumePlanSchema.safeParse({
      ...base,
      mode: "GENERAL",
      jobSnapshotId: null,
      opportunityAssessmentId: null,
      sourceReceipts: [{ ...base.sourceReceipts[0], decision: "OMITTED_DENSITY", selectedItemId: null }],
    }).success).toBe(false);
  });

  it("requires TARGETED receipts to preserve actual match provenance", () => {
    const targeted = {
      ...base,
      mode: "TARGETED",
      jobSnapshotId: id("7"),
      opportunityAssessmentId: id("8"),
      items: [{ ...base.items[0], selectionReason: "TARGET_MATCH" }],
      sourceReceipts: [{ ...base.sourceReceipts[0], targetMatchStatus: "MATCH" }],
    };
    expect(ResumePlanSchema.safeParse(targeted).success).toBe(true);
    expect(ResumePlanSchema.safeParse({
      ...targeted,
      sourceReceipts: [{ ...targeted.sourceReceipts[0], targetMatchStatus: null }],
    }).success).toBe(false);
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

  it("adds explainable balanced selection receipts without weakening target provenance", () => {
    const selection = readFileSync("supabase/migrations/20260903225300_b9_resume_plan_selection_receipts.sql", "utf8");
    expect(selection).toContain("b9-deterministic-resume-plan-v2");
    expect(selection).toContain("resume_plan_source_receipts");
    expect(selection).toContain("OMITTED_DENSITY");
    expect(selection).toContain("OMITTED_TARGET_IRRELEVANT");
    expect(selection).toContain("section_slot");
    expect(selection).toContain("B9_RESUME_PLAN_RECEIPT_TARGET_STATUS_INVALID");
    expect(selection).toContain("B9_RESUME_PLAN_RECEIPT_ITEM_PROVENANCE_INVALID");
    expect(selection).toContain("revoke all on function public.cv_engine_guard_resume_plan_source_receipt_insert()");
  });

  it("extends account lifecycle additively without changing the B8 export envelope", () => {
    const lifecycle = readFileSync("supabase/migrations/20260903225400_b9_resume_plan_selection_lifecycle.sql", "utf8");
    expect(lifecycle).toContain("'schemaVersion', 'b8-account-export-v1'");
    expect(lifecycle).toContain("'resumePlans'");
    expect(lifecycle).toContain("'resumePlanItems'");
    expect(lifecycle).toContain("'resumePlanSourceReceipts'");
    expect(lifecycle).toContain("delete from public.resume_plan_source_receipts");
    expect(lifecycle).toContain("delete from public.resume_plan_items");
    expect(lifecycle).toContain("delete from public.resume_plans");
  });
});
