import { describe, expect, it } from "vitest";
import type { ImportReceipt } from "./import/Import";
import {
  projectSemanticProviderOutput,
  RESUME_SEMANTIC_UNDERSTANDING_SCHEMA,
  understandResumeSemantics,
} from "../application/import/ResumeSemanticUnderstandingService";

const OWNER = "11111111-1111-4111-8111-111111111111";
const RECEIPT_ID = "22222222-2222-4222-8222-222222222222";
const DOCUMENT_ID = "33333333-3333-4333-8333-333333333333";

function receipt(): ImportReceipt {
  const lines = [
    "Eduardo Example | Full Stack Developer",
    "Full Stack Developer | Example Tech | 2025 - Present",
    "Built maintainable APIs with Spring Boot.",
    "PROJECTS",
    "AutoPulse | Android vehicle intelligence",
    "Built an OBD-II telemetry workflow.",
  ];
  const proposals = lines.map((canonicalText, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    receiptId: RECEIPT_ID,
    ownerUserId: OWNER,
    ordinal: index + 1,
    sourceLine: index + 1,
    canonicalText,
    sourceTextSha256: String(index + 1).repeat(64).slice(0, 64),
    status: "PENDING" as const,
    acceptedEvidenceId: null,
    createdAt: "2026-09-10T02:00:00.000Z",
  }));
  return {
    id: RECEIPT_ID,
    ownerUserId: OWNER,
    sourceName: "resume.docx",
    mediaType: "DOCX",
    sourceSizeBytes: 10_000,
    sourceSha256: "a".repeat(64),
    extractedTextSha256: "b".repeat(64),
    extractorVersion: "b5-mechanical-resume-extractor-v1",
    proposalVersion: "b5-line-proposals-v1",
    status: "EXTRACTED",
    warningCode: null,
    proposalCount: proposals.length,
    proposals,
    reviewStructure: null,
    createdAt: "2026-09-10T02:00:00.000Z",
  };
}

const validSemanticOutput = {
  locale: "en-US",
  identity: {
    displayName: "Eduardo Example",
    headline: "Full Stack Developer",
    location: null,
    email: null,
    phone: null,
    links: [],
    sourceOrdinals: [1],
  },
  profile: null,
  employment: [{
    role: "Full Stack Developer",
    organization: "Example Tech",
    startDateText: "2025",
    endDateText: "Present",
    location: null,
    summary: null,
    bullets: ["Built maintainable APIs with Spring Boot."],
    technologies: ["Spring Boot"],
    sourceOrdinals: [2, 3],
  }],
  projects: [{
    name: "AutoPulse",
    subtitle: "Android vehicle intelligence",
    url: null,
    summary: null,
    bullets: ["Built an OBD-II telemetry workflow."],
    technologies: ["OBD-II"],
    sourceOrdinals: [5, 6],
  }],
  education: [],
  certifications: [],
  skillGroups: [],
  languages: [],
  otherSections: [],
  unassignedSourceOrdinals: [4],
};

function requireCapturedBody(value: Record<string, unknown> | null): Record<string, unknown> {
  if (value === null) throw new Error("REQUEST_BODY_NOT_CAPTURED");
  return value;
}

describe("v1.2 resume semantic understanding", () => {
  it("projects a whole resume into semantic entities while preserving mechanical provenance", () => {
    const projected = projectSemanticProviderOutput(receipt(), validSemanticOutput, {
      id: DOCUMENT_ID,
      createdAt: "2026-09-10T02:00:00.000Z",
    });

    expect(projected.warnings).toEqual([]);
    expect(projected.document.understandingStatus).toBe("AI_STRUCTURED");
    expect(projected.document.employment).toHaveLength(1);
    expect(projected.document.projects).toHaveLength(1);
    expect(projected.document.projects[0]?.name?.value).toBe("AutoPulse");
    expect(projected.document.projects[0]?.sourceRefs.map((ref) => ref.ordinal)).toEqual([5, 6]);
    expect(projected.document.unassignedSourceOrdinals).toEqual([4]);
  });

  it("keeps valid entities when another entity references invented provenance", () => {
    const raw = {
      ...validSemanticOutput,
      projects: [{ ...validSemanticOutput.projects[0], sourceOrdinals: [99] }],
      unassignedSourceOrdinals: [4, 5, 6],
    };
    const projected = projectSemanticProviderOutput(receipt(), raw, {
      id: DOCUMENT_ID,
      createdAt: "2026-09-10T02:00:00.000Z",
    });

    expect(projected.document.employment).toHaveLength(1);
    expect(projected.document.projects).toHaveLength(0);
    expect(projected.document.understandingStatus).toBe("PARTIAL_RECOVERY");
    expect(projected.warnings).toContain("SEMANTIC_REFERENCE_INVALID");
    expect(projected.document.unassignedSourceOrdinals).toEqual([4, 5, 6]);
  });

  it("runs semantic understanding through the shared structured-output gateway", async () => {
    let bodySeen: Record<string, unknown> | null = null;
    const fetchImpl: typeof fetch = async (_input, init) => {
      bodySeen = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(validSemanticOutput) }] } }],
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 80 },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const outcome = await understandResumeSemantics(receipt(), {
      credentialMode: "PLATFORM_KEY",
      platformGeminiKey: "test-only-key",
      byokGeminiKey: null,
      geminiBaseUrl: "https://gemini.test",
      ollamaBaseUrl: "http://ollama.test",
      ollamaApiKey: null,
      fetchImpl,
      idFactory: () => DOCUMENT_ID,
      nowIso: () => "2026-09-10T02:00:00.000Z",
    });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.document.projects[0]?.name?.value).toBe("AutoPulse");
      expect(outcome.provenance.capability).toBe("RESUME_SEMANTIC_UNDERSTANDING");
    }
    const captured = requireCapturedBody(bodySeen as Record<string, unknown> | null);
    const generationConfig = captured["generationConfig"] as Record<string, unknown>;
    expect(generationConfig["responseMimeType"]).toBe("application/json");
    expect(generationConfig["responseJsonSchema"]).toEqual(RESUME_SEMANTIC_UNDERSTANDING_SCHEMA);
    expect(generationConfig["responseFormat"]).toBeUndefined();
  });
});
