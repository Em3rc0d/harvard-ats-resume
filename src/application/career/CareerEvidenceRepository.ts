import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CareerEvidenceCurrentSchema,
  type CareerEvidenceCurrent,
  type CreateManualCareerEvidenceInput,
  type ReviseCareerEvidenceInput,
} from "../../domain/career/CareerEvidenceMutation";

type EvidenceRow = {
  id: string;
  vault_id: string;
  owner_user_id: string;
  kind: string;
  source: string;
  current_revision: number;
  created_at: string;
  updated_at: string;
};

type RevisionRow = {
  evidence_id: string;
  revision_number: number;
  verification_status: string;
  canonical_text: string;
};

function mapCurrent(row: EvidenceRow, revision: RevisionRow): CareerEvidenceCurrent {
  return CareerEvidenceCurrentSchema.parse({
    id: row.id,
    ownerUserId: row.owner_user_id,
    vaultId: row.vault_id,
    kind: row.kind,
    source: row.source,
    verificationStatus: revision.verification_status,
    canonicalText: revision.canonical_text,
    revision: revision.revision_number,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

async function loadCurrentById(
  client: SupabaseClient,
  ownerUserId: string,
  evidenceId: string,
): Promise<CareerEvidenceCurrent | null> {
  const { data: evidence, error: evidenceError } = await client
    .from("career_evidence")
    .select("id,vault_id,owner_user_id,kind,source,current_revision,created_at,updated_at")
    .eq("id", evidenceId)
    .eq("owner_user_id", ownerUserId)
    .maybeSingle();

  if (evidenceError) throw evidenceError;
  if (!evidence) return null;

  const row = evidence as EvidenceRow;
  const { data: revision, error: revisionError } = await client
    .from("career_evidence_revisions")
    .select("evidence_id,revision_number,verification_status,canonical_text")
    .eq("evidence_id", evidenceId)
    .eq("owner_user_id", ownerUserId)
    .eq("revision_number", row.current_revision)
    .single();

  if (revisionError) throw revisionError;
  return mapCurrent(row, revision as RevisionRow);
}

export async function listCurrentCareerEvidence(
  client: SupabaseClient,
  ownerUserId: string,
): Promise<CareerEvidenceCurrent[]> {
  const { data: evidenceRows, error: evidenceError } = await client
    .from("career_evidence")
    .select("id,vault_id,owner_user_id,kind,source,current_revision,created_at,updated_at")
    .eq("owner_user_id", ownerUserId)
    .order("updated_at", { ascending: false });

  if (evidenceError) throw evidenceError;
  if (!evidenceRows || evidenceRows.length === 0) return [];

  const rows = evidenceRows as EvidenceRow[];
  const ids = rows.map((row) => row.id);
  const { data: revisions, error: revisionError } = await client
    .from("career_evidence_revisions")
    .select("evidence_id,revision_number,verification_status,canonical_text")
    .eq("owner_user_id", ownerUserId)
    .in("evidence_id", ids);

  if (revisionError) throw revisionError;

  const revisionsByKey = new Map<string, RevisionRow>();
  for (const revision of (revisions ?? []) as RevisionRow[]) {
    revisionsByKey.set(`${revision.evidence_id}:${revision.revision_number}`, revision);
  }

  return rows.map((row) => {
    const revision = revisionsByKey.get(`${row.id}:${row.current_revision}`);
    if (!revision) {
      throw new Error(`CURRENT_EVIDENCE_REVISION_MISSING:${row.id}:${row.current_revision}`);
    }
    return mapCurrent(row, revision);
  });
}

export async function createManualCareerEvidence(
  client: SupabaseClient,
  ownerUserId: string,
  input: CreateManualCareerEvidenceInput,
): Promise<CareerEvidenceCurrent> {
  const { data, error } = await client.rpc("cv_engine_create_career_evidence", {
    p_kind: input.kind,
    p_source: "MANUAL",
    p_verification_status: input.verificationStatus,
    p_canonical_text: input.canonicalText,
    p_source_document_id: null,
  });

  if (error) throw error;

  const result = Array.isArray(data) ? data[0] : data;
  const evidenceId = result?.evidence_id;
  if (typeof evidenceId !== "string") {
    throw new Error("CAREER_EVIDENCE_CREATE_RECEIPT_INVALID");
  }

  const current = await loadCurrentById(client, ownerUserId, evidenceId);
  if (!current) throw new Error("CAREER_EVIDENCE_CREATE_READBACK_FAILED");
  return current;
}

export async function reviseCareerEvidence(
  client: SupabaseClient,
  ownerUserId: string,
  evidenceId: string,
  input: ReviseCareerEvidenceInput,
): Promise<CareerEvidenceCurrent> {
  const { error } = await client.rpc("cv_engine_revise_career_evidence", {
    p_evidence_id: evidenceId,
    p_expected_revision: input.expectedRevision,
    p_verification_status: input.verificationStatus,
    p_canonical_text: input.canonicalText,
    p_source_document_id: null,
  });

  if (error) throw error;

  const current = await loadCurrentById(client, ownerUserId, evidenceId);
  if (!current) throw new Error("CAREER_EVIDENCE_REVISION_READBACK_FAILED");
  return current;
}

export async function deleteCareerEvidence(
  client: SupabaseClient,
  ownerUserId: string,
  evidenceId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("career_evidence")
    .delete()
    .eq("id", evidenceId)
    .eq("owner_user_id", ownerUserId)
    .select("id");

  if (error) throw error;
  return Array.isArray(data) && data.length === 1;
}
