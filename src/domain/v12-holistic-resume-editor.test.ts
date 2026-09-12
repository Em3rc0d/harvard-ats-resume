import { describe, expect, it } from "vitest";
import type { CandidateResumeDocument } from "./resume/CandidateResumeDocument";
import { GeneratedResumeDocumentSchema } from "./resume/GeneratedResumeDocument";
import { improveResumeHolistically } from "../application/resume/HolisticResumeEditorService";

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
const unit = (value: string, ordinal: number) => ({ value, sourceRefs: [ref(ordinal)] });

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
      displayName: unit("Ada Candidate", 1),
      headline: unit("Software Engineer", 2),
      location: null,
      email: null,
      phone: null,
      links: [],
      sourceRefs: [ref(1), ref(2)],
    },
    profile: unit("Builds reliable systems.", 3),
    employment: [{
      role: unit("Software Engineer", 4),
      organization: unit("Example Labs", 5),
      startDateText: null,
      endDateText: null,
      location: null,
      summary: null,
      bullets: [unit("Built a deterministic evidence pipeline.", 6)],
      technologies: [],
      sourceRefs: [ref(4), ref(5), ref(6)],
    }],
    projects: [{
      name: unit("CV Engine", 7),
      subtitle: null,
      url: null,
      summary: unit("Resume improvement system.", 8),
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
    provenanceIndex: [1,2,3,4,5,6,7,8].map(ref),
    createdAt: "2026-09-10T00:00:00.000Z",
  };
}

function validProviderDraft(projectOrdinal = 7) {
  return {
    locale: "en-US",
    header: {
      displayName: { text: "Ada Candidate", sourceOrdinals: [1] },
      headline: { text: "Software Engineer | Reliable Systems", sourceOrdinals: [2] },
      contactLines: [],
      sourceOrdinals: [1,2],
    },
    summary: { text: "Software engineer focused on reliable systems.", sourceOrdinals: [3] },
    experience: [{
      title: { text: "Software Engineer", sourceOrdinals: [4] },
      subtitle: { text: "Example Labs", sourceOrdinals: [5] },
      metaLines: [],
      summary: null,
      bullets: [{ text: "Built a deterministic evidence pipeline.", sourceOrdinals: [6] }],
      sourceOrdinals: [4,5,6],
    }],
    projects: [{
      title: { text: "CV Engine", sourceOrdinals: [projectOrdinal] },
      subtitle: null,
      metaLines: [],
      summary: { text: "Resume improvement system.", sourceOrdinals: [8] },
      bullets: [],
      sourceOrdinals: [projectOrdinal,8],
    }],
    education: [], certifications: [], skillGroups: [], languageGroups: [], otherGroups: [],
    omittedSourceOrdinals: [],
  };
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
    idFactory: () => "12000000-0000-4000-8000-000000000099",
    nowIso: () => "2026-09-10T01:00:00.000Z",
  };
}

function geminiResponse(body: unknown) {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] } }],
    usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 80 },
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("v1.2 holistic resume editor", () => {
  it("returns a source-linked full-document draft", async () => {
    const outcome = await improveResumeHolistically(source(), null, config(async () => geminiResponse(validProviderDraft())));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.document.editorStatus).toBe("AI_EDITED");
    expect(outcome.document.summary?.text).toContain("reliable systems");
    expect(outcome.document.experience[0]?.bullets[0]?.sourceRefs[0]?.ordinal).toBe(6);
    expect(GeneratedResumeDocumentSchema.safeParse(outcome.document).success).toBe(true);
  });

  it("recovers only the invalid section instead of discarding the whole improved CV", async () => {
    const outcome = await improveResumeHolistically(source(), null, config(async () => geminiResponse(validProviderDraft(99))));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.document.editorStatus).toBe("PARTIAL_RECOVERY");
    expect(outcome.warnings).toContain("EDITOR_PROJECTS_RECOVERED");
    expect(outcome.document.summary?.text).toBe("Software engineer focused on reliable systems.");
    expect(outcome.document.projects[0]?.title?.text).toBe("CV Engine");
    expect(outcome.document.projects[0]?.title?.sourceRefs[0]?.ordinal).toBe(7);
  });

  it("uses the proven Gemini reserve when the quality-first model fails structured validation", async () => {
    const urls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("gemini-3.7-flash")) return geminiResponse({ locale: "en-US" });
      return geminiResponse(validProviderDraft());
    };
    const outcome = await improveResumeHolistically(source(), "Need a software engineer for reliable systems.", config(fetchImpl));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(urls[0]).toContain("gemini-3.7-flash");
    expect(urls[1]).toContain("gemini-3.5-flash-lite");
    expect(outcome.provenance.model).toBe("gemini-3.5-flash-lite");
    expect(outcome.provenance.fallbackUsed).toBe(true);
    expect(outcome.attempts[0]?.failureCode).toBe("OUTPUT_VALIDATION_FAILED");
  });

  it("does not treat target-job wording as candidate evidence", async () => {
    let requestBody = "";
    const fetchImpl: typeof fetch = async (_input, init) => {
      requestBody = String(init?.body ?? "");
      return geminiResponse(validProviderDraft());
    };
    const target = "Requires Kubernetes and 10 years of management experience.";
    const outcome = await improveResumeHolistically(source(), target, config(fetchImpl));
    expect(outcome.ok).toBe(true);
    expect(requestBody).toContain("market truth only");
    expect(requestBody).toContain(target);
    if (outcome.ok) expect(JSON.stringify(outcome.document)).not.toContain("Kubernetes");
  });
});
