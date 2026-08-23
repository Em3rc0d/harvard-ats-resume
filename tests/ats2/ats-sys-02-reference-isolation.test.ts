import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(path), 'utf8');

test('REFERENCE-CPU-01 uses a dedicated loopback app port instead of sharing the normal UI endpoint', () => {
  const compose = read('docker-compose.yml');
  const runner = read('scripts/system-reference-run.mjs');

  assert.match(
    compose,
    /127\.0\.0\.1:\$\{CVENGINE_APP_PORT:-3000\}:3000/,
    'Compose must preserve normal local port 3000 while allowing reference runs to override the host port.',
  );
  assert.match(runner, /const REFERENCE_APP_PORT = '3100'/);
  assert.match(runner, /CVENGINE_APP_PORT: REFERENCE_APP_PORT/);
  assert.match(runner, /CV_ENGINE_E2E_BASE_URL: REFERENCE_BASE_URL/);
  assert.match(runner, /normalUiPortExcluded: 3000/);
});

test('all runtime characterization clients honor the injected reference base URL', () => {
  const scripts = [
    'scripts/system-cold-start.mjs',
    'scripts/system-runtime-identity.mjs',
    'scripts/system-characterize.mjs',
    'scripts/system-characterize-inline-optimize.mjs',
    'scripts/system-fault-injection.mjs',
  ];

  for (const script of scripts) {
    assert.match(
      read(script),
      /process\.env\.CV_ENGINE_E2E_BASE_URL/,
      `${script} must honor CV_ENGINE_E2E_BASE_URL so the reference port is actually used.`,
    );
  }
});
