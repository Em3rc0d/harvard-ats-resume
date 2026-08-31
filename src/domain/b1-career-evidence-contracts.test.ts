import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CareerEvidenceSourceSchema } from "./career/CareerEvidence";
import { ReviseCareerEvidenceInputSchema } from "./career/CareerEvidenceMutation";

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("B1 Career Evidence contracts", () => {
  it("keeps Job Description outside candidate evidence sources", () => {
    expect(CareerEvidenceSourceSchema.safeParse("JOB_DESCRIPTION").success).toBe(false);
  });

  it("requires the caller to supply the revision it believes it is editing", () => {
    const invalid = ReviseCareerEvidenceInputSchema.safeParse({
      canonicalText: "Built a telemetry ingestion API.",
      verificationStatus: "VERIFIED",
    });
    expect(invalid.success).toBe(false);

    const valid = ReviseCareerEvidenceInputSchema.safeParse({
      expectedRevision: 3,
      canonicalText: "Built a telemetry ingestion API.",
      verificationStatus: "VERIFIED",
    });
    expect(valid.success).toBe(true);
  });

  it("enforces owner-scoped RLS on the Career Vault and evidence tables", () => {
    const migration = read("supabase/migrations/20260827144500_b1_career_vault.sql");

    for (const table of [
      "career_vaults",
      "career_evidence",
      "career_evidence_revisions",
      "consent_receipts",
    ]) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }

    expect(migration).toContain("auth.uid()) = owner_user_id");
    expect(migration).not.toContain("JOB_DESCRIPTION");
  });

  it("creates evidence and its first revision atomically inside one PostgreSQL function", () => {
    const mutation = read("supabase/migrations/20260827144800_b1_evidence_mutation_contract.sql");

    expect(mutation).toContain("cv_engine_create_career_evidence");
    expect(mutation).toContain("insert into public.career_evidence (");
    expect(mutation).toContain("insert into public.career_evidence_revisions (");
    expect(mutation).toContain("security invoker");
  });

  it("locks evidence and rejects stale revisions before creating the next revision", () => {
    const mutation = read("supabase/migrations/20260827144800_b1_evidence_mutation_contract.sql");

    expect(mutation).toContain("for update;");
    expect(mutation).toContain("v_current <> p_expected_revision");
    expect(mutation).toContain("CAREER_EVIDENCE_REVISION_CONFLICT");
    expect(mutation).toContain("v_next := v_current + 1");
  });

  it("connects successful first-run completion to the real Career Evidence workspace", () => {
    const firstRun = read("src/components/first-run/FirstRunExperience.tsx");
    const intelligenceWorkspace = read("src/components/CareerIntelligenceWorkspace.tsx");

    expect(firstRun).toContain("<CareerIntelligenceWorkspace");
    expect(intelligenceWorkspace).toContain("<CareerEvidenceWorkspace");
    expect(firstRun).toContain("persistConsent(selectedMode)");
    expect(firstRun).not.toContain("Your trusted session is ready for Career Evidence");
  });
});
