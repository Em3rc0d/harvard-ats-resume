import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MarketObservationSchema,
  OpportunitySpaceBundleSchema,
  OpportunitySpaceItemSchema,
  compareOpportunitySpaceItems,
  type MarketObservation,
  type OpportunitySpaceBundle,
  type OpportunitySpaceItem,
} from "../../domain/opportunities/OpportunitySpace";

function iso(value: unknown) {
  if (typeof value !== "string" || !value) throw new Error("B7_INVALID_TIMESTAMP");
  return new Date(value).toISOString();
}

function mapObservation(row: Record<string, unknown>): MarketObservation {
  return MarketObservationSchema.parse({
    id: row.id,
    ownerUserId: row.owner_user_id,
    jobSnapshotId: row.job_snapshot_id,
    jobSnapshotSemanticKey: row.job_snapshot_semantic_key,
    rawDescriptionSha256: row.raw_description_sha256,
    roleTitle: row.role_title,
    company: row.company,
    observedAt: iso(row.observed_at),
    capturedAt: iso(row.captured_at),
    lifecycleVersion: row.lifecycle_version,
  });
}

function mapItem(row: Record<string, unknown>): OpportunitySpaceItem {
  return OpportunitySpaceItemSchema.parse({
    id: row.id,
    ownerUserId: row.owner_user_id,
    marketObservationId: row.market_observation_id,
    opportunityAssessmentId: row.opportunity_assessment_id,
    jobSnapshotId: row.job_snapshot_id,
    recommendation: row.recommendation,
    decision: row.decision,
    action: row.action,
    evidenceStrength: row.evidence_strength,
    assessmentSemanticKey: row.assessment_semantic_key,
    selectedAt: iso(row.selected_at),
    comparisonPolicyVersion: row.comparison_policy_version,
  });
}

export async function listOpportunitySpace(
  client: SupabaseClient,
  ownerUserId: string,
): Promise<OpportunitySpaceBundle> {
  const [observationResult, itemResult] = await Promise.all([
    client.from("market_observations").select("*").eq("owner_user_id", ownerUserId).order("observed_at", { ascending: false }).limit(100),
    client.from("opportunity_space_items").select("*").eq("owner_user_id", ownerUserId).order("selected_at", { ascending: false }).limit(100),
  ]);
  if (observationResult.error) throw new Error(`B7_OBSERVATION_LIST_FAILED:${observationResult.error.message}`);
  if (itemResult.error) throw new Error(`B7_SPACE_LIST_FAILED:${itemResult.error.message}`);
  const observations = (observationResult.data ?? []).map((row) => mapObservation(row as Record<string, unknown>));
  const items = (itemResult.data ?? []).map((row) => mapItem(row as Record<string, unknown>)).sort(compareOpportunitySpaceItems);
  return OpportunitySpaceBundleSchema.parse({ observations, items });
}

async function reloadObservation(client: SupabaseClient, ownerUserId: string, id: string) {
  const result = await client.from("market_observations").select("*").eq("owner_user_id", ownerUserId).eq("id", id).maybeSingle();
  if (result.error) throw new Error(`B7_OBSERVATION_READ_FAILED:${result.error.message}`);
  if (!result.data) throw new Error("B7_OBSERVATION_NOT_FOUND");
  return mapObservation(result.data as Record<string, unknown>);
}

async function reloadItem(client: SupabaseClient, ownerUserId: string, id: string) {
  const result = await client.from("opportunity_space_items").select("*").eq("owner_user_id", ownerUserId).eq("id", id).maybeSingle();
  if (result.error) throw new Error(`B7_SPACE_ITEM_READ_FAILED:${result.error.message}`);
  if (!result.data) throw new Error("B7_SPACE_ITEM_NOT_FOUND");
  return mapItem(result.data as Record<string, unknown>);
}

export async function captureMarketObservation(client: SupabaseClient, ownerUserId: string, jobSnapshotId: string) {
  const result = await client.rpc("cv_engine_capture_market_observation", { p_job_snapshot_id: jobSnapshotId });
  if (result.error) throw new Error(`B7_CAPTURE_FAILED:${result.error.message}`);
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  const id = row && typeof row === "object" ? (row as Record<string, unknown>).observation_id : null;
  if (typeof id !== "string") throw new Error("B7_CAPTURE_EMPTY");
  return reloadObservation(client, ownerUserId, id);
}

export async function selectOpportunity(client: SupabaseClient, ownerUserId: string, marketObservationId: string) {
  const result = await client.rpc("cv_engine_select_opportunity", { p_market_observation_id: marketObservationId });
  if (result.error) throw new Error(`B7_SELECT_FAILED:${result.error.message}`);
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  const id = row && typeof row === "object" ? (row as Record<string, unknown>).space_item_id : null;
  if (typeof id !== "string") throw new Error("B7_SELECT_EMPTY");
  return reloadItem(client, ownerUserId, id);
}
