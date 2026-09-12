import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ResumeImprovementRunSchema,
  type ResumeImprovementRun,
  type ResumeImprovementRunStatus,
} from "../../domain/resume/ResumeImprovementRun";

const FULL_RUN_COLUMNS = [
  "id",
  "owner_user_id",
  "source_receipt_id",
  "source_sha256",
  "semantic_document_json",
  "semantic_document_sha256",
  "editor_provenance_json",
  "generated_document_json",
  "generated_document_sha256",
  "guardian_report_json",
  "guardian_report_sha256",
  "status",
  "target_job_snapshot_id",
  "target_text_hash",
  "created_at",
].join(",");
const SUMMARY_COLUMNS = "id,owner_user_id,source_receipt_id,status,created_at";
const MAX_TRANSIENT_READ_ATTEMPTS = 3;

export type ResumeImprovementRunSummary = Readonly<{
  id: string;
  ownerUserId: string;
  sourceReceiptId: string;
  status: ResumeImprovementRunStatus;
  createdAt: string;
}>;

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`V12_IMPROVEMENT_READBACK_INVALID_${field}`);
  return value;
}

function nullableRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function mapRun(row: Record<string, unknown>): ResumeImprovementRun {
  return ResumeImprovementRunSchema.parse({
    id: requiredString(row.id, "ID"),
    ownerUserId: requiredString(row.owner_user_id, "OWNER"),
    sourceReceiptId: requiredString(row.source_receipt_id, "SOURCE_RECEIPT"),
    sourceSha256: row.source_sha256,
    semanticDocumentJson: nullableRecord(row.semantic_document_json),
    semanticDocumentSha256: row.semantic_document_sha256 ?? null,
    editorProvenanceJson: nullableRecord(row.editor_provenance_json),
    generatedDocumentJson: nullableRecord(row.generated_document_json),
    generatedDocumentSha256: row.generated_document_sha256 ?? null,
    guardianReportJson: nullableRecord(row.guardian_report_json),
    guardianReportSha256: row.guardian_report_sha256 ?? null,
    status: row.status,
    targetJobSnapshotId: row.target_job_snapshot_id ?? null,
    targetTextHash: row.target_text_hash ?? null,
    createdAt: new Date(requiredString(row.created_at, "CREATED_AT")).toISOString(),
  });
}

function mapSummary(row: Record<string, unknown>): ResumeImprovementRunSummary {
  const status = row.status;
  if (status !== "IMPROVED" && status !== "PARTIALLY_IMPROVED" && status !== "FAILED_SOURCE_UNREADABLE") {
    throw new Error("V12_IMPROVEMENT_READBACK_INVALID_STATUS");
  }
  return {
    id: requiredString(row.id, "ID"),
    ownerUserId: requiredString(row.owner_user_id, "OWNER"),
    sourceReceiptId: requiredString(row.source_receipt_id, "SOURCE_RECEIPT"),
    status,
    createdAt: new Date(requiredString(row.created_at, "CREATED_AT")).toISOString(),
  };
}

export function isTransientImprovementReadErrorMessage(message: string) {
  return /gateway timeout|timed? out|timeout|fetch failed|network error|\b50[234]\b/i.test(message);
}

function waitForRetry(attempt: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, 125 * attempt));
}

export async function loadResumeImprovementRun(
  client: SupabaseClient,
  ownerUserId: string,
  runId: string,
): Promise<ResumeImprovementRun> {
  for (let attempt = 1; attempt <= MAX_TRANSIENT_READ_ATTEMPTS; attempt += 1) {
    const result = await client
      .from("resume_improvement_runs")
      .select(FULL_RUN_COLUMNS)
      .eq("owner_user_id", ownerUserId)
      .eq("id", runId)
      .maybeSingle();
    if (!result.error) {
      if (!result.data) throw new Error("V12_IMPROVEMENT_RUN_NOT_FOUND");
      return mapRun(result.data as Record<string, unknown>);
    }
    if (!isTransientImprovementReadErrorMessage(result.error.message) || attempt === MAX_TRANSIENT_READ_ATTEMPTS) {
      throw new Error(`V12_IMPROVEMENT_READ_FAILED:${result.error.message}`);
    }
    await waitForRetry(attempt);
  }
  throw new Error("V12_IMPROVEMENT_READ_FAILED:RETRY_EXHAUSTED");
}

export async function listResumeImprovementRunSummaries(
  client: SupabaseClient,
  ownerUserId: string,
  limit = 20,
): Promise<ResumeImprovementRunSummary[]> {
  const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const result = await client
    .from("resume_improvement_runs")
    .select(SUMMARY_COLUMNS)
    .eq("owner_user_id", ownerUserId)
    .order("created_at", { ascending: false })
    .limit(boundedLimit);
  if (result.error) throw new Error(`V12_IMPROVEMENT_LIST_FAILED:${result.error.message}`);
  return (result.data ?? []).map((row) => mapSummary(row as Record<string, unknown>));
}

export async function recordResumeImprovementRun(
  client: SupabaseClient,
  ownerUserId: string,
  input: {
    sourceReceiptId: string;
    semanticDocumentJson: Record<string, unknown> | null;
    editorProvenanceJson: Record<string, unknown> | null;
    generatedDocumentJson: Record<string, unknown> | null;
    guardianReportJson: Record<string, unknown> | null;
    status: ResumeImprovementRunStatus;
    targetJobSnapshotId?: string | null;
    targetTextHash?: string | null;
  },
): Promise<ResumeImprovementRun> {
  const result = await client.rpc("cv_engine_record_resume_improvement_run", {
    p_source_receipt_id: input.sourceReceiptId,
    p_semantic_document_json: input.semanticDocumentJson,
    p_editor_provenance_json: input.editorProvenanceJson,
    p_generated_document_json: input.generatedDocumentJson,
    p_guardian_report_json: input.guardianReportJson,
    p_status: input.status,
    p_target_job_snapshot_id: input.targetJobSnapshotId ?? null,
    p_target_text_hash: input.targetTextHash ?? null,
  });
  if (result.error) throw new Error(`V12_IMPROVEMENT_RECORD_FAILED:${result.error.message}`);
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row || typeof row !== "object") throw new Error("V12_IMPROVEMENT_RECORD_EMPTY");
  const runId = requiredString((row as Record<string, unknown>).resume_improvement_run_id, "ID");
  return loadResumeImprovementRun(client, ownerUserId, runId);
}
