import { NextResponse } from "next/server";
import { requireAuthenticatedSupabaseContext } from "../../../application/auth/requireAuthenticatedUser";
import { loadResumeProfile, saveResumeProfile } from "../../../application/resume/ResumeProfileRepository";
import { UpsertResumeProfileInputSchema } from "../../../domain/resume/ResumeProfile";

export async function GET() {
  try {
    const { user, client } = await requireAuthenticatedSupabaseContext();
    const profile = await loadResumeProfile(client, user.userId);
    return NextResponse.json({ profile }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "RESUME_PROFILE_LOAD_FAILED" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const parsed = UpsertResumeProfileInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_RESUME_PROFILE_INPUT", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const { user, client } = await requireAuthenticatedSupabaseContext();
    const profile = await saveResumeProfile(client, user.userId, parsed.data);
    return NextResponse.json({ profile }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "RESUME_PROFILE_SAVE_FAILED" }, { status: 500 });
  }
}
