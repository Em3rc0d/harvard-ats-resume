import { NextResponse } from "next/server";
import type { CredentialMode } from "../../../../domain/ai/AICapability";
import { GeminiCredentialInputSchema, type AIAccessMode } from "../../../../domain/ai/AIAccess";
import { CURRENT_TRUST_DISCLOSURE_VERSION } from "../../../../domain/trust/FirstRunTrust";
import { requireAuthenticatedSupabaseContext } from "../../../../application/auth/requireAuthenticatedUser";
import type { SafeAIEvent } from "../../../../application/ai/AIGatewayRuntime";
import {
  listImportReceipts,
  recordImportReviewStructure,
  recordResumeImport,
} from "../../../../application/import/ImportRepository";
import { createImportLineProposals, extractResumeMechanically, sha256Text } from "../../../../application/import/ResumeExtractor";
import { structureResumeImport } from "../../../../application/import/ImportStructuringService";
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

function credentialModeForAccess(mode: AIAccessMode | null): CredentialMode {
  if (mode === "PLATFORM_GEMINI") return "PLATFORM_KEY";
  if (mode === "BYOK_GEMINI") return "BYOK_REQUEST_SCOPED";
  return "NO_CLOUD_AI";
}

function safeLogger(event: SafeAIEvent) {
  console.info("CV_ENGINE_AI_EVENT", JSON.stringify(event));
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
    let receipt = await recordResumeImport(client, user.userId, {
      sourceName: value.name.slice(0, 255),
      mediaType,
      sourceSizeBytes: sourceBuffer.length,
      sourceSha256: sha256Text(sourceBuffer),
      extractedTextSha256: extraction.status === "EXTRACTED" ? sha256Text(extraction.text) : null,
      status: extraction.status,
      warningCode: extraction.warningCode,
      proposals,
    });

    if (receipt.status === "EXTRACTED" && receipt.reviewStructure === null) {
      const consent = await client
        .from("consent_receipts")
        .select("ai_access_mode_preference, acknowledged_at")
        .eq("owner_user_id", user.userId)
        .eq("disclosure_version", CURRENT_TRUST_DISCLOSURE_VERSION)
        .order("acknowledged_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const accessMode = consent.error
        ? null
        : consent.data?.ai_access_mode_preference as AIAccessMode | null | undefined ?? null;
      const suppliedByok = accessMode === "BYOK_GEMINI" ? request.headers.get("x-cvengine-byok-key") : null;
      const parsedByok = accessMode === "BYOK_GEMINI" ? GeminiCredentialInputSchema.safeParse(suppliedByok) : null;
      const byokGeminiKey = parsedByok?.success ? parsedByok.data : null;
      const production = process.env.NODE_ENV === "production";
      const configuredOllamaUrl = process.env.OLLAMA_BASE_URL?.trim() || null;
      const runtimeConfig = {
        credentialMode: credentialModeForAccess(accessMode),
        platformGeminiKey: process.env.GEMINI_API_KEY?.trim() || null,
        byokGeminiKey,
        geminiBaseUrl: process.env.GEMINI_API_BASE_URL?.trim() || "https://generativelanguage.googleapis.com",
        ollamaBaseUrl: configuredOllamaUrl || (production ? "http://127.0.0.1:9" : "http://127.0.0.1:11434"),
        ollamaApiKey: process.env.OLLAMA_API_KEY?.trim() || null,
        logger: safeLogger,
        skipProviderExecution: accessMode === null
          || (accessMode === "BYOK_GEMINI" && byokGeminiKey === null)
          || (accessMode === "NO_CLOUD_AI" && production && configuredOllamaUrl === null),
      } as const;

      const previousImports = await listImportReceipts(client, user.userId);
      let draft;
      try {
        draft = await structureResumeImport(receipt, previousImports, runtimeConfig);
      } catch (error) {
        console.info("CV_ENGINE_IMPORT_STRUCTURING_FALLBACK", error instanceof Error ? error.message : "UNKNOWN");
        draft = await structureResumeImport(receipt, previousImports, { ...runtimeConfig, skipProviderExecution: true });
      }

      receipt = await recordImportReviewStructure(client, user.userId, {
        receiptId: receipt.id,
        structureVersion: draft.structureVersion,
        status: draft.status,
        blocks: draft.blocks,
        aiRuns: draft.aiRuns,
      });
    }

    return NextResponse.json({
      receipt,
      manualFallbackRequired: receipt.status !== "EXTRACTED",
      sourceBytesPersisted: false,
      reviewMode: receipt.reviewStructure?.status ?? null,
    }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return b5ApiError(error);
  }
}
