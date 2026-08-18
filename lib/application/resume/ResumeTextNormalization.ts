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

const UPPERCASE_SECTION_HEADING_SET = new Set<string>(UPPERCASE_SECTION_HEADINGS);

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const SECTION_HEADING_PATTERN = new RegExp(
  `(^|[^\\S\\r\\n]+)(${UPPERCASE_SECTION_HEADINGS.map(escapeRegex).join('|')})(?=[^\\S\\r\\n]+|$)`,
  'g',
);

function splitEmbeddedSectionHeadings(value: string): string {
  return value
    .split('\n')
    .map((line) => {
      if (UPPERCASE_SECTION_HEADING_SET.has(line.trim())) return line;

      return line.replace(
        SECTION_HEADING_PATTERN,
        (_match, prefix: string, heading: string) => `${prefix ? '\n' : ''}${heading}\n`,
      );
    })
    .join('\n');
}

function splitEmbeddedBullets(value: string): string {
  return value
    .split('\n')
    .map((line) => {
      if (/^[•●▪◦]\s*/.test(line.trim())) return line;
      return line.replace(/\s*[•●▪◦]\s*/g, '\n• ');
    })
    .join('\n');
}

/**
 * Repairs presentation-only serialization defects emitted by the generation
 * provider without changing candidate facts or rewriting already-valid layout.
 *
 * Existing physical lines, section spacing and standalone bullets are preserved.
 * Recovery is applied only when a provider serialized line breaks literally or
 * embedded standard headings/bullets inside another physical line.
 */
export function normalizeGeneratedResumeText(value: string): string {
  let normalized = value
    .replace(/\r\n?/g, '\n')
    .trim();

  if (!normalized.includes('\n') && normalized.includes('\\n')) {
    normalized = normalized.replace(/\\n/g, '\n');
  }

  normalized = splitEmbeddedBullets(normalized);
  normalized = splitEmbeddedSectionHeadings(normalized);

  return normalized
    .split('\n')
    .map((line) => line.trim())
    .filter((line, index, lines) => line.length > 0 || (index > 0 && index < lines.length - 1))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
