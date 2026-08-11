import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REQUIREMENT_STATUS_EXPLANATIONS,
  summarizeJobMatch,
} from '../../lib/application/product/ExplainabilityPresenter';
import type { ExplainableJobMatchView } from '../../lib/application/product/ProductResultContract';

const MATCH: ExplainableJobMatchView = {
  score: 64,
  language: 'EN',
  breakdown: {
    required: { matched: 1, total: 3 },
    preferred: { matched: 0, total: 1 },
    unknown: { matched: 0, total: 0 },
    gaps: 1,
    blockers: 0,
  },
  requirements: [
    {
      id: 'r1',
      statement: 'TypeScript',
      kind: 'SKILL',
      necessity: 'REQUIRED',
      status: 'MATCH',
      rationale: 'Supported.',
      assertionIds: ['a1'],
      evidence: [{ assertionId: 'a1', statement: 'Used TypeScript.', truthClass: 'CANDIDATE_ASSERTED', sourceIds: ['s1'], evidenceIds: ['e1'] }],
    },
    {
      id: 'r2',
      statement: 'Architect distributed systems',
      kind: 'RESPONSIBILITY',
      necessity: 'REQUIRED',
      status: 'POTENTIAL_MATCH',
      rationale: 'Related implementation evidence only.',
      assertionIds: ['a2'],
      evidence: [{ assertionId: 'a2', statement: 'Implemented services in a distributed architecture.', truthClass: 'CANDIDATE_ASSERTED', sourceIds: ['s1'], evidenceIds: ['e2'] }],
    },
    {
      id: 'r3',
      statement: 'Kubernetes',
      kind: 'SKILL',
      necessity: 'REQUIRED',
      status: 'GAP',
      rationale: 'No evidence.',
      assertionIds: [],
      evidence: [],
    },
    {
      id: 'r4',
      statement: 'Work authorization',
      kind: 'WORK_AUTHORIZATION',
      necessity: 'PREFERRED',
      status: 'UNKNOWN',
      rationale: 'No authorization evidence.',
      assertionIds: [],
      evidence: [],
    },
  ],
};

test('explainability summary preserves MATCH, POTENTIAL_MATCH, GAP and UNKNOWN as distinct states', () => {
  const summary = summarizeJobMatch(MATCH);
  assert.ok(summary);
  assert.equal(summary.statusCounts.MATCH, 1);
  assert.equal(summary.statusCounts.POTENTIAL_MATCH, 1);
  assert.equal(summary.statusCounts.GAP, 1);
  assert.equal(summary.statusCounts.UNKNOWN, 1);
  assert.notEqual(REQUIREMENT_STATUS_EXPLANATIONS.UNKNOWN, REQUIREMENT_STATUS_EXPLANATIONS.GAP);
  assert.notEqual(REQUIREMENT_STATUS_EXPLANATIONS.POTENTIAL_MATCH, REQUIREMENT_STATUS_EXPLANATIONS.MATCH);
});

test('required and preferred requirements remain separate in the product summary', () => {
  const summary = summarizeJobMatch(MATCH);
  assert.ok(summary);
  assert.equal(summary.required.length, 3);
  assert.equal(summary.preferred.length, 1);
  assert.equal(summary.required.some((item) => item.id === 'r4'), false);
});

test('missing Job Description produces no Job Match product summary', () => {
  assert.equal(summarizeJobMatch(undefined), null);
});
