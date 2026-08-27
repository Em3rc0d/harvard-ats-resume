import { NextResponse } from "next/server";
import { AuthenticationRequiredError } from "../../application/auth/requireAuthenticatedUser";

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "UNKNOWN_ERROR";
}

export function careerApiError(error: unknown) {
  if (error instanceof AuthenticationRequiredError) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const message = messageOf(error);

  if (message.includes("CAREER_EVIDENCE_REVISION_CONFLICT")) {
    return NextResponse.json({ error: "CAREER_EVIDENCE_REVISION_CONFLICT" }, { status: 409 });
  }

  if (message.includes("CAREER_EVIDENCE_NOT_FOUND")) {
    return NextResponse.json({ error: "CAREER_EVIDENCE_NOT_FOUND" }, { status: 404 });
  }

  if (message.includes("SUPABASE_PUBLIC_CONFIG_MISSING")) {
    return NextResponse.json({ error: "DURABLE_STORE_NOT_CONFIGURED" }, { status: 503 });
  }

  return NextResponse.json({ error: "CAREER_EVIDENCE_PERSISTENCE_FAILED" }, { status: 500 });
}
