import { NextResponse } from "next/server";
import { requireAuthenticatedSupabaseContext } from "../../../../application/auth/requireAuthenticatedUser";
import { b8AccountLifecycleError } from "../../../../interfaces/http/b8AccountResponse";

const CONFIRMATION = "DELETE_MY_ACCOUNT";

export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => null)) as { confirmation?: unknown } | null;
  if (!body || body.confirmation !== CONFIRMATION) {
    return NextResponse.json({ error: "B8_DELETE_CONFIRMATION_REQUIRED" }, { status: 400 });
  }

  try {
    const { client } = await requireAuthenticatedSupabaseContext();
    const result = await client.rpc("cv_engine_delete_account");
    if (result.error || result.data !== true) throw new Error("B8_ACCOUNT_DELETE_RPC_FAILED");
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    return NextResponse.json(
      { deleted: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return b8AccountLifecycleError(error, "DELETE");
  }
}
