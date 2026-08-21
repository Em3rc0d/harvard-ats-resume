import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { requestRateLimitIdentifier } from '../../lib/rate-limit';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

test('request rate-limit identity is deterministic, endpoint-scoped and does not expose raw network address', () => {
  const headers = new Headers({
    'x-forwarded-for': '203.0.113.17, 10.0.0.1',
    'x-real-ip': '198.51.100.4',
  });

  const first = requestRateLimitIdentifier(headers, 'import-resume');
  const repeated = requestRateLimitIdentifier(headers, 'import-resume');
  const otherScope = requestRateLimitIdentifier(headers, 'assess-opportunity');

  assert.equal(first, repeated);
  assert.notEqual(first, otherScope);
  assert.match(first, /^request:import-resume:sha256:[0-9a-f]{32}$/);
  assert.doesNotMatch(first, /203\.0\.113\.17/);
  assert.doesNotMatch(first, /198\.51\.100\.4/);
});

test('invalid rate-limit scopes are rejected instead of becoming uncontrolled key namespaces', () => {
  const headers = new Headers({ 'x-real-ip': '203.0.113.17' });
  assert.throws(() => requestRateLimitIdentifier(headers, '../import resume'), /Invalid rate-limit scope/);
});

test('rate-limit storage hashes caller identifiers before Redis or memory keys', () => {
  const rateLimitSource = source('lib/rate-limit.ts');
  assert.match(rateLimitSource, /const storageIdentifier = storageRateLimitIdentifier\(identifier\)/);
  assert.match(rateLimitSource, /ratelimit\.limit\(storageIdentifier\)/);
  assert.match(rateLimitSource, /ratelimit:\$\{storageIdentifier\}/);
  assert.doesNotMatch(rateLimitSource, /ratelimit:\$\{identifier\}/);
});

test('resume import rate limits before multipart parsing and rejects oversized files before arrayBuffer allocation', () => {
  const route = source('app/api/import-resume/route.ts');
  const rateLimitAt = route.indexOf("await rateLimitPublicApiRequest(request.headers, 'import-resume')");
  const formDataAt = route.indexOf('await request.formData()');
  const exactSizeAt = route.indexOf('validateResumeFileSize(file.size)');
  const arrayBufferAt = route.indexOf('await file.arrayBuffer()');

  assert.ok(rateLimitAt >= 0 && formDataAt >= 0 && rateLimitAt < formDataAt);
  assert.ok(exactSizeAt >= 0 && arrayBufferAt >= 0 && exactSizeAt < arrayBufferAt);
  assert.match(route, /MAX_RESUME_MULTIPART_REQUEST_BYTES/);
  assert.match(route, /status: 413/);
});

test('opportunity assessment is rate limited before any durable target/history write', () => {
  const route = source('app/api/assess-opportunity/route.ts');
  const rateLimitAt = route.indexOf("await rateLimitPublicApiRequest(request.headers, 'assess-opportunity')");
  const targetWriteAt = route.indexOf('await persistCareerTarget(');
  const historyWriteAt = route.indexOf('await persistOpportunityAssessmentHistory(');

  assert.ok(rateLimitAt >= 0 && targetWriteAt >= 0 && rateLimitAt < targetWriteAt);
  assert.ok(rateLimitAt < historyWriteAt);
});

test('OpportunitySpace is rate limited before loading or writing durable candidate history', () => {
  const route = source('app/api/opportunity-space/route.ts');
  const rateLimitAt = route.indexOf("await rateLimitPublicApiRequest(request.headers, 'opportunity-space')");
  const historyLoadAt = route.indexOf('opportunityHistoryRepository.load(candidateProfileId)');
  const spaceWriteAt = route.indexOf('await persistOpportunitySpace(');

  assert.ok(rateLimitAt >= 0 && historyLoadAt >= 0 && rateLimitAt < historyLoadAt);
  assert.ok(rateLimitAt < spaceWriteAt);
});

test('inline optimization is rate limited before any model-backed rewrite work', () => {
  const route = source('app/api/optimize-content/route.ts');
  const rateLimitAt = route.indexOf("await rateLimitPublicApiRequest(request.headers, 'optimize-content')");
  const optimizeAt = route.indexOf('await optimizeCandidateText(');
  const providerAt = route.indexOf('new OllamaCandidateTextOptimizer()');

  assert.ok(rateLimitAt >= 0 && optimizeAt >= 0 && rateLimitAt < optimizeAt);
  assert.ok(rateLimitAt < providerAt);
});