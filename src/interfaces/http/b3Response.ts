import { NextResponse } from "next/server";
import { AuthenticationRequiredError } from "../../application/auth/requireAuthenticatedUser";

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "UNKNOWN_ERROR";
}

export function b3ApiError(error: unknown) {
  if (error instanceof AuthenticationRequiredError) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const message = messageOf(error);
  if (message.includes("JOB_SNAPSHOT_NOT_FOUND")) return NextResponse.json({ error: "JOB_SNAPSHOT_NOT_FOUND" }, { status: 404 });
  if (message.includes("JOB_REQUIREMENTS_MISSING")) return NextResponse.json({ error: "JOB_REQUIREMENTS_MISSING" }, { status: 422 });
  if (message.includes("CAREER_EVIDENCE_MISSING")) return NextResponse.json({ error: "CAREER_EVIDENCE_MISSING" }, { status: 422 });
  if (message.includes("B3_REQUIREMENT_") || message.includes("B3_SUPPORT_")) {
    return NextResponse.json({ error: "ASSESSMENT_INTEGRITY_REJECTED" }, { status: 422 });
  }
  if (message.includes("SUPABASE_PUBLIC_CONFIG_MISSING")) return NextResponse.json({ error: "DURABLE_STORE_NOT_CONFIGURED" }, { status: 503 });
  return NextResponse.json({ error: "B3_ASSESSMENT_FAILED" }, { status: 500 });
}
