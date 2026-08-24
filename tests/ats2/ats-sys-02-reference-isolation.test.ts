import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(path), 'utf8');

test('REFERENCE-CPU-01 isolates Compose project and host ports from normal local product traffic', () => {
  const compose = read('docker-compose.yml');
  const runner = read('scripts/system-reference-run.mjs');

  assert.match(
    compose,
    /127\.0\.0\.1:\$\{CVENGINE_APP_PORT:-3000\}:3000/,
    'Compose must preserve normal local app port 3000 while allowing reference runs to override it.',
  );
  assert.match(
    compose,
    /127\.0\.0\.1:\$\{CVENGINE_OLLAMA_PORT:-11434\}:11434/,
    'Compose must preserve normal local Ollama port 11434 while allowing reference runs to isolate inference traffic.',
  );
  assert.match(
    compose,
    /127\.0\.0\.1:\$\{CVENGINE_REDIS_HTTP_PORT:-8079\}:80/,
    'Compose must preserve normal local Redis HTTP port 8079 while allowing reference runs to isolate durable-state traffic.',
  );

  assert.match(runner, /const REFERENCE_COMPOSE_PROJECT = 'cv-engine-reference'/);
  assert.match(runner, /const REFERENCE_APP_PORT = '3100'/);
  assert.match(runner, /const REFERENCE_OLLAMA_PORT = '31434'/);
  assert.match(runner, /const REFERENCE_REDIS_HTTP_PORT = '38079'/);
  assert.match(runner, /COMPOSE_PROJECT_NAME: REFERENCE_COMPOSE_PROJECT/);
  assert.match(runner, /CVENGINE_APP_PORT: REFERENCE_APP_PORT/);
  assert.match(runner, /CVENGINE_OLLAMA_PORT: REFERENCE_OLLAMA_PORT/);
  assert.match(runner, /CVENGINE_REDIS_HTTP_PORT: REFERENCE_REDIS_HTTP_PORT/);
  assert.match(runner, /CV_ENGINE_E2E_BASE_URL: REFERENCE_BASE_URL/);
  assert.match(runner, /mode: 'DEDICATED_COMPOSE_PROJECT_AND_LOOPBACK_RUNTIME_PORTS'/);
  assert.match(runner, /composeProject: REFERENCE_COMPOSE_PROJECT/);
  assert.match(runner, /normalHostPortsExcluded: \[3000, 11434, 8079\]/);
});

test('REFERENCE-CPU-01 cleans only its owned project and fails preflight before provisioning when a dedicated host port is occupied', () => {
  const runner = read('scripts/system-reference-run.mjs');

  assert.match(runner, /function cleanupOwnedReferenceProject/);
  assert.match(runner, /spawnSync\('docker', \['compose', 'down'\]/);
  assert.match(runner, /COMPOSE_PROJECT_NAME: REFERENCE_COMPOSE_PROJECT/);
  assert.match(runner, /function inspectReferencePortConflicts/);
  assert.match(runner, /--filter', `publish=\$\{target\.port\}`/);
  assert.match(runner, /host port preflight failed before build\/provisioning/);
  assert.match(runner, /benchmark will not terminate unrelated containers/);
  assert.match(runner, /ownedProjectCleanup: 'PENDING'/);
  assert.match(runner, /hostPortAvailability: 'PENDING'/);
  assert.match(runner, /manifest\.preflight\.ownedProjectCleanup = 'PASS'/);
  assert.match(runner, /manifest\.preflight\.hostPortAvailability = portConflicts\.length === 0 \? 'PASS' : 'FAIL'/);

  const cleanupIndex = runner.indexOf('cleanupOwnedReferenceProject(sharedEnv)');
  const portCheckIndex = runner.indexOf('const portConflicts = inspectReferencePortConflicts();');
  const coldStartIndex = runner.indexOf("id: 'cold-start'");
  assert.ok(cleanupIndex >= 0 && portCheckIndex > cleanupIndex && coldStartIndex > portCheckIndex,
    'Owned-project cleanup and host-port availability must be checked before cold-start build/model provisioning begins.');
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
      `${script} must honor CV_ENGINE_E2E_BASE_URL so the reference app port is actually used.`,
    );
  }
});

test('reference isolation changes only host/project boundaries; internal trusted dependency addresses stay canonical', () => {
  const compose = read('docker-compose.yml');
  const identifiedCompose = read('scripts/docker-compose-identified.mjs');

  assert.match(compose, /OLLAMA_BASE_URL: http:\/\/ollama:11434/);
  assert.match(compose, /UPSTASH_REDIS_REST_URL: http:\/\/redis-http:80/);
  assert.match(compose, /OLLAMA_HOST: http:\/\/ollama:11434/);
  assert.match(
    identifiedCompose,
    /env:\s*\{[\s\S]*\.\.\.process\.env/,
    'Identified Compose must inherit COMPOSE_PROJECT_NAME and isolated host-port environment from the reference runner.',
  );
});
