import { NextResponse } from "next/server";
import { requireAuthenticatedSupabaseContext } from "../../../../../application/auth/requireAuthenticatedUser";
import { loadResumeArtifact } from "../../../../../application/resume/ResumeArtifactRepository";
import {
  renderResumeArtifactDocx,
  renderResumeArtifactPdf,
  renderResumeArtifactProvenanceJson,
  renderResumeArtifactText,
} from "../../../../../application/resume/ResumeArtifactRenderer";

type RouteContext = { params: Promise<{ resumeArtifactId: string }> };
type Format = "text" | "json" | "docx" | "pdf";

const MIME: Record<Format, string> = {
  text: "text/plain; charset=utf-8",
  json: "application/json; charset=utf-8",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
};

export async function GET(request: Request, { params }: RouteContext) {
  const { resumeArtifactId } = await params;
  const format = (new URL(request.url).searchParams.get("format") ?? "text") as Format;
  if (!/^[0-9a-f-]{36}$/i.test(resumeArtifactId)) return NextResponse.json({ error: "INVALID_RESUME_ARTIFACT_ID" }, { status: 400 });
  if (!(format in MIME)) return NextResponse.json({ error: "UNSUPPORTED_RESUME_ARTIFACT_FORMAT" }, { status: 400 });

  try {
    const { user, client } = await requireAuthenticatedSupabaseContext();
    const artifact = await loadResumeArtifact(client, user.userId, resumeArtifactId);
    const suffix = format === "json" ? "-provenance.json" : format === "text" ? ".txt" : `.${format}`;
    const body = format === "json"
      ? renderResumeArtifactProvenanceJson(artifact)
      : format === "text"
        ? renderResumeArtifactText(artifact)
        : format === "docx"
          ? renderResumeArtifactDocx(artifact)
          : renderResumeArtifactPdf(artifact);

    return new NextResponse(body, {
      headers: {
        "Content-Type": MIME[format],
        "Content-Disposition": `attachment; filename="cvengine-${artifact.id}${suffix}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("B9_RESUME_ARTIFACT_NOT_FOUND")) return NextResponse.json({ error: "RESUME_ARTIFACT_NOT_FOUND" }, { status: 404 });
    if (message.includes("B9_PDF_UNSUPPORTED_CHARACTER")) {
      return NextResponse.json({ error: "PDF_CHARACTER_SET_UNSUPPORTED" }, { status: 422 });
    }
    return NextResponse.json({ error: "RESUME_ARTIFACT_EXPORT_FAILED" }, { status: 500 });
  }
}
