import { describe, expect, it } from "vitest";
import { MarketObservationSchema, OpportunitySpaceItemSchema, compareOpportunitySpaceItems } from "./opportunities/OpportunitySpace";

const base = {
  id: "00000000-0000-4000-8000-000000000701",
  ownerUserId: "00000000-0000-4000-8000-000000000101",
  marketObservationId: "00000000-0000-4000-8000-000000000702",
  opportunityAssessmentId: "00000000-0000-4000-8000-000000000703",
  jobSnapshotId: "00000000-0000-4000-8000-000000000704",
  decision: "YES" as const,
  action: "APPLY" as const,
  evidenceStrength: "STRONG" as const,
  assessmentSemanticKey: "a".repeat(64),
  selectedAt: "2026-09-01T12:00:00.000Z",
  comparisonPolicyVersion: "b7-opportunity-space-v1" as const,
};

describe("B7 opportunity space domain", () => {
  it("orders categories deterministically without producing a hiring probability score", () => {
    const ready = OpportunitySpaceItemSchema.parse({ ...base, recommendation: "READY_NOW" });
    const incomplete = OpportunitySpaceItemSchema.parse({ ...base, id: "00000000-0000-4000-8000-000000000705", recommendation: "EVIDENCE_INCOMPLETE", decision: "NOT_YET", action: "CLARIFY_EVIDENCE" });
    expect([incomplete, ready].sort(compareOpportunitySpaceItems).map((item) => item.recommendation)).toEqual(["READY_NOW", "EVIDENCE_INCOMPLETE"]);
    expect(Object.keys(ready)).not.toContain("hiringProbability");
    expect(Object.keys(ready)).not.toContain("atsScore");
  });

  it("requires immutable market and assessment provenance fields", () => {
    expect(() => MarketObservationSchema.parse({
      id: "00000000-0000-4000-8000-000000000706",
      ownerUserId: base.ownerUserId,
      jobSnapshotId: base.jobSnapshotId,
      jobSnapshotSemanticKey: "b".repeat(64),
      rawDescriptionSha256: "c".repeat(64),
      roleTitle: "Platform Engineer",
      company: null,
      observedAt: "2026-09-01T12:00:00.000Z",
      capturedAt: "2026-09-01T12:00:01.000Z",
      lifecycleVersion: "wrong-version",
    })).toThrow();
  });
});
