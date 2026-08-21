import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CVENGINE_ARCHITECTURE_VERSION,
  UNCHARACTERIZED_RUNTIME_PROFILE,
  UNIDENTIFIED_BUILD_SHA,
  resolveRuntimeIdentity,
} from '../../lib/application/system/RuntimeIdentity';

test('ATS-SYS-01 runtime identity fails closed when build identity is absent', () => {
  const identity = resolveRuntimeIdentity({});
  assert.equal(identity.buildSha, UNIDENTIFIED_BUILD_SHA);
  assert.equal(identity.architectureVersion, CVENGINE_ARCHITECTURE_VERSION);
  assert.equal(identity.runtimeProfileId, UNCHARACTERIZED_RUNTIME_PROFILE);
  assert.equal(identity.identified, false);
  assert.equal(identity.releaseQualifiableIdentity, false);
  assert.equal(identity.source, 'UNIDENTIFIED');
});

test('ATS-SYS-01 runtime identity prefers explicit CV Engine build identity', () => {
  const identity = resolveRuntimeIdentity({
    CVENGINE_BUILD_SHA: 'abc123',
    VERCEL_GIT_COMMIT_SHA: 'vercel456',
    GITHUB_SHA: 'github789',
    CVENGINE_RUNTIME_PROFILE_ID: 'REFERENCE-CPU-01',
  });

  assert.equal(identity.buildSha, 'abc123');
  assert.equal(identity.source, 'CVENGINE_BUILD_SHA');
  assert.equal(identity.runtimeProfileId, 'REFERENCE-CPU-01');
  assert.equal(identity.identified, true);
  assert.equal(identity.releaseQualifiableIdentity, true);
});

test('ATS-SYS-01 runtime identity can use platform commit metadata without inventing support', () => {
  const identity = resolveRuntimeIdentity({ VERCEL_GIT_COMMIT_SHA: 'platform-sha' });
  assert.equal(identity.buildSha, 'platform-sha');
  assert.equal(identity.source, 'VERCEL_GIT_COMMIT_SHA');
  assert.equal(identity.identified, true);
  assert.equal(identity.releaseQualifiableIdentity, false);
});
