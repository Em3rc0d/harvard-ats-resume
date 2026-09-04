import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("B9 ResumePlan source contracts", () => {
  it("keeps ResumePlan downstream from immutable truth and approved presentation", () => {
    const domain = read("src/domain/resume/ResumePlan.ts");
    const migration = read("supabase/migrations/20260903225000_b9_resume_plans.sql");
    const v3 = read("supabase/migrations/20260904030000_b9_resume_planner_v3.sql");
    expect(domain).toContain('B9_RESUME_PLANNER_VERSION = "b9-deterministic-resume-plan-v3"');
    expect(migration).toContain("resume_plan_items_evidence_owner_fk");
    expect(migration).toContain("resume_plan_items_presentation_owner_fk");
    expect(migration).toContain("B9_RESUME_PLAN_UNAPPROVED_REWRITE");
    expect(migration).toContain("B9_RESUME_PLAN_PRESENTATION_BINDING_INVALID");
    expect(v3).toContain("b9-deterministic-resume-plan-v3");
  });

  it("fails closed for targeted plans without a real owner-bound Assessment", () => {
    const v3 = read("supabase/migrations/20260904030000_b9_resume_planner_v3.sql");
    expect(v3).toContain("B9_TARGET_ASSESSMENT_REQUIRED");
    expect(v3).toContain("B9_TARGET_ASSESSMENT_NOT_FOUND");
    expect(v3).toContain("B9_TARGET_ASSESSMENT_STALE");
    expect(v3).toContain("B9_TARGET_SUPPORT_MISSING");
  });

  it("uses only MATCH/POTENTIAL_MATCH evidence for targeted content", () => {
    const v3 = read("supabase/migrations/20260904030000_b9_resume_planner_v3.sql");
    expect(v3).toContain("rm.status in ('MATCH','POTENTIAL_MATCH')");
    expect(v3).toContain("target_match_status is not null");
    expect(v3).toContain("TARGET_MATCH");
    expect(v3).toContain("TARGET_POTENTIAL_MATCH");
  });

  it("preserves the current deterministic section order and density policy", () => {
    const domain = read("src/domain/resume/ResumePlan.ts");
    const v3 = read("supabase/migrations/20260904030000_b9_resume_planner_v3.sql");
    expect(domain).toContain('"PROFILE",');
    expect(domain).toContain('"EXPERIENCE",');
    expect(domain).toContain('"PROJECTS",');
    expect(domain).toContain('"EDUCATION",');
    expect(domain).toContain('"CERTIFICATIONS",');
    expect(domain).toContain('"SKILLS",');
    expect(domain).toContain('"LANGUAGES",');
    expect(v3).toContain('"policyVersion":"b9-one-page-density-v1"');
    expect(v3).toContain("limit 20");
  });

  it("uses explainable source order and balanced section budgets instead of UUID-shaped density selection", () => {
    const v3 = read("supabase/migrations/20260904030000_b9_resume_planner_v3.sql");
    expect(v3).toContain("from public.import_proposals ip");
    expect(v3).toContain("ip.accepted_evidence_id = ce.id");
    expect(v3).toContain("e.source_ordinal");
    expect(v3).toContain("e.source_created_at");
    expect(v3).toContain("when 'PROFILE' then 1");
    expect(v3).toContain("when 'EXPERIENCE' then 4");
    expect(v3).toContain("when 'PROJECTS' then 5");
    expect(v3).toContain("when 'CERTIFICATIONS' then 3");
    expect(v3).toContain("when 'SKILLS' then 4");
    expect(v3).toContain("where section_slot <= section_budget");
  });

  it("keeps ResumePlan rows, items and source receipts application-owned and immutable", () => {
    const migration = read("supabase/migrations/20260903225000_b9_resume_plans.sql");
    const selection = read("supabase/migrations/20260903225300_b9_resume_plan_selection_receipts.sql");
    expect(migration).toContain("resume_plans_immutable");
    expect(migration).toContain("resume_plan_items_immutable");
    expect(migration).toContain("revoke all on public.resume_plans from public, anon, authenticated");
    expect(migration).toContain("revoke all on public.resume_plan_items from public, anon, authenticated");
    expect(selection).toContain("resume_plan_source_receipts_immutable");
    expect(selection).toContain("revoke all on public.resume_plan_source_receipts from public, anon, authenticated");
  });

  it("keeps General and Targeted input shapes distinct at the domain boundary", () => {
    const domain = read("src/domain/resume/ResumePlan.ts");
    expect(domain).toContain('mode: z.literal("GENERAL")');
    expect(domain).toContain('mode: z.literal("TARGETED")');
    expect(domain).toContain("jobSnapshotId: UUIDSchema");
    expect(domain).toContain("opportunityAssessmentId: UUIDSchema");
  });

  it("records an immutable selection receipt for every eligible Career Evidence item", () => {
    const selection = read("supabase/migrations/20260903225300_b9_resume_plan_selection_receipts.sql");
    expect(selection).toContain("create table public.resume_plan_source_receipts");
    expect(selection).toContain("OMITTED_DENSITY");
    expect(selection).toContain("OMITTED_TARGET_IRRELEVANT");
    expect(selection).toContain("resume_plan_source_receipts_one_per_evidence");
    expect(selection).toContain("B9_RESUME_PLAN_RECEIPT_ITEM_BINDING_INVALID");
    expect(selection).toContain("B9_RESUME_PLAN_RECEIPT_TARGET_STATUS_INVALID");
    expect(selection).toContain("B9_RESUME_PLAN_RECEIPT_DECISION_INVALID");
  });

  it("exposes selection receipts only through authenticated owner-bound reads", () => {
    const repository = read("src/application/resume/ResumePlanRepository.ts");
    expect(repository).toContain('.from("resume_plan_source_receipts")');
    expect(repository).toContain('eq("owner_user_id", ownerUserId)');
    expect(repository).toContain('eq("resume_plan_id", resumePlanId)');
  });
});
