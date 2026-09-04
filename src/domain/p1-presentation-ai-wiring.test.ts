import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { optimizePresentationWithAI } from "../application/presentation/PresentationOptimizationService";
import type { PresentationEvidenceReceipt } from "./presentation/PresentationRevision";

const at = "2026-09-03T23:55:00.000Z";
const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
const sha = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

function evidence(text: string): PresentationEvidenceReceipt {
  return {
    evidenceId: id("1"),
    evidenceRevision: 1,
    evidenceKind: "PROJECT",
    evidenceVerificationStatus: "VERIFIED",
    evidenceCanonicalText: text,
    evidenceTextSha256: sha(text),
  };
}

const context = {
  mode: "TARGETED" as const,
  careerTargetId: id("2"),
  jobSnapshotId: id("3"),
  opportunityAssessmentId: id("4"),
};

function geminiConfig(output: string) {
  return {
    platformGeminiKey: "test-key",
    byokGeminiKey: null,
    geminiBaseUrl: "https://example.invalid",
    ollamaBaseUrl: "https://ollama.invalid",
    ollamaApiKey: null,
    now: () => Date.parse(at),
    fetchImpl: async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: output }] } }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 },
    }), { status: 200, headers: { "Content-Type": "application/json" } }),
  } as const;
}

describe("P1 bounded AI presentation wiring", () => {
  it("returns a safe rewrite as PROPOSED but keeps semantic review open", async () => {
    const source = evidence("Built REST APIs using Java and Spring Boot.");
    const result = await optimizePresentationWithAI({
      sourceEvidence: [source],
      context,
      credentialMode: "PLATFORM_KEY",
      targetRole: "Backend Developer",
      marketRequirements: ["Java", "Spring Boot"],
    }, geminiConfig("Built Java and Spring Boot REST APIs."));

    expect(result.status).toBe("PROPOSED");
    expect(result.proposedText).toBe("Built Java and Spring Boot REST APIs.");
    expect(result.validation.deterministicStatus).toBe("PASS");
    expect(result.validation.semanticStatus).toBe("REVIEW_REQUIRED");
    expect(result.validation.overallStatus).toBe("REVIEW_REQUIRED");
    expect(result.aiProvenance?.capability).toBe("INLINE_WORDING_OPTIMIZATION");
    expect(result.aiProvenance?.provider).toBe("gemini");
  });

  it("rejects an AI rewrite that invents a metric", async () => {
    const source = evidence("Improved API response performance.");
    const result = await optimizePresentationWithAI({
      sourceEvidence: [source], context, credentialMode: "PLATFORM_KEY",
      targetRole: "Backend Developer", marketRequirements: ["API performance"],
    }, geminiConfig("Reduced API latency by 35%."));

    expect(result.status).toBe("REJECTED");
    expect(result.proposedText).toBe(source.evidenceCanonicalText);
    expect(result.validation.findings.some((item) => item.code === "UNSUPPORTED_PERCENTAGE")).toBe(true);
    expect(result.aiProvenance).toBeNull();
  });

  it("rejects unsupported leadership or seniority strengthening", async () => {
    const source = evidence("Worked on Spring Boot services with the team.");
    const result = await optimizePresentationWithAI({
      sourceEvidence: [source], context, credentialMode: "PLATFORM_KEY",
      targetRole: "Senior Backend Developer", marketRequirements: ["Senior", "Spring Boot"],
    }, geminiConfig("Led Spring Boot services as a senior engineer."));

    expect(result.status).toBe("REJECTED");
    expect(result.validation.findings.some((item) => item.code === "UNSUPPORTED_STRENGTHENING" && item.token === "led")).toBe(true);
    expect(result.validation.findings.some((item) => item.code === "UNSUPPORTED_STRENGTHENING" && item.token === "senior")).toBe(true);
  });

  it("rejects a market-only technology promoted into candidate wording", async () => {
    const source = evidence("Built containerized services using Docker.");
    const result = await optimizePresentationWithAI({
      sourceEvidence: [source], context, credentialMode: "PLATFORM_KEY",
      targetRole: "Platform Engineer", marketRequirements: ["Kubernetes", "Docker"],
    }, geminiConfig("Built containerized services using Docker and Kubernetes."));

    expect(result.status).toBe("REJECTED");
    expect(result.validation.findings.some((item) => item.code === "MARKET_TERM_PROMOTED_TO_CANDIDATE" && item.token === "Kubernetes")).toBe(true);
  });

  it("degrades to exact source when all AI providers are unavailable", async () => {
    const source = evidence("Built REST APIs using Java and Spring Boot.");
    const result = await optimizePresentationWithAI({
      sourceEvidence: [source], context, credentialMode: "NO_CLOUD_AI",
      targetRole: "Backend Developer", marketRequirements: [],
    }, {
      platformGeminiKey: null,
      byokGeminiKey: null,
      geminiBaseUrl: "https://example.invalid",
      ollamaBaseUrl: "https://ollama.invalid",
      ollamaApiKey: null,
      now: () => Date.parse(at),
      fetchImpl: async () => new Response("unavailable", { status: 503 }),
    });

    expect(result.status).toBe("DEGRADED_TO_SOURCE");
    expect(result.proposedText).toBe(source.evidenceCanonicalText);
    expect(result.validation.overallStatus).toBe("ACCEPTED");
    expect(result.validation.semanticStatus).toBe("SOURCE_EXACT");
    expect(result.aiProvenance).toBeNull();
  });
});
