import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedSupabaseContext } from "../../../application/auth/requireAuthenticatedUser";
import {
  captureMarketObservation,
  listOpportunitySpace,
  selectOpportunity,
} from "../../../application/opportunities/OpportunitySpaceRepository";

const MutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("CAPTURE"), jobSnapshotId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("SELECT"), marketObservationId: z.string().uuid() }).strict(),
]);

export async function GET() {
  try {
    const { user, client } = await requireAuthenticatedSupabaseContext();
    return NextResponse.json(await listOpportunitySpace(client, user.userId), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ error: "OPPORTUNITY_SPACE_LOAD_FAILED" }, { status: 500, headers: { "Cache-Control": "private, no-store" } });
  }
}

export async function POST(request: Request) {
  const parsed = MutationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_OPPORTUNITY_SPACE_MUTATION", issues: parsed.error.issues }, { status: 400 });

  try {
    const { user, client } = await requireAuthenticatedSupabaseContext();
    if (parsed.data.action === "CAPTURE") {
      const observation = await captureMarketObservation(client, user.userId, parsed.data.jobSnapshotId);
      return NextResponse.json({ observation }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
    }
    const item = await selectOpportunity(client, user.userId, parsed.data.marketObservationId);
    return NextResponse.json({ item }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "OPPORTUNITY_SPACE_MUTATION_FAILED";
    if (message.includes("ASSESSMENT_REQUIRED_BEFORE_SELECTION")) {
      return NextResponse.json({ error: "ASSESSMENT_REQUIRED_BEFORE_SELECTION" }, { status: 409 });
    }
    if (message.includes("NOT_FOUND")) return NextResponse.json({ error: "OPPORTUNITY_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ error: "OPPORTUNITY_SPACE_MUTATION_FAILED" }, { status: 500 });
  }
}
