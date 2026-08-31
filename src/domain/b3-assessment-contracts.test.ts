import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CreateAssessmentInputSchema,
  RequirementMatchSchema,
} from "./matching/Assessment";

const ownerUserId = "00000000-0000-4000-8000-000000000101";
const requirementId = "00000000-0000-4000-8000-000000000201";
const evidenceId = "00000000-0000-4000-8000-000000000301";
const baseMatch = {
  id: "00000000-0000-4000-8000-000000000401",
  requirementId,
  requirementSemanticKey: "a".repeat(64),
  category: "TOOL" as const,
  importance: "REQUIRED" as const,
  canonicalConcept: "Kubernetes is required.",
  sourceText: "- Kubernetes is required.",
  rationale: "Evidence supports or contradicts the requirement.",
};
const evidence = {
  id: evidenceId,
  revision: 1,
  kind: "SKILL" as const,
  verificationStatus: "VERIFIED" as const,
  canonicalText: "Candidate evidence relevant to Kubernetes.",
};

describe("B3 assessment contracts", () => {
  it("accepts only a Job Snapshot identifier from the client", () => {
    expect(CreateAssessmentInputSchema.parse({ jobSnapshotId: requirementId })).toEqual({ jobSnapshotId: requirementId });
    expect(CreateAssessmentInputSchema.safeParse({ jobSnapshotId: requirementId, ownerUserId }).success).toBe(false);
    expect(CreateAssessmentInputSchema.safeParse({ jobSnapshotId: requirementId, status: "MATCH" }).success).toBe(false);
    expect(CreateAssessmentInputSchema.safeParse({ jobSnapshotId: requirementId, score: 100 }).success).toBe(false);
  });

  it("requires evidence for every determinate state", () => {
    for (const status of ["MATCH", "POTENTIAL_MATCH", "GAP", "BLOCKER"] as const) {
      expect(RequirementMatchSchema.safeParse({ ...baseMatch, status, supportingEvidence: [] }).success).toBe(false);
      expect(RequirementMatchSchema.safeParse({ ...baseMatch, status, supportingEvidence: [evidence] }).success).toBe(true);
    }
  });

  it("keeps UNKNOWN unsupported rather than silently treating it as a pass", () => {
    expect(RequirementMatchSchema.safeParse({ ...baseMatch, status: "UNKNOWN", supportingEvidence: [] }).success).toBe(true);
    expect(RequirementMatchSchema.safeParse({ ...baseMatch, status: "UNKNOWN", supportingEvidence: [evidence] }).success).toBe(false);
  });

  it("locks the persistence boundary to a single trusted input", () => {
    const migration = readFileSync("supabase/migrations/20260831043000_b3_assessment.sql", "utf8");
    expect(migration).toContain("cv_engine_create_opportunity_assessment(p_job_snapshot_id uuid)");
    expect(migration).not.toContain("p_matches jsonb");
    expect(migration).not.toContain("p_recommendation");
    expect(migration).not.toContain("p_score");
    expect(migration).toContain("Absence of evidence is not treated as a capability gap.");
  });

  it("forbids hiring probability and public match-score fields", () => {
    const domain = readFileSync("src/domain/matching/Assessment.ts", "utf8");
    expect(domain).not.toContain("jobMatchScore");
    expect(domain).not.toContain("hiringProbability");
    expect(domain).toContain("This is not a hiring probability");
  });
});
