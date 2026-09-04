import type { SupabaseClient } from "@supabase/supabase-js";
import { ResumeArtifactSchema, type ResumeArtifact } from "../../domain/resume/ResumeArtifact";

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`B9_ARTIFACT_READBACK_INVALID_${field}`);
  return value;
}
function iso(value: unknown) { return new Date(requiredString(value, "TIMESTAMP")).toISOString(); }

export async function loadResumeArtifact(client: SupabaseClient, ownerUserId: string, artifactId: string): Promise<ResumeArtifact> {
  const [artifactResult, receiptsResult] = await Promise.all([
    client.from("resume_artifacts").select("*").eq("owner_user_id", ownerUserId).eq("id", artifactId).maybeSingle(),
    client.from("resume_artifact_receipts").select("*").eq("owner_user_id", ownerUserId).eq("resume_artifact_id", artifactId).order("ordinal", { ascending: true }),
  ]);
  if (artifactResult.error) throw new Error(`B9_ARTIFACT_READ_FAILED:${artifactResult.error.message}`);
  if (receiptsResult.error) throw new Error(`B9_ARTIFACT_RECEIPTS_READ_FAILED:${receiptsResult.error.message}`);
  if (!artifactResult.data) throw new Error("B9_RESUME_ARTIFACT_NOT_FOUND");

  const artifact = artifactResult.data as Record<string, unknown>;
  const manifest = artifact.manifest_json as Record<string, unknown>;
  const receipts = (receiptsResult.data ?? []).map((row) => {
    const item = row as Record<string, unknown>;
    return {
      id: requiredString(item.id, "RECEIPT_ID"), ordinal: item.ordinal,
      sourcePlanItemId: requiredString(item.source_plan_item_id, "PLAN_ITEM_ID"),
      evidenceId: requiredString(item.evidence_id, "EVIDENCE_ID"), evidenceRevision: item.evidence_revision,
      evidenceTextSha256: item.evidence_text_sha256,
      presentationRevisionId: item.presentation_revision_id ?? null,
      presentationTextSha256: item.presentation_text_sha256 ?? null,
      renderedTextSha256: item.rendered_text_sha256, section: item.section, selectionReason: item.selection_reason,
    };
  });

  return ResumeArtifactSchema.parse({
    id: requiredString(artifact.id, "ARTIFACT_ID"), ownerUserId: requiredString(artifact.owner_user_id, "OWNER"),
    mode: artifact.mode, sourceResumePlanId: requiredString(artifact.resume_plan_id, "PLAN_ID"),
    sourceResumePlanSemanticKey: artifact.source_plan_semantic_key,
    artifactVersion: artifact.artifact_version, composerVersion: artifact.composer_version,
    rendererContractVersion: artifact.renderer_contract_version,
    careerEvidenceFingerprintSha256: artifact.career_evidence_fingerprint_sha256,
    artifactSemanticSha256: artifact.artifact_semantic_sha256,
    content: artifact.content_json, manifest: { ...manifest, receipts }, createdAt: iso(artifact.created_at),
  });
}

export async function createResumeArtifact(client: SupabaseClient, ownerUserId: string, resumePlanId: string): Promise<ResumeArtifact> {
  const existing = await client.from("resume_artifacts").select("id").eq("owner_user_id", ownerUserId).eq("resume_plan_id", resumePlanId).eq("artifact_version", "b9-canonical-resume-artifact-v1").eq("composer_version", "b9-deterministic-resume-composition-v2").eq("renderer_contract_version", "b9-ats-safe-single-column-v1").maybeSingle();
  if (existing.error) throw new Error(`B9_ARTIFACT_EXISTING_READ_FAILED:${existing.error.message}`);
  if (existing.data?.id) return loadResumeArtifact(client, ownerUserId, String(existing.data.id));

  const result = await client.rpc("cv_engine_create_resume_artifact", { p_resume_plan_id: resumePlanId });
  if (result.error) throw new Error(`B9_ARTIFACT_CREATE_FAILED:${result.error.message}`);
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row || typeof row !== "object") throw new Error("B9_ARTIFACT_CREATE_EMPTY");
  return loadResumeArtifact(client, ownerUserId, requiredString((row as Record<string, unknown>).resume_artifact_id, "ARTIFACT_ID"));
}

export async function listResumeArtifacts(client: SupabaseClient, ownerUserId: string): Promise<ResumeArtifact[]> {
  const result = await client.from("resume_artifacts").select("id").eq("owner_user_id", ownerUserId).order("created_at", { ascending: false }).limit(50);
  if (result.error) throw new Error(`B9_ARTIFACT_LIST_FAILED:${result.error.message}`);
  return Promise.all((result.data ?? []).map((row) => loadResumeArtifact(client, ownerUserId, String(row.id))));
}
