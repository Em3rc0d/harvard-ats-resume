import {
  createJobDescription,
  createJobRequirement,
  domainId,
  type JobDescription,
  type JobRequirement,
  type JobRequirementKind,
  type JobRequirementNecessity,
} from '../../domain';

export type JobLanguage = 'EN' | 'ES' | 'UNKNOWN';

export interface JobIntelligenceResult {
  readonly jobDescription: JobDescription;
  readonly requirements: readonly JobRequirement[];
  readonly language: JobLanguage;
}

interface SkillDefinition {
  readonly canonical: string;
  readonly aliases: readonly string[];
}

interface JobStatement {
  readonly text: string;
  readonly contextNecessity: JobRequirementNecessity;
}

const SKILLS: readonly SkillDefinition[] = [
  { canonical: 'Java', aliases: ['java'] },
  { canonical: 'JavaScript', aliases: ['javascript', 'js'] },
  { canonical: 'TypeScript', aliases: ['typescript', 'ts'] },
  { canonical: 'Python', aliases: ['python'] },
  { canonical: 'C#', aliases: ['c#', '.net', 'dotnet'] },
  { canonical: 'C++', aliases: ['c++'] },
  { canonical: 'Go', aliases: ['go', 'golang'] },
  { canonical: 'Rust', aliases: ['rust'] },
  { canonical: 'React', aliases: ['react', 'react.js', 'reactjs'] },
  { canonical: 'Angular', aliases: ['angular'] },
  { canonical: 'Vue', aliases: ['vue', 'vue.js', 'vuejs'] },
  { canonical: 'Node.js', aliases: ['node.js', 'nodejs'] },
  { canonical: 'Next.js', aliases: ['next.js', 'nextjs'] },
  { canonical: 'SQL', aliases: ['sql'] },
  { canonical: 'PostgreSQL', aliases: ['postgresql', 'postgres'] },
  { canonical: 'MySQL', aliases: ['mysql'] },
  { canonical: 'MongoDB', aliases: ['mongodb', 'mongo'] },
  { canonical: 'Redis', aliases: ['redis'] },
  { canonical: 'AWS', aliases: ['aws', 'amazon web services'] },
  { canonical: 'Azure', aliases: ['azure', 'microsoft azure'] },
  { canonical: 'GCP', aliases: ['gcp', 'google cloud', 'google cloud platform'] },
  { canonical: 'Docker', aliases: ['docker'] },
  { canonical: 'Kubernetes', aliases: ['kubernetes', 'k8s'] },
  { canonical: 'Terraform', aliases: ['terraform'] },
  { canonical: 'Ansible', aliases: ['ansible'] },
  { canonical: 'Git', aliases: ['git'] },
  { canonical: 'GitHub Actions', aliases: ['github actions'] },
  { canonical: 'GitLab CI', aliases: ['gitlab ci', 'gitlab pipelines'] },
  { canonical: 'CI/CD', aliases: ['ci/cd', 'continuous integration', 'continuous delivery', 'continuous deployment'] },
  { canonical: 'REST APIs', aliases: ['rest api', 'restful api', 'rest apis', 'restful services'] },
  { canonical: 'GraphQL', aliases: ['graphql'] },
  { canonical: 'Microservices', aliases: ['microservices', 'micro-services'] },
  { canonical: 'Event-driven architecture', aliases: ['event-driven', 'event driven architecture'] },
  { canonical: 'Kafka', aliases: ['kafka', 'apache kafka'] },
  { canonical: 'RabbitMQ', aliases: ['rabbitmq'] },
  { canonical: 'Machine Learning', aliases: ['machine learning', 'ml'] },
  { canonical: 'Deep Learning', aliases: ['deep learning'] },
  { canonical: 'PyTorch', aliases: ['pytorch'] },
  { canonical: 'TensorFlow', aliases: ['tensorflow'] },
  { canonical: 'Data Science', aliases: ['data science'] },
  { canonical: 'Pandas', aliases: ['pandas'] },
  { canonical: 'Spark', aliases: ['apache spark', 'spark'] },
  { canonical: 'Airflow', aliases: ['apache airflow', 'airflow'] },
  { canonical: 'Linux', aliases: ['linux'] },
  { canonical: 'Bash', aliases: ['bash', 'shell scripting'] },
  { canonical: 'OAuth', aliases: ['oauth', 'oauth2', 'openid connect', 'oidc'] },
  { canonical: 'Cybersecurity', aliases: ['cybersecurity', 'cyber security'] },
  { canonical: 'Agile', aliases: ['agile'] },
  { canonical: 'Scrum', aliases: ['scrum'] },
  { canonical: 'Jira', aliases: ['jira'] },
  { canonical: 'Figma', aliases: ['figma'] },
];

const REQUIRED_PATTERNS = [
  /\brequired\b/i,
  /\bmust\b/i,
  /\bminimum\b/i,
  /\bat least\b/i,
  /\bneed(?:ed|s)?\b/i,
  /\brequerid[oa]s?\b/i,
  /\bobligatori[oa]s?\b/i,
  /\bm[ií]nimo\b/i,
  /\bal menos\b/i,
  /\bdebe(?:r[aá]s?|n)?\b/i,
];

const PREFERRED_PATTERNS = [
  /\bpreferred\b/i,
  /\bnice[- ]to[- ]have\b/i,
  /\bplus\b/i,
  /\bbonus\b/i,
  /\bdesirable\b/i,
  /\bpreferid[oa]s?\b/i,
  /\bdeseable\b/i,
  /\bser[aá] un plus\b/i,
];

const REQUIRED_SECTION_PATTERN = /^(requirements?|required qualifications?|minimum qualifications?|must[- ]haves?|requisitos?|requisitos obligatorios?|requisitos m[ií]nimos)$/i;
const PREFERRED_SECTION_PATTERN = /^(preferred qualifications?|nice[- ]to[- ]haves?|preferred|deseables?|requisitos deseables?|preferidos?)$/i;
const EXPERIENCE_PATTERN = /\b(experience|experiencia|years?|a[nñ]os?)\b/i;
const EDUCATION_PATTERN = /\b(bachelor|master|degree|university|college|licenciatura|maestr[ií]a|t[ií]tulo|universidad|ingenier[ií]a)\b/i;
const CERTIFICATION_PATTERN = /\b(certification|certificate|certified|certificaci[oó]n|certificado|certificada|certificado)\b/i;
const LANGUAGE_PATTERN = /\b(english|spanish|french|portuguese|idioma|ingl[eé]s|espa[nñ]ol|franc[eé]s|portugu[eé]s|fluent|fluido|bilingual|biling[uü]e)\b/i;
const LOCATION_PATTERN = /\b(remote|hybrid|on[- ]site|onsite|location|located|ubicaci[oó]n|remoto|h[ií]brido|presencial|residir|residence)\b/i;
const WORK_AUTH_PATTERN = /\b(work authorization|authorized to work|visa sponsorship|sponsorship|permiso de trabajo|autorizaci[oó]n de trabajo|patrocinio de visa)\b/i;
const RESPONSIBILITY_PATTERN = /\b(design|develop|build|lead|mentor|own|manage|architect|implement|maintain|collaborate|dise[nñ]ar|desarrollar|construir|liderar|mentorar|gestionar|implementar|mantener|colaborar)\b/i;

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsAlias(text: string, alias: string): boolean {
  const normalizedText = normalize(text);
  const normalizedAlias = normalize(alias);

  if (normalizedAlias.length <= 2 && /^[a-z0-9]+$/i.test(normalizedAlias)) {
    return new RegExp(`(^|[^a-z0-9])${escapeRegex(normalizedAlias)}([^a-z0-9]|$)`, 'i').test(normalizedText);
  }

  return normalizedText.includes(normalizedAlias);
}

function headingNecessity(line: string): JobRequirementNecessity | undefined {
  const normalizedHeading = line.replace(/:$/, '').trim();
  if (REQUIRED_SECTION_PATTERN.test(normalizedHeading)) return 'REQUIRED';
  if (PREFERRED_SECTION_PATTERN.test(normalizedHeading)) return 'PREFERRED';
  return undefined;
}

function splitStatements(text: string): JobStatement[] {
  const statements: JobStatement[] = [];
  let contextNecessity: JobRequirementNecessity = 'UNKNOWN';

  text
    .replace(/\r/g, '\n')
    .split(/\n+/)
    .forEach((rawLine) => {
      const trimmed = rawLine.replace(/^[\s•*\-–—]+/, '').trim();
      if (!trimmed) return;

      const headingContext = headingNecessity(trimmed);
      if (headingContext) {
        contextNecessity = headingContext;
        return;
      }

      if (trimmed.endsWith(':') && trimmed.length <= 60) {
        contextNecessity = 'UNKNOWN';
        return;
      }

      trimmed
        .split(/(?<=[.!?;])\s+/)
        .map((statement) => statement.trim())
        .filter((statement) => statement.length >= 2)
        .forEach((statement) => {
          statements.push({ text: statement, contextNecessity });
        });
    });

  return statements.slice(0, 120);
}

function detectLanguage(text: string): JobLanguage {
  const normalized = normalize(text);
  const spanishSignals = (normalized.match(/\b(el|la|los|las|con|para|experiencia|requisitos|responsabilidades|deseable|anos|trabajo)\b/g) ?? []).length;
  const englishSignals = (normalized.match(/\b(the|with|for|experience|requirements|responsibilities|preferred|years|work)\b/g) ?? []).length;

  if (spanishSignals >= englishSignals + 2) return 'ES';
  if (englishSignals >= spanishSignals + 2) return 'EN';
  return 'UNKNOWN';
}

function detectNecessity(
  statement: string,
  contextNecessity: JobRequirementNecessity,
): JobRequirementNecessity {
  if (PREFERRED_PATTERNS.some((pattern) => pattern.test(statement))) return 'PREFERRED';
  if (REQUIRED_PATTERNS.some((pattern) => pattern.test(statement))) return 'REQUIRED';
  return contextNecessity;
}

function detectMinimumYears(statement: string): number | undefined {
  const match = statement.match(/\b(\d{1,2})\s*\+?\s*(?:years?|a[nñ]os?)\b/i);
  return match ? Number(match[1]) : undefined;
}

function detectNonSkillKind(statement: string): JobRequirementKind | undefined {
  if (WORK_AUTH_PATTERN.test(statement)) return 'WORK_AUTHORIZATION';
  if (CERTIFICATION_PATTERN.test(statement)) return 'CERTIFICATION';
  if (EDUCATION_PATTERN.test(statement)) return 'EDUCATION';
  if (LANGUAGE_PATTERN.test(statement)) return 'LANGUAGE';
  if (LOCATION_PATTERN.test(statement)) return 'LOCATION';
  if (EXPERIENCE_PATTERN.test(statement)) return 'EXPERIENCE';
  if (RESPONSIBILITY_PATTERN.test(statement)) return 'RESPONSIBILITY';
  return undefined;
}

function requirementConfidence(kind: JobRequirementKind, necessity: JobRequirementNecessity): number {
  let confidence = kind === 'SKILL' ? 0.98 : kind === 'OTHER' ? 0.55 : 0.78;
  if (necessity !== 'UNKNOWN') confidence += 0.08;
  return Math.min(1, confidence);
}

function createRequirement(
  jobDescription: JobDescription,
  ordinal: number,
  statement: string,
  kind: JobRequirementKind,
  necessity: JobRequirementNecessity,
  options: {
    canonicalConcept?: string;
    aliases?: readonly string[];
    minimumYears?: number;
  } = {},
): JobRequirement {
  return createJobRequirement({
    id: domainId('JobRequirement', `requirement:${jobDescription.id}:${String(ordinal).padStart(3, '0')}`),
    jobDescriptionId: jobDescription.id,
    statement,
    kind,
    necessity,
    canonicalConcept: options.canonicalConcept,
    aliases: options.aliases,
    minimumYears: options.minimumYears,
    confidence: requirementConfidence(kind, necessity),
  });
}

/**
 * Deterministic EN/ES first-pass job intelligence.
 *
 * Explicit required/preferred statements are retained even when the technology
 * is outside the canonical skill catalog, preventing silent requirement loss.
 */
export function analyzeJobDescription(
  sourceText: string,
  options: { projectionKey?: string; capturedAt?: string } = {},
): JobIntelligenceResult {
  const projectionKey = options.projectionKey ?? `job:${Date.now()}`;
  const capturedAt = options.capturedAt ?? new Date().toISOString();
  const jobDescription = createJobDescription({
    id: domainId('JobDescription', `job-description:${projectionKey}`),
    sourceText,
    capturedAt,
  });

  const requirements: JobRequirement[] = [];
  let ordinal = 1;

  splitStatements(sourceText).forEach(({ text: statement, contextNecessity }) => {
    const necessity = detectNecessity(statement, contextNecessity);
    const minimumYears = detectMinimumYears(statement);
    const detectedSkills = SKILLS.filter((skill) =>
      skill.aliases.some((alias) => containsAlias(statement, alias)),
    );

    detectedSkills.forEach((skill) => {
      requirements.push(
        createRequirement(jobDescription, ordinal++, statement, 'SKILL', necessity, {
          canonicalConcept: skill.canonical,
          aliases: skill.aliases,
          minimumYears,
        }),
      );
    });

    const nonSkillKind = detectNonSkillKind(statement);
    const isSkillBoundAttribute = nonSkillKind === 'RESPONSIBILITY' || nonSkillKind === 'EXPERIENCE';
    if (nonSkillKind && (detectedSkills.length === 0 || !isSkillBoundAttribute)) {
      requirements.push(
        createRequirement(jobDescription, ordinal++, statement, nonSkillKind, necessity, {
          minimumYears,
        }),
      );
      return;
    }

    if (detectedSkills.length === 0 && necessity !== 'UNKNOWN') {
      requirements.push(
        createRequirement(jobDescription, ordinal++, statement, 'OTHER', necessity, {
          minimumYears,
        }),
      );
    }
  });

  const deduplicated = new Map<string, JobRequirement>();
  requirements.forEach((requirement) => {
    const key = `${requirement.kind}:${normalize(requirement.canonicalConcept ?? requirement.statement)}:${requirement.necessity}`;
    if (!deduplicated.has(key)) {
      deduplicated.set(key, requirement);
    }
  });

  return {
    jobDescription,
    requirements: Array.from(deduplicated.values()).slice(0, 50),
    language: detectLanguage(sourceText),
  };
}
