const UPPERCASE_SECTION_HEADINGS = [
  'PROFESSIONAL SUMMARY',
  'WORK EXPERIENCE',
  'SUMMARY',
  'EXPERIENCE',
  'EDUCATION',
  'PROJECTS',
  'CERTIFICATIONS',
  'LANGUAGES',
  'SKILLS',
] as const;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitUppercaseSectionHeadings(value: string): string {
  // Match all headings in one pass so overlapping names such as
  // PROFESSIONAL SUMMARY / SUMMARY and WORK EXPERIENCE / EXPERIENCE cannot be
  // split twice by successive replacements.
  const alternatives = UPPERCASE_SECTION_HEADINGS
    .map(escapeRegex)
    .join('|');
  const pattern = new RegExp(`(^|\\s+)(${alternatives})(?=\\s+|$)`, 'g');

  return value.replace(
    pattern,
    (_match, prefix: string, heading: string) => `${prefix ? '\n' : ''}${heading}\n`,
  );
}

/**
 * Normalizes presentation-only formatting emitted by the generation provider
 * without changing candidate facts or wording.
 *
 * The structured AI contract returns formattedResume as one JSON string. In
 * field runs, providers can occasionally serialize line breaks as literal
 * "\\n" characters or compress standard sections into a single physical line.
 * Resume composition is line-oriented, so those harmless presentation defects
 * must be repaired before provenance materialization.
 */
export function normalizeGeneratedResumeText(value: string): string {
  let normalized = value
    .replace(/\r\n?/g, '\n')
    .trim();

  if (!normalized.includes('\n') && normalized.includes('\\n')) {
    normalized = normalized.replace(/\\n/g, '\n');
  }

  // A bullet is a presentation boundary, never candidate truth. Splitting it
  // onto its own line preserves wording while making each claim independently
  // traceable.
  normalized = normalized.replace(/\s*[•●▪◦]\s*/g, '\n• ');

  // Explicit uppercase standard headings are presentation boundaries too.
  // Recover them regardless of the number of bullets already discovered so a
  // compressed real-world CV cannot keep its identity/header text fused to a
  // material summary or experience claim.
  normalized = splitUppercaseSectionHeadings(normalized);

  return normalized
    .split('\n')
    .map((line) => line.trim())
    .filter((line, index, lines) => line.length > 0 || (index > 0 && index < lines.length - 1))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
