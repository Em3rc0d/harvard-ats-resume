import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  domainId,
  type CandidateProfileId,
  type CareerSnapshotId,
  type CareerTargetId,
} from '../../lib/domain';
import {
  buildOpportunitySpace,
  classifyOpportunityPriority,
} from '../../lib/application/opportunity/OpportunitySpaceService';
import {
  persistOpportunitySpace,
  type OpportunitySpaceHistory,
  type OpportunitySpaceRepository,
} from '../../lib/application/opportunity/OpportunitySpaceHistory';
import type { PersistedOpportunityAssessment } from '../../lib/application/opportunity/OpportunityHistory';
import type { OpportunityAssessment } from '../../lib/application/opportunity/OpportunityAssessment';
import type { CareerTargetRelevance } from '../../lib/application/target/CareerTargetService';

const candidateProfileId = domainId('CandidateProfile', 'candidate:test-opportunity-space');
const careerSnapshotId = domainId('CareerSnapshot', 'career-snapshot:test-opportunity-space');
const targetId = domainId('CareerTarget', 'career-target:backend');

class MemoryOpportunitySpaceRepository implements OpportunitySpaceRepository {
  snapshot: OpportunitySpaceHistory | null = null;

  async load(id: CandidateProfileId): Promise<OpportunitySpaceHistory | null> {
    if (!this.snapshot || this.snapshot.candidateProfileId !== id) return null;
    return structuredClone(this.snapshot);
  }

  async save(history: OpportunitySpaceHistory): Promise<void> {
    this.snapshot = structuredClone(history);
  }
}

function assessment(
  recommendation: OpportunityAssessment['recommendation'],
  score: number,
  overrides: Partial<OpportunityAssessment> = {},
): OpportunityAssessment {
  return {
    policyVersion: 'market-opportunity-assessment-v1',
    recommendation,
    shouldApply: recommendation === 'READY_NOW' ? 'YES' : recommendation === 'STRONG_STRETCH' ? 'CONSIDER' : 'NOT_YET',
    nextAction: recommendation === 'READY_NOW' ? 'APPLY' : recommendation === 'STRONG_STRETCH' ? 'APPLY_WITH_CAUTION' : 'BUILD_FIRST',
    eligibility: 'CLEAR',
    evidenceStrength: score >= 75 ? 'STRONG' : score >= 45 ? 'MODERATE' : 'LIMITED',
    rationale: 'Test assessment.',
    jobMatchScore: score,
    requiredCoverage: 100,
    preferredCoverage: 50,
    strongEvidence: [],
    transferableEvidence: [],
    criticalGaps: [],
    optionalGaps: [],
    uncertainties: [],
    basis: {
      totalRequirements: 3,
      requiredRequirements: 2,
      preferredRequirements: 1,
      unknownNecessityRequirements: 0,
    },
    scopeBoundary: 'Evidence-based application guidance only. This is not a hiring probability, recruiter decision, or score from a commercial ATS.',
    ...overrides,
  };
}

function relevance(level: CareerTargetRelevance['level']): CareerTargetRelevance {
  return {
    policyVersion: 'career-target-v1',
    level,
    role: level === 'HIGH' ? 'ALIGNED' : level === 'LOW' ? 'UNKNOWN' : 'PARTIAL',
    seniority: level === 'LOW' ? 'CONFLICT' : 'ALIGNED',
    location: 'NOT_CONSTRAINED',
    workModel: 'NOT_CONSTRAINED',
    employmentType: 'NOT_CONSTRAINED',
    reasons: [`Target relevance: ${level}`],
    scopeBoundary: 'PREFERENCE_ALIGNMENT_NOT_CAPABILITY_EVIDENCE',
  };
}

function record(
  suffix: string,
  opportunityAssessment: OpportunityAssessment,
  snapshotId: CareerSnapshotId = careerSnapshotId,
): PersistedOpportunityAssessment {
  return {
    id: domainId('OpportunityAssessment', `opportunity-assessment:${suffix}`),
    careerSnapshotId: snapshotId,
    jobSnapshotId: domainId('JobSnapshot', `job-snapshot:${suffix}`),
    matchReport: {} as PersistedOpportunityAssessment['matchReport'],
    matchScore: opportunityAssessment.jobMatchScore,
    matchBreakdown: {} as PersistedOpportunityAssessment['matchBreakdown'],
    matchEngineVersion: 'jm-g10-v1',
    assessment: opportunityAssessment,
    assessmentPolicyVersion: 'market-opportunity-assessment-v1',
    contentSha256: `hash-${suffix}`,
    createdAt: '2026-08-12T16:00:00.000Z',
  };
}

function build(
  target: CareerTargetId,
  rows: readonly (readonly [string, OpportunityAssessment, CareerTargetRelevance])[],
  generatedAt: string,
) {
  return buildOpportunitySpace({
    candidateProfileId,
    careerSnapshotId,
    careerTargetId: target,
    generatedAt,
    candidates: rows.map(([suffix, itemAssessment, itemRelevance]) => ({
      assessmentRecord: record(suffix, itemAssessment),
      targetRelevance: itemRelevance,
    })),
  });
}

test('OpportunityPriority separates evidence readiness from target intent', () => {
  const ready = assessment('READY_NOW', 88);
  const originalScore = ready.jobMatchScore;

  assert.equal(classifyOpportunityPriority(ready, relevance('HIGH')), 'PRIORITIZE_NOW');
  assert.equal(classifyOpportunityPriority(ready, relevance('LOW')), 'DEPRIORITIZE');
  assert.equal(ready.jobMatchScore, originalScore);
  assert.equal(ready.recommendation, 'READY_NOW');
});

test('OpportunitySpace is deterministic across input order and wall-clock time', () => {
  const rows = [
    ['ready', assessment('READY_NOW', 90), relevance('HIGH')],
    ['stretch', assessment('STRONG_STRETCH', 76), relevance('HIGH')],
    ['build', assessment('BUILDABLE', 58), relevance('HIGH')],
  ] as const;
  const first = build(targetId, rows, '2026-08-12T16:00:00.000Z');
  const second = build(targetId, [...rows].reverse(), '2026-08-13T16:00:00.000Z');

  assert.equal(first.id, second.id);
  assert.equal(first.contentSha256, second.contentSha256);
  assert.notEqual(first.generatedAt, second.generatedAt);
  assert.deepEqual(first.entries.map((entry) => entry.priority), [
    'PRIORITIZE_NOW',
    'APPLY_SELECTIVELY',
    'BUILD_TOWARD',
  ]);
});

test('changing CareerTarget changes OpportunitySpace identity without rewriting assessments', () => {
  const rows = [
    ['one', assessment('READY_NOW', 91), relevance('HIGH')],
    ['two', assessment('STRONG_STRETCH', 75), relevance('MEDIUM')],
  ] as const;
  const backend = build(targetId, rows, '2026-08-12T16:00:00.000Z');
  const architectureTarget = domainId('CareerTarget', 'career-target:architecture');
  const architecture = build(architectureTarget, rows, '2026-08-12T16:00:00.000Z');

  assert.notEqual(backend.id, architecture.id);
  assert.deepEqual(
    backend.entries.map((entry) => entry.opportunityAssessmentId),
    architecture.entries.map((entry) => entry.opportunityAssessmentId),
  );
});

test('target relevance provenance changes OpportunitySpace identity even when final level is unchanged', () => {
  const firstHigh = relevance('HIGH');
  const changedHigh: CareerTargetRelevance = {
    ...firstHigh,
    workModel: 'UNKNOWN',
    reasons: [...firstHigh.reasons, 'Work model signal became unknown.'],
  };
  const sharedAssessment = assessment('READY_NOW', 91);
  const first = build(targetId, [
    ['one', sharedAssessment, firstHigh],
    ['two', assessment('STRONG_STRETCH', 75), relevance('MEDIUM')],
  ], '2026-08-12T16:00:00.000Z');
  const changed = build(targetId, [
    ['one', sharedAssessment, changedHigh],
    ['two', assessment('STRONG_STRETCH', 75), relevance('MEDIUM')],
  ], '2026-08-12T16:00:00.000Z');

  assert.equal(first.entries[0].targetRelevance.level, 'HIGH');
  assert.equal(changed.entries[0].targetRelevance.level, 'HIGH');
  assert.notEqual(first.id, changed.id);
  assert.notEqual(first.contentSha256, changed.contentSha256);
});

test('OpportunitySpace history is durable, immutable and idempotent', async () => {
  const repository = new MemoryOpportunitySpaceRepository();
  const firstSpace = build(targetId, [
    ['one', assessment('READY_NOW', 91), relevance('HIGH')],
    ['two', assessment('BUILDABLE', 60), relevance('HIGH')],
  ], '2026-08-12T16:00:00.000Z');
  const first = await persistOpportunitySpace(repository, firstSpace, '2026-08-12T16:01:00.000Z');
  const repeated = await persistOpportunitySpace(repository, firstSpace, '2026-08-12T17:00:00.000Z');
  const secondSpace = build(domainId('CareerTarget', 'career-target:staff'), [
    ['one', assessment('READY_NOW', 91), relevance('MEDIUM')],
    ['two', assessment('BUILDABLE', 60), relevance('HIGH')],
  ], '2026-08-13T16:00:00.000Z');
  const evolved = await persistOpportunitySpace(repository, secondSpace, '2026-08-13T16:01:00.000Z');

  assert.equal(first.revision, 1);
  assert.equal(repeated.revision, 1);
  assert.equal(repeated.spaces.length, 1);
  assert.equal(evolved.revision, 2);
  assert.equal(evolved.spaces.length, 2);
  assert.ok(evolved.spaces.some((space) => space.id === firstSpace.id));
  assert.ok(evolved.spaces.some((space) => space.id === secondSpace.id));
});

test('OpportunitySpace rejects assessments from another CareerSnapshot', () => {
  const otherSnapshot = domainId('CareerSnapshot', 'career-snapshot:other');
  assert.throws(() => buildOpportunitySpace({
    candidateProfileId,
    careerSnapshotId,
    careerTargetId: targetId,
    generatedAt: '2026-08-12T16:00:00.000Z',
    candidates: [
      { assessmentRecord: record('one', assessment('READY_NOW', 90)), targetRelevance: relevance('HIGH') },
      { assessmentRecord: record('two', assessment('READY_NOW', 90), otherSnapshot), targetRelevance: relevance('HIGH') },
    ],
  }), /different CareerSnapshot/);
});
