import { describe, expect, it } from "vitest";
import type { CandidateResumeDocument } from "./resume/CandidateResumeDocument";
import type { GeneratedResumeDocument } from "./resume/GeneratedResumeDocument";
import { FactGuardianReportSchema } from "./resume/FactGuardian";
import { guardAndRepairResume } from "../application/resume/FactGuardianService";

const owner = "12000000-0000-4000-8000-000000000011";
const sourceDocumentId = "12000000-0000-4000-8000-000000000012";
const sourceReceiptId = "12000000-0000-4000-8000-000000000013";
const sha = "a".repeat(64);
const ref = (ordinal: number) => ({
  proposalId: `12000000-0000-4000-8000-${String(ordinal).padStart(12, "0")}`,
  ordinal,
  sourceLine: ordinal,
  sourceTextSha256: String(ordinal).repeat(64).slice(0, 64),
});
const sourceUnit = (value: string, ordinal: number) => ({ value, sourceRefs: [ref(ordinal)] });
const generatedUnit = (text: string, ordinal: number) => ({ text, sourceRefs: [ref(ordinal)] });

function source(): CandidateResumeDocument {
  return {
    id: sourceDocumentId,
    ownerUserId: owner,
    sourceReceiptId,
    sourceDocumentSha256: sha,
    documentVersion: "v12-candidate-resume-document-v1",
    understandingStatus: "AI_STRUCTURED",
    locale: "en-US",
    identity: {
      displayName: sourceUnit("Ada Candidate", 1),
      headline: sourceUnit("Software Engineer", 2),
      location: null,
      email: null,
      phone: null,
      links: [],
      sourceRefs: [ref(1), ref(2)],
    },
    profile: sourceUnit("Builds reliable systems.", 3),
    employment: [{
      role: sourceUnit("Software Engineer", 4),
      organization: sourceUnit("Example Labs", 5),
      startDateText: null,
      endDateText: null,
      location: null,
      summary: null,
      bullets: [sourceUnit("Built a deterministic evidence pipeline.", 6)],
      technologies: [],
      sourceRefs: [ref(4), ref(5), ref(6)],
    }],
    projects: [{
      name: sourceUnit("CV Engine", 7),
      subtitle: null,
      url: null,
      summary: sourceUnit("Resume improvement system.", 8),
      bullets: [],
      technologies: [],
      sourceRefs: [ref(7), ref(8)],
    }],
    education: [],
    certifications: [],
    skillGroups: [],
    languages: [],
    otherSections: [],
    unassignedSourceOrdinals: [],
    provenanceIndex: [1, 2, 3, 4, 5, 6, 7, 8].map(ref),
    createdAt: "2026-09-10T00:00:00.000Z",
  };
}

function draft(): GeneratedResumeDocument {
  return {
    id: "12000000-0000-4000-8000-000000000099",
    ownerUserId: owner,
    sourceDocumentId,
    sourceReceiptId,
    sourceDocumentSha256: sha,
    documentVersion: "v12-generated-resume-document-v1",
    editorStatus: "AI_EDITED",
    locale: "en-US",
    header: {
      displayName: generatedUnit("Ada Candidate", 1),
      headline: generatedUnit("Software Engineer | Reliable Systems", 2),
      contactLines: [],
      sourceRefs: [ref(1), ref(2)],
    },
    summary: generatedUnit("Software engineer focused on reliable systems.", 3),
    experience: [{
      title: generatedUnit("Software Engineer", 4),
      subtitle: generatedUnit("Example Labs", 5),
      metaLines: [],
      summary: null,
      bullets: [generatedUnit("Built a deterministic evidence pipeline.", 6)],
      sourceRefs: [ref(4), ref(5), ref(6)],
    }],
    projects: [{
      title: generatedUnit("CV Engine", 7),
      subtitle: null,
      metaLines: [],
      summary: generatedUnit("Resume improvement system.", 8),
      bullets: [],
      sourceRefs: [ref(7), ref(8)],
    }],
    education: [],
    certifications: [],
    skillGroups: [],
    languageGroups: [],
    otherGroups: [],
    omittedSourceOrdinals: [],
    sourceProvenanceIndex: [1, 2, 3, 4, 5, 6, 7, 8].map(ref),
    createdAt: "2026-09-10T01:00:00.000Z",
  };
}

const basePaths = [
  "header.displayName",
  "header.headline",
  "summary",
  "experience[0].title",
  "experience[0].subtitle",
  "experience[0].bullets[0]",
  "projects[0].title",
  "projects[0].summary",
] as const;
const pathOrdinal = new Map<string, number>([
  ["header.displayName", 1], ["header.headline", 2], ["summary", 3],
  ["experience[0].title", 4], ["experience[0].subtitle", 5],
  ["experience[0].bullets[0]", 6], ["projects[0].title", 7],
  ["projects[0].summary", 8],
]);

type EnvelopeFinding = {
  generatedPath: string | null;
  classification: "SOURCE_PRESERVED" | "SAFE_REPHRASE" | "SOURCE_OMISSION" | "UNSUPPORTED_NEW_CLAIM" | "SOURCE_CONFLICT";
  sourceOrdinals: number[];
  reasonCode: "EXACT_SOURCE_MEANING" | "SUPPORTED_REPHRASE" | "SOURCE_NOT_RENDERED" | "FACT_NOT_IN_SOURCE" | "CONTRADICTS_SOURCE";
};

function envelope(
  paths: readonly string[] = basePaths,
  overrides: Readonly<Record<string, "UNSUPPORTED_NEW_CLAIM" | "SOURCE_CONFLICT">> = {},
  omitted: readonly number[] = [],
) {
  const findings: EnvelopeFinding[] = paths.map((path) => {
    const classification = overrides[path] ?? (path === "summary" || path === "header.headline" ? "SAFE_REPHRASE" : "SOURCE_PRESERVED");
    return {
      generatedPath: path,
      classification,
      sourceOrdinals: [pathOrdinal.get(path)!],
      reasonCode: classification === "UNSUPPORTED_NEW_CLAIM"
        ? "FACT_NOT_IN_SOURCE"
        : classification === "SOURCE_CONFLICT"
          ? "CONTRADICTS_SOURCE"
          : classification === "SAFE_REPHRASE"
            ? "SUPPORTED_REPHRASE"
            : "EXACT_SOURCE_MEANING",
    };
  });
  for (const ordinal of omitted) {
    findings.push({
      generatedPath: null,
      classification: "SOURCE_OMISSION",
      sourceOrdinals: [ordinal],
      reasonCode: "SOURCE_NOT_RENDERED",
    });
  }
  return {
    reviewedPaths: [...paths],
    reviewedSourceOrdinals: [1, 2, 3, 4, 5, 6, 7, 8],
    findings,
  };
}

function geminiResponse(body: unknown) {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] } }],
    usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 80 },
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}
function ollamaResponse(body: unknown) {
  return new Response(JSON.stringify({
    response: JSON.stringify(body),
    prompt_eval_count: 100,
    eval_count: 80,
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}
function config(fetchImpl: typeof fetch) {
  return {
    credentialMode: "PLATFORM_KEY" as const,
    platformGeminiKey: "synthetic-key",
    byokGeminiKey: null,
    geminiBaseUrl: "https://gemini.invalid",
    ollamaBaseUrl: "https://ollama.invalid",
    ollamaApiKey: null,
    fetchImpl,
    nowIso: () => "2026-09-10T02:00:00.000Z",
  };
}

describe("v1.2 Fact Guardian", () => {
  it("accepts a fully covered source-faithful draft without allowing the editor to self-approve", async () => {
    const input = draft();
    const outcome = await guardAndRepairResume(source(), input, config(async () => geminiResponse(envelope())));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.report.decision).toBe("PASS");
    expect(outcome.report.passes).toHaveLength(1);
    expect(outcome.report.repairedPaths).toEqual([]);
    expect(outcome.document).toEqual(input);
    expect(FactGuardianReportSchema.safeParse(outcome.report).success).toBe(true);
  });

  it("reverts an unsupported generated claim to exact candidate source and requires a bounded second guard pass", async () => {
    let call = 0;
    const fetchImpl: typeof fetch = async () => {
      call += 1;
      return geminiResponse(call === 1
        ? envelope(basePaths, { summary: "UNSUPPORTED_NEW_CLAIM" })
        : envelope());
    };
    const outcome = await guardAndRepairResume(source(), draft(), config(fetchImpl));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.report.decision).toBe("REPAIRED_PASS");
    expect(outcome.report.passes).toHaveLength(2);
    expect(outcome.report.repairedPaths).toEqual(["summary"]);
    expect(outcome.document.editorStatus).toBe("PARTIAL_RECOVERY");
    expect(outcome.document.summary?.text).toBe("Builds reliable systems.");
    expect(outcome.document.summary?.sourceRefs[0]?.ordinal).toBe(3);
  });

  it("fails closed when the repaired unit is still classified as unsafe", async () => {
    const unsafe = envelope(basePaths, { summary: "SOURCE_CONFLICT" });
    const outcome = await guardAndRepairResume(source(), draft(), config(async () => geminiResponse(unsafe)));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failureCode).toBe("FACT_GUARD_REJECTED");
    expect(outcome.report?.decision).toBe("REJECTED");
    expect(outcome.report?.passes).toHaveLength(2);
  });

  it("rejects incomplete guardian coverage across every configured provider instead of accepting a partial audit", async () => {
    const invalid = envelope(basePaths.slice(0, -1));
    const fetchImpl: typeof fetch = async (input) => String(input).includes("/api/generate")
      ? ollamaResponse(invalid)
      : geminiResponse(invalid);
    const outcome = await guardAndRepairResume(source(), draft(), config(fetchImpl));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failureCode).toBe("OUTPUT_VALIDATION_FAILED");
    expect(outcome.report).toBeNull();
    expect(outcome.attempts).toHaveLength(3);
    expect(outcome.attempts.every((attempt) => attempt.status === "FAILED")).toBe(true);
  });

  it("detects a factual omission even when the parent entity still carries that source ordinal", async () => {
    const input = draft();
    input.projects[0] = { ...input.projects[0]!, summary: null, sourceRefs: [ref(7), ref(8)] };
    input.omittedSourceOrdinals = [8];
    const visiblePaths = basePaths.filter((path) => path !== "projects[0].summary");
    const outcome = await guardAndRepairResume(source(), input, config(async () => geminiResponse(envelope(visiblePaths, {}, [8]))));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.report.decision).toBe("PASS");
    expect(outcome.report.passes[0]?.findings).toContainEqual(expect.objectContaining({
      generatedPath: null,
      classification: "SOURCE_OMISSION",
      sourceOrdinals: [8],
    }));
  });
});
