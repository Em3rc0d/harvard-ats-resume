import type { SupabaseClient } from "@supabase/supabase-js";
import {
  B5_EXTRACTOR_VERSION,
  B5_PROPOSAL_VERSION,
  ImportReceiptSchema,
  type ImportMediaType,
  type ImportReceipt,
  type ImportReceiptStatus,
} from "../../domain/import/Import";
import type { ImportLineProposal } from "./ResumeExtractor";

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`B5_READBACK_INVALID_${field}`);
  return value;
}

function iso(value: unknown) {
  return new Date(requiredString(value, "TIMESTAMP")).toISOString();
}

export async function loadImportReceipt(client: SupabaseClient, ownerUserId: string, receiptId: string): Promise<ImportReceipt> {
  const [receiptResult, proposalsResult] = await Promise.all([
    client.from("import_receipts").select("*").eq("owner_user_id", ownerUserId).eq("id", receiptId).maybeSingle(),
    client.from("import_proposals").select("*").eq("owner_user_id", ownerUserId).eq("receipt_id", receiptId).order("ordinal", { ascending: true }),
  ]);
  if (receiptResult.error) throw new Error(`B5_RECEIPT_READ_FAILED:${receiptResult.error.message}`);
  if (proposalsResult.error) throw new Error(`B5_PROPOSALS_READ_FAILED:${proposalsResult.error.message}`);
  if (!receiptResult.data) throw new Error("B5_IMPORT_RECEIPT_NOT_FOUND");
  const receipt = receiptResult.data as Record<string, unknown>;
  const proposals = (proposalsResult.data ?? []).map((row) => {
    const item = row as Record<string, unknown>;
    return {
      id: requiredString(item.id, "PROPOSAL_ID"),
      receiptId: requiredString(item.receipt_id, "RECEIPT_ID"),
      ownerUserId: requiredString(item.owner_user_id, "OWNER"),
      ordinal: item.ordinal,
      sourceLine: item.source_line,
      canonicalText: item.canonical_text,
      sourceTextSha256: item.source_text_sha256,
      status: item.status,
      acceptedEvidenceId: item.accepted_evidence_id ?? null,
      createdAt: iso(item.created_at),
    };
  });
  return ImportReceiptSchema.parse({
    id: requiredString(receipt.id, "RECEIPT_ID"),
    ownerUserId: requiredString(receipt.owner_user_id, "OWNER"),
    sourceName: receipt.source_name,
    mediaType: receipt.media_type,
    sourceSizeBytes: receipt.source_size_bytes,
    sourceSha256: receipt.source_sha256,
    extractedTextSha256: receipt.extracted_text_sha256 ?? null,
    extractorVersion: B5_EXTRACTOR_VERSION,
    proposalVersion: B5_PROPOSAL_VERSION,
    status: receipt.status,
    warningCode: receipt.warning_code ?? null,
    proposalCount: receipt.proposal_count,
    proposals,
    createdAt: iso(receipt.created_at),
  });
}

export async function listImportReceipts(client: SupabaseClient, ownerUserId: string): Promise<ImportReceipt[]> {
  const result = await client.from("import_receipts").select("id").eq("owner_user_id", ownerUserId).order("created_at", { ascending: false }).limit(20);
  if (result.error) throw new Error(`B5_RECEIPT_LIST_FAILED:${result.error.message}`);
  return Promise.all((result.data ?? []).map((row) => loadImportReceipt(client, ownerUserId, String(row.id))));
}

export async function recordResumeImport(
  client: SupabaseClient,
  ownerUserId: string,
  input: {
    sourceName: string;
    mediaType: ImportMediaType;
    sourceSizeBytes: number;
    sourceSha256: string;
    extractedTextSha256: string | null;
    status: ImportReceiptStatus;
    warningCode: string | null;
    proposals: ImportLineProposal[];
  },
) {
  const result = await client.rpc("cv_engine_record_resume_import", {
    p_source_name: input.sourceName,
    p_media_type: input.mediaType,
    p_source_size_bytes: input.sourceSizeBytes,
    p_source_sha256: input.sourceSha256,
    p_extracted_text_sha256: input.extractedTextSha256,
    p_status: input.status,
    p_warning_code: input.warningCode,
    p_proposals: input.proposals.map((proposal) => ({
      ordinal: proposal.ordinal,
      sourceLine: proposal.sourceLine,
      canonicalText: proposal.canonicalText,
      sourceTextSha256: proposal.sourceTextSha256,
    })),
  });
  if (result.error) throw new Error(`B5_IMPORT_RECORD_FAILED:${result.error.message}`);
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row || typeof row !== "object") throw new Error("B5_IMPORT_RECORD_EMPTY");
  const receiptId = requiredString((row as Record<string, unknown>).receipt_id, "RECEIPT_ID");
  return loadImportReceipt(client, ownerUserId, receiptId);
}

export async function acceptImportProposal(client: SupabaseClient, ownerUserId: string, proposalId: string, kind: string) {
  const result = await client.rpc("cv_engine_accept_import_proposal", { p_proposal_id: proposalId, p_kind: kind });
  if (result.error) throw new Error(`B5_PROPOSAL_ACCEPT_FAILED:${result.error.message}`);
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row || typeof row !== "object") throw new Error("B5_PROPOSAL_ACCEPT_EMPTY");
  const proposal = await client.from("import_proposals").select("receipt_id").eq("owner_user_id", ownerUserId).eq("id", proposalId).maybeSingle();
  if (proposal.error || !proposal.data) throw new Error("B5_PROPOSAL_READBACK_FAILED");
  return {
    evidenceId: requiredString((row as Record<string, unknown>).evidence_id, "EVIDENCE_ID"),
    receipt: await loadImportReceipt(client, ownerUserId, String(proposal.data.receipt_id)),
  };
}

export async function dismissImportProposal(client: SupabaseClient, ownerUserId: string, proposalId: string) {
  const proposal = await client.from("import_proposals").select("receipt_id").eq("owner_user_id", ownerUserId).eq("id", proposalId).maybeSingle();
  if (proposal.error || !proposal.data) throw new Error("B5_IMPORT_PROPOSAL_NOT_FOUND");
  const result = await client.rpc("cv_engine_dismiss_import_proposal", { p_proposal_id: proposalId });
  if (result.error) throw new Error(`B5_PROPOSAL_DISMISS_FAILED:${result.error.message}`);
  return loadImportReceipt(client, ownerUserId, String(proposal.data.receipt_id));
}
