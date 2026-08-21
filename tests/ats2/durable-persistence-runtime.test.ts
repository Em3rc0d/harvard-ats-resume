import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertDurableRedisReady,
  createDurableRedisFromEnv,
  DurablePersistenceUnavailableError,
} from '../../lib/infrastructure/persistence/DurableRedisRuntime';

function reasonOf(error: unknown): string | undefined {
  return error instanceof DurablePersistenceUnavailableError ? error.reason : undefined;
}

test('durable Redis configuration fails closed when credentials are missing or malformed', () => {
  assert.throws(
    () => createDurableRedisFromEnv({}),
    (error: unknown) => reasonOf(error) === 'CONFIGURATION_MISSING',
  );

  assert.throws(
    () => createDurableRedisFromEnv({
      UPSTASH_REDIS_REST_URL: 'not-a-url',
      UPSTASH_REDIS_REST_TOKEN: 'token',
    }),
    (error: unknown) => reasonOf(error) === 'CONFIGURATION_INVALID',
  );
});

test('durable readiness distinguishes a healthy backend from an unavailable backend without inventing a fallback', async () => {
  await assert.doesNotReject(() => assertDurableRedisReady({
    ping: async () => 'PONG',
  }));

  await assert.rejects(
    () => assertDurableRedisReady({
      ping: async () => { throw new Error('getaddrinfo ENOTFOUND durable-store.example'); },
    }),
    (error: unknown) => reasonOf(error) === 'BACKEND_UNAVAILABLE',
  );

  await assert.rejects(
    () => assertDurableRedisReady({
      ping: async () => 'UNEXPECTED',
    }),
    (error: unknown) => reasonOf(error) === 'BACKEND_UNAVAILABLE',
  );
});

test('resume generation validates first, then preflights durability before model work', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/generate-resume/route.ts'), 'utf8');
  const validation = route.indexOf('resumeGenerationInputSchema.safeParse');
  const preflight = route.indexOf('await durableRuntime.assertReady()');
  const modelWork = route.indexOf('const localAIResult = await generateResumeWithAI');

  assert.ok(validation >= 0 && preflight > validation, 'durability preflight must follow request validation');
  assert.ok(modelWork > preflight, 'durability preflight must happen before model generation');
  assert.match(route, /stage: 'PREFLIGHT'/);
  assert.match(route, /createCareerVaultRepository\(durableRuntime\.redis\)/);
});

test('target assessment and Opportunity Space share one preflighted durable client per request', () => {
  const assessment = readFileSync(join(process.cwd(), 'app/api/assess-opportunity/route.ts'), 'utf8');
  const space = readFileSync(join(process.cwd(), 'app/api/opportunity-space/route.ts'), 'utf8');

  const assessmentPreflight = assessment.indexOf('await durableRuntime.assertReady()');
  const assessmentAnalysis = assessment.indexOf('const jobIntelligence = analyzeJobDescription');
  assert.ok(assessmentPreflight >= 0 && assessmentAnalysis > assessmentPreflight);
  assert.match(assessment, /createCareerTargetRepository\(durableRuntime\.redis\)/);
  assert.match(assessment, /createOpportunityHistoryRepository\(durableRuntime\.redis\)/);

  assert.match(space, /createOpportunityHistoryRepository\(durableRuntime\.redis\)/);
  assert.match(space, /createCareerTargetRepository\(durableRuntime\.redis\)/);
  assert.match(space, /createOpportunitySpaceRepository\(durableRuntime\.redis\)/);
  assert.match(space, /createMarketObservationHistoryRepository\(durableRuntime\.redis\)/);
  assert.match(space, /createMarketOpportunityIndexRepository\(durableRuntime\.redis\)/);
  assert.equal((space.match(/await durableRuntime\.assertReady\(\)/g) ?? []).length, 1);
});

test('durability failures are not presented as candidate evidence failures', () => {
  const panel = readFileSync(join(process.cwd(), 'components/GenerationGuardrailPanel.tsx'), 'utf8');

  assert.match(panel, /durabilityEyebrow/);
  assert.match(panel, /persistencePreflightTitle/);
  assert.match(panel, /Your Career Evidence is not the problem here/);
  assert.match(panel, /isGrounding \|\| isSemantic[\s\S]*copy\.evidenceNote/);
  assert.match(panel, /isPersistence[\s\S]*copy\.persistenceNote/);
});
