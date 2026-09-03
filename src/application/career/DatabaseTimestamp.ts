export function normalizeCareerEvidenceDatabaseTimestamp(value: string): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error("CAREER_EVIDENCE_READBACK_INVALID_TIMESTAMP");
  }
  return timestamp.toISOString();
}
