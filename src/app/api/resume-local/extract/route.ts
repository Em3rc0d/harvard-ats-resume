import { NextResponse } from "next/server";
import { requireAuthenticatedSupabaseContext } from "../../../../application/auth/requireAuthenticatedUser";
import { extractResumeMechanically } from "../../../../application/import/ResumeExtractor";

export const runtime = "nodejs";

const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const PDF_MIME = "application/pdf";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function POST(request: Request) {
  await requireAuthenticatedSupabaseContext();
  const formData = await request.formData();
  const value = formData.get("file");
  if (!(value instanceof File)) return NextResponse.json({ error: "RESUME_FILE_REQUIRED" }, { status: 400 });
  if (value.size === 0) return NextResponse.json({ error: "EMPTY_FILE" }, { status: 422 });
  if (value.size > MAX_SOURCE_BYTES) return NextResponse.json({ error: "SOURCE_TOO_LARGE" }, { status: 413 });

  const lower = value.name.toLowerCase();
  const supported =
    value.type === PDF_MIME ||
    value.type === DOCX_MIME ||
    lower.endsWith(".pdf") ||
    lower.endsWith(".docx");
  if (!supported) return NextResponse.json({ error: "SUPPORTED_FORMATS_ARE_PDF_AND_DOCX" }, { status: 415 });

  const buffer = Buffer.from(await value.arrayBuffer());
  const extraction = extractResumeMechanically(buffer, value.name, value.type);
  if (extraction.status !== "EXTRACTED" || extraction.text.trim().length === 0) {
    return NextResponse.json({ error: "SOURCE_UNREADABLE" }, { status: 422 });
  }

  return NextResponse.json(
    {
      sourceText: extraction.text,
      mediaType: extraction.mediaType,
      extractorVersion: extraction.extractorVersion,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
