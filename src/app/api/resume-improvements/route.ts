import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import type { CredentialMode } from "../../../domain/ai/AICapability";
import { GeminiCredentialInputSchema, type AIAccessMode } from "../../../domain/ai/AIAccess";
import { CURRENT_TRUST_DISCLOSURE_VERSION } from "../../../domain/trust/FirstRunTrust";
import { requireAuthenticatedSupabaseContext } from "../../../application/auth/requireAuthenticatedUser";
import { understandResumeSemantics } from "../../../application/import/ResumeSemanticUnderstandingService";
import { createImportLineProposals, extractResumeMechanically, sha256Text } from "../../../application/import/ResumeExtractor";
import { recordResumeImport } from "../../../application/import/ImportRepository";
import { improveResumeHolistically } from "../../../application/resume/HolisticResumeEditorService";
import { guardAndRepairResume } from "../../../application/resume/FactGuardianService";
import { listResumeImprovementRuns, loadResumeImprovementRun, recordResumeImprovementRun } from "../../../application/resume/ResumeImprovementRunRepository";
import { renderResumeImprovementRunArtifact } from "../../../application/resume/ResumeImprovementArtifactAdapter";
import type { SafeAIEvent } from "../../../application/ai/AIGatewayRuntime";

export const runtime = "nodejs";

const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const MAX_TARGET_CHARS = 15_000;
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
function jsonRecord(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
function targetHash(value: string | null) {
  return value ? createHash("sha256").update(value, "utf8").digest("hex") : null;
}
function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "V12_IMPROVEMENT_FAILED";
  console.info("CV_ENGINE_V12_IMPROVEMENT_FAILURE", message);
  const candidateCode = message.includes(":") ? message.slice(0, message.indexOf(":")) : message;
  const publicCode = candidateCode.length > 0 && (candidateCode.startsWith("V12_") || candidateCode.startsWith("SOURCE_") || candidateCode.startsWith("SEMANTIC_") || candidateCode.startsWith("FACT_"))
    ? candidateCode
    : "V12_IMPROVEMENT_FAILED";
  const status = publicCode.includes("NOT_FOUND") ? 404 : publicCode.includes("UNREADABLE") ? 422 : 502;
  return NextResponse.json({ error: publicCode }, { status, headers: { "Cache-Control": "private, no-store" } });
}

async function resolveAIConfig(request: Request, client: Awaited<ReturnType<typeof requireAuthenticatedSupabaseContext>>["client"], ownerUserId: string) {
  const consent = await client
    .from("consent_receipts")
    .select("ai_access_mode_preference, acknowledged_at")
    .eq("owner_user_id", ownerUserId)
    .eq("disclosure_version", CURRENT_TRUST_DISCLOSURE_VERSION)
    .order("acknowledged_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (consent.error) throw new Error("V12_AI_ACCESS_LOOKUP_FAILED");
  const accessMode = (consent.data?.ai_access_mode_preference as AIAccessMode | null | undefined) ?? null;
  if (accessMode === null) throw new Error("V12_AI_ACCESS_REQUIRED");
  const suppliedByok = accessMode === "BYOK_GEMINI" ? request.headers.get("x-cvengine-byok-key") : null;
  const parsedByok = accessMode === "BYOK_GEMINI" ? GeminiCredentialInputSchema.safeParse(suppliedByok) : null;
  const byokGeminiKey = parsedByok?.success ? parsedByok.data : null;
  if (accessMode === "BYOK_GEMINI" && !byokGeminiKey) throw new Error("V12_BYOK_REQUIRED");
  const production = process.env.NODE_ENV === "production";
  const configuredOllamaUrl = process.env.OLLAMA_BASE_URL?.trim() || null;
  if (accessMode === "NO_CLOUD_AI" && production && configuredOllamaUrl === null) throw new Error("V12_AI_PROVIDER_UNAVAILABLE");
  return {
    credentialMode: credentialModeForAccess(accessMode),
    platformGeminiKey: process.env.GEMINI_API_KEY?.trim() || null,
    byokGeminiKey,
    geminiBaseUrl: process.env.GEMINI_API_BASE_URL?.trim() || "https://generativelanguage.googleapis.com",
    ollamaBaseUrl: configuredOllamaUrl || (production ? "http://127.0.0.1:9" : "http://127.0.0.1:11434"),
    ollamaApiKey: process.env.OLLAMA_API_KEY?.trim() || null,
    logger: safeLogger,
  } as const;
}

export async function POST(request: Request) {
  try {
    const { user, client } = await requireAuthenticatedSupabaseContext();
    const formData = await request.formData();
    const fileValue = formData.get("file");
    if (!(fileValue instanceof File)) return NextResponse.json({ error: "RESUME_FILE_REQUIRED" }, { status: 400 });
    if (fileValue.size === 0) return NextResponse.json({ error: "EMPTY_FILE" }, { status: 422 });
    if (fileValue.size > MAX_SOURCE_BYTES) return NextResponse.json({ error: "SOURCE_TOO_LARGE", maxBytes: MAX_SOURCE_BYTES }, { status: 413 });
    const mediaType = classifyUpload(fileValue);
    if (!mediaType) return NextResponse.json({ error: "SUPPORTED_FORMATS_ARE_PDF_AND_DOCX" }, { status: 415 });
    const targetValue = formData.get("targetText");
    const targetText = typeof targetValue === "string" && targetValue.trim().length > 0 ? targetValue.trim() : null;
    if (targetText && targetText.length > MAX_TARGET_CHARS) return NextResponse.json({ error: "TARGET_TEXT_TOO_LARGE", maxChars: MAX_TARGET_CHARS }, { status: 413 });

    const sourceBuffer = Buffer.from(await fileValue.arrayBuffer());
    const extraction = extractResumeMechanically(sourceBuffer, fileValue.name, fileValue.type);
    if (extraction.mediaType !== mediaType) return NextResponse.json({ error: "MEDIA_TYPE_MISMATCH" }, { status: 422 });
    const proposals = extraction.status === "EXTRACTED" ? createImportLineProposals(extraction.text) : [];
    const receipt = await recordResumeImport(client, user.userId, {
      sourceName: fileValue.name.slice(0, 255),
      mediaType,
      sourceSizeBytes: sourceBuffer.length,
      sourceSha256: sha256Text(sourceBuffer),
      extractedTextSha256: extraction.status === "EXTRACTED" ? sha256Text(extraction.text) : null,
      status: extraction.status,
      warningCode: extraction.warningCode,
      proposals,
    });
    if (receipt.status !== "EXTRACTED" || receipt.proposals.length === 0) throw new Error("SOURCE_UNREADABLE");

    const aiConfig = await resolveAIConfig(request, client, user.userId);
    const semantic = await understandResumeSemantics(receipt, aiConfig);
    if (!semantic.ok) throw new Error(`SEMANTIC_UNDERSTANDING_FAILED:${semantic.failureCode}`);
    const editor = await improveResumeHolistically(semantic.document, targetText, aiConfig);
    if (!editor.ok) throw new Error(`V12_EDITOR_FAILED:${editor.failureCode}`);
    const guarded = await guardAndRepairResume(semantic.document, editor.document, aiConfig);
    if (!guarded.ok) throw new Error(`FACT_GUARD_REJECTED:${guarded.failureCode}`);

    const status = semantic.warnings.length > 0 || editor.warnings.length > 0 || guarded.report.decision === "REPAIRED_PASS"
      ? "PARTIALLY_IMPROVED"
      : "IMPROVED";
    const run = await recordResumeImprovementRun(client, user.userId, {
      sourceReceiptId: receipt.id,
      semanticDocumentJson: jsonRecord(semantic.document),
      editorProvenanceJson: jsonRecord(editor.provenance),
      generatedDocumentJson: jsonRecord(guarded.document),
      guardianReportJson: jsonRecord(guarded.report),
      status,
      targetTextHash: targetHash(targetText),
    });
    const artifact = renderResumeImprovementRunArtifact(run);
    const finalPass = guarded.report.passes.at(-1);
    const unsupportedNewClaims = finalPass?.findings.filter((finding) => finding.classification === "UNSUPPORTED_NEW_CLAIM" || finding.classification === "POSSIBLE_NEW_CLAIM").length ?? 0;
    const changes = [
      guarded.document.summary ? "Professional summary reviewed" : null,
      guarded.document.experience.length > 0 ? "Experience wording and structure reviewed" : null,
      guarded.report.decision === "REPAIRED_PASS" ? "Unsafe wording reverted to source-supported text" : "Candidate facts passed the independent Fact Guardian",
      "ATS-safe single-column output rendered",
    ].filter((value): value is string => value !== null);

    return NextResponse.json({
      runId: run.id,
      status: run.status,
      sourceReceiptId: receipt.id,
      unsupportedNewClaims,
      changes,
      review: {
        originalText: receipt.proposals.map((proposal) => proposal.canonicalText).join("\n"),
        improvedText: artifact.text,
      },
      downloads: {
        docx: `/api/resume-improvements?runId=${encodeURIComponent(run.id)}&format=docx`,
        pdf: `/api/resume-improvements?runId=${encodeURIComponent(run.id)}&format=pdf`,
        text: `/api/resume-improvements?runId=${encodeURIComponent(run.id)}&format=text`,
        provenance: `/api/resume-improvements?runId=${encodeURIComponent(run.id)}&format=json`,
      },
    }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    const { user, client } = await requireAuthenticatedSupabaseContext();
    const url = new URL(request.url);
    const runId = url.searchParams.get("runId");
    if (!runId) {
      const runs = await listResumeImprovementRuns(client, user.userId, 20);
      return NextResponse.json({ runs: runs.map((run) => ({ id: run.id, status: run.status, sourceReceiptId: run.sourceReceiptId, createdAt: run.createdAt })) }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const run = await loadResumeImprovementRun(client, user.userId, runId);
    const bundle = renderResumeImprovementRunArtifact(run);
    const format = url.searchParams.get("format") ?? "text";
    if (format === "docx") return new Response(Buffer.from(bundle.docx), { headers: { "Content-Type": DOCX_MIME, "Content-Disposition": `attachment; filename="cvengine-${run.id}.docx"`, "Cache-Control": "private, no-store" } });
    if (format === "pdf") return new Response(Buffer.from(bundle.pdf), { headers: { "Content-Type": PDF_MIME, "Content-Disposition": `attachment; filename="cvengine-${run.id}.pdf"`, "Cache-Control": "private, no-store" } });
    if (format === "json") return new Response(bundle.provenanceJson, { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="cvengine-${run.id}-provenance.json"`, "Cache-Control": "private, no-store" } });
    if (format !== "text") return NextResponse.json({ error: "UNSUPPORTED_ARTIFACT_FORMAT" }, { status: 400 });
    return new Response(bundle.text, { headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="cvengine-${run.id}.txt"`, "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
