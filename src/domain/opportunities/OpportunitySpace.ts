import { z } from "zod";

export const B7_MARKET_LIFECYCLE_VERSION = "b7-market-observation-v1" as const;
export const B7_COMPARISON_POLICY_VERSION = "b7-opportunity-space-v1" as const;

export const MarketObservationSchema = z.object({
  id: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  jobSnapshotId: z.string().uuid(),
  jobSnapshotSemanticKey: z.string().regex(/^[0-9a-f]{64}$/),
  rawDescriptionSha256: z.string().regex(/^[0-9a-f]{64}$/),
  roleTitle: z.string().trim().min(1).max(300),
  company: z.string().trim().min(1).max(300).nullable(),
  observedAt: z.iso.datetime(),
  capturedAt: z.iso.datetime(),
  lifecycleVersion: z.literal(B7_MARKET_LIFECYCLE_VERSION),
}).strict();

export const OpportunitySpaceItemSchema = z.object({
  id: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  marketObservationId: z.string().uuid(),
  opportunityAssessmentId: z.string().uuid(),
  jobSnapshotId: z.string().uuid(),
  recommendation: z.enum(["READY_NOW", "STRONG_STRETCH", "EVIDENCE_INCOMPLETE", "BUILDABLE", "LOW_ALIGNMENT"]),
  decision: z.enum(["YES", "CONSIDER", "NOT_YET", "NO"]),
  action: z.enum(["APPLY", "APPLY_WITH_CAUTION", "CLARIFY_EVIDENCE", "BUILD_FIRST", "DEPRIORITIZE"]),
  evidenceStrength: z.enum(["STRONG", "MODERATE", "LIMITED"]),
  assessmentSemanticKey: z.string().regex(/^[0-9a-f]{64}$/),
  selectedAt: z.iso.datetime(),
  comparisonPolicyVersion: z.literal(B7_COMPARISON_POLICY_VERSION),
}).strict();

export const OpportunitySpaceBundleSchema = z.object({
  observations: z.array(MarketObservationSchema),
  items: z.array(OpportunitySpaceItemSchema),
}).strict();

export type MarketObservation = z.infer<typeof MarketObservationSchema>;
export type OpportunitySpaceItem = z.infer<typeof OpportunitySpaceItemSchema>;
export type OpportunitySpaceBundle = z.infer<typeof OpportunitySpaceBundleSchema>;

const recommendationOrder: Record<OpportunitySpaceItem["recommendation"], number> = {
  READY_NOW: 0,
  STRONG_STRETCH: 1,
  EVIDENCE_INCOMPLETE: 2,
  BUILDABLE: 3,
  LOW_ALIGNMENT: 4,
};

const evidenceOrder: Record<OpportunitySpaceItem["evidenceStrength"], number> = {
  STRONG: 0,
  MODERATE: 1,
  LIMITED: 2,
};

export function compareOpportunitySpaceItems(a: OpportunitySpaceItem, b: OpportunitySpaceItem) {
  return recommendationOrder[a.recommendation] - recommendationOrder[b.recommendation]
    || evidenceOrder[a.evidenceStrength] - evidenceOrder[b.evidenceStrength]
    || a.selectedAt.localeCompare(b.selectedAt)
    || a.id.localeCompare(b.id);
}
