import { describe, expect, it } from "vitest";
import {
  candidateSourceAuthority,
  isCandidateSourceEligibleForResumeTransformation,
  isCareerEvidenceEligibleForResumeTransformation,
  isExternallyVerifiedByVerificationStatus,
} from "./truth/CandidateSourceAuthority";
import type { CareerEvidence } from "./career/CareerEvidence";

const USER_ASSERTED_SOURCES = [
  "MANUAL",
  "IMPORTED_RESUME",
  "IMPORTED_CERTIFICATE",
  "USER_CONFIRMED",
] as const;

const VERIFICATION_STATUSES = ["UNVERIFIED", "NEEDS_REVIEW", "VERIFIED"] as const;

describe("v1.2 candidate source authority", () => {
  it("treats every candidate-controlled source as USER_ASSERTED", () => {
    for (const source of USER_ASSERTED_SOURCES) {
      expect(candidateSourceAuthority(source)).toBe("USER_ASSERTED");
      expect(isCandidateSourceEligibleForResumeTransformation(source)).toBe(true);
    }
  });

  it("does not let deterministic derived material independently become candidate authority", () => {
    expect(candidateSourceAuthority("SYSTEM_DERIVED_DETERMINISTIC")).toBe("DERIVED_NOT_CANDIDATE_AUTHORITY");
    expect(isCandidateSourceEligibleForResumeTransformation("SYSTEM_DERIVED_DETERMINISTIC")).toBe(false);
  });

  it("never blocks candidate-authored evidence merely because it is UNVERIFIED or NEEDS_REVIEW", () => {
    for (const source of USER_ASSERTED_SOURCES) {
      for (const verificationStatus of VERIFICATION_STATUSES) {
        const evidence = { source, verificationStatus } as Pick<CareerEvidence, "source" | "verificationStatus">;
        expect(isCareerEvidenceEligibleForResumeTransformation(evidence)).toBe(true);
      }
    }
  });

  it("does not reinterpret the legacy VERIFIED state as external verification", () => {
    for (const verificationStatus of VERIFICATION_STATUSES) {
      expect(isExternallyVerifiedByVerificationStatus(verificationStatus)).toBe(false);
    }
  });
});
