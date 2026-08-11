import type { ResumeRequest } from '../../schemas';

export type GroundingStatus = 'APPROVED' | 'REJECTED' | 'NEEDS_USER_CONFIRMATION';

export type GroundingViolationKind =
  | 'UNSUPPORTED_NUMBER'
  | 'UNSUPPORTED_COMPANY'
  | 'UNSUPPORTED_ROLE'
  | 'UNSUPPORTED_PROJECT'
  | 'UNSUPPORTED_CERTIFICATION'
  | 'UNSUPPORTED_SKILL'
  | 'JD_REQUIREMENT_LEAKAGE';

export interface GroundingViolation {
  readonly kind: GroundingViolationKind;
  readonly value: string;
  readonly message: string;
  readonly source: 'GENERATED_ONLY' | 'JOB_DESCRIPTION_ONLY';
}

export interface GroundingReport {
  readonly status: GroundingStatus;
  readonly violations: readonly GroundingViolation[];
  readonly factsToConfirm: readonly string[];
}

interface CandidateCatalog {
  readonly sourceText: string;
  readonly companies: ReadonlySet<string>;
  readonly roles: ReadonlySet<string>;
  readonly projects: ReadonlySet<string>;
  readonly certifications: ReadonlySet<string>;
  readonly skills: ReadonlySet<string>;
  readonly numbers: ReadonlySet<string>;
}

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

const NUMBER_PATTERN = /(?:[$€£]\s*)?\b\d+(?:[.,]\d+)?%?\b/g;

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[“”"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeNumber(value: string): string {
  return value.replace(/\s+/g, '').replace(',', '.').toLowerCase();
}

function extractNumbers(value: string): string[] {
  return (value.match(NUMBER_PATTERN) ?? []).map(normalizeNumber);
}

function candidatePayload(data: ResumeRequest): Omit<ResumeRequest, 'jobDescription'> {
  const { jobDescription: _jobDescription, ...candidateData } = data;
  return candidateData;
}

function createCandidateCatalog(data: ResumeRequest): CandidateCatalog {
  const candidateData = candidatePayload(data);
  const sourceText = normalize(JSON.stringify(candidateData));
  const companies = new Set(data.experience.map((item) => normalize(item.company)));
  const roles = new Set(data.experience.map((item) => normalize(item.role)));
  const projects = new Set((data.projects ?? []).map((item) => normalize(item.name)));
  const certifications = new Set((data.certifications ?? []).map((item) => normalize(item.name)));
  const skills = new Set([
    ...data.skills.hardSkills,
    ...data.skills.softSkills,
    ...data.experience.flatMap((item) => item.technologies),
    ...(data.projects ?? []).flatMap((item) => item.technologies),
  ].map(normalize));
  const numbers = new Set(extractNumbers(JSON.stringify(candidateData)));

  return {
    sourceText,
    companies,
    roles,
    projects,
    certifications,
    skills,
    numbers,
  };
}

function isSupportedText(value: string, allowed: ReadonlySet<string>, sourceText: string): boolean {
  const normalized = normalize(value);
  return allowed.has(normalized) || (normalized.length >= 3 && sourceText.includes(normalized));
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

function pushUnique(violations: GroundingViolation[], violation: GroundingViolation): void {
  const key = `${violation.kind}:${normalize(violation.value)}`;
  const exists = violations.some(
    (item) => `${item.kind}:${normalize(item.value)}` === key,
  );

  if (!exists) {
    violations.push(violation);
  }
}

function validateNumbers(
  generatedResume: string,
  catalog: CandidateCatalog,
  jobDescription: string,
  violations: GroundingViolation[],
): void {
  extractNumbers(generatedResume).forEach((number) => {
    if (!catalog.numbers.has(number)) {
      pushUnique(
        violations,
        violationFor('UNSUPPORTED_NUMBER', number, 'Numeric fact', jobDescription),
      );
    }
  });
}

function validateExperienceHeader(
  line: string,
  catalog: CandidateCatalog,
  jobDescription: string,
  violations: GroundingViolation[],
): void {
  const parts = line.split(/\s+[—–]\s+/).map((part) => part.trim()).filter(Boolean);

  if (parts.length !== 2) {
    return;
  }

  const [company, role] = parts;

  if (!/[A-Za-zÀ-ÿ]/.test(company) || !/[A-Za-zÀ-ÿ]/.test(role)) {
    return;
  }

  if (!isSupportedText(company, catalog.companies, catalog.sourceText)) {
    pushUnique(
      violations,
      violationFor('UNSUPPORTED_COMPANY', company, 'Employer/company', jobDescription),
    );
  }

  if (!isSupportedText(role, catalog.roles, catalog.sourceText)) {
    pushUnique(
      violations,
      violationFor('UNSUPPORTED_ROLE', role, 'Role/title', jobDescription),
    );
  }
}

function validateSkillLine(
  line: string,
  catalog: CandidateCatalog,
  jobDescription: string,
  violations: GroundingViolation[],
): void {
  const match = line.match(/^(?:technical\s+skills?|soft\s+skills?|skills?)\s*:\s*(.+)$/i);

  if (!match) {
    return;
  }

  match[1]
    .split(/[,;|]/)
    .map((skill) => skill.trim())
    .filter(Boolean)
    .forEach((skill) => {
      if (!isSupportedText(skill, catalog.skills, catalog.sourceText)) {
        pushUnique(
          violations,
          violationFor('UNSUPPORTED_SKILL', skill, 'Skill/technology', jobDescription),
        );
      }
    });
}

function validateCertificationLine(
  line: string,
  catalog: CandidateCatalog,
  jobDescription: string,
  violations: GroundingViolation[],
): void {
  const [name] = line.split(/\s+[—–]\s+/);
  const candidateName = name?.trim();

  if (!candidateName || !/[A-Za-zÀ-ÿ]/.test(candidateName)) {
    return;
  }

  if (!isSupportedText(candidateName, catalog.certifications, catalog.sourceText)) {
    pushUnique(
      violations,
      violationFor(
        'UNSUPPORTED_CERTIFICATION',
        candidateName,
        'Certification',
        jobDescription,
      ),
    );
  }
}

function validateProjectHeading(
  line: string,
  catalog: CandidateCatalog,
  jobDescription: string,
  violations: GroundingViolation[],
): void {
  const normalized = normalize(line);
  const looksLikeHeading = line === line.toUpperCase() && /[A-ZÀ-Ý]/.test(line);

  if (
    !looksLikeHeading ||
    SECTION_HEADINGS.has(line.toUpperCase()) ||
    line.includes(':')
  ) {
    return;
  }

  if (!isSupportedText(normalized, catalog.projects, catalog.sourceText)) {
    pushUnique(
      violations,
      violationFor('UNSUPPORTED_PROJECT', line, 'Project name', jobDescription),
    );
  }
}

/**
 * Deterministic hard-fact gate for generated resume text.
 *
 * This deliberately prefers false rejections over silently accepting a new
 * candidate fact. Semantic entailment can be layered later, but it may never
 * override these deterministic blockers.
 */
export function validateGeneratedResumeGrounding(
  data: ResumeRequest,
  generatedResume: string,
): GroundingReport {
  const catalog = createCandidateCatalog(data);
  const jobDescription = data.jobDescription ?? '';
  const violations: GroundingViolation[] = [];

  validateNumbers(generatedResume, catalog, jobDescription, violations);

  let currentSection = '';

  generatedResume.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.replace(/^[•*\-]\s*/, '').trim();

    if (!line) {
      return;
    }

    const upper = line.toUpperCase();
    if (SECTION_HEADINGS.has(upper)) {
      currentSection = upper;
      return;
    }

    if (currentSection === 'EXPERIENCE' || currentSection === 'WORK EXPERIENCE') {
      validateExperienceHeader(line, catalog, jobDescription, violations);
    }

    if (currentSection === 'SKILLS') {
      validateSkillLine(line, catalog, jobDescription, violations);
    }

    if (currentSection === 'CERTIFICATIONS') {
      validateCertificationLine(line, catalog, jobDescription, violations);
    }

    if (currentSection === 'PROJECTS') {
      validateProjectHeading(line, catalog, jobDescription, violations);
    }
  });

  const hasJobLeakage = violations.some((item) => item.kind === 'JD_REQUIREMENT_LEAKAGE');
  const status: GroundingStatus = hasJobLeakage
    ? 'REJECTED'
    : violations.length > 0
      ? 'NEEDS_USER_CONFIRMATION'
      : 'APPROVED';

  return {
    status,
    violations,
    factsToConfirm: violations
      .filter((item) => item.source === 'GENERATED_ONLY')
      .map((item) => item.value),
  };
}
