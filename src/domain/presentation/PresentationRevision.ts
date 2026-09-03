import { z } from "zod";
import { CareerEvidenceKindSchema } from "../career/CareerEvidence";

export const P1_PRESENTATION_CONTRACT_VERSION = "p1-presentation-v1" as const;
export const P1_DETERMINISTIC_GUARD_VERSION = "p1-presentation-guard-v1" as const;

export const PresentationRevisionStatusSchema = z.enum([
  "PROPOSED",
  "APPROVED",
  "REJECTED",
]);

export const PresentationPurposeSchema = z.enum([
  "CLAIM",
  "SUMMARY",
  "SECTION_HEADING",
]);

export const PresentationOriginSchema = z.enum([
  "DETERMINISTIC",
  "AI_PROPOSAL",
  "USER_EDIT",
]);

export const PresentationTransformationSchema = z.enum([
  "GRAMMAR",
  "ACTIVE_VOICE",
  "CONCISION",
  "CLARITY",
  "TERMINOLOGY_ALIGNMENT",
  "KEYWORD_ALIGNMENT",
  "REORDER",
  "GROUP",
  "DEDUPLICATE",
  "SUMMARY_SYNTHESIS",
  "SECTION_SELECTION",
  "SECTION_HEADING",
]);

export const PresentationValidationFindingCodeSchema = z.enum([
  "SOURCE_NOT_VERIFIED",
  "SOURCE_HASH_MISMATCH",
  "UNSUPPORTED_NUMBER",
  "UNSUPPORTED_PERCENTAGE",
  "UNSUPPORTED_CURRENCY",
  "UNSUPPORTED_TERM",
  "MARKET_TERM_PROMOTED_TO_CANDIDATE",
  "UNSUPPORTED_STRENGTHENING",
  "UNSUPPORTED_SUPERLATIVE",
  "SEMANTIC_REVIEW_REQUIRED",
]);

export const PresentationEvidenceReceiptSchema = z.object({
  evidenceId: z.string().uuid(),
  evidenceRevision: z.number().int().positive(),
  evidenceKind: CareerEvidenceKindSchema,
  evidenceVerificationStatus: z.literal("VERIFIED"),
  evidenceCanonicalText: z.string().trim().min(1).max(10_000),
  evidenceTextSha256: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();

export const PresentationContextSchema = z.object({
  mode: z.enum(["GENERAL", "TARGETED"]),
  careerTargetId: z.string().uuid().nullable(),
  jobSnapshotId: z.string().uuid().nullable(),
  opportunityAssessmentId: z.string().uuid().nullable(),
}).strict().superRefine((context, ctx) => {
  if (context.mode === "GENERAL" && (context.jobSnapshotId !== null || context.opportunityAssessmentId !== null)) {
    ctx.addIssue({
      code: "custom",
      path: ["mode"],
      message: "GENERAL presentation context cannot bind to JobSnapshot or OpportunityAssessment truth.",
    });
  }

  if (context.mode === "TARGETED" && (context.jobSnapshotId === null || context.opportunityAssessmentId === null)) {
    ctx.addIssue({
      code: "custom",
      path: ["mode"],
      message: "TARGETED presentation context requires JobSnapshot and OpportunityAssessment provenance.",
    });
  }
});

export const PresentationAIProvenanceSchema = z.object({
  provider: z.enum(["gemini", "ollama"]),
  model: z.string().trim().min(1).max(200),
  capability: z.literal("INLINE_WORDING_OPTIMIZATION"),
  requestId: z.string().uuid(),
  resultSha256: z.string().regex(/^[0-9a-f]{64}$/),
  credentialMode: z.enum(["PLATFORM", "BYOK", "LOCAL_ONLY"]),
}).strict();

export const PresentationValidationFindingSchema = z.object({
  code: PresentationValidationFindingCodeSchema,
  token: z.string().trim().min(1).max(500).nullable(),
  message: z.string().trim().min(1).max(1_000),
}).strict();

export const PresentationValidationReceiptSchema = z.object({
  contractVersion: z.literal(P1_PRESENTATION_CONTRACT_VERSION),
  deterministicGuardVersion: z.literal(P1_DETERMINISTIC_GUARD_VERSION),
  deterministicStatus: z.enum(["PASS", "FAIL"]),
  semanticStatus: z.enum([
    "SOURCE_EXACT",
    "MODEL_ASSISTED_PASS",
    "MANUAL_EVIDENCE_REVIEW_PASS",
    "REVIEW_REQUIRED",
    "NOT_RUN",
  ]),
  overallStatus: z.enum(["ACCEPTED", "REJECTED", "REVIEW_REQUIRED"]),
  findings: z.array(PresentationValidationFindingSchema),
  checkedAt: z.iso.datetime(),
}).strict().superRefine((receipt, ctx) => {
  if (receipt.deterministicStatus === "FAIL" && receipt.overallStatus !== "REJECTED") {
    ctx.addIssue({
      code: "custom",
      path: ["overallStatus"],
      message: "Deterministic guard failure must reject the presentation.",
    });
  }

  if (receipt.overallStatus === "ACCEPTED" && receipt.deterministicStatus !== "PASS") {
    ctx.addIssue({
      code: "custom",
      path: ["deterministicStatus"],
      message: "Accepted presentation requires deterministic guard PASS.",
    });
  }

  if (receipt.overallStatus === "ACCEPTED" && ["REVIEW_REQUIRED", "NOT_RUN"].includes(receipt.semanticStatus)) {
    ctx.addIssue({
      code: "custom",
      path: ["semanticStatus"],
      message: "Accepted rewritten presentation requires source-exact or completed semantic review.",
    });
  }
});

export const PresentationRevisionSchema = z.object({
  id: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  status: PresentationRevisionStatusSchema,
  purpose: PresentationPurposeSchema,
  sourceEvidence: z.array(PresentationEvidenceReceiptSchema).min(1).max(50),
  sourceText: z.string().trim().min(1).max(50_000),
  proposedText: z.string().trim().min(1).max(10_000),
  transformationTypes: z.array(PresentationTransformationSchema).max(20),
  context: PresentationContextSchema,
  origin: PresentationOriginSchema,
  aiProvenance: PresentationAIProvenanceSchema.nullable(),
  validationReceipt: PresentationValidationReceiptSchema,
  sourceSha256: z.string().regex(/^[0-9a-f]{64}$/),
  proposedSha256: z.string().regex(/^[0-9a-f]{64}$/),
  approvedByUserAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
}).strict().superRefine((revision, ctx) => {
  const identities = revision.sourceEvidence.map((source) => `${source.evidenceId}:${source.evidenceRevision}`);
  if (new Set(identities).size !== identities.length) {
    ctx.addIssue({
      code: "custom",
      path: ["sourceEvidence"],
      message: "Presentation source evidence references must be unique by evidence ID and revision.",
    });
  }

  if (revision.origin === "AI_PROPOSAL" && revision.aiProvenance === null) {
    ctx.addIssue({
      code: "custom",
      path: ["aiProvenance"],
      message: "AI presentation proposals require non-secret provider provenance.",
    });
  }

  if (revision.origin !== "AI_PROPOSAL" && revision.aiProvenance !== null) {
    ctx.addIssue({
      code: "custom",
      path: ["aiProvenance"],
      message: "Non-AI presentation revisions cannot carry AI provenance.",
    });
  }

  if (revision.status === "APPROVED") {
    if (revision.approvedByUserAt === null) {
      ctx.addIssue({
        code: "custom",
        path: ["approvedByUserAt"],
        message: "Approved presentation requires explicit user approval timestamp.",
      });
    }
    if (revision.validationReceipt.overallStatus !== "ACCEPTED") {
      ctx.addIssue({
        code: "custom",
        path: ["validationReceipt", "overallStatus"],
        message: "Approved presentation requires accepted validation receipt.",
      });
    }
  } else if (revision.approvedByUserAt !== null) {
    ctx.addIssue({
      code: "custom",
      path: ["approvedByUserAt"],
      message: "Only approved presentation revisions may carry approval time.",
    });
  }
});

export const PresentationPlanEvidenceRefSchema = z.object({
  evidenceId: z.string().uuid(),
  evidenceRevision: z.number().int().positive(),
}).strict();

export const PresentationPlanSectionSchema = z.object({
  sectionKey: z.string().trim().min(1).max(100),
  ordinal: z.number().int().positive(),
  evidenceRefs: z.array(PresentationPlanEvidenceRefSchema).min(1),
}).strict();

export const PresentationPlanSchema = z.object({
  id: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  context: PresentationContextSchema,
  selectedEvidenceRefs: z.array(PresentationPlanEvidenceRefSchema).min(1),
  excludedEvidenceRefs: z.array(PresentationPlanEvidenceRefSchema),
  sections: z.array(PresentationPlanSectionSchema).min(1),
  rendererProfile: z.literal("ATS_SINGLE_COLUMN_V1"),
  createdAt: z.iso.datetime(),
}).strict().superRefine((plan, ctx) => {
  const selected = new Set(plan.selectedEvidenceRefs.map((ref) => `${ref.evidenceId}:${ref.evidenceRevision}`));
  const excluded = new Set(plan.excludedEvidenceRefs.map((ref) => `${ref.evidenceId}:${ref.evidenceRevision}`));

  for (const identity of selected) {
    if (excluded.has(identity)) {
      ctx.addIssue({
        code: "custom",
        path: ["excludedEvidenceRefs"],
        message: "PresentationPlan evidence cannot be both selected and excluded.",
      });
    }
  }

  const sectionOrdinals = plan.sections.map((section) => section.ordinal);
  if (new Set(sectionOrdinals).size !== sectionOrdinals.length) {
    ctx.addIssue({
      code: "custom",
      path: ["sections"],
      message: "PresentationPlan section ordinals must be unique.",
    });
  }

  for (const section of plan.sections) {
    for (const ref of section.evidenceRefs) {
      if (!selected.has(`${ref.evidenceId}:${ref.evidenceRevision}`)) {
        ctx.addIssue({
          code: "custom",
          path: ["sections"],
          message: "PresentationPlan sections may only reference selected evidence.",
        });
      }
    }
  }
});

export type PresentationRevision = z.infer<typeof PresentationRevisionSchema>;
export type PresentationValidationReceipt = z.infer<typeof PresentationValidationReceiptSchema>;
export type PresentationEvidenceReceipt = z.infer<typeof PresentationEvidenceReceiptSchema>;
export type PresentationPlan = z.infer<typeof PresentationPlanSchema>;
