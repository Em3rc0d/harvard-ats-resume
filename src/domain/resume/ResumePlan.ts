import { z } from "zod";

export const B9_RESUME_PLANNER_VERSION = "b9-deterministic-resume-plan-v1" as const;
export const B9_RESUME_DENSITY_POLICY_VERSION = "b9-one-page-density-v1" as const;

export const ResumePlanModeSchema = z.enum(["GENERAL", "TARGETED"]);
export const ResumePlanSectionSchema = z.enum([
  "PROFILE",
  "EXPERIENCE",
  "PROJECTS",
  "EDUCATION",
  "CERTIFICATIONS",
  "SKILLS",
  "LANGUAGES",
]);
export const ResumePlanSelectionReasonSchema = z.enum([
  "GENERAL_VERIFIED",
  "TARGET_MATCH",
  "TARGET_POTENTIAL_MATCH",
]);

export const ResumePlanSectionOrderSchema = z.tuple([
  z.literal("PROFILE"),
  z.literal("EXPERIENCE"),
  z.literal("PROJECTS"),
  z.literal("EDUCATION"),
  z.literal("CERTIFICATIONS"),
  z.literal("SKILLS"),
  z.literal("LANGUAGES"),
]);

export const ResumePlanDensityPolicySchema = z.object({
  policyVersion: z.literal(B9_RESUME_DENSITY_POLICY_VERSION),
  targetPages: z.literal(1),
  maxItems: z.literal(20),
}).strict();

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const UUIDSchema = z.string().uuid();

export const ResumePlanItemSchema = z.object({
  id: UUIDSchema,
  ordinal: z.number().int().positive(),
  section: ResumePlanSectionSchema,
  evidenceId: UUIDSchema,
  evidenceRevision: z.number().int().positive(),
  evidenceKind: z.string().trim().min(1).max(64),
  evidenceTextSha256: Sha256Schema,
  presentationRevisionId: UUIDSchema.nullable(),
  presentationTextSha256: Sha256Schema.nullable(),
  renderedText: z.string().trim().min(1).max(10_000),
  selectionReason: ResumePlanSelectionReasonSchema,
}).strict().superRefine((item, context) => {
  const hasPresentationId = item.presentationRevisionId !== null;
  const hasPresentationHash = item.presentationTextSha256 !== null;
  if (hasPresentationId !== hasPresentationHash) {
    context.addIssue({
      code: "custom",
      message: "Presentation revision id and hash must be present or absent together.",
      path: ["presentationRevisionId"],
    });
  }
});

const ResumePlanBaseSchema = z.object({
  id: UUIDSchema,
  ownerUserId: UUIDSchema,
  plannerVersion: z.literal(B9_RESUME_PLANNER_VERSION),
  sectionOrder: ResumePlanSectionOrderSchema,
  densityPolicy: ResumePlanDensityPolicySchema,
  careerEvidenceFingerprintSha256: Sha256Schema,
  semanticKey: Sha256Schema,
  items: z.array(ResumePlanItemSchema).min(1).max(20),
  createdAt: z.string().datetime({ offset: true }),
}).strict();

export const ResumePlanSchema = z.discriminatedUnion("mode", [
  ResumePlanBaseSchema.extend({
    mode: z.literal("GENERAL"),
    jobSnapshotId: z.null(),
    opportunityAssessmentId: z.null(),
  }).strict(),
  ResumePlanBaseSchema.extend({
    mode: z.literal("TARGETED"),
    jobSnapshotId: UUIDSchema,
    opportunityAssessmentId: UUIDSchema,
  }).strict(),
]);

export const CreateResumePlanInputSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("GENERAL") }).strict(),
  z.object({
    mode: z.literal("TARGETED"),
    jobSnapshotId: UUIDSchema,
    opportunityAssessmentId: UUIDSchema,
  }).strict(),
]);

export type ResumePlan = z.infer<typeof ResumePlanSchema>;
export type ResumePlanItem = z.infer<typeof ResumePlanItemSchema>;
export type CreateResumePlanInput = z.infer<typeof CreateResumePlanInputSchema>;
