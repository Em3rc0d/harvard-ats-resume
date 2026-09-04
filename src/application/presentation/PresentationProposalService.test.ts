import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { AIExecutionInput, AIExecutionOutcome } from "../ai/AIGatewayRuntime";
import type { CareerEvidenceCurrent } from "../../domain/career/CareerEvidenceMutation";
import {
  B9_PRESENTATION_VALIDATOR_VERSION,
  PresentationRevisionSchema,
  type RecordPresentationProposalInput,
} from "../../domain/presentation/PresentationRevision";
import {
  DEFAULT_PRESENTATION_OBJECTIVE,
  proposePresentationRevision,
} from "./PresentationProposalService";

const id = (suffix: string) =>
  `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

const source =
  "Desarrollo y optimización de APIs REST con Spring Boot, aplicando arquitectura por capas y buenas prácticas de seguridad.";

const evidence: CareerEvidenceCurrent = {
  id: id("1"),
  ownerUserId: id("2"),
  vaultId: id("3"),
  kind: "EMPLOYMENT",
  source: "MANUAL",
  verificationStatus: "VERIFIED",
  canonicalText: source,
  revision: 4,
  createdAt: "2026-09-03T20:00:00.000Z",
  updatedAt: "2026-09-03T20:05:00.000Z",
};

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function successOutcome(text: string): AIExecutionOutcome {
  return {
    ok: true,
    requestId: "req-b9-2",
    capability: "INLINE_WORDING_OPTIMIZATION",
    proposal: { text },
    resultSha256: sha256(text),
    provenance: {
      provider: "gemini",
      model: "gemini-3.5-flash-lite",
      capability: "INLINE_WORDING_OPTIMIZATION",
      contractVersion: "b6-ai-runtime-v1",
      attempt: 1,
      fallbackUsed: false,
      credentialMode: "PLATFORM",
      requestId: "req-b9-2",
    },
    attempts: [{
      provider: "GEMINI",
      model: "gemini-3.5-flash-lite",
      attempt: 1,
      credentialMode: "PLATFORM",
      status: "SUCCESS",
      failureCode: null,
      durationMs: 8,
      inputTokens: 90,
      outputTokens: 24,
    }],
    durationMs: 8,
    inputTokens: 90,
    outputTokens: 24,
  };
}

function durableRevision(input: RecordPresentationProposalInput) {
  return PresentationRevisionSchema.parse({
    id: id("4"),
    ownerUserId: evidence.ownerUserId,
    evidenceId: input.evidenceId,
    evidenceRevision: input.evidenceRevision,
    sourceTextSha256: input.sourceTextSha256,
    proposedText: input.proposedText,
    proposedTextSha256: input.proposedTextSha256,
    provenance: input.provenance,
    validatorVersion: input.validatorVersion,
    validationResult: input.validationResult,
    status: "PROPOSED",
    createdAt: "2026-09-03T20:10:00.000Z",
    resolvedAt: null,
  });
}

describe("B9.2 Presentation proposal wiring", () => {
  it("persists only a validator PASS bound to the exact VERIFIED evidence revision", async () => {
    const safeProposal =
      "Desarrollo y optimizo APIs REST con Spring Boot, aplicando arquitectura por capas y buenas prácticas de seguridad.";
    let capturedPrompt = "";
    const executeAI = vi.fn(async (input: AIExecutionInput) => {
      capturedPrompt = input.prompt;
      return successOutcome(safeProposal);
    });
    const record = vi.fn(async (input: RecordPresentationProposalInput) =>
      durableRevision(input));

    const outcome = await proposePresentationRevision(
      {
        evidence,
        objective: DEFAULT_PRESENTATION_OBJECTIVE,
        credentialMode: "PLATFORM_KEY",
      },
      { executeAI, record },
    );

    expect(outcome.ok).toBe(true);
    expect(record).toHaveBeenCalledTimes(1);

    const recorded = record.mock.calls[0]?.[0];
    expect(recorded?.evidenceId).toBe(evidence.id);
    expect(recorded?.evidenceRevision).toBe(evidence.revision);
    expect(recorded?.sourceTextSha256).toBe(sha256(source));
    expect(recorded?.proposedTextSha256).toBe(sha256(safeProposal));
    expect(recorded?.validatorVersion).toBe(B9_PRESENTATION_VALIDATOR_VERSION);
    expect(recorded?.validationResult).toEqual({ status: "PASS", reasonCodes: [] });

    const envelope = JSON.parse(capturedPrompt) as Record<string, unknown>;
    expect(Object.keys(envelope).sort()).toEqual(
      ["canonicalText", "evidenceId", "kind", "objective", "revision"].sort(),
    );
    expect(envelope.canonicalText).toBe(source);
    expect(envelope).not.toHaveProperty("ownerUserId");
    expect(envelope).not.toHaveProperty("vaultId");
  });

  it("rejects fabricated facts before durable persistence", async () => {
    const executeAI = vi.fn(async () =>
      successOutcome(
        "Desarrollo y optimizo APIs REST con Spring Boot, mejorando el rendimiento en 40%.",
      ));
    const record = vi.fn();

    const outcome = await proposePresentationRevision(
      { evidence, credentialMode: "PLATFORM_KEY" },
      { executeAI, record },
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.kind).toBe("VALIDATION_REJECTED");
      if (outcome.kind === "VALIDATION_REJECTED") {
        expect(outcome.validation.reasonCodes).toContain("METRIC_ADDED");
      }
    }
    expect(record).not.toHaveBeenCalled();
  });

  it("does not call AI or persistence for UNVERIFIED Career Evidence", async () => {
    const executeAI = vi.fn();
    const record = vi.fn();

    const outcome = await proposePresentationRevision(
      {
        evidence: { ...evidence, verificationStatus: "UNVERIFIED" },
        credentialMode: "PLATFORM_KEY",
      },
      { executeAI, record },
    );

    expect(outcome).toEqual({ ok: false, kind: "EVIDENCE_NOT_VERIFIED" });
    expect(executeAI).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it("does not persist when the provider path fails", async () => {
    const failed: AIExecutionOutcome = {
      ok: false,
      requestId: "req-b9-failed",
      capability: "INLINE_WORDING_OPTIMIZATION",
      failureCode: "TOTAL_PROVIDER_OUTAGE",
      attempts: [],
      durationMs: 4,
    };
    const executeAI = vi.fn(async () => failed);
    const record = vi.fn();

    const outcome = await proposePresentationRevision(
      { evidence, credentialMode: "PLATFORM_KEY" },
      { executeAI, record },
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.kind).toBe("AI_FAILURE");
    expect(record).not.toHaveBeenCalled();
  });

  it("fails closed on malformed provider provenance", async () => {
    const malformed = successOutcome(
      "Desarrollo y optimizo APIs REST con Spring Boot, aplicando arquitectura por capas y buenas prácticas de seguridad.",
    );
    if (!malformed.ok) throw new Error("fixture must be successful");
    const executeAI = vi.fn(async () => ({
      ...malformed,
      provenance: {
        ...malformed.provenance,
        capability: "OPPORTUNITY_EXPLANATION" as const,
      },
    } as unknown as AIExecutionOutcome));
    const record = vi.fn();

    const outcome = await proposePresentationRevision(
      { evidence, credentialMode: "PLATFORM_KEY" },
      { executeAI, record },
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.kind).toBe("INVALID_AI_PROVENANCE");
    expect(record).not.toHaveBeenCalled();
  });
});
