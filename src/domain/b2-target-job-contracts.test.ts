import { describe, expect, it } from "vitest";
import { careerTargetSemanticKey } from "../application/targets/CareerTargetIdentity";
import { analyzeManualJobDescription } from "../application/jobs/DeterministicJobIntelligence";
import { CareerEvidenceSchema } from "./career/CareerEvidence";
import { CreateCareerTargetInputSchema } from "./targets/CareerTarget";
import { TRUTH_AUTHORITY } from "./truth/TruthClass";

const targetBase = {
  targetRole: "Backend Engineer",
  preferredSeniorities: ["MID", "SENIOR"] as const,
  preferredLocations: ["Lima", "Remote"],
  workModels: ["REMOTE", "HYBRID"] as const,
  employmentTypes: ["FULL_TIME"] as const,
  industries: ["Fintech", "SaaS"],
  relocationPreference: "OPEN" as const,
  priority: "PRIMARY" as const,
  activate: true,
};

describe("B2 target and job truth contracts", () => {
  it("keeps intent and market truth under distinct authorities", () => {
    expect(TRUTH_AUTHORITY.INTENT).toBe("CAREER_TARGET");
    expect(TRUTH_AUTHORITY.MARKET_FACT).toBe("JOB_SNAPSHOT");
    expect(TRUTH_AUTHORITY.CANDIDATE_FACT).toBe("CAREER_EVIDENCE");
  });

  it("gives semantically equal Career Targets the same identity", () => {
    const left = CreateCareerTargetInputSchema.parse(targetBase);
    const right = CreateCareerTargetInputSchema.parse({
      ...targetBase,
      targetRole: "  backend   engineer ",
      preferredSeniorities: ["SENIOR", "MID"],
      preferredLocations: ["remote", "LIMA"],
      workModels: ["HYBRID", "REMOTE"],
      industries: ["saas", "FINTECH"],
      activate: false,
    });

    expect(careerTargetSemanticKey(left)).toBe(careerTargetSemanticKey(right));
  });

  it("keeps different target directions as different semantic identities", () => {
    const backend = CreateCareerTargetInputSchema.parse(targetBase);
    const security = CreateCareerTargetInputSchema.parse({ ...targetBase, targetRole: "Security Engineer" });
    expect(careerTargetSemanticKey(backend)).not.toBe(careerTargetSemanticKey(security));
  });

  it("extracts requirements only from authorized job-description text, never metadata", () => {
    const analysis = analyzeManualJobDescription({
      roleTitle: "Senior Kubernetes Engineer",
      company: "AWS Experts",
      rawDescription: "About us\nWe build payment systems.\nRequirements:\n- Java is required.\n- Experience with Spring Boot.\nPreferred:\n- Docker is a plus.",
    });

    expect(analysis.requirements.map((item) => item.sourceText)).toEqual([
      "- Java is required.",
      "- Experience with Spring Boot.",
      "- Docker is a plus.",
    ]);
    expect(analysis.requirements.some((item) => item.sourceText.includes("Senior Kubernetes"))).toBe(false);
    expect(analysis.requirements.some((item) => item.sourceText.includes("AWS Experts"))).toBe(false);
  });

  it("is deterministic across runtime time for the same Job Description", () => {
    const input = {
      roleTitle: "Backend Engineer",
      rawDescription: "Requirements:\n- Kubernetes is required.\nPreferred:\n- Terraform is preferred.",
    };
    const left = analyzeManualJobDescription(input);
    const right = analyzeManualJobDescription(input);

    expect(left.semanticKey).toBe(right.semanticKey);
    expect(left.rawDescriptionSha256).toBe(right.rawDescriptionSha256);
    expect(left.requirements).toEqual(right.requirements);
  });

  it("never permits a Job Description to cross into Career Evidence", () => {
    const result = CareerEvidenceSchema.safeParse({
      id: "00000000-0000-4000-8000-000000000002",
      ownerUserId: "00000000-0000-4000-8000-000000000001",
      kind: "SKILL",
      source: "JOB_DESCRIPTION",
      verificationStatus: "UNVERIFIED",
      canonicalText: "Kubernetes",
      revision: 1,
      createdAt: "2026-08-30T12:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });
});
