import { z } from "zod";
import { CareerEvidenceKindSchema, VerificationStatusSchema } from "../career/CareerEvidence";
import { JobRequirementCategorySchema, RequirementImportanceSchema } from "../jobs/JobSnapshot";

export const B3_MATCH_ENGINE_VERSION = "b3-deterministic-evidence-match-v1" as const;
export const B3_ASSESSMENT_POLICY_VERSION = "b3-opportunity-assessment-v1" as const;

export const RequirementMatchStatusSchema = z.enum([
  "MATCH",
  "POTENTIAL_MATCH",
  "GAP",
  "UNKNOWN",
  "BLOCKER",
]);

export const SupportingEvidenceSnapshotSchema = z.object({
  id: z.string().uuid(),
  revision: z.number().int().positive(),
  kind: CareerEvidenceKindSchema,
  verificationStatus: VerificationStatusSchema,
  canonicalText: z.string().trim().min(1).max(10_000),
});

export const RequirementMatchSchema = z.object({
  id: z.string().uuid(),
  requirementId: z.string().uuid(),
  requirementSemanticKey: z.string().regex(/^[0-9a-f]{64}$/),
  category: JobRequirementCategorySchema,
  importance: RequirementImportanceSchema,
  canonicalConcept: z.string().trim().min(1).max(500),
  sourceText: z.string().trim().min(1).max(5_000),
  status: RequirementMatchStatusSchema,
  supportingEvidence: z.array(SupportingEvidenceSnapshotSchema),
  rationale: z.string().trim().min(1).max(5_000),
}).superRefine((value, context) => {
  const supported = value.status === "MATCH" || value.status === "POTENTIAL_MATCH";
  if (supported && value.supportingEvidence.length === 0) {
    context.addIssue({ code: "custom", path: ["supportingEvidence"], message: "Supported match states require Career Evidence." });
  }
  if (value.status === "UNKNOWN" && value.supportingEvidence.length > 0) {
    context.addIssue({ code: "custom", path: ["supportingEvidence"], message: "UNKNOWN must not silently carry supporting evidence." });
  }
});

export const MatchStatusCountsSchema = z.object({
  MATCH: z.number().int().nonnegative(),
  POTENTIAL_MATCH: z.number().int().nonnegative(),
  GAP: z.number().int().nonnegative(),
  UNKNOWN: z.number().int().nonnegative(),
  BLOCKER: z.number().int().nonnegative(),
});

export const MatchBasisSchema = z.object({
  totalRequirements: z.number().int().positive(),
  required: MatchStatusCountsSchema,
  preferred: MatchStatusCountsSchema,
  context: MatchStatusCountsSchema,
});

export const MatchReportSchema = z.object({
  id: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  jobSnapshotId: z.string().uuid(),
  jobSnapshotSemanticKey: z.string().regex(/^[0-9a-f]{64}$/),
  careerEvidenceFingerprintSha256: z.string().regex(/^[0-9a-f]{64}$/),
  semanticKey: z.string().regex(/^[0-9a-f]{64}$/),
  engineVersion: z.literal(B3_MATCH_ENGINE_VERSION),
  matches: z.array(RequirementMatchSchema).min(1).max(250),
  basis: MatchBasisSchema,
  createdAt: z.iso.datetime(),
});

export const OpportunityRecommendationSchema = z.enum([
  "READY_NOW",
  "STRONG_STRETCH",
  "EVIDENCE_INCOMPLETE",
  "BUILDABLE",
  "LOW_ALIGNMENT",
]);
export const OpportunityDecisionSchema = z.enum(["YES", "CONSIDER", "NOT_YET", "NO"]);
export const OpportunityActionSchema = z.enum([
  "APPLY",
  "APPLY_WITH_CAUTION",
  "CLARIFY_EVIDENCE",
  "BUILD_FIRST",
  "DEPRIORITIZE",
]);
export const OpportunityEligibilitySchema = z.enum(["CLEAR", "UNCERTAIN", "BLOCKED"]);
export const OpportunityEvidenceStrengthSchema = z.enum(["STRONG", "MODERATE", "LIMITED"]);

export const OpportunityAssessmentSchema = z.object({
  id: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  matchReportId: z.string().uuid(),
  jobSnapshotId: z.string().uuid(),
  semanticKey: z.string().regex(/^[0-9a-f]{64}$/),
  policyVersion: z.literal(B3_ASSESSMENT_POLICY_VERSION),
  recommendation: OpportunityRecommendationSchema,
  decision: OpportunityDecisionSchema,
  action: OpportunityActionSchema,
  eligibility: OpportunityEligibilitySchema,
  evidenceStrength: OpportunityEvidenceStrengthSchema,
  criticalGapRequirementIds: z.array(z.string().uuid()),
  optionalGapRequirementIds: z.array(z.string().uuid()),
  uncertainRequirementIds: z.array(z.string().uuid()),
  rationale: z.string().trim().min(1).max(10_000),
  scopeBoundary: z.literal("Evidence alignment only. This is not a hiring probability, recruiter decision, or commercial ATS score."),
  createdAt: z.iso.datetime(),
});

export const CreateAssessmentInputSchema = z.object({
  jobSnapshotId: z.string().uuid(),
}).strict();

export const AssessmentBundleSchema = z.object({
  report: MatchReportSchema,
  assessment: OpportunityAssessmentSchema,
});

export type RequirementMatchStatus = z.infer<typeof RequirementMatchStatusSchema>;
export type RequirementMatch = z.infer<typeof RequirementMatchSchema>;
export type MatchBasis = z.infer<typeof MatchBasisSchema>;
export type MatchReport = z.infer<typeof MatchReportSchema>;
export type OpportunityAssessment = z.infer<typeof OpportunityAssessmentSchema>;
export type AssessmentBundle = z.infer<typeof AssessmentBundleSchema>;
