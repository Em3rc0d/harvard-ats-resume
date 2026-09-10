import { createHash } from "node:crypto";
import { z } from "zod";
import type { CredentialMode } from "../../domain/ai/AICapability";
import type { ImportProposal, ImportReceipt } from "../../domain/import/Import";
import {
  IMPORT_REVIEW_STRUCTURE_VERSION,
  ImportReviewBlockSchema,
  ImportReviewConfidenceSchema,
  ImportReviewDecisionSchema,
  ImportReviewKindSchema,
  ImportReviewReasonCodeSchema,
  isCareerEvidenceReviewKind,
  type ImportReviewAIRun,
  type ImportReviewBlock,
  type ImportReviewKind,
} from "../../domain/import/ImportReview";
import { executeAICapability, type SafeAILogger } from "../ai/AIGatewayRuntime";

const RawAIBlockSchema = z.object({
  sourceOrdinals: z.array(z.number().int().min(1).max(100)).min(1).max(20),
  kind: ImportReviewKindSchema,
  confidence: ImportReviewConfidenceSchema,
  decision: z.enum(["READY", "NEEDS_USER_REVIEW", "NON_EVIDENCE"]),
  reasonCodes: z.array(ImportReviewReasonCodeSchema).max(12),
}).strict();

const RawAIStructureSchema = z.object({
  blocks: z.array(RawAIBlockSchema).min(1).max(100),
}).strict();

type RawAIBlock = z.infer<typeof RawAIBlockSchema>;

export type ImportStructuringRuntimeConfig = Readonly<{
  credentialMode: CredentialMode;
  platformGeminiKey: string | null;
  byokGeminiKey: string | null;
  geminiBaseUrl: string;
  ollamaBaseUrl: string;
  ollamaApiKey: string | null;
  logger?: SafeAILogger;
  skipProviderExecution?: boolean;
}>;

export type ImportStructuringDraft = Readonly<{
  structureVersion: typeof IMPORT_REVIEW_STRUCTURE_VERSION;
  status: "AI_STRUCTURED" | "HYBRID" | "DETERMINISTIC_FALLBACK";
  blocks: readonly ImportReviewBlock[];
  aiRuns: readonly ImportReviewAIRun[];
}>;

const SYSTEM_INSTRUCTION = [
  "You are the bounded resume-import structurer for CV Engine.",
  "Use only the supplied source lines. Never add, rewrite, summarize or infer candidate facts.",
  "Your output is structure metadata only, never Career Evidence and never verification.",
  "Return one JSON object and no markdown.",
].join(" ");

const AI_KIND_VALUES = [
  "EMPLOYMENT", "PROJECT", "ACHIEVEMENT", "EDUCATION", "CERTIFICATION", "SKILL", "LANGUAGE", "METRIC",
  "PROFILE", "CONTACT", "NON_EVIDENCE", "UNKNOWN",
] as const;

const AI_REASON_VALUES = [
  "SECTION_HEADING", "SECTION_CONTEXT", "CONTACT_PATTERN", "PROFILE_PATTERN", "ROLE_OR_ORG_PATTERN",
  "DATE_PATTERN", "BULLET_CONTINUITY", "SKILL_LIST_PATTERN", "EDUCATION_PATTERN", "CERTIFICATION_PATTERN",
  "LANGUAGE_PATTERN", "AMBIGUOUS_STRUCTURE",
] as const;

function stableBlockId(receiptId: string, ordinals: readonly number[], kind: ImportReviewKind) {
  const digest = createHash("sha256").update(`${receiptId}:${kind}:${ordinals.join(",")}`).digest("hex");
  return `irb_${digest.slice(0, 12)}`;
}

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9@.+/#-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sectionKindForHeading(value: string): ImportReviewKind | null {
  const text = normalized(value);
  const headings: readonly [RegExp, ImportReviewKind][] = [
    [/^(perfil|perfil profesional|profile|professional profile|summary|professional summary)$/, "PROFILE"],
    [/^(contacto|contact|datos de contacto|contact information)$/, "CONTACT"],
    [/^(experiencia|experiencia profesional|experiencia laboral|experience|work experience|employment)$/, "EMPLOYMENT"],
    [/^(proyectos|proyectos destacados|projects|selected projects|personal projects)$/, "PROJECT"],
    [/^(logros|achievements|awards|reconocimientos)$/, "ACHIEVEMENT"],
    [/^(educacion|formacion|formacion academica|education|academic background)$/, "EDUCATION"],
    [/^(certificaciones|certifications|certificates)$/, "CERTIFICATION"],
    [/^(habilidades|skills|competencias|competencias tecnicas|technical skills|stack tecnologico|tech stack)$/, "SKILL"],
    [/^(idiomas|languages)$/, "LANGUAGE"],
  ];
  return headings.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

function isContactLine(value: string) {
  const text = value.trim();
  return /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(text)
    || /\b(linkedin\.com|github\.com|gitlab\.com|portfolio|https?:\/\/)/i.test(text)
    || /(?:\+?\d[\d\s().-]{6,}\d)/.test(text);
}

function uniqueReasons(values: readonly z.infer<typeof ImportReviewReasonCodeSchema>[]) {
  return [...new Set(values)].slice(0, 12);
}

function splitContiguous(proposals: readonly ImportProposal[]) {
  const sorted = [...proposals].sort((a, b) => a.sourceLine - b.sourceLine || a.ordinal - b.ordinal);
  const runs: ImportProposal[][] = [];
  for (const proposal of sorted) {
    const current = runs.at(-1);
    if (!current || current.length >= 20 || proposal.sourceLine !== current[current.length - 1]!.sourceLine + 1) {
      runs.push([proposal]);
    } else {
      current.push(proposal);
    }
  }
  return runs;
}

function buildBlock(
  receiptId: string,
  proposals: readonly ImportProposal[],
  suggestedKind: ImportReviewKind,
  suggestedConfidence: "HIGH" | "MEDIUM" | "LOW",
  suggestedDecision: "READY" | "NEEDS_USER_REVIEW" | "NON_EVIDENCE" | "DUPLICATE_CANDIDATE",
  reasonCodes: readonly z.infer<typeof ImportReviewReasonCodeSchema>[],
  duplicateOf: string | null = null,
): ImportReviewBlock {
  const headingKind = proposals.length === 1 ? sectionKindForHeading(proposals[0]!.canonicalText) : null;
  const contactOnly = proposals.every((proposal) => isContactLine(proposal.canonicalText));

  let kind = suggestedKind;
  let confidence = suggestedConfidence;
  let decision = suggestedDecision;
  const reasons = [...reasonCodes];

  if (headingKind !== null) {
    kind = "NON_EVIDENCE";
    confidence = "HIGH";
    decision = "NON_EVIDENCE";
    reasons.push("SECTION_HEADING");
  } else if (contactOnly) {
    kind = "CONTACT";
    confidence = "HIGH";
    decision = "NON_EVIDENCE";
    reasons.push("CONTACT_PATTERN");
  } else if (["PROFILE", "CONTACT", "NON_EVIDENCE"].includes(kind)) {
    decision = "NON_EVIDENCE";
  } else if (kind === "UNKNOWN" || confidence === "LOW") {
    decision = "NEEDS_USER_REVIEW";
  }

  return ImportReviewBlockSchema.parse({
    id: stableBlockId(receiptId, proposals.map((proposal) => proposal.ordinal), kind),
    sourceOrdinals: proposals.map((proposal) => proposal.ordinal),
    kind,
    confidence,
    decision,
    reasonCodes: uniqueReasons(reasons),
    duplicateOf: decision === "DUPLICATE_CANDIDATE" ? duplicateOf : null,
  });
}

function deterministicBlocks(receiptId: string, proposals: readonly ImportProposal[]) {
  const sorted = [...proposals].sort((a, b) => a.sourceLine - b.sourceLine || a.ordinal - b.ordinal);
  const blocks: ImportReviewBlock[] = [];
  let section: ImportReviewKind | null = null;
  let pending: ImportProposal[] = [];
  let pendingKind: ImportReviewKind | null = null;

  const flush = () => {
    if (pending.length === 0 || pendingKind === null) return;
    for (const run of splitContiguous(pending)) {
      const nonEvidence = ["PROFILE", "CONTACT", "NON_EVIDENCE"].includes(pendingKind!);
      blocks.push(buildBlock(
        receiptId,
        run,
        pendingKind!,
        pendingKind === "UNKNOWN" ? "LOW" : "MEDIUM",
        nonEvidence ? "NON_EVIDENCE" : "NEEDS_USER_REVIEW",
        pendingKind === "UNKNOWN" ? ["AMBIGUOUS_STRUCTURE", "DETERMINISTIC_FALLBACK"] : ["SECTION_CONTEXT", "DETERMINISTIC_FALLBACK"],
      ));
    }
    pending = [];
    pendingKind = null;
  };

  for (const proposal of sorted) {
    const heading = sectionKindForHeading(proposal.canonicalText);
    if (heading !== null) {
      flush();
      section = heading;
      blocks.push(buildBlock(receiptId, [proposal], "NON_EVIDENCE", "HIGH", "NON_EVIDENCE", ["SECTION_HEADING", "DETERMINISTIC_FALLBACK"]));
      continue;
    }

    const kind: ImportReviewKind = isContactLine(proposal.canonicalText) ? "CONTACT" : section ?? "UNKNOWN";
    const currentLast = pending.at(-1);
    const canAppend = pendingKind === kind && pending.length < 20 && currentLast !== undefined && proposal.sourceLine === currentLast.sourceLine + 1;
    if (!canAppend) flush();
    pendingKind = kind;
    pending.push(proposal);
  }
  flush();
  return blocks;
}

function parseAIJson(text: string) {
  const trimmed = text.trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first < 0 || last <= first) throw new Error("IMPORT_AI_JSON_MISSING");
  return RawAIStructureSchema.parse(JSON.parse(trimmed.slice(first, last + 1)));
}

function normalizeAIBlocks(receiptId: string, chunk: readonly ImportProposal[], rawBlocks: readonly RawAIBlock[]) {
  const byOrdinal = new Map(chunk.map((proposal) => [proposal.ordinal, proposal]));
  const assigned = new Set<number>();
  const blocks: ImportReviewBlock[] = [];

  for (const raw of rawBlocks) {
    const selected = raw.sourceOrdinals
      .filter((ordinal) => byOrdinal.has(ordinal) && !assigned.has(ordinal))
      .map((ordinal) => byOrdinal.get(ordinal)!)
      .sort((a, b) => a.sourceLine - b.sourceLine || a.ordinal - b.ordinal);
    if (selected.length === 0) continue;
    for (const proposal of selected) assigned.add(proposal.ordinal);
    for (const run of splitContiguous(selected)) {
      blocks.push(buildBlock(receiptId, run, raw.kind, raw.confidence, raw.decision, raw.reasonCodes));
    }
  }

  const missing = chunk.filter((proposal) => !assigned.has(proposal.ordinal));
  if (missing.length > 0) blocks.push(...deterministicBlocks(receiptId, missing));
  return blocks;
}

function buildPrompt(chunk: readonly ImportProposal[]) {
  return JSON.stringify({
    task: "Partition every source ordinal exactly once into review blocks. Group only adjacent sourceLine values. Return structure metadata only.",
    allowedKinds: AI_KIND_VALUES,
    allowedDecisions: ["READY", "NEEDS_USER_REVIEW", "NON_EVIDENCE"],
    allowedReasonCodes: AI_REASON_VALUES,
    rules: [
      "PROFILE, CONTACT and NON_EVIDENCE must use NON_EVIDENCE decision.",
      "UNKNOWN and LOW-confidence blocks must use NEEDS_USER_REVIEW.",
      "Do not output source text, titles, summaries, facts, metrics, names, dates or skills.",
    ],
    lines: chunk.map((proposal) => ({
      ordinal: proposal.ordinal,
      sourceLine: proposal.sourceLine,
      text: proposal.canonicalText,
    })),
    outputShape: { blocks: [{ sourceOrdinals: [1], kind: "UNKNOWN", confidence: "LOW", decision: "NEEDS_USER_REVIEW", reasonCodes: ["AMBIGUOUS_STRUCTURE"] }] },
  });
}

function chunkProposals(proposals: readonly ImportProposal[]) {
  const chunks: ImportProposal[][] = [];
  let current: ImportProposal[] = [];
  for (const proposal of proposals) {
    const candidate = [...current, proposal];
    if (current.length > 0 && (candidate.length > 20 || Buffer.byteLength(buildPrompt(candidate), "utf8") > 5_400)) {
      chunks.push(current);
      current = [proposal];
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function blockText(receipt: ImportReceipt, block: ImportReviewBlock) {
  const ordinals = new Set(block.sourceOrdinals);
  return receipt.proposals
    .filter((proposal) => ordinals.has(proposal.ordinal))
    .sort((a, b) => a.sourceLine - b.sourceLine || a.ordinal - b.ordinal)
    .map((proposal) => proposal.canonicalText)
    .join("\n");
}

function tokenSet(value: string) {
  return new Set(normalized(value).split(" ").filter((token) => token.length >= 3));
}

function similarity(left: string, right: string) {
  const a = normalized(left);
  const b = normalized(right);
  if (a.length > 0 && a === b) return 1;
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let intersection = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) intersection += 1;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

function applyDuplicateHints(
  receipt: ImportReceipt,
  blocks: readonly ImportReviewBlock[],
  previousImports: readonly ImportReceipt[],
) {
  return blocks.map((block) => {
    if (!isCareerEvidenceReviewKind(block.kind) || block.decision === "NON_EVIDENCE") return block;
    const currentText = blockText(receipt, block);
    let best: { target: string; score: number } | null = null;

    for (const previous of previousImports) {
      const structure = previous.reviewStructure;
      if (!structure) continue;
      for (const candidate of structure.blocks) {
        if (candidate.kind !== block.kind || !isCareerEvidenceReviewKind(candidate.kind)) continue;
        const score = similarity(currentText, blockText(previous, candidate));
        if (score >= 0.84 && (best === null || score > best.score)) {
          best = { target: `${previous.id}:${candidate.id}`, score };
        }
      }
    }

    if (best === null) return block;
    return ImportReviewBlockSchema.parse({
      ...block,
      decision: "DUPLICATE_CANDIDATE",
      duplicateOf: best.target,
      reasonCodes: uniqueReasons([...block.reasonCodes, "CROSS_IMPORT_SIMILARITY"]),
    });
  });
}

export async function structureResumeImport(
  receipt: ImportReceipt,
  previousImports: readonly ImportReceipt[],
  config: ImportStructuringRuntimeConfig,
): Promise<ImportStructuringDraft> {
  if (receipt.status !== "EXTRACTED" || receipt.proposals.length === 0) {
    throw new Error("IMPORT_REVIEW_REQUIRES_EXTRACTED_RECEIPT");
  }

  const aiRuns: ImportReviewAIRun[] = [];
  const blocks: ImportReviewBlock[] = [];
  let successfulChunks = 0;
  const chunks = chunkProposals(receipt.proposals);

  for (const chunk of chunks) {
    if (config.skipProviderExecution) {
      blocks.push(...deterministicBlocks(receipt.id, chunk));
      continue;
    }

    const outcome = await executeAICapability({
      capability: "RESUME_IMPORT_FRAGMENT",
      credentialMode: config.credentialMode,
      prompt: buildPrompt(chunk),
      systemInstruction: SYSTEM_INSTRUCTION,
    }, {
      platformGeminiKey: config.platformGeminiKey,
      byokGeminiKey: config.byokGeminiKey,
      geminiBaseUrl: config.geminiBaseUrl,
      ollamaBaseUrl: config.ollamaBaseUrl,
      ollamaApiKey: config.ollamaApiKey,
      logger: config.logger,
    });

    if (!outcome.ok) {
      aiRuns.push({
        requestId: outcome.requestId,
        status: "FAILED",
        provider: null,
        model: null,
        resultSha256: null,
        failureCode: outcome.failureCode,
      });
      blocks.push(...deterministicBlocks(receipt.id, chunk));
      continue;
    }

    try {
      const parsed = parseAIJson(outcome.proposal.text);
      blocks.push(...normalizeAIBlocks(receipt.id, chunk, parsed.blocks));
      aiRuns.push({
        requestId: outcome.requestId,
        status: "SUCCESS",
        provider: outcome.provenance.provider === "gemini" ? "GEMINI" : "OLLAMA",
        model: outcome.provenance.model,
        resultSha256: outcome.resultSha256,
        failureCode: null,
      });
      successfulChunks += 1;
    } catch {
      aiRuns.push({
        requestId: outcome.requestId,
        status: "FAILED",
        provider: outcome.provenance.provider === "gemini" ? "GEMINI" : "OLLAMA",
        model: outcome.provenance.model,
        resultSha256: outcome.resultSha256,
        failureCode: "OUTPUT_VALIDATION_FAILED",
      });
      blocks.push(...deterministicBlocks(receipt.id, chunk));
    }
  }

  const structuredReceipt: ImportReceipt = { ...receipt, reviewStructure: null };
  const deduplicated = applyDuplicateHints(structuredReceipt, blocks, previousImports.filter((item) => item.id !== receipt.id));
  const status = successfulChunks === chunks.length && chunks.length > 0
    ? "AI_STRUCTURED"
    : successfulChunks > 0
      ? "HYBRID"
      : "DETERMINISTIC_FALLBACK";

  return {
    structureVersion: IMPORT_REVIEW_STRUCTURE_VERSION,
    status,
    blocks: deduplicated,
    aiRuns,
  };
}
