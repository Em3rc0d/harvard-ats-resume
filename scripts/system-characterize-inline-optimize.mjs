import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { captureCanonicalRuntimeIdentity } from './system-runtime-identity.mjs';

const BASE_URL = (process.env.CV_ENGINE_E2E_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const MANIFEST_PATH = resolve('tests/system/fixtures/canonical-personas.v0.1.json');
const FIXTURE_DIR = resolve('tests/system/fixtures/docx');
const PERSONA_ID = process.env.CVENGINE_OPTIMIZE_PERSONA || 'P01';

function isoSafe(value) {
  return value.replace(/[:.]/g, '-');
}

function normalize(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase();
}

function hasString(haystack, needle) {
  return normalize(haystack).includes(normalize(needle));
}

function dockerLogs(service, sinceIso) {
  try {
    return execFileSync('docker', ['compose', 'logs', '--no-color', '--since', sinceIso, service], {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch (error) {
    return String(error?.stdout || error?.stderr || '');
  }
}

function modelList() {
  try {
    return execFileSync('docker', ['compose', 'exec', '-T', 'ollama', 'ollama', 'list'], {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    return String(error?.stdout || error?.stderr || '');
  }
}

async function timedRequest(url, init) {
  const started = performance.now();
  const response = await fetch(url, init);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { response, body, latencyMs: Math.round(performance.now() - started) };
}

async function persist(path, value) {
  if (typeof value === 'string') {
    await writeFile(path, value, 'utf8');
  } else {
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  }
  return path;
}

function countChatCalls(logText) {
  return (String(logText).match(/POST\s+"\/api\/chat"/g) || []).length;
}

function assertRuntimeIdentity(health, expectedBuildSha) {
  const identity = health?.identity;
  if (!identity?.identified) throw new Error('Runtime is UNIDENTIFIED.');
  if (!identity?.releaseQualifiableIdentity) {
    throw new Error(`Runtime profile is ${identity?.runtimeProfileId ?? 'UNCHARACTERIZED'}.`);
  }
  if (identity.buildSha !== expectedBuildSha) {
    throw new Error(`VERSION_SKEW: runtime ${identity.buildSha} != expected ${expectedBuildSha}`);
  }
  return identity;
}

function sourceTextForPersona(candidate) {
  if (candidate?.summary?.trim?.().length >= 10) return candidate.summary.trim();
  const experienceText = Array.isArray(candidate?.experience)
    ? candidate.experience.map((item) => item.description).filter(Boolean).join(' ')
    : '';
  if (experienceText.trim().length >= 10) return experienceText.trim();
  const skills = [
    ...(candidate?.skills?.hardSkills ?? []),
    ...(candidate?.skills?.softSkills ?? []),
  ].join(', ');
  if (skills.trim().length >= 10) return skills.trim();
  throw new Error('Persona does not contain a bounded candidate-authored text field >= 10 characters.');
}

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  const persona = manifest.personas?.[PERSONA_ID];
  if (!persona || !persona.sourceDocument || !persona.expectedTruth) {
    throw new Error(`Persona ${PERSONA_ID} is not an extraction persona.`);
  }

  const expectedBuildSha = (process.env.CVENGINE_EXPECTED_BUILD_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' })).trim();
  const runStartedAt = new Date().toISOString();
  const outputDir = resolve(
    process.env.CVENGINE_OPTIMIZE_EVIDENCE_DIR
      || `evidence/ats-sys-02/inline-optimize/${isoSafe(runStartedAt)}`,
  );
  await mkdir(outputDir, { recursive: true });

  const healthResult = await timedRequest(`${BASE_URL}/api/health`);
  if (healthResult.response.status !== 200 || !['READY', 'DEGRADED'].includes(healthResult.body?.status)) {
    throw new Error(`System health is not runnable: HTTP ${healthResult.response.status} ${healthResult.body?.status ?? 'UNKNOWN'}`);
  }
  const identity = assertRuntimeIdentity(healthResult.body, expectedBuildSha);
  const runtimeIdentityRef = process.env.CVENGINE_RUNTIME_IDENTITY_REF?.trim()
    || (await captureCanonicalRuntimeIdentity({
      expectedBuildSha,
      healthStatusCode: healthResult.response.status,
      healthBody: healthResult.body,
    })).runtimeIdentityRef;
  if (!runtimeIdentityRef) throw new Error('Canonical runtime identity evidence ref is required.');
  await persist(resolve(outputDir, '00-health.json'), healthResult.body);

  // Prime the import workload first. This deliberately creates the real
  // qwen3:1.7b → qwen3:4b-instruct workload transition used by the product.
  const fixturePath = resolve(FIXTURE_DIR, persona.sourceDocument.fileName);
  const bytes = await readFile(fixturePath);
  const form = new FormData();
  form.append(
    'file',
    new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
    basename(fixturePath),
  );

  const importStartedAt = new Date().toISOString();
  const importResult = await timedRequest(`${BASE_URL}/api/import-resume`, { method: 'POST', body: form });
  await persist(resolve(outputDir, '01-import-response.json'), importResult.body);
  if (!importResult.response.ok || !importResult.body?.success) {
    throw new Error(`Import priming failed: ${importResult.body?.error || `HTTP ${importResult.response.status}`}`);
  }
  const candidate = importResult.body.data?.resume;
  const sourceText = sourceTextForPersona(candidate);

  const optimizeStartedAt = new Date().toISOString();
  const optimizeResult = await timedRequest(`${BASE_URL}/api/optimize-content`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ summary: sourceText }),
  });
  await persist(resolve(outputDir, '02-optimize-response.json'), optimizeResult.body);
  if (!optimizeResult.response.ok || typeof optimizeResult.body?.output !== 'string') {
    throw new Error(`Inline Optimize failed its safe API contract: ${optimizeResult.body?.error || `HTTP ${optimizeResult.response.status}`}`);
  }

  const output = optimizeResult.body.output;
  const forbiddenLeakage = persona.expectedTruth.forbiddenStrings.filter((value) => hasString(output, value));
  if (forbiddenLeakage.length > 0) {
    throw new Error(`Inline Optimize leaked forbidden candidate truth: ${forbiddenLeakage.join(', ')}`);
  }

  const allowedModes = new Set(['FACT_PRESERVING_AI', 'PRESENTATION_ONLY_FALLBACK']);
  if (!allowedModes.has(optimizeResult.body.mode)) {
    throw new Error(`Unknown Inline Optimize mode: ${optimizeResult.body.mode}`);
  }

  const appLogs = dockerLogs('app', importStartedAt);
  const ollamaLogs = dockerLogs('ollama', importStartedAt);
  const optimizeOllamaLogs = dockerLogs('ollama', optimizeStartedAt);
  await persist(resolve(outputDir, '03-app.log'), appLogs);
  await persist(resolve(outputDir, '04-ollama.log'), ollamaLogs);
  await persist(resolve(outputDir, '05-optimize-ollama.log'), optimizeOllamaLogs);
  const models = modelList();
  await persist(resolve(outputDir, '06-model-list.txt'), models);

  const importModelObserved = /qwen3:1\.7b/i.test(appLogs) || /qwen3:1\.7b/i.test(ollamaLogs);
  const optimizeModelObserved = /qwen3:4b-instruct/i.test(appLogs) || /qwen3:4b-instruct/i.test(optimizeOllamaLogs);
  const optimizeChatCalls = countChatCalls(optimizeOllamaLogs);
  const aiMode = optimizeResult.body.mode === 'FACT_PRESERVING_AI';

  // Optional intelligence is allowed to fall back. If the endpoint reports an
  // AI-success mode, however, the runtime evidence must show the expected model
  // and at least one Ollama chat request in the optimize window.
  if (aiMode && (!optimizeModelObserved || optimizeChatCalls < 1)) {
    throw new Error('Inline Optimize claimed FACT_PRESERVING_AI without observable qwen3:4b-instruct inference evidence.');
  }

  const receipt = {
    receiptVersion: 'ats-sys-02-inline-optimize-observation-v0.1',
    capability: 'inline-optimize',
    personaId: PERSONA_ID,
    fixtureRef: fixturePath,
    identity,
    runtimeIdentityRef,
    startedAt: runStartedAt,
    completedAt: new Date().toISOString(),
    workloadSequence: ['resume-import:qwen3:1.7b', 'inline-optimize:qwen3:4b-instruct'],
    sourceTextLength: sourceText.length,
    mode: optimizeResult.body.mode,
    changed: optimizeResult.body.changed,
    policyVersion: optimizeResult.body.policyVersion,
    truthSafety: {
      forbiddenLeakage,
      pass: forbiddenLeakage.length === 0,
    },
    observations: {
      importLatencyMs: importResult.latencyMs,
      optimizeLatencyMs: optimizeResult.latencyMs,
      importModelObserved,
      optimizeModelObserved,
      optimizeChatCalls,
      modelSwitchObserved: importModelObserved && optimizeModelObserved,
      modelListAtCompletion: models.trim().split(/\r?\n/).filter(Boolean),
    },
    provenance: {
      expectedBuildSha,
      runtimeIdentityRef,
    },
    result: 'OBSERVED',
    productCapabilityResult: 'PASS',
    aiWorkloadResult: aiMode ? 'AI_COMPLETED' : 'SAFE_FALLBACK',
    budgetApplied: false,
    note: 'Optimize latency and model-switch observations are characterization data only. Fallback is valid product behavior because Inline Optimize is OPTIONAL_ENHANCEMENT.',
  };

  await persist(resolve(outputDir, 'receipt.json'), receipt);
  process.stdout.write(`Inline Optimize: ${receipt.aiWorkloadResult} (${optimizeResult.latencyMs} ms)\n`);
  process.stdout.write(`Model switch observed: ${receipt.observations.modelSwitchObserved}\n`);
  process.stdout.write(`Runtime identity: ${runtimeIdentityRef}\n`);
  process.stdout.write(`Evidence: ${outputDir}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});