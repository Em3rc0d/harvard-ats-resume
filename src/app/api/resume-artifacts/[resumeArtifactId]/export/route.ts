import { NextResponse } from "next/server";
import { requireAuthenticatedSupabaseContext } from "../../../../../application/auth/requireAuthenticatedUser";
import { loadResumeArtifact } from "../../../../../application/resume/ResumeArtifactRepository";
import { renderResumeArtifactProvenanceJson, renderResumeArtifactText } from "../../../../../application/resume/ResumeArtifactRenderer";

type RouteContext = { params: Promise<{ resumeArtifactId: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const { resumeArtifactId } = await params;
  const format = new URL(request.url).searchParams.get("format") ?? "text";
  if (!/^[0-9a-f-]{36}$/i.test(resumeArtifactId)) return NextResponse.json({ error: "INVALID_RESUME_ARTIFACT_ID" }, { status: 400 });
  if (format !== "text" && format !== "json") return NextResponse.json({ error: "UNSUPPORTED_RESUME_ARTIFACT_FORMAT" }, { status: 400 });

  try {
    const { user, client } = await requireAuthenticatedSupabaseContext();
    const artifact = await loadResumeArtifact(client, user.userId, resumeArtifactId);
    if (format === "json") {
      return new NextResponse(renderResumeArtifactProvenanceJson(artifact), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="cvengine-${artifact.id}-provenance.json"`,
          "Cache-Control": "private, no-store",
        },
      });
    }
    return new NextResponse(renderResumeArtifactText(artifact), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="cvengine-${artifact.id}.txt"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("B9_RESUME_ARTIFACT_NOT_FOUND")) return NextResponse.json({ error: "RESUME_ARTIFACT_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ error: "RESUME_ARTIFACT_EXPORT_FAILED" }, { status: 500 });
  }
}
