import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { executeAICapability, type SafeAIEvent } from "../ai/AIGatewayRuntime";
import type { CredentialMode } from "../../domain/ai/AICapability";
import type { PresentationEvidenceReceipt } from "../../domain/presentation/PresentationRevision";
import { validatePresentationProposal } from "./PresentationGuard";

export const AIPresentationEvidenceRefSchema = z.object({
  evidenceId: z.string().uuid(),
  evidenceRevision: z.number().int().positive(),
}).strict();

export const CreateAIPresentationProposalInputSchema = z.object({
  planId: z.string().uuid(),
  purpose: z.enum(["CLAIM", "SUMMARY"]),
  sourceEvidenceRefs: z.array(AIPresentationEvidenceRefSchema).min(1).max(50),
}).strict();

export type CreateAIPresentationProposalInput = z.infer<typeof CreateAIPresentationProposalInputSchema>;

type PlanRow = {
  id: string;
  owner_user_id: string;
  mode: "GENERAL" | "TARGETED";
  job_snapshot_id: string | null;
};

type PlanEvidenceRow = {
  evidence_id: string;
  evidence_revision: number;
  evidence_text_sha256: string;
};

type EvidenceRow = {
  id: string;
  kind: PresentationEvidenceReceipt["evidenceKind"];
};

type RevisionRow = {
  evidence_id: string;
  revision_number: number;
  verification_status: string;
  canonical_text: string;
};

type JobRequirementRow = {
  category: string;
  importance: string;
  canonical_concept: string;
};

export type AIPresentationRuntimeConfig = Readonly<{
  credentialMode: CredentialMode;
  platformGeminiKey: string | null;
  byokGeminiKey: string | null;
  geminiBaseUrl: string;
  ollamaBaseUrl: string;
  ollamaApiKey: string | null;
  logger?: (event: SafeAIEvent) => void;
}>;

export type AIPresentationProposalResult = Readonly<{
  presentationRevisionId: string;
  reviewStatus: "ACCEPTED" | "REVIEW_REQUIRED";
  proposalText: string;
  provenance: {
    provider: "gemini" | "ollama";
    model: string;
    capability: "INLINE_WORDING_OPTIMIZATION";
    contractVersion: string;
    attempt: number;
    fallbackUsed: boolean;
    credentialMode: "PLATFORM" | "BYOK" | "LOCAL_ONLY";
    requestId: string;
    resultSha256: string;
  };
}>;

const WORDING_SYSTEM_INSTRUCTION = [
  "You are CV Engine's bounded professional-presentation assistant.",
  "Rewrite only the supplied VERIFIED CANDIDATE EVIDENCE into a concise, credible professional resume claim or summary.",
  "Preserve all facts, metrics, dates, scope, seniority, ownership, technologies and outcomes exactly.",
  "Never add a fact, number, technology, credential, employer, title, responsibility, impact, leadership claim or level of seniority that is absent from VERIFIED CANDIDATE EVIDENCE.",
  "MARKET CONTEXT may influence relevance and terminology only. It is never evidence that the candidate possesses a capability.",
  "Do not copy a market requirement into the candidate statement unless that same concept is already supported by VERIFIED CANDIDATE EVIDENCE.",
  "Return only the proposed resume wording. No explanation, markdown, labels, bullets or quotation marks.",
].join(" ");

function refKey(evidenceId: string, evidenceRevision: number) {
  return `${evidenceId}:${evidenceRevision}`;
}

async function loadTrustedContext(
  client: SupabaseClient,
  ownerUserId: string,
  input: CreateAIPresentationProposalInput,
) {
  const { data: planData, error: planError } = await client
    .from("presentation_plans")
    .select("id,owner_user_id,mode,job_snapshot_id")
    .eq("id", input.planId)
    .eq("owner_user_id", ownerUserId)
    .maybeSingle();
  if (planError) throw planError;
  if (!planData) throw new Error("P1_PRESENTATION_PLAN_NOT_FOUND");
  const plan = planData as PlanRow;

  const { data: selectedData, error: selectedError } = await client
    .from("presentation_plan_evidence")
    .select("evidence_id,evidence_revision,evidence_text_sha256")
    .eq("plan_id", input.planId)
    .eq("owner_user_id", ownerUserId)
    .eq("selection", "SELECTED");
  if (selectedError) throw selectedError;

  const selected = (selectedData ?? []) as PlanEvidenceRow[];
  const selectedByKey = new Map(selected.map((row) => [refKey(row.evidence_id, row.evidence_revision), row]));
  const requestedKeys = input.sourceEvidenceRefs.map((ref) => refKey(ref.evidenceId, ref.evidenceRevision));
  if (new Set(requestedKeys).size !== requestedKeys.length) {
    throw new Error("P1_AI_DUPLICATE_EVIDENCE_REF");
  }
  for (const key of requestedKeys) {
    if (!selectedByKey.has(key)) throw new Error("P1_AI_EVIDENCE_NOT_SELECTED");
  }

  const evidenceIds = [...new Set(input.sourceEvidenceRefs.map((ref) => ref.evidenceId))];
  const { data: evidenceData, error: evidenceError } = await client
    .from("career_evidence")
    .select("id,kind")
    .eq("owner_user_id", ownerUserId)
    .in("id", evidenceIds);
  if (evidenceError) throw evidenceError;
  const evidenceById = new Map(((evidenceData ?? []) as EvidenceRow[]).map((row) => [row.id, row]));

  const { data: revisionData, error: revisionError } = await client
    .from("career_evidence_revisions")
    .select("evidence_id,revision_number,verification_status,canonical_text")
    .eq("owner_user_id", ownerUserId)
    .in("evidence_id", evidenceIds);
  if (revisionError) throw revisionError;
  const revisionsByKey = new Map(
    ((revisionData ?? []) as RevisionRow[]).map((row) => [refKey(row.evidence_id, row.revision_number), row]),
  );

  const sourceEvidence: PresentationEvidenceReceipt[] = input.sourceEvidenceRefs.map((ref) => {
    const key = refKey(ref.evidenceId, ref.evidenceRevision);
    const evidence = evidenceById.get(ref.evidenceId);
    const revision = revisionsByKey.get(key);
    const selectedReceipt = selectedByKey.get(key);
    if (!evidence || !revision || !selectedReceipt) throw new Error("P1_AI_EVIDENCE_READBACK_INCOMPLETE");
    if (revision.verification_status !== "VERIFIED") throw new Error("P1_AI_EVIDENCE_NOT_VERIFIED");
    return {
      evidenceId: ref.evidenceId,
      evidenceRevision: ref.evidenceRevision,
      evidenceKind: evidence.kind,
      evidenceVerificationStatus: "VERIFIED",
      evidenceCanonicalText: revision.canonical_text,
      evidenceTextSha256: selectedReceipt.evidence_text_sha256,
    };
  });

  let marketContext: JobRequirementRow[] = [];
  if (plan.mode === "TARGETED" && plan.job_snapshot_id) {
    const { data: requirementsData, error: requirementsError } = await client
      .from("job_requirements")
      .select("category,importance,canonical_concept")
      .eq("owner_user_id", ownerUserId)
      .eq("snapshot_id", plan.job_snapshot_id)
      .order("source_ordinal", { ascending: true });
    if (requirementsError) throw requirementsError;
    marketContext = (requirementsData ?? []) as JobRequirementRow[];
  }

  return { plan, sourceEvidence, marketContext };
}

function buildTrustedPrompt(
  purpose: "CLAIM" | "SUMMARY",
  sourceEvidence: readonly PresentationEvidenceReceipt[],
  marketContext: readonly JobRequirementRow[],
) {
  const evidenceBlock = sourceEvidence.map((source, index) =>
    `[E${index + 1}] ${source.evidenceCanonicalText}`,
  ).join("\n");
  const marketBlock = marketContext.length === 0
    ? "(none)"
    : marketContext.map((requirement, index) =>
      `[M${index + 1}] ${requirement.importance} ${requirement.category}: ${requirement.canonical_concept}`,
    ).join("\n");

  return [
    `OUTPUT PURPOSE: ${purpose}`,
    "VERIFIED CANDIDATE EVIDENCE (authoritative candidate truth):",
    evidenceBlock,
    "MARKET CONTEXT (context only; never candidate truth):",
    marketBlock,
    "Produce the strongest concise professional wording supported entirely by the candidate evidence above.",
  ].join("\n\n");
}

export async function createAIPresentationProposal(
  userClient: SupabaseClient,
  adminClient: SupabaseClient,
  ownerUserId: string,
  inputRaw: CreateAIPresentationProposalInput,
  runtime: AIPresentationRuntimeConfig,
): Promise<AIPresentationProposalResult> {
  const input = CreateAIPresentationProposalInputSchema.parse(inputRaw);
  const { sourceEvidence, marketContext } = await loadTrustedContext(userClient, ownerUserId, input);
  const prompt = buildTrustedPrompt(input.purpose, sourceEvidence, marketContext);

  const outcome = await executeAICapability({
    capability: "INLINE_WORDING_OPTIMIZATION",
    credentialMode: runtime.credentialMode,
    prompt,
    systemInstruction: WORDING_SYSTEM_INSTRUCTION,
  }, {
    platformGeminiKey: runtime.platformGeminiKey,
    byokGeminiKey: runtime.byokGeminiKey,
    geminiBaseUrl: runtime.geminiBaseUrl,
    ollamaBaseUrl: runtime.ollamaBaseUrl,
    ollamaApiKey: runtime.ollamaApiKey,
    logger: runtime.logger,
  });

  if (!outcome.ok) {
    throw new Error(`P1_AI_WORDING_UNAVAILABLE:${outcome.failureCode}`);
  }

  const validation = validatePresentationProposal({
    sourceEvidence,
    proposedText: outcome.proposal.text,
    marketOnlyTerms: marketContext.map((requirement) => requirement.canonical_concept),
  });
  if (validation.deterministicStatus !== "PASS") {
    throw new Error("P1_AI_PROPOSAL_REJECTED_BY_DETERMINISTIC_GUARD");
  }

  const transformationTypes = [
    "CLARITY",
    "CONCISION",
    "TERMINOLOGY_ALIGNMENT",
    ...(marketContext.length > 0 ? ["KEYWORD_ALIGNMENT"] : []),
  ];

  const { data, error } = await adminClient.rpc("cv_engine_create_ai_presentation_revision", {
    p_owner_user_id: ownerUserId,
    p_plan_id: input.planId,
    p_purpose: input.purpose,
    p_source_evidence_refs: input.sourceEvidenceRefs,
    p_proposed_text: outcome.proposal.text,
    p_transformation_types: transformationTypes,
    p_provider: outcome.provenance.provider,
    p_model: outcome.provenance.model,
    p_capability: outcome.provenance.capability,
    p_contract_version: outcome.provenance.contractVersion,
    p_attempt: outcome.provenance.attempt,
    p_fallback_used: outcome.provenance.fallbackUsed,
    p_credential_mode: outcome.provenance.credentialMode,
    p_request_id: outcome.provenance.requestId,
    p_result_sha256: outcome.resultSha256,
  });
  if (error) throw error;

  const receipt = Array.isArray(data) ? data[0] : data;
  if (!receipt || typeof receipt.presentation_revision_id !== "string") {
    throw new Error("P1_AI_PERSISTENCE_RECEIPT_INVALID");
  }
  if (receipt.review_status !== "ACCEPTED" && receipt.review_status !== "REVIEW_REQUIRED") {
    throw new Error("P1_AI_REVIEW_STATUS_INVALID");
  }

  return {
    presentationRevisionId: receipt.presentation_revision_id,
    reviewStatus: receipt.review_status,
    proposalText: outcome.proposal.text,
    provenance: {
      ...outcome.provenance,
      capability: "INLINE_WORDING_OPTIMIZATION",
      resultSha256: outcome.resultSha256,
    },
  };
}
