import {
  createMatchReport,
  createRequirementMatch,
  domainId,
  type CareerAssertion,
  type CareerAssertionId,
  type JobRequirement,
  type MatchReport,
  type RequirementMatch,
  type RequirementMatchStatus,
} from '../../domain';
import type { JobIntelligenceResult } from '../job/JobIntelligenceEngine';

export interface JobMatchBreakdown {
  readonly required: { readonly matched: number; readonly total: number };
  readonly preferred: { readonly matched: number; readonly total: number };
  readonly unknown: { readonly matched: number; readonly total: number };
  readonly gaps: number;
  readonly blockers: number;
}

export interface JobMatchResult {
  readonly score: number;
  readonly report: MatchReport;
  readonly requirements: readonly JobRequirement[];
  readonly breakdown: JobMatchBreakdown;
}

type ResponsibilityIntent =
  | 'LEADERSHIP'
  | 'ARCHITECTURE'
  | 'OWNERSHIP'
  | 'DESIGN'
  | 'MENTORING'
  | 'MANAGEMENT'
  | 'IMPLEMENTATION'
  | 'MAINTENANCE'
  | 'COLLABORATION'
  | 'DEVELOPMENT'
  | 'UNKNOWN';

type DegreeLevel = 'BACHELOR' | 'MASTER' | 'UNKNOWN';

const STOPWORDS = new Set([
  'and', 'the', 'for', 'with', 'from', 'that', 'this', 'your', 'you', 'our',
  'are', 'will', 'have', 'has', 'must', 'required', 'preferred', 'minimum',
  'experience', 'years', 'year', 'work', 'role', 'ability', 'skills', 'skill',
  'con', 'para', 'los', 'las', 'una', 'uno', 'que', 'del', 'por', 'debe',
  'requerido', 'requerida', 'preferido', 'preferida', 'experiencia', 'anos',
  'trabajo', 'habilidad', 'habilidades', 'minimo',
]);

const STRICT_RESPONSIBILITY_INTENTS = new Set<ResponsibilityIntent>([
  'LEADERSHIP',
  'ARCHITECTURE',
  'OWNERSHIP',
  'MENTORING',
  'MANAGEMENT',
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsConcept(text: string, concept: string): boolean {
  const normalizedText = normalize(text);
  const normalizedConcept = normalize(concept);
  const escaped = escapeRegex(normalizedConcept);
  const boundary = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
  return boundary.test(normalizedText);
}

function meaningfulTokens(value: string): Set<string> {
  return new Set(
    normalize(value)
      .replace(/[^a-z0-9+#.\-/\s]/g, ' ')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3 && !STOPWORDS.has(token)),
  );
}

function lexicalOverlap(requirement: string, assertion: string): number {
  const requirementTokens = meaningfulTokens(requirement);
  const assertionTokens = meaningfulTokens(assertion);

  if (requirementTokens.size === 0) return 0;

  let overlap = 0;
  requirementTokens.forEach((token) => {
    if (assertionTokens.has(token)) overlap += 1;
  });

  return overlap / requirementTokens.size;
}

function extractYear(value: string): number | undefined {
  const match = value.match(/\b(19|20)\d{2}\b/);
  if (match) return Number(match[0]);

  if (/\b(present|current|actual|presente|today|hoy)\b/i.test(value)) {
    return new Date().getFullYear();
  }

  return undefined;
}

function experienceDurationYears(assertion: CareerAssertion): number | undefined {
  const match = assertion.statement.match(/\bfrom\s+(.+?)\s+to\s+(.+?)\./i);
  if (!match) return undefined;

  const startYear = extractYear(match[1]);
  const endYear = extractYear(match[2]);
  if (startYear === undefined || endYear === undefined || endYear < startYear) return undefined;

  return endYear - startYear;
}

function skillMatch(
  requirement: JobRequirement,
  assertions: readonly CareerAssertion[],
): CareerAssertion[] {
  const concepts = [
    requirement.canonicalConcept,
    ...(requirement.aliases ?? []),
  ].filter((value): value is string => Boolean(value?.trim()));

  return assertions.filter((assertion) =>
    concepts.some((concept) => containsConcept(assertion.statement, concept)),
  );
}

function linkedExperienceAssertions(
  skillAssertions: readonly CareerAssertion[],
  allAssertions: readonly CareerAssertion[],
  concept: string,
): CareerAssertion[] {
  const companies = skillAssertions
    .map((assertion) => assertion.statement.match(/\bused\s+.+?\s+at\s+(.+?)\s+while serving as\b/i)?.[1]?.trim())
    .filter((company): company is string => Boolean(company));

  return allAssertions.filter((assertion) => {
    if (!/\bworked at\b/i.test(assertion.statement)) return false;
    if (containsConcept(assertion.statement, concept)) return true;
    return companies.some((company) => normalize(assertion.statement).includes(`worked at ${normalize(company)} as`));
  });
}

function applyMinimumYearsToSkill(
  requirement: JobRequirement,
  skillAssertions: readonly CareerAssertion[],
  allAssertions: readonly CareerAssertion[],
): { status: RequirementMatchStatus; assertions: readonly CareerAssertion[]; rationale: string } {
  const minimumYears = requirement.minimumYears;
  const concept = requirement.canonicalConcept ?? 'required skill';

  if (minimumYears === undefined) {
    return {
      status: 'MATCH',
      assertions: skillAssertions,
      rationale: `Candidate evidence explicitly supports ${concept}.`,
    };
  }

  const experienceAssertions = linkedExperienceAssertions(skillAssertions, allAssertions, concept);
  const durations = experienceAssertions
    .map((assertion) => ({ assertion, years: experienceDurationYears(assertion) }))
    .filter((item): item is { assertion: CareerAssertion; years: number } => item.years !== undefined);
  const sufficient = durations.filter((item) => item.years >= minimumYears);

  if (sufficient.length > 0) {
    return {
      status: 'MATCH',
      assertions: [...skillAssertions, ...sufficient.map((item) => item.assertion)],
      rationale: `Candidate evidence supports ${concept} and at least ${minimumYears} years in a linked experience period.`,
    };
  }

  if (durations.length > 0) {
    const maxYears = Math.max(...durations.map((item) => item.years));
    return {
      status: 'GAP',
      assertions: skillAssertions,
      rationale: `Candidate evidence supports ${concept}, but the longest linked documented period is ${maxYears} years versus ${minimumYears} required.`,
    };
  }

  return {
    status: 'POTENTIAL_MATCH',
    assertions: skillAssertions,
    rationale: `Candidate evidence supports ${concept}, but the required ${minimumYears}-year tenure is not evidenced by a parseable linked date range.`,
  };
}

function lexicalMatches(
  requirement: JobRequirement,
  assertions: readonly CareerAssertion[],
): { exact: CareerAssertion[]; potential: CareerAssertion[] } {
  const exact: CareerAssertion[] = [];
  const potential: CareerAssertion[] = [];

  assertions.forEach((assertion) => {
    const overlap = lexicalOverlap(requirement.statement, assertion.statement);
    if (overlap >= 0.6) exact.push(assertion);
    else if (overlap >= 0.3) potential.push(assertion);
  });

  return { exact, potential };
}

function applyMinimumYearsToLexical(
  requirement: JobRequirement,
  candidates: readonly CareerAssertion[],
  defaultStatus: RequirementMatchStatus,
): { status: RequirementMatchStatus; assertions: readonly CareerAssertion[]; rationale: string } {
  if (requirement.minimumYears === undefined) {
    return {
      status: defaultStatus,
      assertions: candidates,
      rationale: defaultStatus === 'MATCH'
        ? 'Candidate assertions provide strong lexical evidence for this requirement.'
        : 'Candidate assertions partially overlap this requirement; human review may confirm the relationship.',
    };
  }

  const durations = candidates
    .map((assertion) => ({ assertion, years: experienceDurationYears(assertion) }))
    .filter((item): item is { assertion: CareerAssertion; years: number } => item.years !== undefined);
  const sufficient = durations.filter((item) => item.years >= requirement.minimumYears!);

  if (sufficient.length > 0) {
    return {
      status: defaultStatus,
      assertions: sufficient.map((item) => item.assertion),
      rationale: `Candidate assertions support the requirement and document at least ${requirement.minimumYears} years in a relevant experience period.`,
    };
  }

  if (durations.length > 0) {
    const maxYears = Math.max(...durations.map((item) => item.years));
    return {
      status: 'GAP',
      assertions: candidates,
      rationale: `Relevant candidate evidence documents at most ${maxYears} years versus ${requirement.minimumYears} required.`,
    };
  }

  return {
    status: 'POTENTIAL_MATCH',
    assertions: candidates,
    rationale: `Candidate assertions overlap this requirement, but the required ${requirement.minimumYears}-year duration is not evidenced by a parseable date range.`,
  };
}

function responsibilityIntent(value: string): ResponsibilityIntent {
  const text = normalize(value);
  if (/\b(lead|leads|leading|led|liderar|lidera|lidero|liderando)\b/.test(text)) return 'LEADERSHIP';
  if (/\b(architect|architected|architecting|architecture|arquitectar|arquitecto|arquitectura)\b/.test(text)) return 'ARCHITECTURE';
  if (/\b(own|owns|owned|ownership|dueno|propietario)\b/.test(text)) return 'OWNERSHIP';
  if (/\b(design|designed|designing|disenar|diseno|disenando)\b/.test(text)) return 'DESIGN';
  if (/\b(mentor|mentored|mentoring|mentorar|mentoreo)\b/.test(text)) return 'MENTORING';
  if (/\b(manage|managed|managing|gestionar|gestiono|gestionando)\b/.test(text)) return 'MANAGEMENT';
  if (/\b(implement|implemented|implementing|implementar|implemento|implementando)\b/.test(text)) return 'IMPLEMENTATION';
  if (/\b(maintain|maintained|maintaining|mantener|mantuvo|manteniendo)\b/.test(text)) return 'MAINTENANCE';
  if (/\b(collaborate|collaborated|collaborating|colaborar|colaboro|colaborando)\b/.test(text)) return 'COLLABORATION';
  if (/\b(develop|developed|developing|build|built|building|create|created|desarrollar|desarrollo|construir|construyo|crear|creo)\b/.test(text)) return 'DEVELOPMENT';
  return 'UNKNOWN';
}

function classifyResponsibility(
  requirement: JobRequirement,
  assertions: readonly CareerAssertion[],
): { status: RequirementMatchStatus; assertions: readonly CareerAssertion[]; rationale: string } {
  const intent = responsibilityIntent(requirement.statement);
  const lexical = lexicalMatches(requirement, assertions);

  if (STRICT_RESPONSIBILITY_INTENTS.has(intent)) {
    const sameIntent = assertions.filter((assertion) => responsibilityIntent(assertion.statement) === intent);
    const sameIntentLexical = lexicalMatches(requirement, sameIntent);

    if (sameIntentLexical.exact.length > 0) {
      return applyMinimumYearsToLexical(requirement, sameIntentLexical.exact, 'MATCH');
    }
    if (sameIntentLexical.potential.length > 0) {
      return applyMinimumYearsToLexical(requirement, sameIntentLexical.potential, 'POTENTIAL_MATCH');
    }

    return {
      status: 'GAP',
      assertions: [],
      rationale: `Candidate evidence does not explicitly support the required ${intent.toLowerCase()} responsibility; shared domain nouns alone are insufficient.`,
    };
  }

  if (intent === 'DESIGN') {
    const designAssertions = assertions.filter((assertion) => responsibilityIntent(assertion.statement) === 'DESIGN');
    const designLexical = lexicalMatches(requirement, designAssertions);
    if (designLexical.exact.length > 0) {
      return applyMinimumYearsToLexical(requirement, designLexical.exact, 'MATCH');
    }
    if (designLexical.potential.length > 0) {
      return applyMinimumYearsToLexical(requirement, designLexical.potential, 'POTENTIAL_MATCH');
    }

    const topical = [...lexical.exact, ...lexical.potential];
    if (topical.length > 0) {
      return {
        status: 'POTENTIAL_MATCH',
        assertions: topical,
        rationale: 'Candidate evidence overlaps the design domain, but explicit design responsibility is not documented.',
      };
    }

    return {
      status: 'GAP',
      assertions: [],
      rationale: 'No candidate assertion supports the requested design responsibility or its domain context.',
    };
  }

  if (lexical.exact.length > 0) {
    return applyMinimumYearsToLexical(requirement, lexical.exact, 'MATCH');
  }
  if (lexical.potential.length > 0) {
    return applyMinimumYearsToLexical(requirement, lexical.potential, 'POTENTIAL_MATCH');
  }

  return {
    status: 'GAP',
    assertions: [],
    rationale: 'No evidence-backed candidate assertion currently supports this responsibility.',
  };
}

function degreeLevel(value: string): DegreeLevel {
  const text = normalize(value);
  if (/\b(master|masters|maestria)\b/.test(text)) return 'MASTER';
  if (/\b(bachelor|bachelors|licenciatura|ingenieria)\b/.test(text)) return 'BACHELOR';
  return 'UNKNOWN';
}

function classifyEducation(
  requirement: JobRequirement,
  assertions: readonly CareerAssertion[],
): { status: RequirementMatchStatus; assertions: readonly CareerAssertion[]; rationale: string } {
  const requestedLevel = degreeLevel(requirement.statement);
  const educationAssertions = assertions.filter((assertion) => /^studied\b/i.test(assertion.statement));

  if (requestedLevel !== 'UNKNOWN') {
    const eligible = educationAssertions.filter((assertion) => {
      const candidateLevel = degreeLevel(assertion.statement);
      if (requestedLevel === 'MASTER') return candidateLevel === 'MASTER';
      return candidateLevel === 'BACHELOR' || candidateLevel === 'MASTER';
    });

    if (eligible.length === 0) {
      return {
        status: 'GAP',
        assertions: [],
        rationale: `Candidate education does not document the required ${requestedLevel.toLowerCase()} degree level.`,
      };
    }

    const lexical = lexicalMatches(requirement, eligible);
    if (lexical.exact.length > 0) {
      return { status: 'MATCH', assertions: lexical.exact, rationale: 'Candidate education matches the required degree level and field context.' };
    }
    if (lexical.potential.length > 0) {
      return { status: 'POTENTIAL_MATCH', assertions: lexical.potential, rationale: 'Candidate education matches the degree level but only partially overlaps the requested field context.' };
    }

    return {
      status: 'POTENTIAL_MATCH',
      assertions: eligible,
      rationale: 'Candidate education satisfies the requested degree level, but field equivalence requires review.',
    };
  }

  const lexical = lexicalMatches(requirement, educationAssertions);
  if (lexical.exact.length > 0) return { status: 'MATCH', assertions: lexical.exact, rationale: 'Candidate education strongly supports this requirement.' };
  if (lexical.potential.length > 0) return { status: 'POTENTIAL_MATCH', assertions: lexical.potential, rationale: 'Candidate education partially overlaps this requirement.' };
  return { status: 'GAP', assertions: [], rationale: 'No candidate education assertion supports this requirement.' };
}

function languageConcept(value: string): string | undefined {
  const text = normalize(value);
  const concepts: readonly [string, readonly string[]][] = [
    ['english', ['english', 'ingles']],
    ['spanish', ['spanish', 'espanol']],
    ['french', ['french', 'frances']],
    ['portuguese', ['portuguese', 'portugues']],
  ];

  return concepts.find(([, aliases]) => aliases.some((alias) => containsConcept(text, alias)))?.[0];
}

function proficiencyRank(value: string): number | undefined {
  const text = normalize(value);
  if (/\b(native|nativo|nativa)\b/.test(text)) return 5;
  if (/\b(fluent|fluido|fluida|bilingual|bilingue)\b/.test(text)) return 4;
  if (/\b(advanced|avanzado|avanzada)\b/.test(text)) return 3;
  if (/\b(intermediate|intermedio|intermedia)\b/.test(text)) return 2;
  if (/\b(basic|basico|basica)\b/.test(text)) return 1;
  return undefined;
}

function classifyLanguage(
  requirement: JobRequirement,
  assertions: readonly CareerAssertion[],
): { status: RequirementMatchStatus; assertions: readonly CareerAssertion[]; rationale: string } {
  const requestedLanguage = languageConcept(requirement.statement);
  if (!requestedLanguage) {
    const lexical = lexicalMatches(requirement, assertions);
    if (lexical.exact.length > 0) return { status: 'MATCH', assertions: lexical.exact, rationale: 'Candidate language evidence strongly supports this requirement.' };
    if (lexical.potential.length > 0) return { status: 'POTENTIAL_MATCH', assertions: lexical.potential, rationale: 'Candidate language evidence partially overlaps this requirement.' };
    return { status: 'GAP', assertions: [], rationale: 'No candidate language evidence supports this requirement.' };
  }

  const languageAssertions = assertions.filter((assertion) =>
    /^language\b/i.test(assertion.statement) && languageConcept(assertion.statement) === requestedLanguage,
  );

  if (languageAssertions.length === 0) {
    return {
      status: 'GAP',
      assertions: [],
      rationale: `Candidate evidence does not document ${requestedLanguage}.`,
    };
  }

  const requiredRank = proficiencyRank(requirement.statement);
  if (requiredRank === undefined) {
    return { status: 'MATCH', assertions: languageAssertions, rationale: `Candidate evidence documents ${requestedLanguage}.` };
  }

  const adequate = languageAssertions.filter((assertion) => (proficiencyRank(assertion.statement) ?? 0) >= requiredRank);
  if (adequate.length > 0) {
    return { status: 'MATCH', assertions: adequate, rationale: `Candidate evidence documents ${requestedLanguage} at or above the required proficiency.` };
  }

  return {
    status: 'GAP',
    assertions: languageAssertions,
    rationale: `Candidate evidence documents ${requestedLanguage}, but not at the required proficiency.`,
  };
}

function classifyLocation(
  requirement: JobRequirement,
  assertions: readonly CareerAssertion[],
): { status: RequirementMatchStatus; assertions: readonly CareerAssertion[]; rationale: string } {
  const locationAssertions = assertions.filter((assertion) => /^candidate location:/i.test(assertion.statement));
  const normalizedRequirement = normalize(requirement.statement);

  const exact = locationAssertions.filter((assertion) => {
    const location = assertion.statement.replace(/^candidate location:\s*/i, '').replace(/\.$/, '').trim();
    return location.length >= 2 && normalizedRequirement.includes(normalize(location));
  });

  if (exact.length > 0) {
    return { status: 'MATCH', assertions: exact, rationale: 'Candidate location explicitly matches the stated job location requirement.' };
  }

  if (/\b(remote|remoto)\b/.test(normalizedRequirement)) {
    const remoteEvidence = assertions.filter((assertion) => /\b(remote|remoto)\b/i.test(assertion.statement));
    if (remoteEvidence.length > 0) {
      return { status: 'MATCH', assertions: remoteEvidence, rationale: 'Candidate evidence explicitly supports the remote-location requirement.' };
    }
  }

  return {
    status: 'GAP',
    assertions: locationAssertions,
    rationale: 'Candidate location evidence does not match the explicit job location requirement.',
  };
}

function classifyMatch(
  requirement: JobRequirement,
  assertions: readonly CareerAssertion[],
): { status: RequirementMatchStatus; assertions: readonly CareerAssertion[]; rationale: string } {
  if (requirement.kind === 'SKILL' && requirement.canonicalConcept) {
    const matches = skillMatch(requirement, assertions);
    if (matches.length > 0) {
      return applyMinimumYearsToSkill(requirement, matches, assertions);
    }

    return {
      status: 'GAP',
      assertions: [],
      rationale: `No candidate assertion supports ${requirement.canonicalConcept}; the job requirement is not converted into a candidate fact.`,
    };
  }

  if (requirement.kind === 'RESPONSIBILITY') {
    return classifyResponsibility(requirement, assertions);
  }

  if (requirement.kind === 'EDUCATION') {
    return classifyEducation(requirement, assertions);
  }

  if (requirement.kind === 'LANGUAGE') {
    return classifyLanguage(requirement, assertions);
  }

  if (requirement.kind === 'LOCATION') {
    return classifyLocation(requirement, assertions);
  }

  const lexical = lexicalMatches(requirement, assertions);
  if (lexical.exact.length > 0) {
    return applyMinimumYearsToLexical(requirement, lexical.exact, 'MATCH');
  }

  if (lexical.potential.length > 0) {
    return applyMinimumYearsToLexical(requirement, lexical.potential, 'POTENTIAL_MATCH');
  }

  if (requirement.kind === 'WORK_AUTHORIZATION') {
    return {
      status: 'UNKNOWN',
      assertions: [],
      rationale: 'Work-authorization evidence is not present. Absence of evidence is not treated as a blocker or negative candidate fact.',
    };
  }

  return {
    status: 'GAP',
    assertions: [],
    rationale: 'No evidence-backed candidate assertion currently supports this requirement.',
  };
}

function necessityWeight(requirement: JobRequirement): number {
  if (requirement.necessity === 'REQUIRED') return 3;
  if (requirement.necessity === 'PREFERRED') return 1.5;
  return 1;
}

function statusValue(status: RequirementMatchStatus): number {
  if (status === 'MATCH') return 1;
  if (status === 'POTENTIAL_MATCH') return 0.5;
  return 0;
}

function calculateScore(
  requirements: readonly JobRequirement[],
  matches: readonly RequirementMatch[],
): number {
  if (requirements.length === 0) return 0;

  let earned = 0;
  let possible = 0;

  requirements.forEach((requirement, index) => {
    const weight = necessityWeight(requirement);
    possible += weight;
    earned += weight * statusValue(matches[index]?.status ?? 'UNKNOWN');
  });

  return possible === 0 ? 0 : Math.round((earned / possible) * 100);
}

function buildBreakdown(
  requirements: readonly JobRequirement[],
  matches: readonly RequirementMatch[],
): JobMatchBreakdown {
  const breakdown = {
    required: { matched: 0, total: 0 },
    preferred: { matched: 0, total: 0 },
    unknown: { matched: 0, total: 0 },
    gaps: 0,
    blockers: 0,
  };

  requirements.forEach((requirement, index) => {
    const match = matches[index];
    const matched = match?.status === 'MATCH' || match?.status === 'POTENTIAL_MATCH';

    if (requirement.necessity === 'REQUIRED') {
      breakdown.required.total += 1;
      if (matched) breakdown.required.matched += 1;
    } else if (requirement.necessity === 'PREFERRED') {
      breakdown.preferred.total += 1;
      if (matched) breakdown.preferred.matched += 1;
    } else {
      breakdown.unknown.total += 1;
      if (matched) breakdown.unknown.matched += 1;
    }

    if (match?.status === 'GAP') breakdown.gaps += 1;
    if (match?.status === 'BLOCKER') breakdown.blockers += 1;
  });

  return breakdown;
}

/**
 * Matches job truth against existing candidate assertions.
 * The engine creates inference artifacts only; it never creates assertions.
 */
export function matchJobToCandidate(
  job: JobIntelligenceResult,
  assertions: readonly CareerAssertion[],
  options: { projectionKey?: string; generatedAt?: string } = {},
): JobMatchResult {
  if (assertions.length === 0) {
    throw new Error('JobMatchEngine requires candidate assertions.');
  }

  const candidateProfileId = assertions[0].candidateProfileId;
  const projectionKey = options.projectionKey ?? `match:${Date.now()}`;
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const matches: RequirementMatch[] = job.requirements.map((requirement, index) => {
    const classification = classifyMatch(requirement, assertions);
    const assertionIds: CareerAssertionId[] = classification.assertions.map((assertion) => assertion.id);

    return createRequirementMatch({
      id: domainId('RequirementMatch', `requirement-match:${projectionKey}:${String(index + 1).padStart(3, '0')}`),
      requirementId: requirement.id,
      assertionIds,
      status: classification.status,
      rationale: classification.rationale,
    });
  });

  const report = createMatchReport({
    id: domainId('MatchReport', `match-report:${projectionKey}`),
    candidateProfileId,
    jobDescriptionId: job.jobDescription.id,
    matches,
    generatedAt,
  });

  return {
    score: calculateScore(job.requirements, matches),
    report,
    requirements: job.requirements,
    breakdown: buildBreakdown(job.requirements, matches),
  };
}
