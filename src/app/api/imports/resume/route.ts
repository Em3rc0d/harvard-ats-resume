import { NextResponse } from "next/server";
import { requireAuthenticatedSupabaseContext } from "../../../../application/auth/requireAuthenticatedUser";
import { listImportReceipts, recordResumeImport } from "../../../../application/import/ImportRepository";
import { createImportLineProposals, extractResumeMechanically, sha256Text } from "../../../../application/import/ResumeExtractor";
import { b5ApiError } from "../../../../interfaces/http/b5Response";

export const runtime = "nodejs";

const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const PDF_MIME = "application/pdf";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function classifyUpload(file: File) {
  const name = file.name.toLowerCase();
  const byName = name.endsWith(".pdf") ? "PDF" : name.endsWith(".docx") ? "DOCX" : null;
  const byMime = file.type === PDF_MIME ? "PDF" : file.type === DOCX_MIME ? "DOCX" : null;
  if (!byName && !byMime) return null;
  if (byName && byMime && byName !== byMime) return null;
  return byName ?? byMime;
}

export async function GET() {
  try {
    const { user, client } = await requireAuthenticatedSupabaseContext();
    const imports = await listImportReceipts(client, user.userId);
    return NextResponse.json({ imports }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return b5ApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user, client } = await requireAuthenticatedSupabaseContext();
    const formData = await request.formData();
    const value = formData.get("file");
    if (!(value instanceof File)) return NextResponse.json({ error: "RESUME_FILE_REQUIRED" }, { status: 400 });
    if (value.size === 0) return NextResponse.json({ error: "EMPTY_FILE" }, { status: 422 });
    if (value.size > MAX_SOURCE_BYTES) return NextResponse.json({ error: "SOURCE_TOO_LARGE", maxBytes: MAX_SOURCE_BYTES }, { status: 413 });
    const mediaType = classifyUpload(value);
    if (!mediaType) return NextResponse.json({ error: "SUPPORTED_FORMATS_ARE_PDF_AND_DOCX" }, { status: 415 });

    const sourceBuffer = Buffer.from(await value.arrayBuffer());
    const extraction = extractResumeMechanically(sourceBuffer, value.name, value.type);
    if (extraction.mediaType !== mediaType) return NextResponse.json({ error: "MEDIA_TYPE_MISMATCH" }, { status: 422 });
    const proposals = extraction.status === "EXTRACTED" ? createImportLineProposals(extraction.text) : [];
    const receipt = await recordResumeImport(client, user.userId, {
      sourceName: value.name.slice(0, 255),
      mediaType,
      sourceSizeBytes: sourceBuffer.length,
      sourceSha256: sha256Text(sourceBuffer),
      extractedTextSha256: extraction.status === "EXTRACTED" ? sha256Text(extraction.text) : null,
      status: extraction.status,
      warningCode: extraction.warningCode,
      proposals,
    });

    return NextResponse.json({
      receipt,
      manualFallbackRequired: receipt.status !== "EXTRACTED",
      sourceBytesPersisted: false,
    }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return b5ApiError(error);
  }
}
