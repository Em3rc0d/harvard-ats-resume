import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedSupabaseContext } from "../../../application/auth/requireAuthenticatedUser";
import { createResumeArtifact, listResumeArtifacts } from "../../../application/resume/ResumeArtifactRepository";

const InputSchema = z.object({ resumePlanId: z.string().uuid() }).strict();

function artifactApiError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("B9_RESUME_PLAN_STALE")) return NextResponse.json({ error: "RESUME_PLAN_STALE" }, { status: 409 });
  if (message.includes("B9_RESUME_PROFILE_REQUIRED")) return NextResponse.json({ error: "RESUME_PROFILE_REQUIRED" }, { status: 409 });
  if (message.includes("B9_RESUME_PLAN_NOT_FOUND")) return NextResponse.json({ error: "RESUME_PLAN_NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ error: "RESUME_ARTIFACT_OPERATION_FAILED" }, { status: 500 });
}

export async function GET() {
  try {
    const { user, client } = await requireAuthenticatedSupabaseContext();
    return NextResponse.json({ artifacts: await listResumeArtifacts(client, user.userId) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return artifactApiError(error);
  }
}

export async function POST(request: Request) {
  const parsed = InputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_RESUME_ARTIFACT_INPUT", issues: parsed.error.issues }, { status: 400 });
  try {
    const { user, client } = await requireAuthenticatedSupabaseContext();
    const artifact = await createResumeArtifact(client, user.userId, parsed.data.resumePlanId);
    return NextResponse.json({ artifact }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return artifactApiError(error);
  }
}
