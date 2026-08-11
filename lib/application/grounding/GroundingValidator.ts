import type { ResumeRequest } from '../../schemas';

export type GroundingStatus = 'APPROVED' | 'REJECTED' | 'NEEDS_USER_CONFIRMATION';

export type GroundingViolationKind =
  | 'UNSUPPORTED_NUMBER'
  | 'UNSUPPORTED_COMPANY'
  | 'UNSUPPORTED_ROLE'
  | 'UNSUPPORTED_PROJECT'
  | 'UNSUPPORTED_CERTIFICATION'
  | 'UNSUPPORTED_SKILL'
  | 'UNSUPPORTED_EDUCATION'
  | 'UNSUPPORTED_LANGUAGE'
  | 'UNSUPPORTED_NARRATIVE_CLAIM'
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
  readonly sourceTokens: ReadonlySet<string>;
  readonly companies: ReadonlySet<string>;
  readonly roles: ReadonlySet<string>;
  readonly projects: ReadonlySet<string>;
  readonly certifications: ReadonlySet<string>;
  readonly skills: ReadonlySet<string>;
  readonly institutions: ReadonlySet<string>;
  readonly languages: ReadonlySet<string>;
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
const INSTITUTION_PATTERN = /\b(university|college|institute|school|academy|universidad|instituto|escuela|facultad)\b/i;

const NARRATIVE_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'over', 'under',
  'through', 'using', 'used', 'while', 'where', 'which', 'their', 'there', 'your',
  'our', 'his', 'her', 'its', 'was', 'were', 'are', 'has', 'have', 'had', 'been',
  'being', 'than', 'then', 'also', 'across', 'within', 'without', 'about', 'work',
  'worked', 'experience', 'professional', 'candidate', 'role', 'company', 'project',
  'projects', 'skills', 'skill', 'technical', 'summary', 'responsible', 'supporting',
  'support', 'including', 'focused', 'focus', 'con', 'para', 'por', 'del', 'las',
  'los', 'una', 'uno', 'como', 'desde', 'hasta', 'sobre', 'entre', 'donde', 'que',
  'experiencia', 'profesional', 'trabajo', 'proyecto', 'proyectos', 'habilidad',
  'habilidades', 'responsable', 'incluyendo', 'enfocado', 'enfocada',
]);

// These terms describe resume phrasing rather than new factual scope. Novel
// domain nouns still require support from candidate data.
const SAFE_REWRITE_TOKENS = new Set([
  'led', 'lead', 'leading', 'built', 'build', 'developed', 'develop', 'designed',
  'design', 'implemented', 'implement', 'created', 'create', 'delivered', 'deliver',
  'managed', 'manage', 'owned', 'own', 'improved', 'improve', 'optimized', 'optimize',
  'maintained', 'maintain', 'collaborated', 'collaborate', 'supported', 'support',
  'engineered', 'engineer', 'architected', 'architect', 'drove', 'drive', 'enabled',
  'enable', 'contributed', 'contribute', 'strong', 'proven', 'effective', 'high',
  'quality', 'reliable', 'scalable', 'efficient', 'solutions', 'solution', 'system',
  'systems', 'service', 'services', 'application', 'applications', 'platform',
  'platforms', 'team', 'teams', 'initiative', 'initiatives', 'results', 'result',
  'lidero', 'liderar', 'desarrollo', 'desarrollar', 'diseno', 'disenar', 'implemento',
  'implementar', 'creo', 'crear', 'gestiono', 'gestionar', 'mejoro', 'mejorar',
  'optimizo', 'optimizar', 'colaboro', 'colaborar', 'solucion', 'soluciones',
  'sistema', 'sistemas', 'servicio', 'servicios', 'aplicacion', 'aplicaciones',
  'equipo', 'equipos', 'iniciativa', 'iniciativas',
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

function normalizeNumber(value: string): string {
  return value.replace(/\s+/g, '').replace(',', '.').toLowerCase();
}

function extractNumbers(value: string): string[] {
  return (value.match(NUMBER_PATTERN) ?? []).map(normalizeNumber);
}

function meaningfulTokens(value: string): Set<string> {
  return new Set(
    normalize(value)
      .replace(/[^a-z0-9+#.\-/\s]/g, ' ')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(
        (token) =>
          token.length >= 3 &&
          !NARRATIVE_STOPWORDS.has(token) &&
          !SAFE_REWRITE_TOKENS.has(token),
      ),
  );
}

function candidatePayload(data: ResumeRequest): Omit<ResumeRequest, 'jobDescription'> {
  const { jobDescription: _jobDescription, ...candidateData } = data;
  return candidateData;
}

function createCandidateCatalog(data: ResumeRequest): CandidateCatalog {
  const candidateData = candidatePayload(data);
  const rawCandidateText = JSON.stringify(candidateData);
  const sourceText = normalize(rawCandidateText);
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
  const institutions = new Set(data.education.map((item) => normalize(item.institution)));
  const languages = new Set((data.languages ?? []).map((item) => normalize(item.language)));
  const numbers = new Set(extractNumbers(rawCandidateText));

  return {
    sourceText,
    sourceTokens: meaningfulTokens(rawCandidateText),
    companies,
    roles,
    projects,
    certifications,
    skills,
    institutions,
    languages,
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
  const match = line.match(/^(?:technical\s+skills?|soft\s+skills?|skills?|technologies?)\s*:\s*(.+)$/i);

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
): boolean {
  const normalized = normalize(line);
  const looksLikeHeading = line === line.toUpperCase() && /[A-ZÀ-Ý]/.test(line);

  if (
    !looksLikeHeading ||
    SECTION_HEADINGS.has(line.toUpperCase()) ||
    line.includes(':')
  ) {
    return false;
  }

  if (!isSupportedText(normalized, catalog.projects, catalog.sourceText)) {
    pushUnique(
      violations,
      violationFor('UNSUPPORTED_PROJECT', line, 'Project name', jobDescription),
    );
  }

  return true;
}

function validateEducationLine(
  line: string,
  catalog: CandidateCatalog,
  jobDescription: string,
  violations: GroundingViolation[],
): void {
  if (!INSTITUTION_PATTERN.test(line)) {
    return;
  }

  if (!isSupportedText(line, catalog.institutions, catalog.sourceText)) {
    pushUnique(
      violations,
      violationFor('UNSUPPORTED_EDUCATION', line, 'Education institution', jobDescription),
    );
  }
}

function validateLanguageLine(
  line: string,
  catalog: CandidateCatalog,
  jobDescription: string,
  violations: GroundingViolation[],
): void {
  line
    .split(/[|,;]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .forEach((entry) => {
      const language = entry.split(':')[0]?.trim();
      if (!language || !/[A-Za-zÀ-ÿ]/.test(language)) return;

      if (!isSupportedText(language, catalog.languages, catalog.sourceText)) {
        pushUnique(
          violations,
          violationFor('UNSUPPORTED_LANGUAGE', language, 'Language', jobDescription),
        );
      }
    });
}

function tokenOverlapRatio(tokens: ReadonlySet<string>, reference: ReadonlySet<string>): number {
  if (tokens.size === 0) return 1;

  let overlap = 0;
  tokens.forEach((token) => {
    if (reference.has(token)) overlap += 1;
  });

  return overlap / tokens.size;
}

function validateNarrativeLine(
  line: string,
  catalog: CandidateCatalog,
  jobDescription: string,
  violations: GroundingViolation[],
): void {
  if (line.length < 12 || /@|https?:\/\//i.test(line)) {
    return;
  }

  const tokens = meaningfulTokens(line);
  if (tokens.size < 2) return;

  const novelTokens = new Set(Array.from(tokens).filter((token) => !catalog.sourceTokens.has(token)));
  if (novelTokens.size < 2) return;

  const candidateOverlap = tokenOverlapRatio(tokens, catalog.sourceTokens);
  if (candidateOverlap >= 0.45) return;

  const jobTokens = meaningfulTokens(jobDescription);
  const jobOverlap = tokenOverlapRatio(novelTokens, jobTokens);

  if (jobDescription.trim() && jobOverlap >= 0.5) {
    pushUnique(violations, {
      kind: 'JD_REQUIREMENT_LEAKAGE',
      value: line,
      message: 'Narrative claim is not supported by candidate data and substantially overlaps the job description.',
      source: 'JOB_DESCRIPTION_ONLY',
    });
    return;
  }

  pushUnique(
    violations,
    violationFor(
      'UNSUPPORTED_NARRATIVE_CLAIM',
      line,
      'Narrative responsibility/achievement claim',
      jobDescription,
    ),
  );
}

/**
 * Deterministic hard-fact and conservative narrative gate for generated resume
 * text. It intentionally prefers asking for confirmation over silently
 * accepting new factual scope. Semantic entailment remains a future layer and
 * may never override deterministic blockers.
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
    const trimmedRawLine = rawLine.trim();
    const isBullet = /^[•*\-]\s*/.test(trimmedRawLine);
    const line = trimmedRawLine.replace(/^[•*\-]\s*/, '').trim();

    if (!line) {
      return;
    }

    const upper = line.toUpperCase();
    if (SECTION_HEADINGS.has(upper)) {
      currentSection = upper;
      return;
    }

    if (currentSection === 'PROFESSIONAL SUMMARY' || currentSection === 'SUMMARY') {
      validateNarrativeLine(line, catalog, jobDescription, violations);
      return;
    }

    if (currentSection === 'EXPERIENCE' || currentSection === 'WORK EXPERIENCE') {
      if (isBullet) {
        validateNarrativeLine(line, catalog, jobDescription, violations);
      } else {
        validateExperienceHeader(line, catalog, jobDescription, violations);
      }
      return;
    }

    if (currentSection === 'SKILLS') {
      validateSkillLine(line, catalog, jobDescription, violations);
      return;
    }

    if (currentSection === 'CERTIFICATIONS') {
      validateCertificationLine(line, catalog, jobDescription, violations);
      return;
    }

    if (currentSection === 'EDUCATION') {
      validateEducationLine(line, catalog, jobDescription, violations);
      return;
    }

    if (currentSection === 'LANGUAGES') {
      validateLanguageLine(line, catalog, jobDescription, violations);
      return;
    }

    if (currentSection === 'PROJECTS') {
      const isProjectHeading = validateProjectHeading(line, catalog, jobDescription, violations);
      if (!isProjectHeading) {
        validateSkillLine(line, catalog, jobDescription, violations);
        if (!/^technologies?\s*:/i.test(line)) {
          validateNarrativeLine(line, catalog, jobDescription, violations);
        }
      }
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
