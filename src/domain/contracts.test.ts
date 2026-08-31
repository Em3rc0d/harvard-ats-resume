import { describe, expect, it } from "vitest";
import { AIExecutionBudgetSchema } from "./ai/AICapability";
import { CareerEvidenceSchema } from "./career/CareerEvidence";
import { JobSnapshotSchema } from "./jobs/JobSnapshot";
import { ResumeVersionSchema } from "./resume/ResumeVersion";
import { TRUTH_AUTHORITY } from "./truth/TruthClass";

const ownerUserId = "00000000-0000-4000-8000-000000000001";
const evidenceId = "00000000-0000-4000-8000-000000000002";
const claimId = "00000000-0000-4000-8000-000000000003";
const snapshotId = "00000000-0000-4000-8000-000000000004";
const sha = "a".repeat(64);

const evidenceFixture = {
  id: evidenceId,
  ownerUserId,
  kind: "PROJECT",
  source: "MANUAL",
  verificationStatus: "VERIFIED",
  canonicalText: "Built a telemetry ingestion API.",
  revision: 1,
  createdAt: "2026-08-26T17:00:00.000Z",
} as const;

describe("CV Engine vNext foundational contracts", () => {
  it("keeps candidate and market truth under different authorities", () => {
    expect(TRUTH_AUTHORITY.CANDIDATE_FACT).toBe("CAREER_EVIDENCE");
    expect(TRUTH_AUTHORITY.MARKET_FACT).toBe("JOB_SNAPSHOT");
  });

  it("does not allow a Job Description to become a Career Evidence source", () => {
    expect(CareerEvidenceSchema.safeParse(evidenceFixture).success).toBe(true);
    expect(CareerEvidenceSchema.safeParse({ ...evidenceFixture, source: "JOB_DESCRIPTION" }).success).toBe(false);
  });

  it("keeps Job requirements inside market truth", () => {
    const result = JobSnapshotSchema.safeParse({
      id: snapshotId,
      ownerUserId,
      semanticKey: sha,
      source: "MANUAL_JOB_DESCRIPTION",
      roleTitle: "Backend Engineer",
      rawDescription: "Kubernetes is required.",
      rawDescriptionSha256: sha,
      analyzerVersion: "b2-deterministic-job-intelligence-v1",
      requirements: [{
        id: "00000000-0000-4000-8000-000000000005",
        semanticKey: "b".repeat(64),
        category: "HARD_SKILL",
        importance: "REQUIRED",
        canonicalConcept: "Kubernetes",
        sourceText: "Kubernetes is required.",
        sourceTextSha256: "c".repeat(64),
        sourceOrdinal: 0,
      }],
      capturedAt: "2026-08-26T17:00:00.000Z",
      createdAt: "2026-08-26T17:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("requires evidence references for every Resume claim", () => {
    const result = ResumeVersionSchema.safeParse({
      id: "00000000-0000-4000-8000-000000000006",
      ownerUserId,
      careerSnapshotId: snapshotId,
      claims: [{ claimId, evidenceIds: [], renderedText: "Built a telemetry ingestion API." }],
      composer: { provider: "cv-engine-deterministic", contractVersion: "cv-engine-vnext-resume-v1" },
      createdAt: "2026-08-26T17:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects AI as final trusted ResumeVersion composer", () => {
    const result = ResumeVersionSchema.safeParse({
      id: "00000000-0000-4000-8000-000000000006",
      ownerUserId,
      careerSnapshotId: snapshotId,
      claims: [{ claimId, evidenceIds: [evidenceId], renderedText: "Built a telemetry ingestion API." }],
      composer: { provider: "gemini", contractVersion: "cv-engine-vnext-resume-v1" },
      createdAt: "2026-08-26T17:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("caps provider attempts at the PF0 safety ceiling", () => {
    const result = AIExecutionBudgetSchema.safeParse({
      capability: "resume-import-fragment",
      capabilityClass: "BOUNDED_ASSIST",
      maxGeminiAttempts: 3,
      maxOllamaAttempts: 1,
      maxInputTokens: 20_000,
      maxOutputTokens: 4_000,
      perAttemptTimeoutMs: 10_000,
      wholeOperationDeadlineMs: 30_000,
      allowQualityEscalation: true,
    });
    expect(result.success).toBe(false);
  });
});
