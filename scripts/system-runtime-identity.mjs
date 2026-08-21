import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const BASE_URL = (process.env.CV_ENGINE_E2E_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const RUNTIME_IDENTITY_VERSION = 'ats-sys-02-runtime-identity-v0.1';
const CONTRACT_VERSION = 'ats-sys-01-receipt-v0.1';
const REQUIRED_CAPABILITIES = [
  'resumeImport',
  'jobIntelligence',
  'opportunityAssessment',
  'deterministicComposer',
  'inlineOptimize',
  'persistence',
];

function isoSafe(value) {
  return value.replace(/[:.]/g, '-');
}

function fileSafe(value) {
  return String(value || 'UNKNOWN').replace(/[^a-zA-Z0-9._-]+/g, '_');
}

function command(commandName, args) {
  try {
    return execFileSync(commandName, args, {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    }).trim();
  } catch {
    return undefined;
  }
}

function requireCommand(commandName, args, label) {
  const value = command(commandName, args);
  if (!value) throw new Error(`Runtime identity could not resolve ${label}.`);
  return value;
}

function containerId(service) {
  return requireCommand('docker', ['compose', 'ps', '-q', service], `${service} container id`);
}

function inspectContainer(id, format, label) {
  return requireCommand('docker', ['inspect', '--format', format, id], label);
}

function parseContainerEnvironment(id) {
  const raw = inspectContainer(id, '{{json .Config.Env}}', 'application container environment');
  let values;
  try {
    values = JSON.parse(raw);
  } catch {
    throw new Error('Runtime identity could not parse application container environment.');
  }
  const result = {};
  for (const entry of Array.isArray(values) ? values : []) {
    const separator = String(entry).indexOf('=');
    if (separator <= 0) continue;
    const key = entry.slice(0, separator);
    const value = entry.slice(separator + 1);
    result[key] = value;
  }
  return result;
}

function serviceImage(service) {
  const id = containerId(service);
  return inspectContainer(id, '{{.Config.Image}}', `${service} image`);
}

function applicationImageIdentity(appContainerId) {
  const image = inspectContainer(appContainerId, '{{.Config.Image}}', 'application image');
  const imageId = inspectContainer(appContainerId, '{{.Image}}', 'application image digest');
  const repoDigestsRaw = command('docker', ['image', 'inspect', imageId, '--format', '{{json .RepoDigests}}']);
  let repoDigests = [];
  if (repoDigestsRaw) {
    try {
      repoDigests = JSON.parse(repoDigestsRaw) || [];
    } catch {
      repoDigests = [];
    }
  }
  return {
    image,
    // Locally built Compose images commonly have no RepoDigest. The immutable
    // Docker image content id is still an exact digest and is preferable to UNKNOWN.
    imageDigest: Array.isArray(repoDigests) && repoDigests.length > 0 ? repoDigests[0] : imageId,
  };
}

async function getHealth(baseUrl = BASE_URL) {
  const response = await fetch(`${baseUrl}/api/health`, {
    headers: { 'cache-control': 'no-cache' },
  });
  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { statusCode: response.status, body };
}

function capabilityIdentity(configuration, observedState, fallback = {}) {
  return {
    configured: Boolean(configuration) || Boolean(fallback.configured),
    observedState,
    ...(configuration?.provider ? { provider: configuration.provider } : {}),
    ...(configuration?.model ? { model: configuration.model } : {}),
    ...(configuration?.contractVersion ? { contractVersion: configuration.contractVersion } : {}),
    ...(fallback.detail ? { detail: fallback.detail } : {}),
  };
}

function validateSnapshot(snapshot) {
  const issues = [];
  if (snapshot.runtimeIdentityVersion !== RUNTIME_IDENTITY_VERSION) issues.push('runtime-identity-version');
  if (snapshot.contractVersion !== CONTRACT_VERSION) issues.push('contract-version');
  if (!snapshot.sourceIdentity?.releaseQualifiableIdentity) issues.push('source-identity-not-release-qualifiable');
  if (snapshot.buildSha !== snapshot.sourceIdentity?.buildSha) issues.push('build-sha-mismatch');
  if (snapshot.architectureVersion !== snapshot.sourceIdentity?.architectureVersion) issues.push('architecture-version-mismatch');
  if (snapshot.runtimeProfile !== snapshot.sourceIdentity?.runtimeProfileId) issues.push('runtime-profile-mismatch');
  if (snapshot.host?.profileId !== snapshot.runtimeProfile) issues.push('host-profile-mismatch');
  if (!Number.isInteger(snapshot.host?.cores) || snapshot.host.cores < 1) issues.push('host-cores');
  if (!Number.isFinite(snapshot.host?.memoryBytes) || snapshot.host.memoryBytes <= 0) issues.push('host-memory');
  if (!snapshot.container?.image) issues.push('container-image');
  if (!snapshot.container?.imageDigest) issues.push('container-image-digest');
  if (!snapshot.container?.dockerVersion) issues.push('docker-version');
  for (const capability of REQUIRED_CAPABILITIES) {
    if (!snapshot.capabilities?.[capability]) issues.push(`capability:${capability}`);
  }
  if (!snapshot.ai?.provider) issues.push('ai-provider');
  if (!snapshot.ai?.endpoint) issues.push('ai-endpoint');
  if (!snapshot.ai?.capabilities?.resumeImport?.resolvedModel) issues.push('ai-resume-import-model');
  if (!snapshot.ai?.capabilities?.inlineOptimize?.resolvedModel) issues.push('ai-inline-optimize-model');
  if (!snapshot.redis?.provider) issues.push('redis-provider');
  if (!snapshot.redis?.endpoint) issues.push('redis-endpoint');
  if (!Number.isFinite(Date.parse(snapshot.capturedAt))) issues.push('captured-at');
  if (issues.length > 0) throw new Error(`Runtime identity evidence is incomplete: ${issues.join(', ')}`);
}

export async function captureCanonicalRuntimeIdentity(options = {}) {
  const expectedBuildSha = String(
    options.expectedBuildSha
      || process.env.CVENGINE_EXPECTED_BUILD_SHA
      || command('git', ['rev-parse', 'HEAD'])
      || '',
  ).trim();
  if (!expectedBuildSha) throw new Error('Runtime identity requires an expected Git build SHA.');

  const health = options.healthBody
    ? { statusCode: options.healthStatusCode ?? 200, body: options.healthBody }
    : await getHealth(options.baseUrl || BASE_URL);
  const identity = health.body?.identity;
  if (!identity?.identified) throw new Error('Runtime build is UNIDENTIFIED.');
  if (!identity?.releaseQualifiableIdentity) {
    throw new Error(`Runtime profile is ${identity?.runtimeProfileId ?? 'UNCHARACTERIZED'}.`);
  }
  if (identity.buildSha !== expectedBuildSha) {
    throw new Error(`VERSION_SKEW: runtime ${identity.buildSha} != expected ${expectedBuildSha}`);
  }
  if (health.statusCode !== 200 || !['READY', 'DEGRADED'].includes(health.body?.status)) {
    throw new Error(`Trusted runtime is not characterizable: HTTP ${health.statusCode} ${health.body?.status ?? 'UNKNOWN'}`);
  }

  const appContainerId = containerId('app');
  const appEnvironment = parseContainerEnvironment(appContainerId);
  const imageIdentity = applicationImageIdentity(appContainerId);
  const dockerVersion = requireCommand('docker', ['version', '--format', '{{.Server.Version}}'], 'Docker server version');
  const configuration = health.body?.configuration?.status === 'RESOLVED'
    ? health.body.configuration.capabilities
    : {};
  const localAiState = health.body?.dependencies?.localAI?.status === 'READY' ? 'READY' : 'UNAVAILABLE';
  const redisState = health.body?.dependencies?.durableRedis?.status === 'READY' ? 'READY' : 'UNAVAILABLE';

  const importConfiguration = configuration?.resumeImport;
  const optimizeConfiguration = configuration?.inlineOptimize;
  const deterministicConfiguration = configuration?.resumeAssembly;
  const aiProvider = importConfiguration?.provider === optimizeConfiguration?.provider
    ? importConfiguration?.provider
    : 'MULTIPLE_OR_UNKNOWN';

  const snapshot = {
    runtimeIdentityVersion: RUNTIME_IDENTITY_VERSION,
    buildSha: identity.buildSha,
    architectureVersion: identity.architectureVersion,
    contractVersion: CONTRACT_VERSION,
    environment: appEnvironment.NODE_ENV || 'UNKNOWN',
    runtimeProfile: identity.runtimeProfileId,
    sourceIdentity: identity,
    host: {
      profileId: identity.runtimeProfileId,
      cpu: cpus()[0]?.model || 'UNKNOWN',
      cores: cpus().length,
      memoryBytes: totalmem(),
      operatingSystem: `${platform()} ${release()}`,
      architecture: arch(),
    },
    container: {
      image: imageIdentity.image,
      imageDigest: imageIdentity.imageDigest,
      dockerVersion,
    },
    capabilities: {
      resumeImport: capabilityIdentity(importConfiguration, localAiState),
      jobIntelligence: capabilityIdentity(undefined, 'UNKNOWN', {
        configured: true,
        detail: 'Present in identified build but not independently readiness-probed by /api/health.',
      }),
      opportunityAssessment: capabilityIdentity(undefined, 'UNKNOWN', {
        configured: true,
        detail: 'Present in identified build but not independently readiness-probed by /api/health.',
      }),
      deterministicComposer: capabilityIdentity(deterministicConfiguration, 'CONFIGURED'),
      inlineOptimize: capabilityIdentity(optimizeConfiguration, localAiState),
      persistence: capabilityIdentity(undefined, redisState, {
        configured: true,
        detail: 'Durable Redis readiness is directly probed by /api/health.',
      }),
    },
    ai: {
      provider: aiProvider || 'UNKNOWN',
      endpoint: appEnvironment.OLLAMA_BASE_URL || 'UNKNOWN',
      capabilities: {
        resumeImport: {
          resolvedModel: importConfiguration?.model || 'UNKNOWN',
          modelVersion: 'UNKNOWN',
          capability: 'resumeImport',
        },
        inlineOptimize: {
          resolvedModel: optimizeConfiguration?.model || 'UNKNOWN',
          modelVersion: 'UNKNOWN',
          capability: 'inlineOptimize',
        },
      },
    },
    redis: {
      provider: `${serviceImage('redis')} via ${serviceImage('redis-http')}`,
      connectivity: redisState,
      namespace: 'UNKNOWN',
      environment: appEnvironment.NODE_ENV || 'UNKNOWN',
      endpoint: appEnvironment.UPSTASH_REDIS_REST_URL || 'UNKNOWN',
    },
    capturedAt: new Date().toISOString(),
  };

  validateSnapshot(snapshot);

  const outputRoot = resolve(
    options.outputRoot
      || process.env.CVENGINE_RUNTIME_IDENTITY_DIR
      || 'evidence/ats-sys-02/runtime',
  );
  const outputDir = resolve(outputRoot, fileSafe(snapshot.runtimeProfile), fileSafe(snapshot.buildSha));
  await mkdir(outputDir, { recursive: true });
  const outputPath = resolve(outputDir, `${isoSafe(snapshot.capturedAt)}.json`);
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

  return {
    runtimeIdentity: snapshot,
    runtimeIdentityRef: outputPath,
  };
}

async function main() {
  const captured = await captureCanonicalRuntimeIdentity();
  process.stdout.write(`Runtime identity: ${captured.runtimeIdentityRef}\n`);
  process.stdout.write(`Build: ${captured.runtimeIdentity.buildSha}\n`);
  process.stdout.write(`Profile: ${captured.runtimeIdentity.runtimeProfile}\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
