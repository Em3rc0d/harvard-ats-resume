import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedSupabaseContext } from "../../../../application/auth/requireAuthenticatedUser";
import { loadResumeArtifact } from "../../../../application/resume/ResumeArtifactRepository";

const IdSchema = z.string().uuid();
type RouteContext = { params: Promise<{ resumeArtifactId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const parsed = IdSchema.safeParse((await params).resumeArtifactId);
  if (!parsed.success) return NextResponse.json({ error: "INVALID_RESUME_ARTIFACT_ID" }, { status: 400 });
  try {
    const { user, client } = await requireAuthenticatedSupabaseContext();
    const artifact = await loadResumeArtifact(client, user.userId, parsed.data);
    return NextResponse.json({ artifact }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("B9_RESUME_ARTIFACT_NOT_FOUND")) return NextResponse.json({ error: "RESUME_ARTIFACT_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ error: "RESUME_ARTIFACT_OPERATION_FAILED" }, { status: 500 });
  }
}
