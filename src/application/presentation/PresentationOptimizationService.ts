import { z } from "zod";
import {
  executeAICapability,
  type AIGatewayRuntimeConfig,
  type AIExecutionOutcome,
} from "../ai/AIGatewayRuntime";
import type { CredentialMode } from "../../domain/ai/AICapability";
import {
  PresentationContextSchema,
  PresentationEvidenceReceiptSchema,
  type PresentationEvidenceReceipt,
} from "../../domain/presentation/PresentationRevision";
import { validatePresentationProposal } from "./PresentationGuard";

export const P1_AI_PRESENTATION_CONTRACT_VERSION = "p1-ai-presentation-v1" as const;

const OptimizationRequestSchema = z.object({
  sourceEvidence: z.array(PresentationEvidenceReceiptSchema).min(1).max(20),
  context: PresentationContextSchema,
  credentialMode: z.enum(["PLATFORM_KEY", "BYOK_REQUEST_SCOPED", "NO_CLOUD_AI"]),
  targetRole: z.string().trim().min(1).max(300).nullable(),
  marketRequirements: z.array(z.string().trim().min(1).max(500)).max(100),
}).strict();

export type PresentationOptimizationRequest = z.infer<typeof OptimizationRequestSchema>;

export type PresentationOptimizationResult = Readonly<{
  status: "PROPOSED" | "DEGRADED_TO_SOURCE" | "REJECTED";
  proposedText: string;
  sourceText: string;
  validation: ReturnType<typeof validatePresentationProposal>;
  aiOutcome: AIExecutionOutcome;
  aiProvenance: null | Readonly<{
    provider: "gemini" | "ollama";
    model: string;
    capability: "INLINE_WORDING_OPTIMIZATION";
    requestId: string;
    resultSha256: string;
    credentialMode: "PLATFORM" | "BYOK" | "LOCAL_ONLY";
  }>;
}>;

function sourceTextFor(sourceEvidence: readonly PresentationEvidenceReceipt[]) {
  return sourceEvidence.map((source) => source.evidenceCanonicalText).join("\n");
}

function buildOptimizationPrompt(input: PresentationOptimizationRequest) {
  const sourceText = sourceTextFor(input.sourceEvidence);
  const market = input.marketRequirements.length > 0
    ? input.marketRequirements.map((requirement, index) => `${index + 1}. ${requirement}`).join("\n")
    : "(none supplied)";

  return [
    "Rewrite the candidate statement into concise, strong professional resume wording.",
    "Return ONLY the rewritten candidate statement. No bullets, labels, commentary, markdown or JSON.",
    "Hard constraints:",
    "- Preserve only facts explicitly present in CANDIDATE EVIDENCE.",
    "- Do not introduce or strengthen metrics, dates, employers, titles, skills, technologies, credentials, ownership, leadership, scope, outcomes or seniority.",
    "- MARKET CONTEXT may influence wording priority only. It is not candidate evidence.",
    "- If a market requirement is unsupported by CANDIDATE EVIDENCE, do not mention it.",
    `Target role: ${input.targetRole ?? "general resume"}`,
    "",
    "CANDIDATE EVIDENCE:",
    sourceText,
    "",
    "MARKET CONTEXT:",
    market,
  ].join("\n");
}

function supportedTermsFromEvidence(sourceEvidence: readonly PresentationEvidenceReceipt[]) {
  const text = sourceTextFor(sourceEvidence);
  const tokens = text.match(/[A-Za-z][A-Za-z0-9+.#/-]{1,80}/g) ?? [];
  return [...new Set(tokens.map((token) => token.toLocaleLowerCase("en-US")))];
}

function marketFactTerms(requirements: readonly string[], supportedTerms: readonly string[]) {
  const supported = new Set(supportedTerms.map((term) => term.toLocaleLowerCase("en-US")));
  const stop = new Set(["required", "preferred", "experience", "with", "and", "the", "for", "role", "skills", "skill", "years", "year"]);
  const terms = requirements.flatMap((requirement) => requirement.match(/[A-Za-z][A-Za-z0-9+.#/-]{1,80}/g) ?? []);
  return [...new Set(terms.filter((term) => {
    const normalized = term.toLocaleLowerCase("en-US");
    return !supported.has(normalized) && !stop.has(normalized) && (/[A-Z]/.test(term[0] ?? "") || /[+.#/-]/.test(term));
  }))];
}

export async function optimizePresentationWithAI(
  requestInput: PresentationOptimizationRequest,
  runtimeConfig: AIGatewayRuntimeConfig,
): Promise<PresentationOptimizationResult> {
  const input = OptimizationRequestSchema.parse(requestInput);
  const sourceText = sourceTextFor(input.sourceEvidence);
  const supportedTerms = supportedTermsFromEvidence(input.sourceEvidence);
  const marketTerms = marketFactTerms(input.marketRequirements, supportedTerms);

  const outcome = await executeAICapability({
    capability: "INLINE_WORDING_OPTIMIZATION",
    credentialMode: input.credentialMode as CredentialMode,
    prompt: buildOptimizationPrompt(input),
    systemInstruction: [
      "You are CV Engine's bounded professional-presentation assistant.",
      "You may improve wording, concision and ordering, but you may not create candidate truth.",
      "Candidate Evidence is authoritative. Market context is non-authoritative context only.",
      "When uncertain, preserve the source statement rather than strengthen it.",
    ].join(" "),
  }, runtimeConfig);

  if (!outcome.ok) {
    return {
      status: "DEGRADED_TO_SOURCE",
      proposedText: sourceText,
      sourceText,
      validation: validatePresentationProposal({
        sourceEvidence: input.sourceEvidence,
        proposedText: sourceText,
      }),
      aiOutcome: outcome,
      aiProvenance: null,
    };
  }

  const validation = validatePresentationProposal({
    sourceEvidence: input.sourceEvidence,
    proposedText: outcome.proposal.text,
    supportedTerms,
    marketOnlyTerms: marketTerms,
  });

  if (validation.overallStatus === "REJECTED") {
    return {
      status: "REJECTED",
      proposedText: sourceText,
      sourceText,
      validation,
      aiOutcome: outcome,
      aiProvenance: null,
    };
  }

  return {
    status: "PROPOSED",
    proposedText: outcome.proposal.text,
    sourceText,
    validation,
    aiOutcome: outcome,
    aiProvenance: {
      provider: outcome.provenance.provider,
      model: outcome.provenance.model,
      capability: "INLINE_WORDING_OPTIMIZATION",
      requestId: outcome.requestId,
      resultSha256: outcome.resultSha256,
      credentialMode: outcome.provenance.credentialMode,
    },
  };
}
