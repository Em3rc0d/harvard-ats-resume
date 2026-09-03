import "server-only";

import { createClient } from "@supabase/supabase-js";
import { requireSupabasePublicConfig } from "./config";

export function requireSupabaseServiceRoleKey() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY_MISSING");
  }
  return serviceRoleKey;
}

export function createSupabaseAdminClient() {
  const { url } = requireSupabasePublicConfig();
  return createClient(url, requireSupabaseServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
