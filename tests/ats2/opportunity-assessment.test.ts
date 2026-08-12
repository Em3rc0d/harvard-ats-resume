import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assessOpportunity,
  type OpportunityMatchInput,
  type OpportunityRequirementInput,
} from '../../lib/application/opportunity/OpportunityAssessment';

function requirement(
  id: string,
  necessity: OpportunityRequirementInput['necessity'],
  status: OpportunityRequirementInput['status'],
  statement = id,
  evidenceStatements: readonly string[] = [],
): OpportunityRequirementInput {
  return {
    id,
    statement,
    kind: 'SKILL',
    necessity,
    status,
    evidence: evidenceStatements.map((evidence) => ({ statement: evidence })),
  };
}

function match(score: number, requirements: readonly OpportunityRequirementInput[]): OpportunityMatchInput {
  return { score, requirements };
}

test('READY_NOW requires full REQUIRED support plus sufficient overall evidence alignment', () => {
  const assessment = assessOpportunity(match(78, [
    requirement('typescript', 'REQUIRED', 'MATCH'),
    requirement('react', 'REQUIRED', 'MATCH'),
    requirement('terraform', 'PREFERRED', 'GAP'),
  ]));

  assert.equal(assessment.recommendation, 'READY_NOW');
  assert.equal(assessment.shouldApply, 'YES');
  assert.equal(assessment.nextAction, 'APPLY');
  assert.equal(assessment.requiredCoverage, 100);
  assert.equal(assessment.criticalGaps.length, 0);
});

test('full REQUIRED coverage with weak overall evidence is not labeled READY_NOW', () => {
  const assessment = assessOpportunity(match(55, [
    requirement('typescript', 'REQUIRED', 'MATCH'),
    requirement('react', 'REQUIRED', 'MATCH'),
    requirement('kubernetes', 'PREFERRED', 'GAP'),
    requirement('terraform', 'PREFERRED', 'GAP'),
  ]));

  assert.equal(assessment.requiredCoverage, 100);
  assert.equal(assessment.recommendation, 'STRONG_STRETCH');
  assert.equal(assessment.shouldApply, 'CONSIDER');
  assert.notEqual(assessment.recommendation, 'READY_NOW');
});

test('a high-alignment role with a limited required gap is a STRONG_STRETCH, not READY_NOW', () => {
  const assessment = assessOpportunity(match(74, [
    requirement('typescript', 'REQUIRED', 'MATCH'),
    requirement('react', 'REQUIRED', 'MATCH'),
    requirement('kubernetes', 'REQUIRED', 'GAP'),
    requirement('terraform', 'PREFERRED', 'MATCH'),
  ]));

  assert.equal(assessment.recommendation, 'STRONG_STRETCH');
  assert.equal(assessment.shouldApply, 'CONSIDER');
  assert.equal(assessment.criticalGaps.length, 1);
  assert.equal(assessment.requiredCoverage, 67);
});

test('meaningful overlap with several required gaps is BUILDABLE', () => {
  const assessment = assessOpportunity(match(55, [
    requirement('typescript', 'REQUIRED', 'MATCH'),
    requirement('kubernetes', 'REQUIRED', 'GAP'),
    requirement('terraform', 'REQUIRED', 'GAP'),
  ]));

  assert.equal(assessment.recommendation, 'BUILDABLE');
  assert.equal(assessment.shouldApply, 'NOT_YET');
  assert.equal(assessment.nextAction, 'BUILD_FIRST');
  assert.equal(assessment.requiredCoverage, 33);
});

test('limited transferable support is ASPIRATIONAL instead of an efficient immediate application', () => {
  const assessment = assessOpportunity(match(30, [
    requirement('architecture', 'REQUIRED', 'POTENTIAL_MATCH'),
    requirement('kubernetes', 'REQUIRED', 'GAP'),
    requirement('terraform', 'REQUIRED', 'GAP'),
  ]));

  assert.equal(assessment.recommendation, 'ASPIRATIONAL');
  assert.equal(assessment.shouldApply, 'FUTURE_TARGET');
  assert.equal(assessment.transferableEvidence.length, 1);
});

test('no material supporting evidence produces LOW_ALIGNMENT', () => {
  const assessment = assessOpportunity(match(0, [
    requirement('kubernetes', 'REQUIRED', 'GAP'),
    requirement('terraform', 'REQUIRED', 'GAP'),
  ]));

  assert.equal(assessment.recommendation, 'LOW_ALIGNMENT');
  assert.equal(assessment.shouldApply, 'NO');
  assert.equal(assessment.nextAction, 'DEPRIORITIZE');
});

test('an explicit required blocker forces LOW_ALIGNMENT and BLOCKED eligibility', () => {
  const assessment = assessOpportunity(match(90, [
    requirement('work-auth', 'REQUIRED', 'BLOCKER', 'Must already have work authorization'),
    requirement('typescript', 'REQUIRED', 'MATCH'),
  ]));

  assert.equal(assessment.recommendation, 'LOW_ALIGNMENT');
  assert.equal(assessment.eligibility, 'BLOCKED');
  assert.equal(assessment.shouldApply, 'NO');
});

test('without explicit REQUIRED requirements the policy never claims READY_NOW', () => {
  const assessment = assessOpportunity(match(88, [
    requirement('typescript', 'PREFERRED', 'MATCH'),
    requirement('react', 'UNKNOWN', 'MATCH'),
  ]));

  assert.equal(assessment.recommendation, 'STRONG_STRETCH');
  assert.notEqual(assessment.recommendation, 'READY_NOW');
  assert.equal(assessment.requiredCoverage, null);
});

test('candidate evidence statements survive into strong and transferable opportunity signals', () => {
  const assessment = assessOpportunity(match(76, [
    requirement(
      'typescript',
      'REQUIRED',
      'MATCH',
      'TypeScript is required',
      ['Used TypeScript at VertikALL while serving as Software Engineer.'],
    ),
  ]));

  assert.deepEqual(
    assessment.strongEvidence[0]?.evidenceStatements,
    ['Used TypeScript at VertikALL while serving as Software Engineer.'],
  );
});

test('the same evidence and job match always produce the same recommendation payload', () => {
  const input = match(62, [
    requirement('typescript', 'REQUIRED', 'MATCH'),
    requirement('kubernetes', 'REQUIRED', 'POTENTIAL_MATCH'),
    requirement('terraform', 'PREFERRED', 'GAP'),
  ]);

  assert.deepEqual(assessOpportunity(input), assessOpportunity(input));
});

test('assessment refuses to manufacture a recommendation when Job Intelligence extracted no requirements', () => {
  assert.throws(
    () => assessOpportunity(match(0, [])),
    /at least one extracted job requirement/i,
  );
});
