import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CreateResumeVersionInputSchema,
  ResumeClaimSchema,
  ResumeVersionSchema,
} from "./resume/ResumeVersion";

const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
const hash = "a".repeat(64);

const claim = {
  id: id("1"), ordinal: 1, evidenceId: id("2"), evidenceRevision: 1,
  evidenceKind: "PROJECT" as const, evidenceVerificationStatus: "VERIFIED" as const,
  evidenceCanonicalText: "Built a deterministic evidence pipeline.",
  renderedText: "Built a deterministic evidence pipeline.", evidenceTextSha256: hash, claimSha256: hash,
};

describe("B4 ResumeVersion contracts", () => {
  it("accepts only mode and targeted JobSnapshot identity from the client", () => {
    expect(CreateResumeVersionInputSchema.parse({ mode: "GENERAL" })).toEqual({ mode: "GENERAL" });
    expect(CreateResumeVersionInputSchema.safeParse({ mode: "GENERAL", jobSnapshotId: id("3") }).success).toBe(false);
    expect(CreateResumeVersionInputSchema.safeParse({ mode: "TARGETED", jobSnapshotId: id("3") }).success).toBe(true);
    expect(CreateResumeVersionInputSchema.safeParse({ mode: "TARGETED", jobSnapshotId: id("3"), ownerUserId: id("4") }).success).toBe(false);
    expect(CreateResumeVersionInputSchema.safeParse({ mode: "GENERAL", claims: [claim] }).success).toBe(false);
  });

  it("requires trusted claims to preserve verified Career Evidence text exactly", () => {
    expect(ResumeClaimSchema.safeParse(claim).success).toBe(true);
    expect(ResumeClaimSchema.safeParse({ ...claim, renderedText: "Improved marketing rewrite." }).success).toBe(false);
    expect(ResumeClaimSchema.safeParse({ ...claim, evidenceVerificationStatus: "NEEDS_REVIEW" }).success).toBe(false);
  });

  it("keeps general and targeted provenance bindings distinct", () => {
    const common = {
      id: id("10"), ownerUserId: id("11"), evidenceFingerprintSha256: hash, semanticKey: hash,
      composerVersion: "b4-deterministic-resume-v1" as const, rendererVersion: "b4-plain-text-v1" as const,
      manifest: { composerVersion: "b4-deterministic-resume-v1" as const, rendererVersion: "b4-plain-text-v1" as const, evidenceFingerprintSha256: hash, claimCount: 1, evidenceReceipts: [{ evidenceId: claim.evidenceId, revision: 1, textSha256: hash }] },
      document: { mode: "GENERAL" as const, claims: [{ ordinal: 1, kind: "PROJECT", text: claim.renderedText }] },
      plainText: claim.renderedText, claims: [claim], createdAt: "2026-09-01T00:00:00.000Z",
    };
    expect(ResumeVersionSchema.safeParse({ ...common, mode: "GENERAL", jobSnapshotId: null, opportunityAssessmentId: null }).success).toBe(true);
    expect(ResumeVersionSchema.safeParse({ ...common, mode: "GENERAL", jobSnapshotId: id("20"), opportunityAssessmentId: null }).success).toBe(false);
  });

  it("locks persistence to application-owned composition", () => {
    const migration = readFileSync("supabase/migrations/20260901021000_b4_resume_version.sql", "utf8");
    expect(migration).toContain("cv_engine_create_resume_version");
    expect(migration).not.toContain("p_claims jsonb");
    expect(migration).not.toContain("p_rendered_text");
    expect(migration).toContain("cer.verification_status = 'VERIFIED'");
    expect(migration).toContain("resume_claims_source_preserving");
  });
});
