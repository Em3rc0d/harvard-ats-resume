import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedSupabaseContext } from "../../../../../../application/auth/requireAuthenticatedUser";
import { dismissImportProposal } from "../../../../../../application/import/ImportRepository";
import { b5ApiError } from "../../../../../../interfaces/http/b5Response";

const ProposalIdSchema = z.string().uuid();
type RouteContext = { params: Promise<{ proposalId: string }> };

export async function POST(_request: Request, { params }: RouteContext) {
  const { proposalId: rawProposalId } = await params;
  const proposalId = ProposalIdSchema.safeParse(rawProposalId);
  if (!proposalId.success) return NextResponse.json({ error: "INVALID_IMPORT_PROPOSAL_ID" }, { status: 400 });
  try {
    const { user, client } = await requireAuthenticatedSupabaseContext();
    const receipt = await dismissImportProposal(client, user.userId, proposalId.data);
    return NextResponse.json({ receipt }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return b5ApiError(error);
  }
}
