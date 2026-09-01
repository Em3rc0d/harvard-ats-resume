import { NextResponse } from "next/server";
import { AuthenticationRequiredError } from "../../application/auth/requireAuthenticatedUser";

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "UNKNOWN_ERROR";
}

export function b4ApiError(error: unknown) {
  if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const message = messageOf(error);
  if (message.includes("JOB_SNAPSHOT_NOT_FOUND")) return NextResponse.json({ error: "JOB_SNAPSHOT_NOT_FOUND" }, { status: 404 });
  if (message.includes("B4_RESUME_NOT_FOUND")) return NextResponse.json({ error: "RESUME_VERSION_NOT_FOUND" }, { status: 404 });
  if (message.includes("B4_VERIFIED_EVIDENCE_MISSING")) return NextResponse.json({ error: "VERIFIED_EVIDENCE_REQUIRED" }, { status: 422 });
  if (message.includes("CAREER_EVIDENCE_MISSING") || message.includes("JOB_REQUIREMENTS_MISSING")) return NextResponse.json({ error: "ASSESSMENT_INPUTS_INCOMPLETE" }, { status: 422 });
  if (message.includes("B4_EVIDENCE_") || message.includes("B4_SOURCE_") || message.includes("B4_CLAIM_") || message.includes("B4_RESUME_ARTIFACT_")) {
    return NextResponse.json({ error: "RESUME_INTEGRITY_REJECTED" }, { status: 422 });
  }
  if (message.includes("SUPABASE_PUBLIC_CONFIG_MISSING")) return NextResponse.json({ error: "DURABLE_STORE_NOT_CONFIGURED" }, { status: 503 });
  return NextResponse.json({ error: "B4_RESUME_FAILED" }, { status: 500 });
}
