import { createHash } from 'node:crypto';
import {
  MARKET_CANDIDATE_RETRIEVAL_POLICY_VERSION,
  MARKET_CANDIDATE_RETRIEVAL_SCHEMA_VERSION,
  domainId,
  type CareerTarget,
  type CareerTargetEmploymentType,
  type CareerTargetSeniority,
  type CareerTargetWorkModel,
  type MarketCandidateSet,
  type MarketObservation,
  type MarketRetrievalCandidate,
  type MarketRetrievalDisposition,
  type MarketRetrievalSignal,
  type MarketRetrievalSignalStatus,
  type ObservedMarketField,
} from '../../domain';
import { stableJson } from '../career-vault/CareerVaultIdentity';
import {
  createMarketOpportunityLink,
  deriveMarketOpportunityId,
  deriveMarketOpportunityLifecycle,
} from './MarketOpportunityIdentityLifecycleService';
import {
  validateMarketObservationHistorySnapshot,
  type MarketObservationHistorySnapshot,
} from './MarketObservationHistory';

export const MARKET_CANDIDATE_RETRIEVAL_SELECTED_LIMIT = 20;
export const MARKET_CANDIDATE_RETRIEVAL_MAX_SELECTED_LIMIT = 50;
export const MARKET_CANDIDATE_RETRIEVAL_MAX_OBSERVATIONS = 5_000;

const ROLE_STOPWORDS = new Set([
  'engineer', 'engineering', 'developer', 'specialist', 'software', 'the', 'and', 'of', 'de', 'y',
]);

const SENIORITY_TERMS: Readonly<Record<Exclude<CareerTargetSeniority, 'ANY'>, readonly string[]>> = {
  ENTRY: ['entry level', 'entry-level', 'graduate', 'new grad'],
  JUNIOR: ['junior', 'jr.', 'jr '],
  MID: ['mid level', 'mid-level', 'intermediate'],
  SENIOR: ['senior', 'sr.', 'sr '],
  LEAD: ['lead', 'technical lead', 'tech lead'],
  STAFF: ['staff'],
  PRINCIPAL: ['principal'],
  MANAGER: ['manager', 'engineering manager'],
  DIRECTOR: ['director'],
};

const WORK_MODEL_TERMS: Readonly<Record<Exclude<CareerTargetWorkModel, 'FLEXIBLE'>, readonly string[]>> = {
  REMOTE: ['remote', 'work from home', 'fully remote', 'remoto', 'remota'],
  HYBRID: ['hybrid', 'hibrido', 'hibrida'],
  ONSITE: ['on-site', 'onsite', 'in office', 'office-based', 'presencial'],
};

const EMPLOYMENT_TERMS: Readonly<Record<Exclude<CareerTargetEmploymentType, 'ANY'>, readonly string[]>> = {
  FULL_TIME: ['full time', 'full-time', 'tiempo completo'],
  PART_TIME: ['part time', 'part-time', 'medio tiempo'],
  CONTRACT: ['contract', 'contractor', 'contrato', 'freelance'],
  INTERNSHIP: ['internship', 'intern', 'practicas', 'practicante'],
};

export class MarketCandidateRetrievalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MarketCandidateRetrievalError';
  }
}

function requireRetrieval(condition: boolean, message: string): asserts condition {
  if (!condition) throw new MarketCandidateRetrievalError(message);
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+#.\-/\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizedTargetValues(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function fieldSignal(input: {
  dimension: MarketRetrievalSignal['dimension'];
  status: MarketRetrievalSignalStatus;
  targetValues: readonly string[];
  field?: ObservedMarketField;
}): MarketRetrievalSignal {
  return {
    dimension: input.dimension,
    status: input.status,
    targetValues: normalizedTargetValues(input.targetValues),
    marketValue: input.field?.value,
    sourcePath: input.field?.evidence.sourcePath,
    scopeBoundary: 'RETRIEVAL_SIGNAL_NOT_JOB_MATCH_OR_CANDIDATE_FACT',
  };
}

function roleSignal(target: CareerTarget, field: ObservedMarketField | undefined): MarketRetrievalSignal {
  if (!field) {
    return fieldSignal({ dimension: 'ROLE', status: 'UNKNOWN', targetValues: [target.roleTitle] });
  }
  const targetRole = normalize(target.roleTitle);
  const marketRole = normalize(field.value);
  if (marketRole.includes(targetRole) || targetRole.includes(marketRole)) {
    return fieldSignal({ dimension: 'ROLE', status: 'ALIGNED', targetValues: [target.roleTitle], field });
  }
  const tokens = targetRole
    .split(' ')
    .filter((token) => token.length >= 3 && !ROLE_STOPWORDS.has(token));
  if (tokens.length === 0) {
    return fieldSignal({ dimension: 'ROLE', status: 'UNKNOWN', targetValues: [target.roleTitle], field });
  }
  const matched = tokens.filter((token) => marketRole.includes(token)).length;
  const status: MarketRetrievalSignalStatus = matched === tokens.length
    ? 'ALIGNED'
    : matched >= Math.max(1, Math.ceil(tokens.length / 2))
      ? 'PARTIAL'
      : 'UNKNOWN';
  return fieldSignal({ dimension: 'ROLE', status, targetValues: [target.roleTitle], field });
}

function classifyExplicit<T extends string>(
  rawValue: string,
  terms: Readonly<Record<T, readonly string[]>>,
): T[] {
  const normalized = normalize(rawValue);
  return (Object.entries(terms) as [T, readonly string[]][])
    .filter(([, values]) => values.some((term) => normalized.includes(normalize(term))))
    .map(([key]) => key);
}

function senioritySignal(target: CareerTarget, field: ObservedMarketField | undefined): MarketRetrievalSignal {
  if (target.preferredSeniority === 'ANY') {
    return fieldSignal({ dimension: 'SENIORITY', status: 'NOT_CONSTRAINED', targetValues: ['ANY'], field });
  }
  if (!field) {
    return fieldSignal({ dimension: 'SENIORITY', status: 'UNKNOWN', targetValues: [target.preferredSeniority] });
  }
  const explicit = classifyExplicit(field.value, SENIORITY_TERMS);
  const status: MarketRetrievalSignalStatus = explicit.length === 0
    ? 'UNKNOWN'
    : explicit.includes(target.preferredSeniority)
      ? 'ALIGNED'
      : 'CONFLICT';
  return fieldSignal({ dimension: 'SENIORITY', status, targetValues: [target.preferredSeniority], field });
}

function workModelSignal(target: CareerTarget, field: ObservedMarketField | undefined): MarketRetrievalSignal {
  if (target.workModels.includes('FLEXIBLE')) {
    return fieldSignal({ dimension: 'WORK_MODEL', status: 'NOT_CONSTRAINED', targetValues: target.workModels, field });
  }
  if (!field) {
    return fieldSignal({ dimension: 'WORK_MODEL', status: 'UNKNOWN', targetValues: target.workModels });
  }
  const explicit = classifyExplicit(field.value, WORK_MODEL_TERMS);
  const status: MarketRetrievalSignalStatus = explicit.length === 0
    ? 'UNKNOWN'
    : explicit.some((value) => target.workModels.includes(value))
      ? 'ALIGNED'
      : 'CONFLICT';
  return fieldSignal({ dimension: 'WORK_MODEL', status, targetValues: target.workModels, field });
}

function employmentSignal(target: CareerTarget, field: ObservedMarketField | undefined): MarketRetrievalSignal {
  if (target.employmentTypes.includes('ANY')) {
    return fieldSignal({ dimension: 'EMPLOYMENT_TYPE', status: 'NOT_CONSTRAINED', targetValues: target.employmentTypes, field });
  }
  if (!field) {
    return fieldSignal({ dimension: 'EMPLOYMENT_TYPE', status: 'UNKNOWN', targetValues: target.employmentTypes });
  }
  const explicit = classifyExplicit(field.value, EMPLOYMENT_TERMS);
  const status: MarketRetrievalSignalStatus = explicit.length === 0
    ? 'UNKNOWN'
    : explicit.some((value) => target.employmentTypes.includes(value))
      ? 'ALIGNED'
      : 'CONFLICT';
  return fieldSignal({ dimension: 'EMPLOYMENT_TYPE', status, targetValues: target.employmentTypes, field });
}

function locationSignal(target: CareerTarget, field: ObservedMarketField | undefined): MarketRetrievalSignal {
  if (target.preferredLocations.length === 0) {
    return fieldSignal({ dimension: 'LOCATION', status: 'NOT_CONSTRAINED', targetValues: [], field });
  }
  if (!field) {
    return fieldSignal({ dimension: 'LOCATION', status: 'UNKNOWN', targetValues: target.preferredLocations });
  }
  const market = normalize(field.value);
  const aligned = target.preferredLocations.some((location) => {
    const desired = normalize(location);
    return market.includes(desired) || desired.includes(market);
  });
  // A non-match is UNKNOWN, not CONFLICT: city/region/remote semantics are too
  // ambiguous for a cheap retrieval gate to prove incompatibility.
  return fieldSignal({
    dimension: 'LOCATION',
    status: aligned ? 'ALIGNED' : 'UNKNOWN',
    targetValues: target.preferredLocations,
    field,
  });
}

function signalsFor(target: CareerTarget, observation: MarketObservation): readonly MarketRetrievalSignal[] {
  return [
    roleSignal(target, observation.explicitFields.roleTitle),
    senioritySignal(target, observation.explicitFields.seniority),
    locationSignal(target, observation.explicitFields.location),
    workModelSignal(target, observation.explicitFields.workModel),
    employmentSignal(target, observation.explicitFields.employmentType),
  ];
}

function openDisposition(signals: readonly MarketRetrievalSignal[]): MarketRetrievalDisposition {
  const role = signals.find((signal) => signal.dimension === 'ROLE');
  const conflicts = signals.filter((signal) => signal.status === 'CONFLICT').length;
  if (role?.status === 'ALIGNED' && conflicts === 0) return 'CANDIDATE';
  if (role?.status === 'ALIGNED' || role?.status === 'PARTIAL') return 'REVIEW';
  return 'INSUFFICIENT_SIGNAL';
}

function dispositionFor(
  lifecycleStatus: MarketRetrievalCandidate['lifecycle']['status'],
  signals: readonly MarketRetrievalSignal[],
): MarketRetrievalDisposition {
  if (lifecycleStatus === 'CLOSED') return 'EXCLUDED_CLOSED';
  if (lifecycleStatus === 'STALE') {
    const role = signals.find((signal) => signal.dimension === 'ROLE');
    return role?.status === 'ALIGNED' || role?.status === 'PARTIAL'
      ? 'REFRESH_FIRST'
      : 'INSUFFICIENT_SIGNAL';
  }
  if (lifecycleStatus === 'UNKNOWN') return 'INSUFFICIENT_SIGNAL';
  return openDisposition(signals);
}

function candidateFor(input: {
  target: CareerTarget;
  observation: MarketObservation;
  lifecycle: ReturnType<typeof deriveMarketOpportunityLifecycle>;
}): MarketRetrievalCandidate {
  const signals = signalsFor(input.target, input.observation);
  const alignedSignalCount = signals.filter((signal) => signal.status === 'ALIGNED').length;
  const conflictSignalCount = signals.filter((signal) => signal.status === 'CONFLICT').length;
  return {
    marketOpportunityId: input.lifecycle.marketOpportunityId,
    marketObservationId: input.observation.id,
    lifecycle: {
      status: input.lifecycle.status,
      basis: input.lifecycle.basis,
      lastObservedAt: input.lifecycle.lastObservedAt,
    },
    provider: input.observation.source.provider,
    companyName: input.observation.explicitFields.companyName?.value,
    roleTitle: input.observation.explicitFields.roleTitle?.value,
    location: input.observation.explicitFields.location?.value,
    disposition: dispositionFor(input.lifecycle.status, signals),
    signals,
    alignedSignalCount,
    conflictSignalCount,
    scopeBoundary: 'MARKET_RETRIEVAL_CANDIDATE_NOT_OPPORTUNITY_ASSESSMENT',
  };
}

const DISPOSITION_ORDER: Readonly<Record<MarketRetrievalDisposition, number>> = {
  CANDIDATE: 0,
  REVIEW: 1,
  REFRESH_FIRST: 2,
  INSUFFICIENT_SIGNAL: 3,
  EXCLUDED_CLOSED: 4,
};

function compareCandidates(left: MarketRetrievalCandidate, right: MarketRetrievalCandidate): number {
  const byDisposition = DISPOSITION_ORDER[left.disposition] - DISPOSITION_ORDER[right.disposition];
  if (byDisposition !== 0) return byDisposition;
  const byAligned = right.alignedSignalCount - left.alignedSignalCount;
  if (byAligned !== 0) return byAligned;
  const byConflict = left.conflictSignalCount - right.conflictSignalCount;
  if (byConflict !== 0) return byConflict;
  const byRecency = Date.parse(right.lifecycle.lastObservedAt) - Date.parse(left.lifecycle.lastObservedAt);
  return byRecency !== 0 ? byRecency : left.marketOpportunityId.localeCompare(right.marketOpportunityId);
}

function retrievalCandidateSemantic(candidate: MarketRetrievalCandidate) {
  return {
    marketOpportunityId: candidate.marketOpportunityId,
    marketObservationId: candidate.marketObservationId,
    lifecycle: candidate.lifecycle,
    provider: candidate.provider,
    companyName: candidate.companyName,
    roleTitle: candidate.roleTitle,
    location: candidate.location,
    disposition: candidate.disposition,
    signals: candidate.signals,
    alignedSignalCount: candidate.alignedSignalCount,
    conflictSignalCount: candidate.conflictSignalCount,
    scopeBoundary: candidate.scopeBoundary,
  };
}

export interface BuildMarketCandidateSetInput {
  readonly target: CareerTarget;
  readonly observationHistory: MarketObservationHistorySnapshot;
  readonly evaluatedAt?: string;
  readonly selectedLimit?: number;
}

/**
 * M4B-10 cheap retrieval boundary.
 *
 * It deliberately does not consume CareerEvidence/CareerAssertions. Before an
 * exact JobRequirement graph exists, comparing candidate skills to description
 * text would be an undeclared second matcher. Candidate specificity comes from
 * the active CareerTarget only; capability remains reserved for Job Match.
 */
export function buildMarketCandidateSet(input: BuildMarketCandidateSetInput): MarketCandidateSet {
  validateMarketObservationHistorySnapshot(input.observationHistory);
  requireRetrieval(
    input.observationHistory.observations.length <= MARKET_CANDIDATE_RETRIEVAL_MAX_OBSERVATIONS,
    `Market candidate retrieval v1 supports at most ${MARKET_CANDIDATE_RETRIEVAL_MAX_OBSERVATIONS} durable observations per bounded scan.`,
  );
  const selectedLimit = input.selectedLimit ?? MARKET_CANDIDATE_RETRIEVAL_SELECTED_LIMIT;
  requireRetrieval(
    Number.isInteger(selectedLimit) && selectedLimit >= 1 && selectedLimit <= MARKET_CANDIDATE_RETRIEVAL_MAX_SELECTED_LIMIT,
    `Market candidate retrieval selectedLimit must be between 1 and ${MARKET_CANDIDATE_RETRIEVAL_MAX_SELECTED_LIMIT}.`,
  );
  const evaluatedAt = input.evaluatedAt ?? new Date().toISOString();
  requireRetrieval(Number.isFinite(Date.parse(evaluatedAt)), 'Market candidate retrieval evaluatedAt must be a valid timestamp.');

  const groups = new Map<string, MarketObservation[]>();
  for (const observation of input.observationHistory.observations) {
    const opportunityId = deriveMarketOpportunityId(observation);
    const group = groups.get(opportunityId) ?? [];
    group.push(observation);
    groups.set(opportunityId, group);
  }

  const allCandidates: MarketRetrievalCandidate[] = [];
  for (const observations of groups.values()) {
    const links = observations.map(createMarketOpportunityLink);
    const lifecycle = deriveMarketOpportunityLifecycle({
      marketOpportunityId: links[0].marketOpportunityId,
      links,
      observationHistory: input.observationHistory,
      evaluatedAt,
    });
    const current = observations.find((observation) => observation.id === lifecycle.currentMarketObservationId);
    requireRetrieval(Boolean(current), `Current MarketObservation ${lifecycle.currentMarketObservationId} is absent from its logical opportunity group.`);
    allCandidates.push(candidateFor({ target: input.target, observation: current!, lifecycle }));
  }

  allCandidates.sort(compareCandidates);
  const selected = allCandidates
    .filter((candidate) => candidate.disposition === 'CANDIDATE' || candidate.disposition === 'REVIEW')
    .slice(0, selectedLimit);
  const refreshFirst = allCandidates
    .filter((candidate) => candidate.disposition === 'REFRESH_FIRST')
    .slice(0, selectedLimit);

  const summary = {
    logicalOpportunityCount: allCandidates.length,
    candidateCount: allCandidates.filter((item) => item.disposition === 'CANDIDATE').length,
    reviewCount: allCandidates.filter((item) => item.disposition === 'REVIEW').length,
    refreshFirstCount: allCandidates.filter((item) => item.disposition === 'REFRESH_FIRST').length,
    excludedClosedCount: allCandidates.filter((item) => item.disposition === 'EXCLUDED_CLOSED').length,
    insufficientSignalCount: allCandidates.filter((item) => item.disposition === 'INSUFFICIENT_SIGNAL').length,
    selectedCount: selected.length,
    selectedLimit,
  };

  const marketUniverseSha256 = sha256(stableJson(allCandidates
    .map((candidate) => retrievalCandidateSemantic(candidate))
    .sort((left, right) => String(left.marketOpportunityId).localeCompare(String(right.marketOpportunityId)))));

  const semantic = {
    schemaVersion: MARKET_CANDIDATE_RETRIEVAL_SCHEMA_VERSION,
    policyVersion: MARKET_CANDIDATE_RETRIEVAL_POLICY_VERSION,
    candidateProfileId: input.target.candidateProfileId,
    careerTargetId: input.target.id,
    careerTargetContentSha256: input.target.contentSha256,
    marketObservationHistoryRevision: input.observationHistory.revision,
    marketUniverseSha256,
    candidates: selected.map(retrievalCandidateSemantic),
    refreshFirst: refreshFirst.map(retrievalCandidateSemantic),
    summary,
    persistence: 'NOT_PERSISTED_CURRENT_RETRIEVAL_VIEW_M4B_10' as const,
    scopeBoundary: 'TARGET_BOUND_MARKET_PREFILTER_NOT_JOB_MATCH_HIRING_PROBABILITY_OR_CANDIDATE_TRUTH' as const,
  };
  const contentSha256 = sha256(stableJson(semantic));

  return {
    ...semantic,
    id: domainId('MarketCandidateSet', `market-candidate-set:${contentSha256.slice(0, 32)}`),
    contentSha256,
    generatedAt: evaluatedAt,
  };
}
