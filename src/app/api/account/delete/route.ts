import { NextResponse } from "next/server";
import { requireAuthenticatedSupabaseContext } from "../../../../application/auth/requireAuthenticatedUser";

const CONFIRMATION = "DELETE_MY_ACCOUNT";

export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => null)) as { confirmation?: unknown } | null;
  if (!body || body.confirmation !== CONFIRMATION) {
    return NextResponse.json({ error: "B8_DELETE_CONFIRMATION_REQUIRED" }, { status: 400 });
  }

  try {
    const { client } = await requireAuthenticatedSupabaseContext();
    const result = await client.rpc("cv_engine_delete_account");
    if (result.error) throw new Error(`B8_ACCOUNT_DELETE_FAILED:${result.error.message}`);
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    return NextResponse.json(
      { deleted: result.data === true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "B8_ACCOUNT_DELETE_FAILED";
    return NextResponse.json({ error: message }, { status: message.includes("AUTH") ? 401 : 500 });
  }
}
