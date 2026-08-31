import { NextResponse } from "next/server";
import { requireAuthenticatedSupabaseContext } from "../../../../application/auth/requireAuthenticatedUser";
import { listCareerTargets, saveCareerTarget } from "../../../../application/targets/CareerTargetRepository";
import { CreateCareerTargetInputSchema } from "../../../../domain/targets/CareerTarget";
import { b2ApiError } from "../../../../interfaces/http/b2Response";

export async function GET() {
  try {
    const { user, client } = await requireAuthenticatedSupabaseContext();
    const targets = await listCareerTargets(client, user.userId);
    return NextResponse.json({ targets }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return b2ApiError(error);
  }
}

export async function POST(request: Request) {
  const parsed = CreateCareerTargetInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_CAREER_TARGET_INPUT", issues: parsed.error.issues }, { status: 400 });
  try {
    const { user, client } = await requireAuthenticatedSupabaseContext();
    const target = await saveCareerTarget(client, user.userId, parsed.data);
    return NextResponse.json({ target }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return b2ApiError(error);
  }
}
