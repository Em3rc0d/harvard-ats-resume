import type { ResumeRequest } from '../../schemas';
import {
  validateGeneratedResumeGrounding as validateLegacyGeneratedResumeGrounding,
  type GroundingReport,
  type GroundingStatus,
  type GroundingViolation,
  type GroundingViolationKind,
} from './GroundingValidatorLegacy';

export type {
  GroundingReport,
  GroundingStatus,
  GroundingViolation,
  GroundingViolationKind,
} from './GroundingValidatorLegacy';

const SECTION_HEADINGS = new Set([
  'PROFESSIONAL SUMMARY',
  'SUMMARY',
  'EXPERIENCE',
  'WORK EXPERIENCE',
  'PROJECTS',
  'EDUCATION',
  'CERTIFICATIONS',
  'LANGUAGES',
  'SKILLS',
]);

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[“”"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function violationFor(
  kind: Exclude<GroundingViolationKind, 'JD_REQUIREMENT_LEAKAGE'>,
  value: string,
  label: string,
  jobDescription: string,
): GroundingViolation {
  const normalizedValue = normalize(value);
  const normalizedJob = normalize(jobDescription);
  const leakedFromJob = normalizedValue.length >= 2 && normalizedJob.includes(normalizedValue);

  if (leakedFromJob) {
    return {
      kind: 'JD_REQUIREMENT_LEAKAGE',
      value,
      message: `${label} appears in generated candidate content but is supported only by the job description.`,
      source: 'JOB_DESCRIPTION_ONLY',
    };
  }

  return {
    kind,
    value,
    message: `${label} appears in generated candidate content but is not supported by candidate evidence.`,
    source: 'GENERATED_ONLY',
  };
}

function uniqueViolations(values: readonly GroundingViolation[]): GroundingViolation[] {
  const seen = new Set<string>();
  const result: GroundingViolation[] = [];

  values.forEach((violation) => {
    const key = `${violation.kind}:${normalize(violation.value)}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(violation);
  });

  return result;
}

interface SectionLine {
  readonly section: string;
  readonly line: string;
}

function sectionLines(generatedResume: string): SectionLine[] {
  let section = '';
  const lines: SectionLine[] = [];

  generatedResume.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim().replace(/^[•*\-]\s*/, '').trim();
    if (!line) return;

    const upper = line.toUpperCase();
    if (SECTION_HEADINGS.has(upper)) {
      section = upper;
      return;
    }

    lines.push({ section, line });
  });

  return lines;
}

interface ParsedLanguageLine {
  readonly language: string;
  readonly proficiency?: string;
}

function parseLanguageLine(value: string): ParsedLanguageLine {
  const pair = value.match(/^(.+?)\s*(?::|\s+[—–-]\s+)\s*(.+)$/);
  if (!pair) return { language: value.trim() };
  return {
    language: pair[1].trim(),
    proficiency: pair[2].trim(),
  };
}

function validateStructuredLanguages(
  data: ResumeRequest,
  generatedResume: string,
): GroundingViolation[] {
  const jobDescription = data.jobDescription ?? '';
  const records = (data.languages ?? []).map((item) => ({
    language: normalize(item.language),
    proficiency: normalize(item.proficiency),
  }));
  const violations: GroundingViolation[] = [];

  sectionLines(generatedResume)
    .filter((item) => item.section === 'LANGUAGES')
    .flatMap((item) => item.line.split(/[|,;]/).map((entry) => entry.trim()).filter(Boolean))
    .forEach((entry) => {
      const parsed = parseLanguageLine(entry);
      if (!parsed.language || !/[A-Za-zÀ-ÿ]/.test(parsed.language)) return;

      const language = normalize(parsed.language);
      const record = records.find((item) => item.language === language);
      if (!record) {
        violations.push(violationFor('UNSUPPORTED_LANGUAGE', parsed.language, 'Language', jobDescription));
        return;
      }

      if (parsed.proficiency !== undefined) {
        const proficiency = normalize(parsed.proficiency);
        if (!record.proficiency || record.proficiency !== proficiency) {
          violations.push(violationFor(
            'UNSUPPORTED_LANGUAGE',
            `${parsed.language} — ${parsed.proficiency}`,
            'Language proficiency',
            jobDescription,
          ));
        }
      }
    });

  return violations;
}

function splitEducationLine(value: string): string[] {
  return value
    .split(/\s+[—–]\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function refineEducationViolation(
  violation: GroundingViolation,
  data: ResumeRequest,
): GroundingViolation[] {
  const parts = splitEducationLine(violation.value);
  if (parts.length < 2) return [violation];

  const [institutionPart, ...remaining] = parts;
  const institution = normalize(institutionPart);
  const record = data.education.find((item) => normalize(item.institution) === institution);
  if (!record) return [violation];

  const supported = new Set([
    record.degree,
    record.startDate,
    record.endDate,
    record.honors ?? '',
  ].map(normalize).filter(Boolean));
  const unsupported = remaining.filter((part) => !supported.has(normalize(part)));

  if (unsupported.length === 0) return [];

  return unsupported.map((part) => violationFor(
    'UNSUPPORTED_EDUCATION',
    part,
    'Education detail',
    data.jobDescription ?? '',
  ));
}

function rebuildReport(violations: readonly GroundingViolation[]): GroundingReport {
  const unique = uniqueViolations(violations);
  const hasJobLeakage = unique.some((item) => item.kind === 'JD_REQUIREMENT_LEAKAGE');
  const status: GroundingStatus = hasJobLeakage
    ? 'REJECTED'
    : unique.length > 0
      ? 'NEEDS_USER_CONFIRMATION'
      : 'APPROVED';

  return {
    status,
    violations: unique,
    factsToConfirm: unique
      .filter((item) => item.source === 'GENERATED_ONLY')
      .map((item) => item.value),
  };
}

/**
 * Release-hardening facade over the established deterministic validator.
 *
 * The legacy validator remains authoritative for numbers, companies, roles,
 * projects, certifications, skills, narrative claims, and JD leakage. This
 * facade only makes EDUCATION and LANGUAGES structured/facet-aware so valid
 * presentation separators do not become false unsupported facts.
 *
 * A language proficiency must match the exact candidate-provided proficiency;
 * a supported language never authorizes a stronger generated level. Likewise,
 * a supported institution/degree never authorizes an additional academic
 * distinction. An explicit education.honors value is candidate evidence and can
 * support that exact distinction; otherwise it remains a confirmation request.
 */
export function validateGeneratedResumeGrounding(
  data: ResumeRequest,
  generatedResume: string,
): GroundingReport {
  const legacy = validateLegacyGeneratedResumeGrounding(data, generatedResume);
  const retained: GroundingViolation[] = [];

  legacy.violations.forEach((violation) => {
    if (violation.kind === 'UNSUPPORTED_LANGUAGE') return;
    if (violation.kind === 'UNSUPPORTED_EDUCATION') {
      retained.push(...refineEducationViolation(violation, data));
      return;
    }
    retained.push(violation);
  });

  retained.push(...validateStructuredLanguages(data, generatedResume));
  return rebuildReport(retained);
}
