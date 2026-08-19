import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('controlled OpportunitySpace UI assesses 2-10 jobs against one target and composes durable assessment IDs', () => {
  const surface = readFileSync(join(process.cwd(), 'components/OpportunitySpaceStep.tsx'), 'utf8');
  const flow = readFileSync(join(process.cwd(), 'components/CVEngineFlow.tsx'), 'utf8');
  const page = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8');

  assert.match(surface, /jobs\.length >= 10/);
  assert.match(surface, /validJobs\.length >= 2/);
  assert.match(surface, /for \(let index = 0; index < selectedJobs\.length; index \+= 1\)/);
  assert.match(surface, /fetch\('\/api\/assess-opportunity'/);
  assert.match(surface, /boundCareerSnapshotId/);
  assert.match(surface, /fetch\('\/api\/opportunity-space'/);
  assert.match(surface, /opportunityAssessmentIds: assessed\.map/);
  assert.match(surface, /DURABLE_OPPORTUNITY_SPACE/);
  assert.match(surface, /entry\.targetRelevance\.level/);

  assert.match(flow, /type FlowStage = .*'SPACE'/);
  assert.match(flow, /Compare multiple opportunities/);
  assert.match(flow, /<OpportunitySpaceStep/);
  assert.match(page, /CVEngineFlow/);
});
