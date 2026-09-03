import { NextResponse } from "next/server";
import { requireAuthenticatedSupabaseContext } from "../../../../application/auth/requireAuthenticatedUser";

export async function GET() {
  try {
    const { client } = await requireAuthenticatedSupabaseContext();
    const result = await client.rpc("cv_engine_export_account");
    if (result.error) throw new Error(`B8_ACCOUNT_EXPORT_FAILED:${result.error.message}`);
    return NextResponse.json(
      { export: result.data },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "B8_ACCOUNT_EXPORT_FAILED";
    return NextResponse.json({ error: message }, { status: message.includes("AUTH") ? 401 : 500 });
  }
}
