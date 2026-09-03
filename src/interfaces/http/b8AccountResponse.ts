import { NextResponse } from "next/server";
import { AuthenticationRequiredError } from "../../application/auth/requireAuthenticatedUser";

type AccountLifecycleOperation = "EXPORT" | "DELETE";

export function b8AccountLifecycleError(error: unknown, operation: AccountLifecycleOperation) {
  if (error instanceof AuthenticationRequiredError) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED" },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const message = error instanceof Error ? error.message : "B8_ACCOUNT_LIFECYCLE_FAILED";
  if (message.includes("SUPABASE_PUBLIC_CONFIG_MISSING")) {
    return NextResponse.json(
      { error: "DURABLE_STORE_NOT_CONFIGURED" },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  return NextResponse.json(
    { error: operation === "EXPORT" ? "B8_ACCOUNT_EXPORT_FAILED" : "B8_ACCOUNT_DELETE_FAILED" },
    { status: 500, headers: { "Cache-Control": "private, no-store" } },
  );
}
