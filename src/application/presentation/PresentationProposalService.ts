import { createHash } from "node:crypto";
import { z } from "zod";
import type {
  AIExecutionInput,
  AIExecutionOutcome,
  AIExecutionSuccess,
} from "../ai/AIGatewayRuntime";
import type { CredentialMode } from "../../domain/ai/AICapability";
import type { CareerEvidenceCurrent } from "../../domain/career/CareerEvidenceMutation";
import {
  B9_PRESENTATION_VALIDATOR_VERSION,
  PresentationProviderProvenanceSchema,
  PresentationValidationResultSchema,
  RecordPresentationProposalInputSchema,
  type PresentationRevision,
  type RecordPresentationProposalInput,
} from "../../domain/presentation/PresentationRevision";
import {
  validatePresentationRewrite,
  type PresentationValidationOutcome,
} from "./PresentationFactValidator";

export const DEFAULT_PRESENTATION_OBJECTIVE =
  "Improve clarity, concision, and professional phrasing while preserving the source meaning exactly." as const;

export const PresentationObjectiveSchema = z.string().trim().min(1).max(500);

export const B9_PRESENTATION_AI_SYSTEM_INSTRUCTION = [
  "You rewrite exactly one VERIFIED Career Evidence statement.",
  "Return only the replacement wording, with no commentary, labels, bullets, markdown, or alternatives.",
  "Preserve every supplied fact, metric, employer, title, date, skill, certification, ownership level, seniority level, scope, negation, and uncertainty exactly.",
  "Do not add, infer, strengthen, weaken, remove, or fabricate factual content.",
  "Use the smallest safe rewrite possible.",
  "For content-bearing words, reuse words already present in canonicalText except for neutral presentation verbs such as apply, build, collaborate, configure, create, develop, design, implement, integrate, maintain, optimize, program, support, test, work, or focus and their ordinary grammatical forms.",
  "Do not introduce new adjectives, adverbs, claims, technologies, outcomes, scale, ownership, seniority, quality, or scope language.",
  "If no safer improvement is possible under these constraints, return canonicalText unchanged.",
].join(" ");

export type PresentationAIExecutor = (
  input: AIExecutionInput,
) => Promise<AIExecutionOutcome>;

export type PresentationProposalRecorder = (
  input: RecordPresentationProposalInput,
) => Promise<PresentationRevision>;

export type PresentationProposalOutcome =
  | Readonly<{
      ok: true;
      revision: PresentationRevision;
      ai: AIExecutionSuccess;
      validation: Readonly<{ status: "PASS"; reasonCodes: readonly [] }>;
    }>
  | Readonly<{
      ok: false;
      kind: "EVIDENCE_NOT_VERIFIED";
    }>
  | Readonly<{
      ok: false;
      kind: "AI_FAILURE";
      ai: Exclude<AIExecutionOutcome, AIExecutionSuccess>;
    }>
  | Readonly<{
      ok: false;
      kind: "INVALID_AI_PROVENANCE";
      ai: AIExecutionSuccess;
    }>
  | Readonly<{
      ok: false;
      kind: "VALIDATION_REJECTED";
      ai: AIExecutionSuccess;
      validation: Extract<PresentationValidationOutcome, { status: "REJECT" }>;
    }>;

function sha256Utf8(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function buildProviderEnvelope(
  evidence: CareerEvidenceCurrent,
  objective: string,
) {
  return JSON.stringify({
    evidenceId: evidence.id,
    revision: evidence.revision,
    kind: evidence.kind,
    canonicalText: evidence.canonicalText,
    objective,
  });
}

export async function proposePresentationRevision(
  input: Readonly<{
    evidence: CareerEvidenceCurrent;
    objective?: string;
    credentialMode: CredentialMode;
  }>,
  dependencies: Readonly<{
    executeAI: PresentationAIExecutor;
    record: PresentationProposalRecorder;
  }>,
): Promise<PresentationProposalOutcome> {
  if (input.evidence.verificationStatus !== "VERIFIED") {
    return { ok: false, kind: "EVIDENCE_NOT_VERIFIED" };
  }

  const objective = PresentationObjectiveSchema.parse(
    input.objective ?? DEFAULT_PRESENTATION_OBJECTIVE,
  );

  const ai = await dependencies.executeAI({
    capability: "INLINE_WORDING_OPTIMIZATION",
    credentialMode: input.credentialMode,
    prompt: buildProviderEnvelope(input.evidence, objective),
    systemInstruction: B9_PRESENTATION_AI_SYSTEM_INSTRUCTION,
  });

  if (!ai.ok) {
    return { ok: false, kind: "AI_FAILURE", ai };
  }

  if (
    ai.capability !== "INLINE_WORDING_OPTIMIZATION"
    || !PresentationProviderProvenanceSchema.safeParse(ai.provenance).success
  ) {
    return { ok: false, kind: "INVALID_AI_PROVENANCE", ai };
  }

  const validation = validatePresentationRewrite(
    input.evidence.canonicalText,
    ai.proposal.text,
  );

  if (validation.status === "REJECT") {
    return {
      ok: false,
      kind: "VALIDATION_REJECTED",
      ai,
      validation,
    };
  }

  const validationResult = PresentationValidationResultSchema.parse(validation);
  const recordInput = RecordPresentationProposalInputSchema.parse({
    evidenceId: input.evidence.id,
    evidenceRevision: input.evidence.revision,
    sourceTextSha256: sha256Utf8(input.evidence.canonicalText),
    proposedText: ai.proposal.text,
    proposedTextSha256: sha256Utf8(ai.proposal.text),
    provenance: ai.provenance,
    validatorVersion: B9_PRESENTATION_VALIDATOR_VERSION,
    validationResult,
  });

  const revision = await dependencies.record(recordInput);
  return {
    ok: true,
    revision,
    ai,
    validation,
  };
}
