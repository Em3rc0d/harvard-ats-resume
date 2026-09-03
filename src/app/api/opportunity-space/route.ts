import { NextResponse } from "next/server";
import { AuthenticationRequiredError, requireAuthenticatedSupabaseContext } from "../../../application/auth/requireAuthenticatedUser";
import {
  captureMarketObservation,
  listOpportunitySpace,
  selectOpportunity,
} from "../../../application/opportunities/OpportunitySpaceRepository";
import { z } from "zod";

const MutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("CAPTURE"), jobSnapshotId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("SELECT"), marketObservationId: z.string().uuid() }).strict(),
]);

function opportunitySpaceError(error: unknown) {
  if (error instanceof AuthenticationRequiredError) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  }

  const message = error instanceof Error ? error.message : "OPPORTUNITY_SPACE_FAILED";
  if (message.includes("SUPABASE_PUBLIC_CONFIG_MISSING")) {
    return NextResponse.json({ error: "DURABLE_STORE_NOT_CONFIGURED" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
  if (message.includes("ASSESSMENT_REQUIRED_BEFORE_SELECTION")) {
    return NextResponse.json({ error: "ASSESSMENT_REQUIRED_BEFORE_SELECTION" }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
  }
  if (message.includes("NOT_FOUND")) {
    return NextResponse.json({ error: "OPPORTUNITY_NOT_FOUND" }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  }
  return NextResponse.json({ error: "OPPORTUNITY_SPACE_FAILED" }, { status: 500, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET() {
  try {
    const { user, client } = await requireAuthenticatedSupabaseContext();
    return NextResponse.json(await listOpportunitySpace(client, user.userId), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return opportunitySpaceError(error);
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
    return opportunitySpaceError(error);
  }
}
