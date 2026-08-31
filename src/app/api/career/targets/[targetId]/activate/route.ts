import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedSupabaseContext } from "../../../../../../application/auth/requireAuthenticatedUser";
import { activateCareerTarget } from "../../../../../../application/targets/CareerTargetRepository";
import { b2ApiError } from "../../../../../../interfaces/http/b2Response";

const TargetIdSchema = z.string().uuid();
type RouteContext = { params: Promise<{ targetId: string }> };

export async function POST(_request: Request, { params }: RouteContext) {
  const { targetId } = await params;
  const parsed = TargetIdSchema.safeParse(targetId);
  if (!parsed.success) return NextResponse.json({ error: "INVALID_CAREER_TARGET_ID" }, { status: 400 });
  try {
    const { user, client } = await requireAuthenticatedSupabaseContext();
    const target = await activateCareerTarget(client, user.userId, parsed.data);
    return NextResponse.json({ target }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return b2ApiError(error);
  }
}
