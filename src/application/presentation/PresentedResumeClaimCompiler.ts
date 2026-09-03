import { createHash, randomUUID } from "node:crypto";
import {
  PresentationRevisionSchema,
  type PresentationRevision,
} from "../../domain/presentation/PresentationRevision";
import {
  P1_PRESENTED_CLAIM_VERSION,
  PresentedResumeClaimSchema,
  type PresentedResumeClaim,
} from "../../domain/resume/PresentedResumeClaim";

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function evidenceFingerprint(revision: PresentationRevision) {
  return sha256(JSON.stringify(revision.sourceEvidence.map((source) => ({
    evidenceId: source.evidenceId,
    evidenceRevision: source.evidenceRevision,
    evidenceKind: source.evidenceKind,
    evidenceTextSha256: source.evidenceTextSha256,
  }))));
}

export function compilePresentedResumeClaim(
  revisionInput: PresentationRevision,
  ordinal: number,
  claimId = randomUUID(),
): PresentedResumeClaim {
  const revision = PresentationRevisionSchema.parse(revisionInput);

  if (revision.status !== "APPROVED") {
    throw new Error("P1_PRESENTED_CLAIM_REQUIRES_APPROVED_REVISION");
  }

  if (revision.validationReceipt.overallStatus !== "ACCEPTED") {
    throw new Error("P1_PRESENTED_CLAIM_REQUIRES_ACCEPTED_VALIDATION");
  }

  if (revision.purpose === "SECTION_HEADING") {
    throw new Error("P1_SECTION_HEADING_IS_NOT_A_RESUME_CLAIM");
  }

  if (revision.proposedSha256 !== sha256(revision.proposedText)) {
    throw new Error("P1_PRESENTATION_HASH_MISMATCH");
  }

  return PresentedResumeClaimSchema.parse({
    id: claimId,
    version: P1_PRESENTED_CLAIM_VERSION,
    ordinal,
    purpose: revision.purpose,
    presentationRevisionId: revision.id,
    evidenceRefs: revision.sourceEvidence.map((source) => ({
      evidenceId: source.evidenceId,
      evidenceRevision: source.evidenceRevision,
      evidenceKind: source.evidenceKind,
      evidenceTextSha256: source.evidenceTextSha256,
    })),
    renderedText: revision.proposedText,
    evidenceFingerprintSha256: evidenceFingerprint(revision),
    presentationFingerprintSha256: revision.proposedSha256,
  });
}
