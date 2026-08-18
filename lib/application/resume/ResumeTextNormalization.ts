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

function splitUppercaseSectionHeadings(value: string): string {
  return UPPERCASE_SECTION_HEADINGS.reduce((text, heading) => {
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\s+(${escaped})\\s+`, 'g');
    return text.replace(pattern, '\n$1\n');
  }, value);
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

  // Only recover explicit uppercase standard headings. This avoids splitting
  // ordinary prose that happens to contain words such as "experience".
  if (normalized.split('\n').filter((line) => line.trim()).length <= 2) {
    normalized = splitUppercaseSectionHeadings(normalized);
  }

  return normalized
    .split('\n')
    .map((line) => line.trim())
    .filter((line, index, lines) => line.length > 0 || (index > 0 && index < lines.length - 1))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
