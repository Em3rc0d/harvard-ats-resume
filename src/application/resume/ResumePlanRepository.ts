import type { SupabaseClient } from "@supabase/supabase-js";
import {
  B9_RESUME_PLANNER_VERSION,
  ResumePlanSchema,
  type CreateResumePlanInput,
  type ResumePlan,
} from "../../domain/resume/ResumePlan";

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`B9_RESUME_PLAN_READBACK_INVALID_${field}`);
  }
  return value;
}

function iso(value: unknown) {
  return new Date(requiredString(value, "TIMESTAMP")).toISOString();
}

export async function loadResumePlan(
  client: SupabaseClient,
  ownerUserId: string,
  resumePlanId: string,
): Promise<ResumePlan> {
  const [planResult, itemsResult] = await Promise.all([
    client
      .from("resume_plans")
      .select("*")
      .eq("owner_user_id", ownerUserId)
      .eq("id", resumePlanId)
      .maybeSingle(),
    client
      .from("resume_plan_items")
      .select("*")
      .eq("owner_user_id", ownerUserId)
      .eq("resume_plan_id", resumePlanId)
      .order("ordinal", { ascending: true }),
  ]);

  if (planResult.error) throw new Error(`B9_RESUME_PLAN_READ_FAILED:${planResult.error.message}`);
  if (itemsResult.error) throw new Error(`B9_RESUME_PLAN_ITEMS_READ_FAILED:${itemsResult.error.message}`);
  if (!planResult.data) throw new Error("B9_RESUME_PLAN_NOT_FOUND");

  const plan = planResult.data as Record<string, unknown>;
  const items = (itemsResult.data ?? []).map((row) => {
    const item = row as Record<string, unknown>;
    return {
      id: requiredString(item.id, "ITEM_ID"),
      ordinal: item.ordinal,
      section: item.section,
      evidenceId: requiredString(item.evidence_id, "EVIDENCE_ID"),
      evidenceRevision: item.evidence_revision,
      evidenceKind: item.evidence_kind,
      evidenceTextSha256: item.evidence_text_sha256,
      presentationRevisionId: item.presentation_revision_id ?? null,
      presentationTextSha256: item.presentation_text_sha256 ?? null,
      renderedText: item.rendered_text,
      selectionReason: item.selection_reason,
    };
  });

  return ResumePlanSchema.parse({
    id: requiredString(plan.id, "PLAN_ID"),
    ownerUserId: requiredString(plan.owner_user_id, "OWNER"),
    mode: plan.mode,
    jobSnapshotId: plan.job_snapshot_id ?? null,
    opportunityAssessmentId: plan.opportunity_assessment_id ?? null,
    plannerVersion: B9_RESUME_PLANNER_VERSION,
    sectionOrder: plan.section_order,
    densityPolicy: plan.density_policy,
    careerEvidenceFingerprintSha256: plan.career_evidence_fingerprint_sha256,
    semanticKey: plan.semantic_key,
    items,
    createdAt: iso(plan.created_at),
  });
}

export async function createResumePlan(
  client: SupabaseClient,
  ownerUserId: string,
  input: CreateResumePlanInput,
): Promise<ResumePlan> {
  const result = await client.rpc("cv_engine_create_resume_plan", {
    p_mode: input.mode,
    p_job_snapshot_id: input.mode === "TARGETED" ? input.jobSnapshotId : null,
    p_opportunity_assessment_id:
      input.mode === "TARGETED" ? input.opportunityAssessmentId : null,
  });

  if (result.error) throw new Error(`B9_RESUME_PLAN_CREATE_FAILED:${result.error.message}`);
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row || typeof row !== "object") throw new Error("B9_RESUME_PLAN_CREATE_EMPTY");

  const resumePlanId = requiredString(
    (row as Record<string, unknown>).resume_plan_id,
    "PLAN_ID",
  );
  return loadResumePlan(client, ownerUserId, resumePlanId);
}

export async function listResumePlans(
  client: SupabaseClient,
  ownerUserId: string,
): Promise<ResumePlan[]> {
  const result = await client
    .from("resume_plans")
    .select("id")
    .eq("owner_user_id", ownerUserId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (result.error) throw new Error(`B9_RESUME_PLAN_LIST_FAILED:${result.error.message}`);
  return Promise.all(
    (result.data ?? []).map((row) => loadResumePlan(client, ownerUserId, String(row.id))),
  );
}
