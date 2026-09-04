import { z } from "zod";
import {
  B9_RESUME_COMPOSER_VERSION,
  ResumeCompositionSectionSchema,
  ResumeProfessionalSummarySchema,
  composeResumePlan,
} from "./ResumeComposition";
import { ResumePlanSchema, type ResumePlan } from "./ResumePlan";

export const B9_RESUME_ARTIFACT_VERSION = "b9-canonical-resume-artifact-v1" as const;
export const B9_RENDERER_CONTRACT_VERSION = "b9-ats-safe-single-column-v1" as const;

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const UUIDSchema = z.string().uuid();

export const ResumeArtifactHeaderSchema = z.object({
  status: z.literal("UNAVAILABLE"),
  displayName: z.null(),
  headline: z.null(),
  contactLines: z.tuple([]),
}).strict();

export const ResumeArtifactReceiptSchema = z.object({
  id: UUIDSchema,
  ordinal: z.number().int().positive(),
  sourcePlanItemId: UUIDSchema,
  evidenceId: UUIDSchema,
  evidenceRevision: z.number().int().positive(),
  evidenceTextSha256: Sha256Schema,
  presentationRevisionId: UUIDSchema.nullable(),
  presentationTextSha256: Sha256Schema.nullable(),
  renderedTextSha256: Sha256Schema,
  section: z.enum(["PROFILE", "EXPERIENCE", "PROJECTS", "EDUCATION", "CERTIFICATIONS", "SKILLS", "LANGUAGES"]),
  selectionReason: z.enum(["GENERAL_VERIFIED", "TARGET_MATCH", "TARGET_POTENTIAL_MATCH"]),
}).strict().superRefine((receipt, context) => {
  const usesPresentation = receipt.presentationRevisionId !== null;
  if (usesPresentation !== (receipt.presentationTextSha256 !== null)) {
    context.addIssue({ code: "custom", message: "Presentation provenance must be complete.", path: ["presentationRevisionId"] });
  }
  const expectedRenderedHash = receipt.presentationTextSha256 ?? receipt.evidenceTextSha256;
  if (receipt.renderedTextSha256 !== expectedRenderedHash) {
    context.addIssue({ code: "custom", message: "Rendered text must resolve to approved presentation or source evidence.", path: ["renderedTextSha256"] });
  }
});

export const ResumeArtifactManifestSchema = z.object({
  sourceResumePlanId: UUIDSchema,
  sourceResumePlanSemanticKey: Sha256Schema,
  plannerVersion: z.string().trim().min(1).max(128),
  composerVersion: z.literal(B9_RESUME_COMPOSER_VERSION),
  artifactVersion: z.literal(B9_RESUME_ARTIFACT_VERSION),
  rendererContractVersion: z.literal(B9_RENDERER_CONTRACT_VERSION),
  careerEvidenceFingerprintSha256: Sha256Schema,
  jobSnapshotId: UUIDSchema.nullable(),
  opportunityAssessmentId: UUIDSchema.nullable(),
  receipts: z.array(ResumeArtifactReceiptSchema).min(1).max(20),
}).strict();

export const ResumeArtifactContentSchema = z.object({
  header: ResumeArtifactHeaderSchema,
  professionalSummary: ResumeProfessionalSummarySchema.nullable(),
  sections: z.array(ResumeCompositionSectionSchema).max(6),
}).strict();

export const ResumeArtifactSchema = z.object({
  id: UUIDSchema,
  ownerUserId: UUIDSchema,
  mode: z.enum(["GENERAL", "TARGETED"]),
  sourceResumePlanId: UUIDSchema,
  sourceResumePlanSemanticKey: Sha256Schema,
  artifactVersion: z.literal(B9_RESUME_ARTIFACT_VERSION),
  composerVersion: z.literal(B9_RESUME_COMPOSER_VERSION),
  rendererContractVersion: z.literal(B9_RENDERER_CONTRACT_VERSION),
  careerEvidenceFingerprintSha256: Sha256Schema,
  artifactSemanticSha256: Sha256Schema,
  content: ResumeArtifactContentSchema,
  manifest: ResumeArtifactManifestSchema,
  createdAt: z.string().datetime({ offset: true }),
}).strict().superRefine((artifact, context) => {
  if (artifact.mode === "GENERAL" && (artifact.manifest.jobSnapshotId !== null || artifact.manifest.opportunityAssessmentId !== null)) {
    context.addIssue({ code: "custom", message: "GENERAL artifact cannot carry target bindings.", path: ["manifest"] });
  }
  if (artifact.mode === "TARGETED" && (artifact.manifest.jobSnapshotId === null || artifact.manifest.opportunityAssessmentId === null)) {
    context.addIssue({ code: "custom", message: "TARGETED artifact requires Job/Assessment provenance.", path: ["manifest"] });
  }
  if (artifact.manifest.sourceResumePlanId !== artifact.sourceResumePlanId || artifact.manifest.sourceResumePlanSemanticKey !== artifact.sourceResumePlanSemanticKey) {
    context.addIssue({ code: "custom", message: "Artifact source-plan identity must match its manifest.", path: ["manifest"] });
  }
  if (artifact.manifest.careerEvidenceFingerprintSha256 !== artifact.careerEvidenceFingerprintSha256) {
    context.addIssue({ code: "custom", message: "Artifact fingerprint must match its manifest.", path: ["manifest"] });
  }
});

export type ResumeArtifact = z.infer<typeof ResumeArtifactSchema>;

export function buildResumeArtifactContent(input: ResumePlan) {
  const plan = ResumePlanSchema.parse(input);
  const composition = composeResumePlan(plan);
  return ResumeArtifactContentSchema.parse({
    header: { status: "UNAVAILABLE", displayName: null, headline: null, contactLines: [] },
    professionalSummary: composition.professionalSummary,
    sections: composition.sections,
  });
}
