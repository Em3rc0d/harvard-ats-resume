import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('OpportunitySpace API composes durable M1-M3 artifacts without recomputing Job Match', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/opportunity-space/route.ts'), 'utf8');

  assert.match(route, /opportunityAssessmentIds/);
  assert.match(route, /validateOpportunityHistorySnapshot/);
  assert.match(route, /validateCareerTargetPortfolio/);
  assert.match(route, /buildOpportunitySpace/);
  assert.match(route, /persistOpportunitySpace/);
  assert.match(route, /DURABLE_OPPORTUNITY_SPACE/);
  assert.match(route, /PRIORITY_DOES_NOT_CHANGE_JOB_MATCH_OR_CANDIDATE_EVIDENCE/);
  assert.doesNotMatch(route, /matchJobToCandidate/);
  assert.doesNotMatch(route, /buildLegacyTruthContext/);
});
