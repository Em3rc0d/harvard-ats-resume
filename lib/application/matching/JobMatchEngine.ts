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

const STOPWORDS = new Set([
  'and', 'the', 'for', 'with', 'from', 'that', 'this', 'your', 'you', 'our',
  'are', 'will', 'have', 'has', 'must', 'required', 'preferred', 'minimum',
  'experience', 'years', 'year', 'work', 'role', 'ability', 'skills', 'skill',
  'con', 'para', 'los', 'las', 'una', 'uno', 'que', 'del', 'por', 'debe',
  'requerido', 'requerida', 'preferido', 'preferida', 'experiencia', 'anos',
  'trabajo', 'habilidad', 'habilidades', 'minimo',
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

function classifyMatch(
  requirement: JobRequirement,
  assertions: readonly CareerAssertion[],
): { status: RequirementMatchStatus; assertions: readonly CareerAssertion[]; rationale: string } {
  if (requirement.kind === 'SKILL' && requirement.canonicalConcept) {
    const matches = skillMatch(requirement, assertions);
    if (matches.length > 0) {
      return {
        status: 'MATCH',
        assertions: matches,
        rationale: `Candidate evidence explicitly supports ${requirement.canonicalConcept}.`,
      };
    }

    return {
      status: 'GAP',
      assertions: [],
      rationale: `No candidate assertion supports ${requirement.canonicalConcept}; the job requirement is not converted into a candidate fact.`,
    };
  }

  const lexical = lexicalMatches(requirement, assertions);
  if (lexical.exact.length > 0) {
    return {
      status: 'MATCH',
      assertions: lexical.exact,
      rationale: 'Candidate assertions provide strong lexical evidence for this requirement.',
    };
  }

  if (lexical.potential.length > 0) {
    return {
      status: 'POTENTIAL_MATCH',
      assertions: lexical.potential,
      rationale: 'Candidate assertions partially overlap this requirement; human review may confirm the relationship.',
    };
  }

  if (requirement.kind === 'WORK_AUTHORIZATION' && requirement.necessity === 'REQUIRED') {
    return {
      status: 'BLOCKER',
      assertions: [],
      rationale: 'Required work-authorization evidence is not present in candidate assertions.',
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
