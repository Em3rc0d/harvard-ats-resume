import { NextResponse } from "next/server";
import { AuthenticationRequiredError } from "../../application/auth/requireAuthenticatedUser";

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "UNKNOWN_ERROR";
}

export function b5ApiError(error: unknown) {
  if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const message = messageOf(error);
  if (message.includes("B5_IMPORT_RECEIPT_NOT_FOUND") || message.includes("IMPORT_PROPOSAL_NOT_FOUND") || message.includes("B5_IMPORT_PROPOSAL_NOT_FOUND")) {
    return NextResponse.json({ error: "IMPORT_RESOURCE_NOT_FOUND" }, { status: 404 });
  }
  if (message.includes("B5_IMPORT_PROPOSAL_ALREADY_RESOLVED")) return NextResponse.json({ error: "IMPORT_PROPOSAL_ALREADY_RESOLVED" }, { status: 409 });
  if (message.includes("B5_") || message.includes("IMPORT_")) return NextResponse.json({ error: "IMPORT_CONTRACT_REJECTED" }, { status: 422 });
  if (message.includes("SUPABASE_PUBLIC_CONFIG_MISSING")) return NextResponse.json({ error: "DURABLE_STORE_NOT_CONFIGURED" }, { status: 503 });
  return NextResponse.json({ error: "B5_IMPORT_FAILED" }, { status: 500 });
}
