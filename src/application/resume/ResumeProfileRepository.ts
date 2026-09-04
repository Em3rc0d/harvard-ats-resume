import type { SupabaseClient } from "@supabase/supabase-js";
import { ResumeProfileSchema, type ResumeProfile, type UpsertResumeProfileInput } from "../../domain/resume/ResumeProfile";

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`B9_RESUME_PROFILE_READBACK_INVALID_${field}`);
  return value;
}

export async function loadResumeProfile(client: SupabaseClient, ownerUserId: string): Promise<ResumeProfile | null> {
  const profileResult = await client
    .from("resume_profiles")
    .select("current_revision")
    .eq("owner_user_id", ownerUserId)
    .maybeSingle();
  if (profileResult.error) throw new Error(`B9_RESUME_PROFILE_READ_FAILED:${profileResult.error.message}`);
  if (!profileResult.data) return null;

  const revision = Number(profileResult.data.current_revision);
  const revisionResult = await client
    .from("resume_profile_revisions")
    .select("*")
    .eq("owner_user_id", ownerUserId)
    .eq("revision_number", revision)
    .maybeSingle();
  if (revisionResult.error) throw new Error(`B9_RESUME_PROFILE_REVISION_READ_FAILED:${revisionResult.error.message}`);
  if (!revisionResult.data) throw new Error("B9_RESUME_PROFILE_CURRENT_REVISION_MISSING");

  const row = revisionResult.data as Record<string, unknown>;
  return ResumeProfileSchema.parse({
    ownerUserId: requiredString(row.owner_user_id, "OWNER"),
    revision: row.revision_number,
    displayName: row.display_name,
    headline: row.headline ?? null,
    location: row.location ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    links: Array.isArray(row.links_json) ? row.links_json : [],
    semanticSha256: row.semantic_sha256,
    createdAt: new Date(requiredString(row.created_at, "CREATED_AT")).toISOString(),
  });
}

export async function saveResumeProfile(
  client: SupabaseClient,
  ownerUserId: string,
  input: UpsertResumeProfileInput,
): Promise<ResumeProfile> {
  const result = await client.rpc("cv_engine_upsert_resume_profile", {
    p_display_name: input.displayName,
    p_headline: input.headline,
    p_location: input.location,
    p_email: input.email,
    p_phone: input.phone,
    p_links: input.links,
  });
  if (result.error) throw new Error(`B9_RESUME_PROFILE_SAVE_FAILED:${result.error.message}`);
  return (await loadResumeProfile(client, ownerUserId)) ?? (() => { throw new Error("B9_RESUME_PROFILE_SAVE_EMPTY"); })();
}
