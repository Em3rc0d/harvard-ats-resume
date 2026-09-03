import type { SupabaseClient } from "@supabase/supabase-js";
import {
  JobSnapshotSchema,
  type CreateManualJobSnapshotInput,
  type JobSnapshot,
} from "../../domain/jobs/JobSnapshot";
import { normalizeB2DatabaseTimestamp } from "../b2/DatabaseTimestamp";
import { analyzeManualJobDescription } from "./DeterministicJobIntelligence";

type SnapshotRow = {
  id: string;
  owner_user_id: string;
  semantic_key: string;
  source: string;
  role_title: string;
  company: string | null;
  raw_description: string;
  raw_description_sha256: string;
  analyzer_version: string;
  captured_at: string;
  created_at: string;
};

type RequirementRow = {
  id: string;
  snapshot_id: string;
  semantic_key: string;
  category: string;
  importance: string;
  canonical_concept: string;
  source_text: string;
  source_text_sha256: string;
  source_ordinal: number;
};

const SNAPSHOT_SELECT = "id,owner_user_id,semantic_key,source,role_title,company,raw_description,raw_description_sha256,analyzer_version,captured_at,created_at";
const REQUIREMENT_SELECT = "id,snapshot_id,semantic_key,category,importance,canonical_concept,source_text,source_text_sha256,source_ordinal";

async function mapSnapshot(client: SupabaseClient, row: SnapshotRow): Promise<JobSnapshot> {
  const { data, error } = await client.from("job_requirements").select(REQUIREMENT_SELECT)
    .eq("snapshot_id", row.id).eq("owner_user_id", row.owner_user_id).order("source_ordinal", { ascending: true });
  if (error) throw error;
  const requirements = ((data ?? []) as RequirementRow[]).map((requirement) => ({
    id: requirement.id,
    semanticKey: requirement.semantic_key,
    category: requirement.category,
    importance: requirement.importance,
    canonicalConcept: requirement.canonical_concept,
    sourceText: requirement.source_text,
    sourceTextSha256: requirement.source_text_sha256,
    sourceOrdinal: requirement.source_ordinal,
  }));
  return JobSnapshotSchema.parse({
    id: row.id,
    ownerUserId: row.owner_user_id,
    semanticKey: row.semantic_key,
    source: row.source,
    roleTitle: row.role_title,
    ...(row.company ? { company: row.company } : {}),
    rawDescription: row.raw_description,
    rawDescriptionSha256: row.raw_description_sha256,
    analyzerVersion: row.analyzer_version,
    requirements,
    capturedAt: normalizeB2DatabaseTimestamp(row.captured_at),
    createdAt: normalizeB2DatabaseTimestamp(row.created_at),
  });
}

async function loadSnapshot(client: SupabaseClient, ownerUserId: string, snapshotId: string) {
  const { data, error } = await client.from("job_snapshots").select(SNAPSHOT_SELECT)
    .eq("id", snapshotId).eq("owner_user_id", ownerUserId).maybeSingle();
  if (error) throw error;
  return data ? mapSnapshot(client, data as SnapshotRow) : null;
}

export async function listJobSnapshots(client: SupabaseClient, ownerUserId: string): Promise<JobSnapshot[]> {
  const { data, error } = await client.from("job_snapshots").select(SNAPSHOT_SELECT)
    .eq("owner_user_id", ownerUserId).order("created_at", { ascending: false });
  if (error) throw error;
  return Promise.all(((data ?? []) as SnapshotRow[]).map((row) => mapSnapshot(client, row)));
}

export async function createManualJobSnapshot(
  client: SupabaseClient,
  ownerUserId: string,
  input: CreateManualJobSnapshotInput,
): Promise<JobSnapshot> {
  const analysis = analyzeManualJobDescription(input);
  const { data, error } = await client.rpc("cv_engine_create_job_snapshot", {
    p_semantic_key: analysis.semanticKey,
    p_role_title: analysis.input.roleTitle,
    p_company: analysis.input.company ?? "",
    p_raw_description: analysis.input.rawDescription,
    p_raw_description_sha256: analysis.rawDescriptionSha256,
    p_analyzer_version: analysis.analyzerVersion,
    p_requirements: analysis.requirements,
  });
  if (error) throw error;
  const receipt = Array.isArray(data) ? data[0] : data;
  if (typeof receipt?.snapshot_id !== "string") throw new Error("JOB_SNAPSHOT_CREATE_RECEIPT_INVALID");
  const snapshot = await loadSnapshot(client, ownerUserId, receipt.snapshot_id);
  if (!snapshot) throw new Error("JOB_SNAPSHOT_CREATE_READBACK_FAILED");
  return snapshot;
}
