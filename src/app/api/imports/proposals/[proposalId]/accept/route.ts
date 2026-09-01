import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedSupabaseContext } from "../../../../../../application/auth/requireAuthenticatedUser";
import { acceptImportProposal } from "../../../../../../application/import/ImportRepository";
import { AcceptImportProposalInputSchema } from "../../../../../../domain/import/Import";
import { b5ApiError } from "../../../../../../interfaces/http/b5Response";

const ProposalIdSchema = z.string().uuid();
type RouteContext = { params: Promise<{ proposalId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const { proposalId: rawProposalId } = await params;
  const proposalId = ProposalIdSchema.safeParse(rawProposalId);
  const input = AcceptImportProposalInputSchema.safeParse(await request.json().catch(() => null));
  if (!proposalId.success) return NextResponse.json({ error: "INVALID_IMPORT_PROPOSAL_ID" }, { status: 400 });
  if (!input.success) return NextResponse.json({ error: "INVALID_IMPORT_ACCEPT_INPUT", issues: input.error.issues }, { status: 400 });
  try {
    const { user, client } = await requireAuthenticatedSupabaseContext();
    const result = await acceptImportProposal(client, user.userId, proposalId.data, input.data.kind);
    return NextResponse.json(result, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return b5ApiError(error);
  }
}
