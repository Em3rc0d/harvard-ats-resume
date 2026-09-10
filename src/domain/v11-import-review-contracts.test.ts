import { describe, expect, it } from "vitest";
import type { ImportReceipt } from "./import/Import";
import { ImportReviewStructureSchema } from "./import/ImportReview";
import { structureResumeImport } from "../application/import/ImportStructuringService";

const OWNER = "11111111-1111-4111-8111-111111111111";
const NOW = "2026-09-09T20:00:00.000Z";

function proposal(receiptId: string, ordinal: number, sourceLine: number, canonicalText: string) {
  return {
    id: `00000000-0000-4000-8000-${String(ordinal).padStart(12, "0")}`,
    receiptId,
    ownerUserId: OWNER,
    ordinal,
    sourceLine,
    canonicalText,
    sourceTextSha256: "a".repeat(64),
    status: "PENDING" as const,
    acceptedEvidenceId: null,
    createdAt: NOW,
  };
}

function receipt(id: string, lines: readonly [number, string][]): ImportReceipt {
  const proposals = lines.map(([sourceLine, text], index) => proposal(id, index + 1, sourceLine, text));
  return {
    id,
    ownerUserId: OWNER,
    sourceName: "resume.docx",
    mediaType: "DOCX",
    sourceSizeBytes: 10_000,
    sourceSha256: "b".repeat(64),
    extractedTextSha256: "c".repeat(64),
    extractorVersion: "b5-mechanical-resume-extractor-v1",
    proposalVersion: "b5-line-proposals-v1",
    status: "EXTRACTED",
    warningCode: null,
    proposalCount: proposals.length,
    proposals,
    reviewStructure: null,
    createdAt: NOW,
  };
}

const fallbackConfig = {
  credentialMode: "NO_CLOUD_AI" as const,
  platformGeminiKey: null,
  byokGeminiKey: null,
  geminiBaseUrl: "https://generativelanguage.googleapis.com",
  ollamaBaseUrl: "http://127.0.0.1:9",
  ollamaApiKey: null,
  logger: () => undefined,
  skipProviderExecution: true,
};

describe("CV Engine v1.1 AI-first import contracts", () => {
  it("turns mechanical lines into review blocks while covering every source proposal exactly once", async () => {
    const current = receipt("22222222-2222-4222-8222-222222222222", [
      [1, "PERFIL PROFESIONAL"],
      [2, "Full Stack Developer con experiencia construyendo sistemas end-to-end."],
      [3, "EXPERIENCIA PROFESIONAL"],
      [4, "Full Stack Developer | Thradex Tech | Feb 2025 - Actualidad"],
      [5, "Diseño y desarrollo soluciones web y APIs mantenibles."],
      [7, "EDUCACIÓN"],
      [8, "Universidad Nacional Mayor de San Marcos | Ingeniería de Sistemas"],
      [9, "eduardo@example.com | github.com/example"],
    ]);

    const draft = await structureResumeImport(current, [], fallbackConfig);
    const ordinals = draft.blocks.flatMap((block) => block.sourceOrdinals);

    expect(draft.status).toBe("DETERMINISTIC_FALLBACK");
    expect(draft.aiRuns).toEqual([]);
    expect(new Set(ordinals).size).toBe(current.proposals.length);
    expect([...ordinals].sort((a, b) => a - b)).toEqual(current.proposals.map((item) => item.ordinal));
    expect(draft.blocks.length).toBeLessThan(current.proposals.length);
    expect(draft.blocks.some((block) => block.kind === "EMPLOYMENT" && block.sourceOrdinals.length === 2)).toBe(true);
    expect(draft.blocks.filter((block) => block.decision === "NON_EVIDENCE").length).toBeGreaterThan(0);
    expect(draft.blocks.some((block) => block.kind === "CONTACT" && block.decision === "NON_EVIDENCE")).toBe(true);
    expect(draft.blocks.every((block) => block.decision !== "READY")).toBe(true);
  });

  it("flags cross-CV similarity as a reviewable duplicate instead of deleting or merging evidence", async () => {
    const previous = receipt("33333333-3333-4333-8333-333333333333", [
      [1, "EXPERIENCIA PROFESIONAL"],
      [2, "Full Stack Developer | Thradex Tech | Feb 2025 - Actualidad"],
      [3, "Diseño y desarrollo soluciones web y APIs mantenibles."],
    ]);
    previous.reviewStructure = ImportReviewStructureSchema.parse({
      id: "44444444-4444-4444-8444-444444444444",
      receiptId: previous.id,
      ownerUserId: OWNER,
      structureVersion: "v1.1-ai-import-structure-v1",
      status: "DETERMINISTIC_FALLBACK",
      blocks: [
        {
          id: "irb_aaaaaaaaaaaa",
          sourceOrdinals: [1],
          kind: "NON_EVIDENCE",
          confidence: "HIGH",
          decision: "NON_EVIDENCE",
          reasonCodes: ["SECTION_HEADING", "DETERMINISTIC_FALLBACK"],
          duplicateOf: null,
        },
        {
          id: "irb_bbbbbbbbbbbb",
          sourceOrdinals: [2, 3],
          kind: "EMPLOYMENT",
          confidence: "MEDIUM",
          decision: "NEEDS_USER_REVIEW",
          reasonCodes: ["SECTION_CONTEXT", "DETERMINISTIC_FALLBACK"],
          duplicateOf: null,
        },
      ],
      aiRuns: [],
      createdAt: NOW,
    });

    const current = receipt("55555555-5555-4555-8555-555555555555", [
      [1, "EXPERIENCIA PROFESIONAL"],
      [2, "Full Stack Developer | Thradex Tech | Feb 2025 - Actualidad"],
      [3, "Diseño y desarrollo soluciones web y APIs mantenibles."],
    ]);

    const draft = await structureResumeImport(current, [previous], fallbackConfig);
    const employment = draft.blocks.find((block) => block.kind === "EMPLOYMENT");

    expect(employment?.decision).toBe("DUPLICATE_CANDIDATE");
    expect(employment?.duplicateOf).toBe(`${previous.id}:irb_bbbbbbbbbbbb`);
    expect(employment?.reasonCodes).toContain("CROSS_IMPORT_SIMILARITY");
  });
});
