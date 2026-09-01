import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedSupabaseContext } from "../../../../../application/auth/requireAuthenticatedUser";
import { loadResumeVersion } from "../../../../../application/resume/ResumeVersionRepository";
import { b4ApiError } from "../../../../../interfaces/http/b4Response";

const ResumeIdSchema = z.string().uuid();
type RouteContext = { params: Promise<{ resumeVersionId: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const { resumeVersionId: rawId } = await params;
  const resumeId = ResumeIdSchema.safeParse(rawId);
  if (!resumeId.success) return NextResponse.json({ error: "INVALID_RESUME_VERSION_ID" }, { status: 400 });
  const format = new URL(request.url).searchParams.get("format") ?? "text";
  if (format !== "text" && format !== "json") return NextResponse.json({ error: "INVALID_EXPORT_FORMAT" }, { status: 400 });
  try {
    const { user, client } = await requireAuthenticatedSupabaseContext();
    const resume = await loadResumeVersion(client, user.userId, resumeId.data);
    const safeName = `cv-engine-${resume.mode.toLowerCase()}-${resume.id}`;
    if (format === "json") {
      return new NextResponse(JSON.stringify(resume, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${safeName}.json"`,
          "Cache-Control": "private, no-store",
        },
      });
    }
    return new NextResponse(resume.plainText, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeName}.txt"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return b4ApiError(error);
  }
}
