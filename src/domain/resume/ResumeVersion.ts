import { z } from "zod";

export const B4_COMPOSER_VERSION = "b4-deterministic-resume-v1" as const;
export const B4_RENDERER_VERSION = "b4-plain-text-v1" as const;

export const ResumeModeSchema = z.enum(["GENERAL", "TARGETED"]);

export const ResumeClaimSchema = z.object({
  id: z.string().uuid(),
  ordinal: z.number().int().positive(),
  evidenceId: z.string().uuid(),
  evidenceRevision: z.number().int().positive(),
  evidenceKind: z.enum(["EMPLOYMENT", "PROJECT", "ACHIEVEMENT", "EDUCATION", "CERTIFICATION", "SKILL", "LANGUAGE", "METRIC"]),
  evidenceVerificationStatus: z.literal("VERIFIED"),
  evidenceCanonicalText: z.string().trim().min(1).max(10_000),
  renderedText: z.string().trim().min(1).max(10_000),
  evidenceTextSha256: z.string().regex(/^[0-9a-f]{64}$/),
  claimSha256: z.string().regex(/^[0-9a-f]{64}$/),
}).superRefine((value, context) => {
  if (value.renderedText !== value.evidenceCanonicalText) {
    context.addIssue({ code: "custom", path: ["renderedText"], message: "B4 trusted claims must preserve Career Evidence text exactly." });
  }
});

export const ResumeManifestSchema = z.object({
  composerVersion: z.literal(B4_COMPOSER_VERSION),
  rendererVersion: z.literal(B4_RENDERER_VERSION),
  evidenceFingerprintSha256: z.string().regex(/^[0-9a-f]{64}$/),
  claimCount: z.number().int().positive(),
  evidenceReceipts: z.array(z.object({
    evidenceId: z.string().uuid(),
    revision: z.number().int().positive(),
    textSha256: z.string().regex(/^[0-9a-f]{64}$/),
  })).min(1),
});

export const ResumeDocumentSchema = z.object({
  mode: ResumeModeSchema,
  claims: z.array(z.object({
    ordinal: z.number().int().positive(),
    kind: z.string().min(1),
    text: z.string().trim().min(1),
  })).min(1),
});

export const ResumeVersionSchema = z.object({
  id: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  mode: ResumeModeSchema,
  jobSnapshotId: z.string().uuid().nullable(),
  opportunityAssessmentId: z.string().uuid().nullable(),
  evidenceFingerprintSha256: z.string().regex(/^[0-9a-f]{64}$/),
  semanticKey: z.string().regex(/^[0-9a-f]{64}$/),
  composerVersion: z.literal(B4_COMPOSER_VERSION),
  rendererVersion: z.literal(B4_RENDERER_VERSION),
  manifest: ResumeManifestSchema,
  document: ResumeDocumentSchema,
  plainText: z.string().trim().min(1),
  claims: z.array(ResumeClaimSchema).min(1),
  createdAt: z.iso.datetime(),
}).superRefine((value, context) => {
  if (value.mode === "GENERAL" && (value.jobSnapshotId !== null || value.opportunityAssessmentId !== null)) {
    context.addIssue({ code: "custom", path: ["mode"], message: "GENERAL ResumeVersion cannot bind to Job/Assessment truth." });
  }
  if (value.mode === "TARGETED" && (value.jobSnapshotId === null || value.opportunityAssessmentId === null)) {
    context.addIssue({ code: "custom", path: ["mode"], message: "TARGETED ResumeVersion requires JobSnapshot and OpportunityAssessment provenance." });
  }
  if (value.document.mode !== value.mode) {
    context.addIssue({ code: "custom", path: ["document", "mode"], message: "Rendered document mode must match ResumeVersion mode." });
  }
  if (value.manifest.evidenceFingerprintSha256 !== value.evidenceFingerprintSha256) {
    context.addIssue({ code: "custom", path: ["manifest", "evidenceFingerprintSha256"], message: "Manifest fingerprint must match ResumeVersion fingerprint." });
  }
  if (value.manifest.claimCount !== value.claims.length || value.manifest.evidenceReceipts.length !== value.claims.length || value.document.claims.length !== value.claims.length) {
    context.addIssue({ code: "custom", path: ["manifest", "claimCount"], message: "Manifest, document and claim cardinalities must agree." });
  }
  value.claims.forEach((claim, index) => {
    const documentClaim = value.document.claims[index];
    const receipt = value.manifest.evidenceReceipts[index];
    if (!documentClaim || documentClaim.ordinal !== claim.ordinal || documentClaim.kind !== claim.evidenceKind || documentClaim.text !== claim.renderedText) {
      context.addIssue({ code: "custom", path: ["document", "claims", index], message: "Rendered document claim must match provenance claim exactly." });
    }
    if (!receipt || receipt.evidenceId !== claim.evidenceId || receipt.revision !== claim.evidenceRevision || receipt.textSha256 !== claim.evidenceTextSha256) {
      context.addIssue({ code: "custom", path: ["manifest", "evidenceReceipts", index], message: "Manifest receipt must match provenance claim exactly." });
    }
  });
});

export const CreateResumeVersionInputSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("GENERAL") }).strict(),
  z.object({ mode: z.literal("TARGETED"), jobSnapshotId: z.string().uuid() }).strict(),
]);

export type ResumeMode = z.infer<typeof ResumeModeSchema>;
export type ResumeClaim = z.infer<typeof ResumeClaimSchema>;
export type ResumeVersion = z.infer<typeof ResumeVersionSchema>;
export type CreateResumeVersionInput = z.infer<typeof CreateResumeVersionInputSchema>;
