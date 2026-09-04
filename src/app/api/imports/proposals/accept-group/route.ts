import { NextResponse } from "next/server";
import { requireAuthenticatedSupabaseContext } from "../../../../../application/auth/requireAuthenticatedUser";
import { acceptImportProposalGroup } from "../../../../../application/import/ImportRepository";
import { AcceptImportProposalGroupInputSchema } from "../../../../../domain/import/Import";
import { b5ApiError } from "../../../../../interfaces/http/b5Response";

export async function POST(request: Request) {
  const input = AcceptImportProposalGroupInputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ error: "INVALID_IMPORT_GROUP_ACCEPT_INPUT", issues: input.error.issues }, { status: 400 });
  }
  try {
    const { user, client } = await requireAuthenticatedSupabaseContext();
    const result = await acceptImportProposalGroup(client, user.userId, input.data.proposalIds, input.data.kind);
    return NextResponse.json(result, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return b5ApiError(error);
  }
}
