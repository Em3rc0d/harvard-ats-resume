import { z } from "zod";
import {
  PresentationPurposeSchema,
  PresentationEvidenceReceiptSchema,
} from "../presentation/PresentationRevision";

export const P1_PRESENTED_CLAIM_VERSION = "p1-presented-claim-v1" as const;

export const PresentedResumeClaimSchema = z.object({
  id: z.string().uuid(),
  version: z.literal(P1_PRESENTED_CLAIM_VERSION),
  ordinal: z.number().int().positive(),
  purpose: PresentationPurposeSchema.exclude(["SECTION_HEADING"]),
  presentationRevisionId: z.string().uuid(),
  evidenceRefs: z.array(PresentationEvidenceReceiptSchema.pick({
    evidenceId: true,
    evidenceRevision: true,
    evidenceKind: true,
    evidenceTextSha256: true,
  })).min(1).max(50),
  renderedText: z.string().trim().min(1).max(10_000),
  evidenceFingerprintSha256: z.string().regex(/^[0-9a-f]{64}$/),
  presentationFingerprintSha256: z.string().regex(/^[0-9a-f]{64}$/),
}).strict().superRefine((claim, ctx) => {
  const identities = claim.evidenceRefs.map((ref) => `${ref.evidenceId}:${ref.evidenceRevision}`);
  if (new Set(identities).size !== identities.length) {
    ctx.addIssue({
      code: "custom",
      path: ["evidenceRefs"],
      message: "Presented resume claim evidence references must be unique.",
    });
  }
});

export type PresentedResumeClaim = z.infer<typeof PresentedResumeClaimSchema>;
