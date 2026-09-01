import { NextResponse } from "next/server";
import { requireAuthenticatedSupabaseContext } from "../../../application/auth/requireAuthenticatedUser";
import { createResumeVersion, listResumeVersions } from "../../../application/resume/ResumeVersionRepository";
import { CreateResumeVersionInputSchema } from "../../../domain/resume/ResumeVersion";
import { b4ApiError } from "../../../interfaces/http/b4Response";

export async function GET() {
  try {
    const { user, client } = await requireAuthenticatedSupabaseContext();
    const resumes = await listResumeVersions(client, user.userId);
    return NextResponse.json({ resumes }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return b4ApiError(error);
  }
}

export async function POST(request: Request) {
  const parsed = CreateResumeVersionInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_RESUME_VERSION_INPUT", issues: parsed.error.issues }, { status: 400 });
  try {
    const { user, client } = await requireAuthenticatedSupabaseContext();
    const resume = await createResumeVersion(client, user.userId, parsed.data);
    return NextResponse.json({ resume }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return b4ApiError(error);
  }
}
