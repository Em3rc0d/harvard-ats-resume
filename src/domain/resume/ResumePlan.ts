import { z } from "zod";

export const B9_RESUME_PLANNER_VERSION_V1 = "b9-deterministic-resume-plan-v1" as const;
export const B9_RESUME_PLANNER_VERSION_V2 = "b9-deterministic-resume-plan-v2" as const;
export const B9_RESUME_PLANNER_VERSION = "b9-deterministic-resume-plan-v3" as const;
export const B9_RESUME_DENSITY_POLICY_VERSION_V1 = "b9-one-page-density-v1" as const;
export const B9_RESUME_DENSITY_POLICY_VERSION = "b9-balanced-one-page-density-v2" as const;

export const B9_RESUME_SECTION_BUDGETS = {
  PROFILE: 1,
  EXPERIENCE: 4,
  PROJECTS: 5,
  EDUCATION: 2,
  CERTIFICATIONS: 3,
  SKILLS: 4,
  LANGUAGES: 1,
} as const;

export const ResumePlanModeSchema = z.enum(["GENERAL", "TARGETED"]);
export const ResumePlanPlannerVersionSchema = z.enum([
  B9_RESUME_PLANNER_VERSION_V1,
  B9_RESUME_PLANNER_VERSION_V2,
  B9_RESUME_PLANNER_VERSION,
]);
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
export const ResumePlanSourceDecisionSchema = z.enum([
  "INCLUDED",
  "OMITTED_DENSITY",
  "OMITTED_TARGET_IRRELEVANT",
]);
export const ResumePlanTargetMatchStatusSchema = z.enum(["MATCH", "POTENTIAL_MATCH"]);

export const ResumePlanSectionOrderSchema = z.tuple([
  z.literal("PROFILE"),
  z.literal("EXPERIENCE"),
  z.literal("PROJECTS"),
  z.literal("EDUCATION"),
  z.literal("CERTIFICATIONS"),
  z.literal("SKILLS"),
  z.literal("LANGUAGES"),
]);

const ResumePlanDensityPolicyV1Schema = z.object({
  policyVersion: z.literal(B9_RESUME_DENSITY_POLICY_VERSION_V1),
  targetPages: z.literal(1),
  maxItems: z.literal(20),
}).strict();

const ResumePlanDensityPolicyV2Schema = z.object({
  policyVersion: z.literal(B9_RESUME_DENSITY_POLICY_VERSION),
  targetPages: z.literal(1),
  maxItems: z.literal(20),
  sectionBudgets: z.object({
    PROFILE: z.literal(B9_RESUME_SECTION_BUDGETS.PROFILE),
    EXPERIENCE: z.literal(B9_RESUME_SECTION_BUDGETS.EXPERIENCE),
    PROJECTS: z.literal(B9_RESUME_SECTION_BUDGETS.PROJECTS),
    EDUCATION: z.literal(B9_RESUME_SECTION_BUDGETS.EDUCATION),
    CERTIFICATIONS: z.literal(B9_RESUME_SECTION_BUDGETS.CERTIFICATIONS),
    SKILLS: z.literal(B9_RESUME_SECTION_BUDGETS.SKILLS),
    LANGUAGES: z.literal(B9_RESUME_SECTION_BUDGETS.LANGUAGES),
  }).strict(),
}).strict();

export const ResumePlanDensityPolicySchema = z.union([
  ResumePlanDensityPolicyV1Schema,
  ResumePlanDensityPolicyV2Schema,
]);

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

export const ResumePlanSourceReceiptSchema = z.object({
  id: UUIDSchema,
  evidenceId: UUIDSchema,
  evidenceRevision: z.number().int().positive(),
  evidenceKind: z.string().trim().min(1).max(64),
  evidenceTextSha256: Sha256Schema,
  section: ResumePlanSectionSchema,
  decision: ResumePlanSourceDecisionSchema,
  targetMatchStatus: ResumePlanTargetMatchStatusSchema.nullable(),
  selectedItemId: UUIDSchema.nullable(),
}).strict().superRefine((receipt, context) => {
  const included = receipt.decision === "INCLUDED";
  if (included !== (receipt.selectedItemId !== null)) {
    context.addIssue({
      code: "custom",
      message: "Only INCLUDED source receipts may reference a selected plan item.",
      path: ["selectedItemId"],
    });
  }
  if (receipt.decision === "OMITTED_TARGET_IRRELEVANT" && receipt.targetMatchStatus !== null) {
    context.addIssue({
      code: "custom",
      message: "Target-irrelevant evidence cannot carry a target match status.",
      path: ["targetMatchStatus"],
    });
  }
});

const ResumePlanBaseSchema = z.object({
  id: UUIDSchema,
  ownerUserId: UUIDSchema,
  plannerVersion: ResumePlanPlannerVersionSchema,
  sectionOrder: ResumePlanSectionOrderSchema,
  densityPolicy: ResumePlanDensityPolicySchema,
  careerEvidenceFingerprintSha256: Sha256Schema,
  semanticKey: Sha256Schema,
  items: z.array(ResumePlanItemSchema).min(1).max(20),
  sourceReceipts: z.array(ResumePlanSourceReceiptSchema).max(2_000),
  createdAt: z.string().datetime({ offset: true }),
}).strict();

const ResumePlanUnionSchema = z.discriminatedUnion("mode", [
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

export const ResumePlanSchema = ResumePlanUnionSchema.superRefine((plan, context) => {
  const usesBalancedPolicy = plan.densityPolicy.policyVersion === B9_RESUME_DENSITY_POLICY_VERSION;
  if ((plan.plannerVersion === B9_RESUME_PLANNER_VERSION) !== usesBalancedPolicy) {
    context.addIssue({
      code: "custom",
      message: "ResumePlan v3 requires the balanced density policy; historical planners must retain their historical density policy.",
      path: ["densityPolicy", "policyVersion"],
    });
  }

  if (plan.plannerVersion === B9_RESUME_PLANNER_VERSION_V1) return;

  if (plan.sourceReceipts.length === 0) {
    context.addIssue({
      code: "custom",
      message: "B9 ResumePlan v2+ requires durable source-selection receipts.",
      path: ["sourceReceipts"],
    });
    return;
  }

  const receiptEvidenceIds = new Set<string>();
  const includedItemIds = new Set<string>();
  const itemById = new Map(plan.items.map((item) => [item.id, item]));

  for (const receipt of plan.sourceReceipts) {
    if (receiptEvidenceIds.has(receipt.evidenceId)) {
      context.addIssue({
        code: "custom",
        message: "Each evidence item must have exactly one source-selection receipt.",
        path: ["sourceReceipts"],
      });
    }
    receiptEvidenceIds.add(receipt.evidenceId);

    if (receipt.decision === "INCLUDED" && receipt.selectedItemId) {
      const item = itemById.get(receipt.selectedItemId);
      if (!item || item.evidenceId !== receipt.evidenceId || item.evidenceRevision !== receipt.evidenceRevision) {
        context.addIssue({
          code: "custom",
          message: "Included source receipt must bind to the matching ResumePlan item.",
          path: ["sourceReceipts"],
        });
      }
      includedItemIds.add(receipt.selectedItemId);
    }

    if (plan.mode === "GENERAL" && receipt.targetMatchStatus !== null) {
      context.addIssue({
        code: "custom",
        message: "GENERAL source receipts cannot carry target match state.",
        path: ["sourceReceipts"],
      });
    }
    if (plan.mode === "GENERAL" && receipt.decision === "OMITTED_TARGET_IRRELEVANT") {
      context.addIssue({
        code: "custom",
        message: "GENERAL plans cannot omit evidence as target-irrelevant.",
        path: ["sourceReceipts"],
      });
    }
    if (plan.mode === "TARGETED") {
      const shouldHaveTargetStatus = receipt.decision !== "OMITTED_TARGET_IRRELEVANT";
      if (shouldHaveTargetStatus !== (receipt.targetMatchStatus !== null)) {
        context.addIssue({
          code: "custom",
          message: "TARGETED included/density receipts require MATCH or POTENTIAL_MATCH provenance.",
          path: ["sourceReceipts"],
        });
      }
    }
  }

  if (includedItemIds.size !== plan.items.length) {
    context.addIssue({
      code: "custom",
      message: "Every ResumePlan item must be backed by exactly one INCLUDED source receipt.",
      path: ["items"],
    });
  }
});

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
export type ResumePlanSourceReceipt = z.infer<typeof ResumePlanSourceReceiptSchema>;
export type CreateResumePlanInput = z.infer<typeof CreateResumePlanInputSchema>;
