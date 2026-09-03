import { randomUUID } from "node:crypto";
import {
  PresentationContextSchema,
  PresentationEvidenceReceiptSchema,
  PresentationOriginSchema,
  PresentationPurposeSchema,
  PresentationRevisionSchema,
  PresentationTransformationSchema,
  PresentationValidationReceiptSchema,
  type PresentationRevision,
  type PresentationValidationReceipt,
} from "../../domain/presentation/PresentationRevision";
import { presentationTextSha256 } from "./PresentationGuard";

export type CreatePresentationProposalInput = Readonly<{
  id?: string;
  ownerUserId: string;
  purpose: "CLAIM" | "SUMMARY" | "SECTION_HEADING";
  sourceEvidence: readonly unknown[];
  proposedText: string;
  transformationTypes: readonly string[];
  context: unknown;
  origin: "DETERMINISTIC" | "AI_PROPOSAL" | "USER_EDIT";
  aiProvenance?: unknown | null;
  validationReceipt: PresentationValidationReceipt;
  createdAt?: string;
}>;

function sourceTextFor(sourceEvidence: readonly { evidenceCanonicalText: string }[]) {
  return sourceEvidence.map((source) => source.evidenceCanonicalText).join("\n");
}

export function createPresentationProposal(input: CreatePresentationProposalInput): PresentationRevision {
  const sourceEvidence = input.sourceEvidence.map((source) => PresentationEvidenceReceiptSchema.parse(source));
  const sourceText = sourceTextFor(sourceEvidence);
  const proposedText = input.proposedText.trim();
  const context = PresentationContextSchema.parse(input.context);
  const purpose = PresentationPurposeSchema.parse(input.purpose);
  const origin = PresentationOriginSchema.parse(input.origin);
  const transformationTypes = input.transformationTypes.map((value) => PresentationTransformationSchema.parse(value));
  const validationReceipt = PresentationValidationReceiptSchema.parse(input.validationReceipt);

  return PresentationRevisionSchema.parse({
    id: input.id ?? randomUUID(),
    ownerUserId: input.ownerUserId,
    status: validationReceipt.overallStatus === "REJECTED" ? "REJECTED" : "PROPOSED",
    purpose,
    sourceEvidence,
    sourceText,
    proposedText,
    transformationTypes,
    context,
    origin,
    aiProvenance: input.aiProvenance ?? null,
    validationReceipt,
    sourceSha256: presentationTextSha256(sourceText),
    proposedSha256: presentationTextSha256(proposedText),
    approvedByUserAt: null,
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
}

export function approvePresentationRevision(
  proposalInput: PresentationRevision,
  approvedByUserAt = new Date().toISOString(),
): PresentationRevision {
  const proposal = PresentationRevisionSchema.parse(proposalInput);

  if (proposal.status !== "PROPOSED") {
    throw new Error("P1_ONLY_PROPOSED_PRESENTATION_CAN_BE_APPROVED");
  }

  if (proposal.validationReceipt.overallStatus !== "ACCEPTED") {
    throw new Error("P1_PRESENTATION_APPROVAL_REQUIRES_ACCEPTED_VALIDATION");
  }

  return PresentationRevisionSchema.parse({
    ...proposal,
    status: "APPROVED",
    approvedByUserAt,
  });
}

export function rejectPresentationRevision(proposalInput: PresentationRevision): PresentationRevision {
  const proposal = PresentationRevisionSchema.parse(proposalInput);

  if (proposal.status === "APPROVED") {
    throw new Error("P1_APPROVED_PRESENTATION_IS_IMMUTABLE");
  }

  return PresentationRevisionSchema.parse({
    ...proposal,
    status: "REJECTED",
    approvedByUserAt: null,
  });
}
