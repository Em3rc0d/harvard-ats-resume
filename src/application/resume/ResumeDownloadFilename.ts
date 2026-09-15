const FALLBACK_RESUME_FILENAME_BASE = "CV_Optimizado";
const MAX_CANDIDATE_FILENAME_CHARS = 80;

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function candidateDisplayName(generatedDocumentJson: Record<string, unknown> | null) {
  const header = objectRecord(generatedDocumentJson?.header);
  const displayName = objectRecord(header?.displayName);
  return typeof displayName?.text === "string" ? displayName.text.trim() : "";
}

function sanitizeFilenameSegment(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_CANDIDATE_FILENAME_CHARS)
    .replace(/_+$/g, "");
}

/**
 * Keeps internal run UUIDs out of user-facing downloads. The candidate name is
 * sourced only from the already fact-checked generated document header and is
 * normalized to a portable ASCII filename segment for Content-Disposition.
 */
export function resumeDownloadBaseName(generatedDocumentJson: Record<string, unknown> | null) {
  const candidate = sanitizeFilenameSegment(candidateDisplayName(generatedDocumentJson));
  return candidate ? `${candidate}_CV` : FALLBACK_RESUME_FILENAME_BASE;
}
