import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateSystemHealth } from '../../lib/application/system/SystemHealthPolicy';

test('ATS-SYS-01 health keeps trusted core available when only local AI is unavailable', () => {
  const decision = evaluateSystemHealth({ localAI: 'UNAVAILABLE', durableRedis: 'READY' });
  assert.equal(decision.status, 'DEGRADED');
  assert.equal(decision.httpStatus, 200);
  assert.equal(decision.trustedCoreAvailable, true);
  assert.deepEqual(decision.degradedCapabilities, ['resume-import-ai', 'inline-optimize']);
});

test('ATS-SYS-01 health treats durable-state outage as trusted-core unavailable', () => {
  const decision = evaluateSystemHealth({ localAI: 'READY', durableRedis: 'UNAVAILABLE' });
  assert.equal(decision.status, 'UNAVAILABLE');
  assert.equal(decision.httpStatus, 503);
  assert.equal(decision.trustedCoreAvailable, false);
  assert.deepEqual(decision.degradedCapabilities, ['durable-state']);
});

test('ATS-SYS-01 health reports fully ready only when bounded AI and durable state are ready', () => {
  const decision = evaluateSystemHealth({ localAI: 'READY', durableRedis: 'READY' });
  assert.equal(decision.status, 'READY');
  assert.equal(decision.httpStatus, 200);
  assert.equal(decision.trustedCoreAvailable, true);
  assert.deepEqual(decision.degradedCapabilities, []);
});
