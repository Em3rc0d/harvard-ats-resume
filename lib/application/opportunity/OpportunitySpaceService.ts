import { createHash } from 'node:crypto';
import {
  domainId,
  type CandidateProfileId,
  type CareerSnapshotId,
  type CareerTargetId,
  type OpportunityPriorityBand,
  type OpportunitySpace,
  type OpportunitySpaceEntry,
} from '../../domain';
import { stableJson } from '../career-vault/CareerVaultIdentity';
import type { PersistedOpportunityAssessment } from './OpportunityHistory';
import type { CareerTargetRelevance } from '../target/CareerTargetService';

export const OPPORTUNITY_SPACE_POLICY_VERSION = 'opportunity-space-v1' as const;

export interface OpportunitySpaceCandidate {
  readonly assessmentRecord: PersistedOpportunityAssessment;
  readonly targetRelevance: CareerTargetRelevance;
}

export interface BuildOpportunitySpaceInput {
  readonly candidateProfileId: CandidateProfileId;
  readonly careerSnapshotId: CareerSnapshotId;
  readonly careerTargetId: CareerTargetId;
  readonly candidates: readonly OpportunitySpaceCandidate[];
  readonly generatedAt?: string;
}

const PRIORITY_ORDER: Readonly<Record<OpportunityPriorityBand, number>> = {
  PRIORITIZE_NOW: 0,
  APPLY_SELECTIVELY: 1,
  BUILD_TOWARD: 2,
  EXPLORE: 3,
  DEPRIORITIZE: 4,
  INSUFFICIENT_SIGNAL: 5,
};

const RECOMMENDATION_ORDER = {
  READY_NOW: 0,
  STRONG_STRETCH: 1,
  BUILDABLE: 2,
  ASPIRATIONAL: 3,
  LOW_ALIGNMENT: 4,
} as const;

const RELEVANCE_ORDER = {
  HIGH: 0,
  MEDIUM: 1,
  UNKNOWN: 2,
  LOW: 3,
} as const;

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function assertSpace(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`OpportunitySpace integrity: ${message}`);
}

/**
 * Priority is decision support only. It combines two already-derived dimensions
 * without changing either one: evidence readiness (OpportunityAssessment) and
 * user intent (CareerTargetRelevance). It never changes Job Match.
 */
export function classifyOpportunityPriority(
  assessment: PersistedOpportunityAssessment['assessment'],
  relevance: CareerTargetRelevance,
): OpportunityPriorityBand {
  if (assessment.eligibility === 'BLOCKED' || assessment.recommendation === 'LOW_ALIGNMENT') {
    return 'DEPRIORITIZE';
  }

  if (
    relevance.level === 'UNKNOWN' &&
    assessment.evidenceStrength === 'LIMITED' &&
    assessment.basis.requiredRequirements === 0
  ) {
    return 'INSUFFICIENT_SIGNAL';
  }

  if (relevance.level === 'LOW') return 'DEPRIORITIZE';

  if (relevance.level === 'HIGH') {
    if (assessment.recommendation === 'READY_NOW') return 'PRIORITIZE_NOW';
    if (assessment.recommendation === 'STRONG_STRETCH') return 'APPLY_SELECTIVELY';
    if (assessment.recommendation === 'BUILDABLE' || assessment.recommendation === 'ASPIRATIONAL') {
      return 'BUILD_TOWARD';
    }
  }

  if (relevance.level === 'MEDIUM') {
    if (assessment.recommendation === 'READY_NOW' || assessment.recommendation === 'STRONG_STRETCH') {
      return 'APPLY_SELECTIVELY';
    }
    if (assessment.recommendation === 'BUILDABLE') return 'BUILD_TOWARD';
    return 'EXPLORE';
  }

  if (assessment.recommendation === 'READY_NOW') return 'APPLY_SELECTIVELY';
  return 'EXPLORE';
}

function rationaleFor(
  assessment: PersistedOpportunityAssessment['assessment'],
  relevance: CareerTargetRelevance,
  priority: OpportunityPriorityBand,
): string {
  if (priority === 'PRIORITIZE_NOW') {
    return 'Evidence supports a ready-now application and the opportunity is highly aligned with the active Career Target.';
  }
  if (priority === 'APPLY_SELECTIVELY') {
    return `The opportunity is application-worthy, but should be weighed selectively because evidence readiness is ${assessment.recommendation} and target relevance is ${relevance.level}.`;
  }
  if (priority === 'BUILD_TOWARD') {
    return `The opportunity aligns with the chosen direction, but current evidence readiness is ${assessment.recommendation}; strengthen the concrete gaps before making it a primary application target.`;
  }
  if (priority === 'EXPLORE') {
    return `The available signals are useful for exploration, but evidence readiness (${assessment.recommendation}) and target relevance (${relevance.level}) do not justify immediate priority.`;
  }
  if (priority === 'INSUFFICIENT_SIGNAL') {
    return 'Neither explicit target alignment nor strong required-requirement evidence is sufficient to rank this opportunity confidently.';
  }
  if (assessment.eligibility === 'BLOCKED') {
    return 'An explicit eligibility blocker makes this opportunity inefficient to prioritize regardless of target preference.';
  }
  if (relevance.level === 'LOW') {
    return 'The opportunity may contain defendable work, but it conflicts with the active Career Target and is therefore deprioritized.';
  }
  return 'Current evidence alignment is too weak to justify prioritizing this opportunity.';
}

function toEntry(candidate: OpportunitySpaceCandidate): OpportunitySpaceEntry {
  const { assessmentRecord, targetRelevance } = candidate;
  const priority = classifyOpportunityPriority(assessmentRecord.assessment, targetRelevance);
  return {
    jobSnapshotId: assessmentRecord.jobSnapshotId,
    opportunityAssessmentId: assessmentRecord.id,
    priority,
    recommendation: assessmentRecord.assessment.recommendation,
    targetRelevance: targetRelevance.level,
    eligibility: assessmentRecord.assessment.eligibility,
    criticalGapCount: assessmentRecord.assessment.criticalGaps.length,
    rationale: rationaleFor(assessmentRecord.assessment, targetRelevance, priority),
  };
}

function sortEntries(entries: readonly OpportunitySpaceEntry[]): OpportunitySpaceEntry[] {
  return [...entries].sort((left, right) => {
    const byPriority = PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority];
    if (byPriority !== 0) return byPriority;
    const byRecommendation = RECOMMENDATION_ORDER[left.recommendation] - RECOMMENDATION_ORDER[right.recommendation];
    if (byRecommendation !== 0) return byRecommendation;
    const byRelevance = RELEVANCE_ORDER[left.targetRelevance] - RELEVANCE_ORDER[right.targetRelevance];
    if (byRelevance !== 0) return byRelevance;
    if (left.criticalGapCount !== right.criticalGapCount) return left.criticalGapCount - right.criticalGapCount;
    return left.jobSnapshotId.localeCompare(right.jobSnapshotId);
  });
}

export function validateOpportunitySpace(space: OpportunitySpace): void {
  assertSpace(space.policyVersion === OPPORTUNITY_SPACE_POLICY_VERSION, 'unsupported policy version.');
  assertSpace(space.entries.length >= 2, 'at least two opportunities are required.');
  assertSpace(new Set(space.entries.map((entry) => entry.jobSnapshotId)).size === space.entries.length, 'duplicate JobSnapshot IDs.');
  assertSpace(new Set(space.entries.map((entry) => entry.opportunityAssessmentId)).size === space.entries.length, 'duplicate OpportunityAssessment IDs.');
  assertSpace(space.scopeBoundary === 'DERIVED_PRIORITY_NOT_CAREER_OR_MARKET_FACT', 'scope boundary changed.');

  const semantic = {
    candidateProfileId: space.candidateProfileId,
    careerSnapshotId: space.careerSnapshotId,
    careerTargetId: space.careerTargetId,
    policyVersion: space.policyVersion,
    entries: space.entries,
    scopeBoundary: space.scopeBoundary,
  };
  const expectedHash = sha256(stableJson(semantic));
  assertSpace(space.contentSha256 === expectedHash, 'content hash mismatch.');
  assertSpace(space.id === `opportunity-space:${expectedHash.slice(0, 32)}`, 'identity is not content-addressed.');
}

/**
 * Builds one explainable comparison space for ONE immutable CareerSnapshot,
 * ONE explicit CareerTarget and MANY immutable JobSnapshot assessments.
 */
export function buildOpportunitySpace(input: BuildOpportunitySpaceInput): OpportunitySpace {
  assertSpace(input.candidates.length >= 2, 'compare at least two opportunities.');
  input.candidates.forEach(({ assessmentRecord }) => assertSpace(
    assessmentRecord.careerSnapshotId === input.careerSnapshotId,
    `assessment ${assessmentRecord.id} belongs to a different CareerSnapshot.`,
  ));

  const entries = sortEntries(input.candidates.map(toEntry));
  const semantic = {
    candidateProfileId: input.candidateProfileId,
    careerSnapshotId: input.careerSnapshotId,
    careerTargetId: input.careerTargetId,
    policyVersion: OPPORTUNITY_SPACE_POLICY_VERSION,
    entries,
    scopeBoundary: 'DERIVED_PRIORITY_NOT_CAREER_OR_MARKET_FACT' as const,
  };
  const contentSha256 = sha256(stableJson(semantic));
  const space: OpportunitySpace = {
    id: domainId('OpportunitySpace', `opportunity-space:${contentSha256.slice(0, 32)}`),
    ...semantic,
    contentSha256,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
  };
  validateOpportunitySpace(space);
  return space;
}
