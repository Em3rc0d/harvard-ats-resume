import { NextResponse } from "next/server";
import { AuthenticationRequiredError } from "../../application/auth/requireAuthenticatedUser";

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "UNKNOWN_ERROR";
}

export function b2ApiError(error: unknown) {
  if (error instanceof AuthenticationRequiredError) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const message = messageOf(error);
  if (message.includes("CAREER_TARGET_NOT_FOUND")) return NextResponse.json({ error: "CAREER_TARGET_NOT_FOUND" }, { status: 404 });
  if (message.includes("JOB_REQUIREMENT_") || message.includes("JOB_DESCRIPTION_HASH_MISMATCH") || message.includes("JOB_SNAPSHOT_SEMANTIC_KEY_MISMATCH")) {
    return NextResponse.json({ error: "JOB_TRUTH_INTEGRITY_REJECTED" }, { status: 422 });
  }
  if (message.includes("SUPABASE_PUBLIC_CONFIG_MISSING")) return NextResponse.json({ error: "DURABLE_STORE_NOT_CONFIGURED" }, { status: 503 });
  return NextResponse.json({ error: "B2_PERSISTENCE_FAILED" }, { status: 500 });
}
