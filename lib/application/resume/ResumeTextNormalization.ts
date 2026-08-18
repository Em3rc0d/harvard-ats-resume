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

function normalizeStructuredRecordSeparators(value: string): string {
  let currentSection = '';
  const normalizedLines: string[] = [];

  value.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (UPPERCASE_SECTION_HEADING_SET.has(trimmed)) {
      currentSection = trimmed;
      normalizedLines.push(line);
      return;
    }

    const pipeParts = trimmed
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean);

    if (currentSection === 'CERTIFICATIONS' && pipeParts.length >= 3) {
      normalizedLines.push(pipeParts.join(' — '));
      return;
    }

    if (
      (currentSection === 'EXPERIENCE' || currentSection === 'WORK EXPERIENCE') &&
      !/^[•●▪◦*\-]\s*/.test(trimmed) &&
      pipeParts.length === 3
    ) {
      const [company, role, date] = pipeParts;
      normalizedLines.push(`${company} — ${role}`, date);
      return;
    }

    normalizedLines.push(line);
  });

  return normalizedLines.join('\n');
}

/**
 * Repairs presentation-only serialization defects emitted by the generation
 * provider without changing candidate facts or rewriting already-valid layout.
 *
 * Existing physical lines, section spacing and standalone bullets are preserved.
 * Recovery is applied only when a provider serialized line breaks literally,
 * embedded standard headings/bullets, or used pipe separators for structured
 * records whose semantic fields are already independently present.
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
  normalized = normalizeStructuredRecordSeparators(normalized);

  return normalized
    .split('\n')
    .map((line) => line.trim())
    .filter((line, index, lines) => line.length > 0 || (index > 0 && index < lines.length - 1))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
