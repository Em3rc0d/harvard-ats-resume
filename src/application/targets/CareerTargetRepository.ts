import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CareerTargetSchema,
  type CareerTarget,
  type CreateCareerTargetInput,
} from "../../domain/targets/CareerTarget";
import { normalizeB2DatabaseTimestamp } from "../b2/DatabaseTimestamp";
import { canonicalizeCareerTargetInput, careerTargetSemanticKey } from "./CareerTargetIdentity";

type TargetRow = {
  id: string;
  owner_user_id: string;
  semantic_key: string;
  target_role: string;
  job_family: string | null;
  preferred_seniorities: string[];
  preferred_locations: string[];
  work_models: string[];
  employment_types: string[];
  industries: string[];
  relocation_preference: string;
  priority: string;
  is_active: boolean;
  activated_at: string | null;
  created_at: string;
};

const SELECT = "id,owner_user_id,semantic_key,target_role,job_family,preferred_seniorities,preferred_locations,work_models,employment_types,industries,relocation_preference,priority,is_active,activated_at,created_at";

function mapTarget(row: TargetRow): CareerTarget {
  return CareerTargetSchema.parse({
    id: row.id,
    ownerUserId: row.owner_user_id,
    semanticKey: row.semantic_key,
    targetRole: row.target_role,
    ...(row.job_family ? { jobFamily: row.job_family } : {}),
    preferredSeniorities: row.preferred_seniorities,
    preferredLocations: row.preferred_locations,
    workModels: row.work_models,
    employmentTypes: row.employment_types,
    industries: row.industries,
    relocationPreference: row.relocation_preference,
    priority: row.priority,
    isActive: row.is_active,
    activatedAt: row.activated_at ? normalizeB2DatabaseTimestamp(row.activated_at) : null,
    createdAt: normalizeB2DatabaseTimestamp(row.created_at),
  });
}

async function loadTarget(client: SupabaseClient, ownerUserId: string, targetId: string) {
  const { data, error } = await client.from("career_targets").select(SELECT)
    .eq("id", targetId).eq("owner_user_id", ownerUserId).maybeSingle();
  if (error) throw error;
  return data ? mapTarget(data as TargetRow) : null;
}

export async function listCareerTargets(client: SupabaseClient, ownerUserId: string): Promise<CareerTarget[]> {
  const { data, error } = await client.from("career_targets").select(SELECT)
    .eq("owner_user_id", ownerUserId).order("is_active", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as TargetRow[]).map(mapTarget);
}

export async function saveCareerTarget(
  client: SupabaseClient,
  ownerUserId: string,
  rawInput: CreateCareerTargetInput,
): Promise<CareerTarget> {
  const input = canonicalizeCareerTargetInput(rawInput);
  const semanticKey = careerTargetSemanticKey(input);
  const { data, error } = await client.rpc("cv_engine_save_career_target", {
    p_semantic_key: semanticKey,
    p_target_role: input.targetRole,
    p_job_family: input.jobFamily ?? "",
    p_preferred_seniorities: input.preferredSeniorities,
    p_preferred_locations: input.preferredLocations,
    p_work_models: input.workModels,
    p_employment_types: input.employmentTypes,
    p_industries: input.industries,
    p_relocation_preference: input.relocationPreference,
    p_priority: input.priority,
    p_activate: input.activate,
  });
  if (error) throw error;
  const receipt = Array.isArray(data) ? data[0] : data;
  if (typeof receipt?.target_id !== "string") throw new Error("CAREER_TARGET_SAVE_RECEIPT_INVALID");
  const target = await loadTarget(client, ownerUserId, receipt.target_id);
  if (!target) throw new Error("CAREER_TARGET_SAVE_READBACK_FAILED");
  return target;
}

export async function activateCareerTarget(
  client: SupabaseClient,
  ownerUserId: string,
  targetId: string,
): Promise<CareerTarget> {
  const { error } = await client.rpc("cv_engine_activate_career_target", { p_target_id: targetId });
  if (error) throw error;
  const target = await loadTarget(client, ownerUserId, targetId);
  if (!target) throw new Error("CAREER_TARGET_NOT_FOUND");
  return target;
}
