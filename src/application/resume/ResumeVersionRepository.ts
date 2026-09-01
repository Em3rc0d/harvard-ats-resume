import type { SupabaseClient } from "@supabase/supabase-js";
import {
  B4_COMPOSER_VERSION,
  B4_RENDERER_VERSION,
  ResumeVersionSchema,
  type CreateResumeVersionInput,
  type ResumeVersion,
} from "../../domain/resume/ResumeVersion";

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`B4_READBACK_INVALID_${field}`);
  return value;
}

function iso(value: unknown) {
  return new Date(requiredString(value, "TIMESTAMP")).toISOString();
}

export async function loadResumeVersion(
  client: SupabaseClient,
  ownerUserId: string,
  resumeVersionId: string,
): Promise<ResumeVersion> {
  const [versionResult, claimsResult] = await Promise.all([
    client.from("resume_versions").select("*").eq("owner_user_id", ownerUserId).eq("id", resumeVersionId).maybeSingle(),
    client.from("resume_claims").select("*").eq("owner_user_id", ownerUserId).eq("resume_version_id", resumeVersionId).order("ordinal", { ascending: true }),
  ]);
  if (versionResult.error) throw new Error(`B4_RESUME_READ_FAILED:${versionResult.error.message}`);
  if (claimsResult.error) throw new Error(`B4_CLAIMS_READ_FAILED:${claimsResult.error.message}`);
  if (!versionResult.data) throw new Error("B4_RESUME_NOT_FOUND");

  const version = versionResult.data as Record<string, unknown>;
  const claims = (claimsResult.data ?? []).map((row) => {
    const item = row as Record<string, unknown>;
    return {
      id: requiredString(item.id, "CLAIM_ID"),
      ordinal: item.ordinal,
      evidenceId: requiredString(item.evidence_id, "EVIDENCE_ID"),
      evidenceRevision: item.evidence_revision,
      evidenceKind: item.evidence_kind,
      evidenceVerificationStatus: item.evidence_verification_status,
      evidenceCanonicalText: item.evidence_canonical_text,
      renderedText: item.rendered_text,
      evidenceTextSha256: item.evidence_text_sha256,
      claimSha256: item.claim_sha256,
    };
  });

  return ResumeVersionSchema.parse({
    id: requiredString(version.id, "RESUME_ID"),
    ownerUserId: requiredString(version.owner_user_id, "OWNER"),
    mode: version.mode,
    jobSnapshotId: version.job_snapshot_id ?? null,
    opportunityAssessmentId: version.opportunity_assessment_id ?? null,
    evidenceFingerprintSha256: version.evidence_fingerprint_sha256,
    semanticKey: version.semantic_key,
    composerVersion: B4_COMPOSER_VERSION,
    rendererVersion: B4_RENDERER_VERSION,
    manifest: version.manifest,
    document: version.document_json,
    plainText: version.plain_text,
    claims,
    createdAt: iso(version.created_at),
  });
}

export async function createResumeVersion(
  client: SupabaseClient,
  ownerUserId: string,
  input: CreateResumeVersionInput,
): Promise<ResumeVersion> {
  const result = await client.rpc("cv_engine_create_resume_version", {
    p_mode: input.mode,
    p_job_snapshot_id: input.mode === "TARGETED" ? input.jobSnapshotId : null,
  });
  if (result.error) throw new Error(`B4_RESUME_CREATE_FAILED:${result.error.message}`);
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row || typeof row !== "object") throw new Error("B4_RESUME_CREATE_EMPTY");
  const resumeVersionId = requiredString((row as Record<string, unknown>).resume_version_id, "RESUME_ID");
  return loadResumeVersion(client, ownerUserId, resumeVersionId);
}

export async function listResumeVersions(
  client: SupabaseClient,
  ownerUserId: string,
): Promise<ResumeVersion[]> {
  const result = await client.from("resume_versions").select("id").eq("owner_user_id", ownerUserId).order("created_at", { ascending: false }).limit(50);
  if (result.error) throw new Error(`B4_RESUME_LIST_FAILED:${result.error.message}`);
  return Promise.all((result.data ?? []).map((row) => loadResumeVersion(client, ownerUserId, String(row.id))));
}
