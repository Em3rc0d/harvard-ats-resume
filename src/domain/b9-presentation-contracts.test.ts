import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  B9_PRESENTATION_VALIDATOR_VERSION,
  PresentationRevisionSchema,
  PresentationValidationResultSchema,
  RecordPresentationProposalInputSchema,
  ResolvePresentationRevisionInputSchema,
} from "./presentation/PresentationRevision";

const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
const hash = "a".repeat(64);

const provenance = {
  provider: "gemini" as const,
  model: "gemini-3.5-flash-lite",
  capability: "INLINE_WORDING_OPTIMIZATION" as const,
  contractVersion: "b6-ai-runtime-v1",
  attempt: 1,
  fallbackUsed: false,
  credentialMode: "PLATFORM" as const,
  requestId: "req-b9-1",
};

const base = {
  id: id("1"),
  ownerUserId: id("2"),
  evidenceId: id("3"),
  evidenceRevision: 1,
  sourceTextSha256: hash,
  proposedText: "Built and tested a deterministic evidence pipeline.",
  proposedTextSha256: hash,
  provenance,
  validatorVersion: B9_PRESENTATION_VALIDATOR_VERSION,
  validationResult: { status: "PASS" as const, reasonCodes: [] },
  status: "PROPOSED" as const,
  createdAt: "2026-09-03T20:00:00.000Z",
  resolvedAt: null,
};

describe("B9 PresentationRevision contracts", () => {
  it("accepts only durable PASS validation results", () => {
    expect(PresentationValidationResultSchema.safeParse({ status: "PASS", reasonCodes: [] }).success).toBe(true);
    expect(PresentationValidationResultSchema.safeParse({ status: "PASS", reasonCodes: ["METRIC_ADDED"] }).success).toBe(false);
    expect(PresentationValidationResultSchema.safeParse({ status: "REJECT", reasonCodes: [] }).success).toBe(false);
  });

  it("requires explicit provider provenance and exact evidence revision binding", () => {
    expect(PresentationRevisionSchema.safeParse(base).success).toBe(true);
    expect(PresentationRevisionSchema.safeParse({ ...base, evidenceRevision: 0 }).success).toBe(false);
    expect(PresentationRevisionSchema.safeParse({ ...base, provenance: { ...provenance, capability: "OPPORTUNITY_EXPLANATION" } }).success).toBe(false);
  });

  it("keeps proposed and terminal resolution shapes distinct", () => {
    expect(PresentationRevisionSchema.safeParse({ ...base, status: "PROPOSED", resolvedAt: "2026-09-03T20:01:00.000Z" }).success).toBe(false);
    expect(PresentationRevisionSchema.safeParse({ ...base, status: "APPROVED", resolvedAt: null }).success).toBe(false);
    expect(PresentationRevisionSchema.safeParse({ ...base, status: "APPROVED", resolvedAt: "2026-09-03T20:01:00.000Z" }).success).toBe(true);
  });

  it("does not let a client smuggle owner or status into record/resolve commands", () => {
    const record = {
      evidenceId: id("3"), evidenceRevision: 1, sourceTextSha256: hash,
      proposedText: base.proposedText, proposedTextSha256: hash,
      provenance, validatorVersion: B9_PRESENTATION_VALIDATOR_VERSION,
      validationResult: base.validationResult,
    };
    expect(RecordPresentationProposalInputSchema.safeParse(record).success).toBe(true);
    expect(RecordPresentationProposalInputSchema.safeParse({ ...record, ownerUserId: id("2") }).success).toBe(false);
    expect(ResolvePresentationRevisionInputSchema.safeParse({ presentationRevisionId: id("1"), decision: "APPROVE" }).success).toBe(true);
    expect(ResolvePresentationRevisionInputSchema.safeParse({ presentationRevisionId: id("1"), decision: "APPROVE", status: "APPROVED" }).success).toBe(false);
  });

  it("locks DB mutation behind owner-bound RPCs and safe transitions", () => {
    const migration = readFileSync("supabase/migrations/20260903214000_b9_presentation_revisions.sql", "utf8");
    expect(migration).toContain("presentation_revisions_source_owner_fk");
    expect(migration).toContain("cv_engine_record_presentation_proposal");
    expect(migration).toContain("cv_engine_resolve_presentation_revision");
    expect(migration).toContain("B9_SOURCE_REVISION_STALE");
    expect(migration).toContain("B9_APPROVAL_SOURCE_STALE");
    expect(migration).toContain("validation_result->>'status' = 'PASS'");
    expect(migration).toContain("revoke all on public.presentation_revisions from public, anon, authenticated");
    expect(migration).toContain("grant select on public.presentation_revisions to authenticated");
  });
});
