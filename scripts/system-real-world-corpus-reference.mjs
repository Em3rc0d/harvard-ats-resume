import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const REQUIRED_PROFILE = 'REFERENCE-CPU-01';
const COMPOSE_PROJECT = 'cv-engine-reference';
const APP_PORT = '3100';
const OLLAMA_PORT = '31434';
const REDIS_HTTP_PORT = '38079';
const BASE_URL = `http://127.0.0.1:${APP_PORT}`;
const GENERATED_EVIDENCE_PREFIXES = ['evidence/ats-sys-02/', 'evidence/ats-sys-03/'];
const OPAQUE_CORPUS_ID = /^CORPUS-\d{8}(?:-[A-Z0-9]{1,8})?$/;

function isoSafe(value) {
  return value.replace(/[:.]/g, '-');
}

function command(commandName, args, options = {}) {
  return execFileSync(commandName, args, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    ...options,
  }).trim();
}

function run(commandName, args, env, accepted = [0]) {
  const result = spawnSync(commandName, args, { stdio: 'inherit', env });
  if (result.error) throw result.error;
  const exitCode = result.status ?? 1;
  if (!accepted.includes(exitCode)) throw new Error(`${commandName} ${args.join(' ')} failed with exit ${exitCode}.`);
  return exitCode;
}

function ensureReferenceProfile() {
  const profile = process.env.CVENGINE_RUNTIME_PROFILE_ID?.trim();
  if (profile !== REQUIRED_PROFILE) {
    throw new Error(`Set CVENGINE_RUNTIME_PROFILE_ID=${REQUIRED_PROFILE}. Refusing to label another host as the ATS-SYS-03E reference runtime.`);
  }
}

function ensureCommittedSource() {
  const status = command('git', ['status', '--porcelain=v1', '--untracked-files=all']);
  if (!status) return;
  const sourceChanges = status.split(/\r?\n/).filter(Boolean).filter((line) => {
    if (!line.startsWith('?? ')) return true;
    const path = line.slice(3).replace(/\\/g, '/');
    return !GENERATED_EVIDENCE_PREFIXES.some((prefix) => path.startsWith(prefix));
  });
  if (sourceChanges.length > 0) throw new Error(`ATS-SYS-03E requires committed source. Resolve: ${sourceChanges.join(' | ')}`);
}

function inspectPort(port) {
  return command('docker', ['ps', '--filter', `publish=${port}`, '--format', '{{.ID}}\t{{.Names}}\t{{.Ports}}']);
}

function resetBenchmarkRateLimitWindow(env) {
  run(
    'docker',
    [
      'compose', 'exec', '-T', 'redis', 'sh', '-lc',
      `keys="$(redis-cli --scan --pattern '@upstash/ratelimit*')"; if [ -n "$keys" ]; then printf '%s\\n' "$keys" | xargs redis-cli del >/dev/null; fi`,
    ],
    env,
  );
}

async function waitForReady(expectedBuildSha, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  let last = 'no response';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE_URL}/api/health`);
      const body = await response.json();
      last = `HTTP ${response.status} / ${body?.status ?? 'UNKNOWN'} / ${body?.identity?.buildSha ?? 'UNKNOWN'}`;
      if (
        response.status === 200
        && body?.status === 'READY'
        && body?.identity?.releaseQualifiableIdentity === true
        && body?.identity?.buildSha === expectedBuildSha
      ) return body;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
  }
  throw new Error(`ATS-SYS-03E runtime did not become READY within ${timeoutMs} ms: ${last}`);
}

async function main() {
  ensureReferenceProfile();
  ensureCommittedSource();

  const realCorpusManifest = process.env.CVENGINE_REAL_CORPUS_MANIFEST?.trim();
  if (!realCorpusManifest) {
    throw new Error('Set CVENGINE_REAL_CORPUS_MANIFEST to an absolute external manifest path before running ATS-SYS-03E.');
  }
  const corpusManifestPath = resolve(realCorpusManifest);
  const manifestPreview = JSON.parse(await readFile(corpusManifestPath, 'utf8'));
  const corpusId = typeof manifestPreview?.corpusId === 'string' ? manifestPreview.corpusId.trim() : '';
  if (!OPAQUE_CORPUS_ID.test(corpusId)) {
    throw new Error('ATS-SYS-03E corpusId must use the privacy-safe CORPUS-YYYYMMDD[-SUFFIX] form before any evidence manifest is written.');
  }

  const buildSha = command('git', ['rev-parse', 'HEAD']);
  const startedAt = new Date().toISOString();
  const root = resolve(process.env.CVENGINE_SYS03E_REFERENCE_DIR || `evidence/ats-sys-03/real-world-reference-runs/${isoSafe(startedAt)}`);
  const corpusDir = resolve(root, 'real-world-corpus');
  await mkdir(corpusDir, { recursive: true });

  const env = {
    ...process.env,
    COMPOSE_PROJECT_NAME: COMPOSE_PROJECT,
    CVENGINE_RUNTIME_PROFILE_ID: REQUIRED_PROFILE,
    CVENGINE_APP_PORT: APP_PORT,
    CVENGINE_OLLAMA_PORT: OLLAMA_PORT,
    CVENGINE_REDIS_HTTP_PORT: REDIS_HTTP_PORT,
    CV_ENGINE_E2E_BASE_URL: BASE_URL,
    CVENGINE_SYS03E_EVIDENCE_DIR: corpusDir,
    CVENGINE_REAL_CORPUS_MANIFEST: corpusManifestPath,
  };

  const manifest = {
    manifestVersion: 'ats-sys-03e-reference-run-v0.1',
    startedAt,
    completedAt: null,
    buildSha,
    runtimeProfileId: REQUIRED_PROFILE,
    composeProject: COMPOSE_PROJECT,
    baseUrl: BASE_URL,
    ports: { app: Number(APP_PORT), ollama: Number(OLLAMA_PORT), redisHttp: Number(REDIS_HTTP_PORT) },
    corpus: {
      corpusId,
      externalManifestFilenamePersisted: false,
      rawManifestPathPersisted: false,
      rawDocumentsPersisted: false,
    },
    preflight: {
      committedSource: true,
      dedicatedPorts: 'PENDING',
      rateLimitWindowReset: 'PENDING',
      externalCorpusPrivacyBoundary: 'PASS',
    },
    result: 'RUNNING',
    evidenceDir: corpusDir,
  };
  const manifestPath = resolve(root, 'manifest.json');
  const persistManifest = async () => writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await persistManifest();

  try {
    run('docker', ['compose', 'down'], env);
    for (const port of [APP_PORT, OLLAMA_PORT, REDIS_HTTP_PORT]) {
      const owner = inspectPort(port);
      if (owner) throw new Error(`ATS-SYS-03E reference port ${port} is occupied by ${owner}.`);
    }
    manifest.preflight.dedicatedPorts = 'PASS';
    await persistManifest();

    run(process.execPath, ['scripts/docker-compose-identified.mjs', 'build', 'app'], env);
    run(process.execPath, ['scripts/docker-compose-identified.mjs', 'up', '-d'], env);
    await waitForReady(buildSha);

    resetBenchmarkRateLimitWindow(env);
    manifest.preflight.rateLimitWindowReset = 'PASS';
    await persistManifest();

    run(process.execPath, ['scripts/system-real-world-corpus.mjs'], env);

    manifest.completedAt = new Date().toISOString();
    manifest.result = 'EVIDENCE_CAPTURED';
    await persistManifest();
    process.stdout.write(`\nATS-SYS-03E reference execution: EVIDENCE_CAPTURED\n`);
    process.stdout.write(`Build: ${buildSha}\n`);
    process.stdout.write(`Corpus: ${corpusId}\n`);
    process.stdout.write(`Evidence: ${root}\n`);
  } catch (error) {
    manifest.completedAt = new Date().toISOString();
    manifest.result = 'FAILED';
    manifest.blockingReason = error instanceof Error ? error.message : String(error);
    await persistManifest();
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
