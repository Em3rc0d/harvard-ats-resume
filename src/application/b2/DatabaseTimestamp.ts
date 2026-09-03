export function normalizeB2DatabaseTimestamp(value: string): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error("B2_READBACK_INVALID_TIMESTAMP");
  }
  return timestamp.toISOString();
}
