import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AssessmentBundleSchema,
  B3_ASSESSMENT_POLICY_VERSION,
  B3_MATCH_ENGINE_VERSION,
  type AssessmentBundle,
} from "../../domain/matching/Assessment";

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`B3_READBACK_INVALID_${field}`);
  return value;
}

function iso(value: unknown) {
  return new Date(requiredString(value, "TIMESTAMP")).toISOString();
}

async function loadAssessmentBundle(
  client: SupabaseClient,
  ownerUserId: string,
  assessmentId: string,
): Promise<AssessmentBundle> {
  const assessmentResult = await client
    .from("opportunity_assessments")
    .select("*")
    .eq("owner_user_id", ownerUserId)
    .eq("id", assessmentId)
    .maybeSingle();
  if (assessmentResult.error) throw new Error(`B3_ASSESSMENT_READ_FAILED:${assessmentResult.error.message}`);
  if (!assessmentResult.data) throw new Error("B3_ASSESSMENT_NOT_FOUND");
  const assessmentRow = assessmentResult.data as Record<string, unknown>;

  const matchReportId = requiredString(assessmentRow.match_report_id, "MATCH_REPORT_ID");
  const jobSnapshotId = requiredString(assessmentRow.job_snapshot_id, "JOB_SNAPSHOT_ID");

  const [reportResult, matchesResult, requirementsResult] = await Promise.all([
    client.from("match_reports").select("*").eq("owner_user_id", ownerUserId).eq("id", matchReportId).maybeSingle(),
    client.from("requirement_matches").select("*").eq("owner_user_id", ownerUserId).eq("match_report_id", matchReportId).order("created_at", { ascending: true }),
    client.from("job_requirements").select("*").eq("owner_user_id", ownerUserId).eq("snapshot_id", jobSnapshotId).order("source_ordinal", { ascending: true }),
  ]);

  if (reportResult.error) throw new Error(`B3_MATCH_REPORT_READ_FAILED:${reportResult.error.message}`);
  if (matchesResult.error) throw new Error(`B3_REQUIREMENT_MATCH_READ_FAILED:${matchesResult.error.message}`);
  if (requirementsResult.error) throw new Error(`B3_JOB_REQUIREMENT_READ_FAILED:${requirementsResult.error.message}`);
  if (!reportResult.data) throw new Error("B3_MATCH_REPORT_NOT_FOUND");

  const reportRow = reportResult.data as Record<string, unknown>;
  const requirements = new Map(
    (requirementsResult.data ?? []).map((row) => {
      const item = row as Record<string, unknown>;
      return [requiredString(item.id, "REQUIREMENT_ID"), item] as const;
    }),
  );

  const matches = (matchesResult.data ?? []).map((row) => {
    const item = row as Record<string, unknown>;
    const requirementId = requiredString(item.requirement_id, "REQUIREMENT_ID");
    const requirement = requirements.get(requirementId);
    if (!requirement) throw new Error("B3_REQUIREMENT_READBACK_MISMATCH");
    return {
      id: requiredString(item.id, "MATCH_ID"),
      requirementId,
      requirementSemanticKey: requiredString(item.requirement_semantic_key, "REQUIREMENT_SEMANTIC_KEY"),
      category: requirement.category,
      importance: requirement.importance,
      canonicalConcept: requirement.canonical_concept,
      sourceText: requirement.source_text,
      status: item.status,
      supportingEvidence: item.supporting_evidence_snapshot,
      rationale: item.rationale,
    };
  });

  return AssessmentBundleSchema.parse({
    report: {
      id: requiredString(reportRow.id, "REPORT_ID"),
      ownerUserId: requiredString(reportRow.owner_user_id, "REPORT_OWNER"),
      jobSnapshotId: requiredString(reportRow.job_snapshot_id, "REPORT_JOB"),
      jobSnapshotSemanticKey: requiredString(reportRow.job_snapshot_semantic_key, "JOB_SEMANTIC_KEY"),
      careerEvidenceFingerprintSha256: requiredString(reportRow.career_evidence_fingerprint_sha256, "EVIDENCE_FINGERPRINT"),
      semanticKey: requiredString(reportRow.semantic_key, "REPORT_SEMANTIC_KEY"),
      engineVersion: B3_MATCH_ENGINE_VERSION,
      matches,
      basis: reportRow.basis,
      createdAt: iso(reportRow.created_at),
    },
    assessment: {
      id: requiredString(assessmentRow.id, "ASSESSMENT_ID"),
      ownerUserId: requiredString(assessmentRow.owner_user_id, "ASSESSMENT_OWNER"),
      matchReportId,
      jobSnapshotId,
      semanticKey: requiredString(assessmentRow.semantic_key, "ASSESSMENT_SEMANTIC_KEY"),
      policyVersion: B3_ASSESSMENT_POLICY_VERSION,
      recommendation: assessmentRow.recommendation,
      decision: assessmentRow.decision,
      action: assessmentRow.action,
      eligibility: assessmentRow.eligibility,
      evidenceStrength: assessmentRow.evidence_strength,
      criticalGapRequirementIds: assessmentRow.critical_gap_requirement_ids,
      optionalGapRequirementIds: assessmentRow.optional_gap_requirement_ids,
      uncertainRequirementIds: assessmentRow.uncertain_requirement_ids,
      rationale: assessmentRow.rationale,
      scopeBoundary: assessmentRow.scope_boundary,
      createdAt: iso(assessmentRow.created_at),
    },
  });
}

export async function createOpportunityAssessment(
  client: SupabaseClient,
  ownerUserId: string,
  jobSnapshotId: string,
): Promise<AssessmentBundle> {
  const result = await client.rpc("cv_engine_create_opportunity_assessment", {
    p_job_snapshot_id: jobSnapshotId,
  });
  if (result.error) throw new Error(`B3_ASSESSMENT_CREATE_FAILED:${result.error.message}`);
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row || typeof row !== "object") throw new Error("B3_ASSESSMENT_CREATE_EMPTY");
  const assessmentId = requiredString((row as Record<string, unknown>).assessment_id, "ASSESSMENT_ID");
  return loadAssessmentBundle(client, ownerUserId, assessmentId);
}

export async function listOpportunityAssessments(
  client: SupabaseClient,
  ownerUserId: string,
): Promise<AssessmentBundle[]> {
  const result = await client
    .from("opportunity_assessments")
    .select("id")
    .eq("owner_user_id", ownerUserId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (result.error) throw new Error(`B3_ASSESSMENT_LIST_FAILED:${result.error.message}`);
  return Promise.all((result.data ?? []).map((row) => loadAssessmentBundle(client, ownerUserId, String(row.id))));
}
