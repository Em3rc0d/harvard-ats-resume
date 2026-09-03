import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PresentationRevisionSchema,
  RecordPresentationProposalInputSchema,
  ResolvePresentationRevisionInputSchema,
  type PresentationRevision,
  type RecordPresentationProposalInput,
  type ResolvePresentationRevisionInput,
} from "../../domain/presentation/PresentationRevision";

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`B9_PRESENTATION_READBACK_INVALID_${field}`);
  }
  return value;
}

function iso(value: unknown, field: string) {
  return new Date(requiredString(value, field)).toISOString();
}

function mapPresentationRevision(row: Record<string, unknown>): PresentationRevision {
  return PresentationRevisionSchema.parse({
    id: requiredString(row.id, "ID"),
    ownerUserId: requiredString(row.owner_user_id, "OWNER"),
    evidenceId: requiredString(row.evidence_id, "EVIDENCE_ID"),
    evidenceRevision: row.evidence_revision,
    sourceTextSha256: row.source_text_sha256,
    proposedText: row.proposed_text,
    proposedTextSha256: row.proposed_text_sha256,
    provenance: {
      provider: row.provider,
      model: row.model,
      capability: row.capability,
      contractVersion: row.provider_contract_version,
      attempt: row.provider_attempt,
      fallbackUsed: row.provider_fallback_used,
      credentialMode: row.provider_credential_mode,
      requestId: row.provider_request_id,
    },
    validatorVersion: row.validator_version,
    validationResult: row.validation_result,
    status: row.status,
    createdAt: iso(row.created_at, "CREATED_AT"),
    resolvedAt: row.resolved_at === null ? null : iso(row.resolved_at, "RESOLVED_AT"),
  });
}

export async function loadPresentationRevision(
  client: SupabaseClient,
  ownerUserId: string,
  presentationRevisionId: string,
): Promise<PresentationRevision> {
  const result = await client
    .from("presentation_revisions")
    .select("*")
    .eq("owner_user_id", ownerUserId)
    .eq("id", presentationRevisionId)
    .maybeSingle();

  if (result.error) throw new Error(`B9_PRESENTATION_READ_FAILED:${result.error.message}`);
  if (!result.data) throw new Error("B9_PRESENTATION_REVISION_NOT_FOUND");
  return mapPresentationRevision(result.data as Record<string, unknown>);
}

export async function listPresentationRevisions(
  client: SupabaseClient,
  ownerUserId: string,
  evidenceId?: string,
): Promise<PresentationRevision[]> {
  let query = client
    .from("presentation_revisions")
    .select("*")
    .eq("owner_user_id", ownerUserId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (evidenceId) query = query.eq("evidence_id", evidenceId);

  const result = await query;
  if (result.error) throw new Error(`B9_PRESENTATION_LIST_FAILED:${result.error.message}`);
  return (result.data ?? []).map((row) => mapPresentationRevision(row as Record<string, unknown>));
}

export async function recordPresentationProposal(
  client: SupabaseClient,
  ownerUserId: string,
  input: RecordPresentationProposalInput,
): Promise<PresentationRevision> {
  const value = RecordPresentationProposalInputSchema.parse(input);
  const result = await client.rpc("cv_engine_record_presentation_proposal", {
    p_evidence_id: value.evidenceId,
    p_evidence_revision: value.evidenceRevision,
    p_source_text_sha256: value.sourceTextSha256,
    p_proposed_text: value.proposedText,
    p_proposed_text_sha256: value.proposedTextSha256,
    p_provider: value.provenance.provider,
    p_model: value.provenance.model,
    p_provider_contract_version: value.provenance.contractVersion,
    p_provider_attempt: value.provenance.attempt,
    p_provider_fallback_used: value.provenance.fallbackUsed,
    p_provider_credential_mode: value.provenance.credentialMode,
    p_provider_request_id: value.provenance.requestId,
    p_validator_version: value.validatorVersion,
    p_validation_result: value.validationResult,
  });

  if (result.error) throw new Error(`B9_PRESENTATION_RECORD_FAILED:${result.error.message}`);
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row || typeof row !== "object") throw new Error("B9_PRESENTATION_RECORD_EMPTY");
  const presentationRevisionId = requiredString(
    (row as Record<string, unknown>).presentation_revision_id,
    "ID",
  );
  return loadPresentationRevision(client, ownerUserId, presentationRevisionId);
}

export async function resolvePresentationRevision(
  client: SupabaseClient,
  ownerUserId: string,
  input: ResolvePresentationRevisionInput,
): Promise<PresentationRevision> {
  const value = ResolvePresentationRevisionInputSchema.parse(input);
  const result = await client.rpc("cv_engine_resolve_presentation_revision", {
    p_presentation_revision_id: value.presentationRevisionId,
    p_decision: value.decision,
  });

  if (result.error) throw new Error(`B9_PRESENTATION_RESOLVE_FAILED:${result.error.message}`);
  return loadPresentationRevision(client, ownerUserId, value.presentationRevisionId);
}
