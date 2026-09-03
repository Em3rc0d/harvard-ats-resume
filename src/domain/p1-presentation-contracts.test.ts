import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  PresentationPlanSchema,
  PresentationRevisionSchema,
  type PresentationEvidenceReceipt,
} from "./presentation/PresentationRevision";
import {
  completeManualEvidenceReview,
  completeModelAssistedSemanticReview,
  presentationTextSha256,
  validatePresentationProposal,
} from "../application/presentation/PresentationGuard";
import {
  approvePresentationRevision,
  createPresentationProposal,
} from "../application/presentation/PresentationRevisionFactory";
import { compilePresentedResumeClaim } from "../application/presentation/PresentedResumeClaimCompiler";

const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
const at = "2026-09-03T21:30:00.000Z";

function sha(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function evidence(
  suffix: string,
  text: string,
  kind: PresentationEvidenceReceipt["evidenceKind"] = "PROJECT",
): PresentationEvidenceReceipt {
  return {
    evidenceId: id(suffix),
    evidenceRevision: 1,
    evidenceKind: kind,
    evidenceVerificationStatus: "VERIFIED",
    evidenceCanonicalText: text,
    evidenceTextSha256: sha(text),
  };
}

const generalContext = {
  mode: "GENERAL" as const,
  careerTargetId: id("90"),
  jobSnapshotId: null,
  opportunityAssessmentId: null,
};

const targetedContext = {
  mode: "TARGETED" as const,
  careerTargetId: id("90"),
  jobSnapshotId: id("91"),
  opportunityAssessmentId: id("92"),
};

describe("P1 truth-preserving professional presentation", () => {
  it("accepts exact verified source text without semantic review", () => {
    const source = evidence("1", "Built REST APIs using Java and Spring Boot.");
    const receipt = validatePresentationProposal({
      sourceEvidence: [source],
      proposedText: source.evidenceCanonicalText,
      checkedAt: at,
    });

    expect(receipt.deterministicStatus).toBe("PASS");
    expect(receipt.semanticStatus).toBe("SOURCE_EXACT");
    expect(receipt.overallStatus).toBe("ACCEPTED");
  });

  it("allows stronger wording only after deterministic guards and explicit semantic review", () => {
    const source = evidence("2", "Built REST APIs using Java and Spring Boot.");
    const proposedText = "Built Java and Spring Boot REST APIs.";
    const initial = validatePresentationProposal({
      sourceEvidence: [source],
      proposedText,
      checkedAt: at,
    });

    expect(initial.deterministicStatus).toBe("PASS");
    expect(initial.overallStatus).toBe("REVIEW_REQUIRED");
    expect(() => createPresentationProposal({
      id: id("20"),
      ownerUserId: id("99"),
      purpose: "CLAIM",
      sourceEvidence: [source],
      proposedText,
      transformationTypes: ["CLARITY", "REORDER"],
      context: generalContext,
      origin: "USER_EDIT",
      validationReceipt: initial,
      createdAt: at,
    })).not.toThrow();

    const reviewed = completeManualEvidenceReview(initial, at);
    expect(reviewed.overallStatus).toBe("ACCEPTED");

    const proposal = createPresentationProposal({
      id: id("21"),
      ownerUserId: id("99"),
      purpose: "CLAIM",
      sourceEvidence: [source],
      proposedText,
      transformationTypes: ["CLARITY", "REORDER"],
      context: generalContext,
      origin: "USER_EDIT",
      validationReceipt: reviewed,
      createdAt: at,
    });

    expect(proposal.status).toBe("PROPOSED");
    expect(proposal.sourceSha256).toBe(sha(source.evidenceCanonicalText));
    expect(proposal.proposedSha256).toBe(sha(proposedText));
    expect(() => approvePresentationRevision(proposal, at)).not.toThrow();

    const approved = approvePresentationRevision(proposal, at);
    const claim = compilePresentedResumeClaim(approved, 1, id("22"));
    expect(claim.renderedText).toBe(proposedText);
    expect(claim.presentationRevisionId).toBe(approved.id);
    expect(claim.evidenceRefs).toHaveLength(1);
    expect(claim.evidenceRefs[0]?.evidenceId).toBe(source.evidenceId);
  });

  it("cannot approve a changed proposal while semantic review is still open", () => {
    const source = evidence("3", "Implemented Angular user interfaces.");
    const validation = validatePresentationProposal({
      sourceEvidence: [source],
      proposedText: "Implemented user interfaces with Angular.",
      checkedAt: at,
    });
    const proposal = createPresentationProposal({
      id: id("30"), ownerUserId: id("99"), purpose: "CLAIM", sourceEvidence: [source],
      proposedText: "Implemented user interfaces with Angular.", transformationTypes: ["CLARITY"],
      context: generalContext, origin: "USER_EDIT", validationReceipt: validation, createdAt: at,
    });

    expect(validation.overallStatus).toBe("REVIEW_REQUIRED");
    expect(() => approvePresentationRevision(proposal, at)).toThrow("P1_PRESENTATION_APPROVAL_REQUIRES_ACCEPTED_VALIDATION");
  });

  it("rejects invented metrics and percentages", () => {
    const source = evidence("4", "Improved API response performance.");
    const validation = validatePresentationProposal({
      sourceEvidence: [source],
      proposedText: "Reduced API latency by 35%.",
      checkedAt: at,
    });

    expect(validation.overallStatus).toBe("REJECTED");
    expect(validation.findings.some((item) => item.code === "UNSUPPORTED_NUMBER")).toBe(true);
    expect(validation.findings.some((item) => item.code === "UNSUPPORTED_PERCENTAGE")).toBe(true);
  });

  it("rejects unsupported ownership, leadership and seniority strengthening", () => {
    const source = evidence("5", "Worked on Spring Boot services with the development team.");
    const validation = validatePresentationProposal({
      sourceEvidence: [source],
      proposedText: "Led and architected Spring Boot services as a senior engineer.",
      checkedAt: at,
    });

    expect(validation.overallStatus).toBe("REJECTED");
    const tokens = validation.findings.filter((item) => item.code === "UNSUPPORTED_STRENGTHENING").map((item) => item.token);
    expect(tokens).toEqual(expect.arrayContaining(["led", "architected", "senior"]));
  });

  it("rejects a market-only keyword when Career Evidence does not support it", () => {
    const source = evidence("6", "Built containerized services using Docker.");
    const validation = validatePresentationProposal({
      sourceEvidence: [source],
      proposedText: "Built containerized services using Docker and Kubernetes.",
      supportedTerms: ["Docker"],
      detectedCandidateTerms: ["Docker", "Kubernetes"],
      marketOnlyTerms: ["Kubernetes"],
      checkedAt: at,
    });

    expect(validation.overallStatus).toBe("REJECTED");
    expect(validation.findings.some((item) => item.code === "UNSUPPORTED_TERM" && item.token === "Kubernetes")).toBe(true);
    expect(validation.findings.some((item) => item.code === "MARKET_TERM_PROMOTED_TO_CANDIDATE" && item.token === "Kubernetes")).toBe(true);
  });

  it("allows a target-relevant term when the supported evidence term set proves it", () => {
    const source = evidence("7", "Deployed workloads to Kubernetes clusters.");
    const validation = validatePresentationProposal({
      sourceEvidence: [source],
      proposedText: "Deployed Kubernetes workloads to production clusters.",
      supportedTerms: ["Kubernetes"],
      detectedCandidateTerms: ["Kubernetes"],
      marketOnlyTerms: ["Kubernetes"],
      checkedAt: at,
    });

    expect(validation.deterministicStatus).toBe("PASS");
    expect(validation.overallStatus).toBe("REVIEW_REQUIRED");
  });

  it("never lets semantic review override a deterministic failure", () => {
    const source = evidence("8", "Improved customer onboarding flows.");
    const rejected = validatePresentationProposal({
      sourceEvidence: [source],
      proposedText: "Increased customer conversion by 50%.",
      checkedAt: at,
    });

    expect(() => completeManualEvidenceReview(rejected, at)).toThrow("P1_SEMANTIC_REVIEW_CANNOT_OVERRIDE_DETERMINISTIC_FAILURE");
    expect(() => completeModelAssistedSemanticReview(rejected, at)).toThrow("P1_SEMANTIC_REVIEW_CANNOT_OVERRIDE_DETERMINISTIC_FAILURE");
  });

  it("fails closed when an evidence text hash no longer matches", () => {
    const source = { ...evidence("9", "Built a reliable import pipeline."), evidenceTextSha256: "a".repeat(64) };
    const validation = validatePresentationProposal({
      sourceEvidence: [source],
      proposedText: source.evidenceCanonicalText,
      checkedAt: at,
    });

    expect(validation.overallStatus).toBe("REJECTED");
    expect(validation.findings.some((item) => item.code === "SOURCE_HASH_MISMATCH")).toBe(true);
  });

  it("requires explicit approval and accepted validation for APPROVED revisions", () => {
    const source = evidence("10", "Built a deterministic evidence pipeline.");
    const accepted = validatePresentationProposal({ sourceEvidence: [source], proposedText: source.evidenceCanonicalText, checkedAt: at });
    const sourceText = source.evidenceCanonicalText;
    const base = {
      id: id("100"), ownerUserId: id("99"), status: "APPROVED" as const, purpose: "CLAIM" as const,
      sourceEvidence: [source], sourceText, proposedText: sourceText, transformationTypes: [],
      context: generalContext, origin: "DETERMINISTIC" as const, aiProvenance: null,
      validationReceipt: accepted, sourceSha256: sha(sourceText), proposedSha256: sha(sourceText), createdAt: at,
    };

    expect(PresentationRevisionSchema.safeParse({ ...base, approvedByUserAt: null }).success).toBe(false);
    expect(PresentationRevisionSchema.safeParse({ ...base, approvedByUserAt: at }).success).toBe(true);
  });

  it("requires AI provenance for AI-origin proposals", () => {
    const source = evidence("11", "Built backend services in Java.");
    const review = completeModelAssistedSemanticReview(validatePresentationProposal({
      sourceEvidence: [source], proposedText: "Built Java backend services.", checkedAt: at,
    }), at);

    expect(() => createPresentationProposal({
      id: id("110"), ownerUserId: id("99"), purpose: "CLAIM", sourceEvidence: [source],
      proposedText: "Built Java backend services.", transformationTypes: ["REORDER"], context: generalContext,
      origin: "AI_PROPOSAL", aiProvenance: null, validationReceipt: review, createdAt: at,
    })).toThrow();

    expect(() => createPresentationProposal({
      id: id("111"), ownerUserId: id("99"), purpose: "CLAIM", sourceEvidence: [source],
      proposedText: "Built Java backend services.", transformationTypes: ["REORDER"], context: generalContext,
      origin: "AI_PROPOSAL",
      aiProvenance: {
        provider: "gemini", model: "gemini-3.5-flash-lite", capability: "INLINE_WORDING_OPTIMIZATION",
        requestId: id("112"), resultSha256: presentationTextSha256("Built Java backend services."), credentialMode: "PLATFORM",
      },
      validationReceipt: review, createdAt: at,
    })).not.toThrow();
  });

  it("keeps general and targeted presentation contexts distinct", () => {
    const source = evidence("12", "Built TypeScript applications.");
    const accepted = validatePresentationProposal({ sourceEvidence: [source], proposedText: source.evidenceCanonicalText, checkedAt: at });

    expect(() => createPresentationProposal({
      id: id("120"), ownerUserId: id("99"), purpose: "CLAIM", sourceEvidence: [source], proposedText: source.evidenceCanonicalText,
      transformationTypes: [], context: { ...generalContext, jobSnapshotId: id("91") }, origin: "DETERMINISTIC", validationReceipt: accepted, createdAt: at,
    })).toThrow();

    expect(() => createPresentationProposal({
      id: id("121"), ownerUserId: id("99"), purpose: "CLAIM", sourceEvidence: [source], proposedText: source.evidenceCanonicalText,
      transformationTypes: [], context: targetedContext, origin: "DETERMINISTIC", validationReceipt: accepted, createdAt: at,
    })).not.toThrow();
  });

  it("keeps PresentationPlan selection, exclusion and section membership deterministic", () => {
    const a = { evidenceId: id("13"), evidenceRevision: 1 };
    const b = { evidenceId: id("14"), evidenceRevision: 1 };
    const base = {
      id: id("130"), ownerUserId: id("99"), context: targetedContext,
      selectedEvidenceRefs: [a], excludedEvidenceRefs: [b],
      sections: [{ sectionKey: "experience", ordinal: 1, evidenceRefs: [a] }],
      rendererProfile: "ATS_SINGLE_COLUMN_V1" as const, createdAt: at,
    };

    expect(PresentationPlanSchema.safeParse(base).success).toBe(true);
    expect(PresentationPlanSchema.safeParse({ ...base, excludedEvidenceRefs: [a] }).success).toBe(false);
    expect(PresentationPlanSchema.safeParse({ ...base, sections: [{ sectionKey: "experience", ordinal: 1, evidenceRefs: [b] }] }).success).toBe(false);
  });

  it("supports synthesized summaries with multi-evidence provenance", () => {
    const api = evidence("15", "Built Spring Boot APIs for project Atlas.", "PROJECT");
    const ui = evidence("16", "Built Angular interfaces for project Nova.", "PROJECT");
    const proposedText = "Full-stack developer with hands-on experience building Spring Boot APIs and Angular interfaces.";
    const initial = validatePresentationProposal({ sourceEvidence: [api, ui], proposedText, checkedAt: at });
    const reviewed = completeManualEvidenceReview(initial, at);
    const proposal = createPresentationProposal({
      id: id("150"), ownerUserId: id("99"), purpose: "SUMMARY", sourceEvidence: [api, ui], proposedText,
      transformationTypes: ["SUMMARY_SYNTHESIS", "CONCISION"], context: generalContext, origin: "USER_EDIT",
      validationReceipt: reviewed, createdAt: at,
    });
    const approved = approvePresentationRevision(proposal, at);
    const claim = compilePresentedResumeClaim(approved, 1, id("151"));

    expect(claim.purpose).toBe("SUMMARY");
    expect(claim.evidenceRefs).toHaveLength(2);
    expect(claim.renderedText).toBe(proposedText);
  });
});
