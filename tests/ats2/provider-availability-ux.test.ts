import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('generation UX preserves provider classification and suppresses meaningless non-retryable retries', () => {
  const flow = readFileSync(join(process.cwd(), 'components/CVEngineFlow.tsx'), 'utf8');
  const panel = readFileSync(join(process.cwd(), 'components/GenerationGuardrailPanel.tsx'), 'utf8');

  assert.match(flow, /provider:\s*result\.provider/);
  assert.match(flow, /generationFailure\.provider\?\.retryable !== false/);
  assert.match(flow, /generationFailure\.persistence\?\.retryable !== false/);

  assert.match(panel, /providerEyebrow:\s*'Provider availability'/);
  assert.match(panel, /providerKind === 'QUOTA_EXHAUSTED'/);
  assert.match(panel, /providerKind === 'AUTHENTICATION_FAILED'/);
  assert.match(panel, /failure\.provider\?\.retryable === false \? copy\.providerStopNote : copy\.providerRetryNote/);
  assert.match(panel, /Your Career Evidence is not the problem/);
});
