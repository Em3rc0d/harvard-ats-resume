import { NextResponse } from "next/server";
import { requireAuthenticatedSupabaseContext } from "../../../../application/auth/requireAuthenticatedUser";
import { b8AccountLifecycleError } from "../../../../interfaces/http/b8AccountResponse";

export async function GET() {
  try {
    const { client } = await requireAuthenticatedSupabaseContext();
    const result = await client.rpc("cv_engine_export_account");
    if (result.error) throw new Error("B8_ACCOUNT_EXPORT_RPC_FAILED");
    return NextResponse.json(
      { export: result.data },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return b8AccountLifecycleError(error, "EXPORT");
  }
}
