import { z } from "zod";
import {
  CareerEvidenceSourceSchema,
  VerificationStatusSchema,
  type CareerEvidence,
} from "../career/CareerEvidence";

export const CandidateSourceAuthoritySchema = z.enum([
  "USER_ASSERTED",
  "DERIVED_NOT_CANDIDATE_AUTHORITY",
]);

export type CandidateSourceAuthority = z.infer<typeof CandidateSourceAuthoritySchema>;

const CANDIDATE_CONTROLLED_SOURCES = new Set<z.infer<typeof CareerEvidenceSourceSchema>>([
  "MANUAL",
  "IMPORTED_RESUME",
  "IMPORTED_CERTIFICATE",
  "USER_CONFIRMED",
]);

export function candidateSourceAuthority(
  sourceInput: z.infer<typeof CareerEvidenceSourceSchema>,
): CandidateSourceAuthority {
  const source = CareerEvidenceSourceSchema.parse(sourceInput);
  return CANDIDATE_CONTROLLED_SOURCES.has(source)
    ? "USER_ASSERTED"
    : "DERIVED_NOT_CANDIDATE_AUTHORITY";
}

export function isCandidateSourceEligibleForResumeTransformation(
  sourceInput: z.infer<typeof CareerEvidenceSourceSchema>,
): boolean {
  return candidateSourceAuthority(sourceInput) === "USER_ASSERTED";
}

export function isCareerEvidenceEligibleForResumeTransformation(
  evidence: Pick<CareerEvidence, "source" | "verificationStatus">,
): boolean {
  VerificationStatusSchema.parse(evidence.verificationStatus);
  return isCandidateSourceEligibleForResumeTransformation(evidence.source);
}

/**
 * Existing verificationStatus records candidate review/defensibility state.
 * It is deliberately not an external-verification authority dimension.
 */
export function isExternallyVerifiedByVerificationStatus(
  statusInput: z.infer<typeof VerificationStatusSchema>,
): false {
  VerificationStatusSchema.parse(statusInput);
  return false;
}
