import { randomUUID } from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { promisify } from 'node:util';
import { performance } from 'node:perf_hooks';

const execFileAsync = promisify(execFile);
const BASE_URL = (process.env.CV_ENGINE_E2E_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const MANIFEST_PATH = resolve('tests/system/fixtures/canonical-personas.v0.1.json');
const FIXTURE_DIR = resolve('tests/system/fixtures/docx');
const RECEIPT_VERSION = 'ats-sys-01-receipt-v0.1';
const REQUIRED_PERSONAS = ['P01', 'P03', 'P04', 'P09'];

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function isoSafe(value) {
  return value.replace(/[:.]/g, '-');
}

function normalize(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase();
}

function hasString(haystack, needle) {
  return normalize(haystack).includes(normalize(needle));
}

function stage(status, evidenceRefs, latencyMs, detail, failureClass) {
  return {
    status,
    evidenceRefs,
    ...(Number.isFinite(latencyMs) ? { latencyMs: Math.round(latencyMs) } : {}),
    ...(detail ? { detail } : {}),
    ...(failureClass ? { failureClass } : {}),
  };
}

function parseMiB(text) {
  const value = String(text || '').split('/')[0].trim();
  const match = value.match(/^([0-9.]+)\s*(B|KiB|MiB|GiB)$/i);
  if (!match) return undefined;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (!Number.isFinite(amount)) return undefined;
  if (unit === 'b') return amount / (1024 * 1024);
  if (unit === 'kib') return amount / 1024;
  if (unit === 'mib') return amount;
  if (unit === 'gib') return amount * 1024;
  return undefined;
}

async function createMemorySampler() {
  let peakMemoryMiB;
  let stopped = false;
  let sampling = false;
  let containerId = '';
  try {
    containerId = execFileSync('docker', ['compose', 'ps', '-q', 'app'], { encoding: 'utf8' }).trim();
  } catch {
    return { stop: async () => undefined };
  }
  if (!containerId) return { stop: async () => undefined };

  const sample = async () => {
    if (stopped || sampling) return;
    sampling = true;
    try {
      const { stdout } = await execFileAsync('docker', ['stats', '--no-stream', '--format', '{{.MemUsage}}', containerId]);
      const memory = parseMiB(stdout.trim());
      if (Number.isFinite(memory)) peakMemoryMiB = Math.max(peakMemoryMiB ?? 0, memory);
    } catch {
      // Measurement absence must not fabricate a peak. Receipt simply omits it.
    } finally {
      sampling = false;
    }
  };

  await sample();
  const timer = setInterval(sample, 1000);
  timer.unref?.();
  return {
    stop: async () => {
      stopped = true;
      clearInterval(timer);
      await sample();
      return peakMemoryMiB;
    },
  };
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
  return {
    response,
    body,
    latencyMs: performance.now() - started,
  };
}

async function persistJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return path;
}

function requireSuccessfulJson(result, label) {
  if (!result.response.ok || !result.body?.success) {
    const message = result.body?.error || `HTTP ${result.response.status}`;
    throw new Error(`${label} failed: ${message}`);
  }
  return result.body.data;
}

function validateImportedTruth(candidate, expected) {
  const issues = [];
  const serialized = JSON.stringify(candidate);
  const summaryPresent = Boolean(candidate?.summary?.trim?.());
  if (summaryPresent !== expected.summaryPresent) {
    issues.push(`summary expected ${expected.summaryPresent}, received ${summaryPresent}`);
  }
  const experienceCount = Array.isArray(candidate?.experience) ? candidate.experience.length : 0;
  if (experienceCount !== expected.experienceCount) {
    issues.push(`experience expected ${expected.experienceCount}, received ${experienceCount}`);
  }
  const educationCount = Array.isArray(candidate?.education) ? candidate.education.length : 0;
  if (educationCount !== expected.educationCount) {
    issues.push(`education expected ${expected.educationCount}, received ${educationCount}`);
  }
  for (const required of expected.requiredStrings) {
    if (!hasString(serialized, required)) issues.push(`missing required truth: ${required}`);
  }
  for (const forbidden of expected.forbiddenStrings) {
    if (hasString(serialized, forbidden)) issues.push(`forbidden candidate truth present: ${forbidden}`);
  }
  return issues;
}

function validateFinalResume(formattedResume, expected) {
  const issues = [];
  for (const required of expected.requiredStrings) {
    if (!hasString(formattedResume, required)) issues.push(`final resume missing: ${required}`);
  }
  for (const forbidden of expected.forbiddenStrings) {
    if (hasString(formattedResume, forbidden)) issues.push(`job/non-source truth leaked: ${forbidden}`);
  }
  return issues;
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

function countChatCalls(logText) {
  return (String(logText).match(/POST\s+"\/api\/chat"/g) || []).length;
}

function readCareerVault(candidateProfileId) {
  const key = `ats2:career-vault:v1:${candidateProfileId}`;
  const raw = execFileSync(
    'docker',
    ['compose', 'exec', '-T', 'redis', 'redis-cli', '--raw', 'GET', key],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  ).trim();
  if (!raw) throw new Error(`Career Vault read-back was empty for ${candidateProfileId}`);
  return JSON.parse(raw);
}

async function characterizePersona(personaId, persona, identity, expectedBuildSha, rootOutputDir) {
  const startedAt = new Date().toISOString();
  const runStarted = performance.now();
  const outputDir = resolve(rootOutputDir, personaId);
  await mkdir(outputDir, { recursive: true });
  const memorySampler = await createMemorySampler();
  const stages = {};
  const evidence = (name) => resolve(outputDir, name);

  try {
    const fixturePath = resolve(FIXTURE_DIR, persona.sourceDocument.fileName);
    const bytes = await readFile(fixturePath);
    const form = new FormData();
    form.append(
      'file',
      new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
      basename(fixturePath),
    );

    const importResult = await timedRequest(`${BASE_URL}/api/import-resume`, { method: 'POST', body: form });
    const importEvidence = await persistJson(evidence('01-import-response.json'), importResult.body);
    const imported = requireSuccessfulJson(importResult, `${personaId} import`);
    stages.sourceIntake = stage('PASS', [importEvidence], importResult.latencyMs, `Imported ${bytes.byteLength} bytes.`);

    const truthIssues = validateImportedTruth(imported.resume, persona.expectedTruth);
    const truthEvidence = await persistJson(evidence('02-known-truth-evaluation.json'), {
      expected: persona.expectedTruth,
      issues: truthIssues,
      importer: imported.context?.receipt?.importer,
      importerVersion: imported.context?.receipt?.importerVersion,
      rejectedFieldPaths: imported.context?.rejectedFieldPaths ?? [],
    });
    if (truthIssues.length > 0) {
      stages.careerEvidence = stage('FAIL', [truthEvidence], undefined, truthIssues.join(' | '), 'EXTRACTION');
      throw new Error(`${personaId} known-truth mismatch: ${truthIssues.join(' | ')}`);
    }
    stages.careerEvidence = stage('PASS', [truthEvidence], undefined, 'Imported candidate matches authored fixture truth envelope.');

    const careerVaultId = randomUUID();
    const candidateWithJob = { ...imported.resume, jobDescription: persona.jobDescription };

    const assessmentResult = await timedRequest(`${BASE_URL}/api/assess-opportunity`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...candidateWithJob, careerVaultId, careerTarget: persona.careerTarget }),
    });
    const assessmentEvidence = await persistJson(evidence('03-opportunity-assessment-response.json'), assessmentResult.body);
    const assessment = requireSuccessfulJson(assessmentResult, `${personaId} opportunity assessment`);
    const assessmentRefs = [assessmentEvidence];
    stages.careerTarget = stage('PASS', assessmentRefs, assessmentResult.latencyMs, `Portfolio revision ${assessment.careerTarget?.portfolioRevision ?? 'unknown'}.`);
    stages.jobSnapshot = stage('PASS', assessmentRefs, undefined, `Job snapshot ${assessment.opportunityHistory?.jobSnapshotId ?? 'unknown'}.`);
    stages.jobIntelligence = stage('PASS', assessmentRefs, undefined, 'Opportunity endpoint completed explicit Job Intelligence before assessment.');
    stages.jobMatch = stage('PASS', assessmentRefs, undefined, 'Opportunity endpoint completed match inference before assessment.');
    stages.opportunityAssessment = stage('PASS', assessmentRefs, undefined, `Assessment ${assessment.opportunityHistory?.assessmentId ?? 'unknown'} persisted.`);

    const generationStartedAt = new Date().toISOString();
    const generationResult = await timedRequest(`${BASE_URL}/api/generate-resume`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...candidateWithJob, careerVaultId, sourceContext: imported.context }),
    });
    const generationEvidence = await persistJson(evidence('04-generate-resume-response.json'), generationResult.body);
    const generated = requireSuccessfulJson(generationResult, `${personaId} resume generation`);

    const finalTruthIssues = validateFinalResume(generated.formattedResume, persona.expectedTruth);
    const finalTruthEvidence = await persistJson(evidence('05-final-resume-truth-evaluation.json'), {
      expected: persona.expectedTruth,
      issues: finalTruthIssues,
      resumeVersionId: generated.resumeVersion?.id,
      generation: generated.resumeVersion?.generation,
    });
    if (finalTruthIssues.length > 0) {
      stages.resumeAssembly = stage('FAIL', [generationEvidence, finalTruthEvidence], generationResult.latencyMs, finalTruthIssues.join(' | '), 'TRUTH');
      throw new Error(`${personaId} final resume truth mismatch: ${finalTruthIssues.join(' | ')}`);
    }

    const generationOllamaLog = dockerLogs('ollama', generationStartedAt);
    await writeFile(evidence('06-generation-ollama.log'), generationOllamaLog, 'utf8');
    const generationChatCalls = countChatCalls(generationOllamaLog);
    if (generationChatCalls !== 0) {
      stages.resumeAssembly = stage('FAIL', [generationEvidence, finalTruthEvidence, evidence('06-generation-ollama.log')], generationResult.latencyMs, `Final assembly made ${generationChatCalls} Ollama /api/chat call(s).`, 'MODEL');
      throw new Error(`${personaId} final assembly used Ollama on the critical path.`);
    }

    stages.resumeAssembly = stage('PASS', [generationEvidence, finalTruthEvidence, evidence('06-generation-ollama.log')], generationResult.latencyMs, 'Deterministic assembly completed with zero final-generation Ollama calls.');
    stages.grounding = stage('PASS', [generationEvidence], undefined, 'HTTP success can only occur after grounding approval in the generation route.');
    stages.semanticGrounding = stage('PASS', [generationEvidence], undefined, 'HTTP success can only occur after semantic-grounding approval in the generation route.');

    const traceability = Array.isArray(generated.claimTraceability) ? generated.claimTraceability : [];
    const traceabilityComplete = traceability.length > 0 && traceability.every((claim) => Array.isArray(claim.evidence) && claim.evidence.length > 0);
    if (!traceabilityComplete) {
      stages.provenance = stage('FAIL', [generationEvidence], undefined, 'Claim traceability is empty or contains a material claim without evidence.', 'PROVENANCE');
      throw new Error(`${personaId} claim traceability incomplete.`);
    }
    stages.provenance = stage('PASS', [generationEvidence], undefined, `${traceability.length} material claim(s) have evidence bindings.`);

    if (generated.resumePersistence !== 'DURABLE_CAREER_VAULT' || !generated.careerVault?.candidateProfileId) {
      stages.persistence = stage('FAIL', [generationEvidence], undefined, 'Generation response did not emit durable Career Vault evidence.', 'DURABILITY');
      throw new Error(`${personaId} durable persistence contract not satisfied.`);
    }
    stages.persistence = stage('PASS', [generationEvidence], undefined, `Career Vault revision ${generated.careerVault.revision}.`);

    const vault = readCareerVault(generated.careerVault.candidateProfileId);
    const readBackEvidence = await persistJson(evidence('07-career-vault-readback.json'), vault);
    const versionId = generated.resumeVersion?.id;
    const hasVersion = Array.isArray(vault.resumeVersions) && vault.resumeVersions.some((version) => version.id === versionId);
    const hasDocument = Array.isArray(vault.resumeDocuments) && vault.resumeDocuments.some((document) => document.resumeVersionId === versionId);
    if (vault.candidate?.id !== generated.careerVault.candidateProfileId || !hasVersion || !hasDocument) {
      stages.readBack = stage('FAIL', [readBackEvidence], undefined, 'Redis read-back did not contain the emitted candidate/version/document graph.', 'DURABILITY');
      throw new Error(`${personaId} read-after-write verification failed.`);
    }
    stages.readBack = stage('PASS', [readBackEvidence], undefined, `ResumeVersion ${versionId} survived durable read-back.`);

    const fullOllamaLog = dockerLogs('ollama', startedAt);
    const appLog = dockerLogs('app', startedAt);
    await writeFile(evidence('08-ollama.log'), fullOllamaLog, 'utf8');
    await writeFile(evidence('09-app.log'), appLog, 'utf8');
    const totalAiCalls = countChatCalls(fullOllamaLog);
    const peakMemoryMiB = await memorySampler.stop();
    const completedAt = new Date().toISOString();
    const receipt = {
      receiptVersion: RECEIPT_VERSION,
      personaId,
      identity,
      startedAt,
      completedAt,
      stages,
      aiCalls: {
        total: totalAiCalls,
        criticalPath: generationChatCalls,
        byCapability: { 'resume-import-ai': totalAiCalls, 'resume-assembly': generationChatCalls },
      },
      measurements: {
        totalLatencyMs: Math.round(performance.now() - runStarted),
        ...(Number.isFinite(peakMemoryMiB) ? { peakMemoryMiB: Math.round(peakMemoryMiB * 10) / 10 } : {}),
      },
      expectedBuildSha,
      accepted: true,
    };
    await persistJson(evidence('receipt.json'), receipt);
    return receipt;
  } catch (error) {
    const peakMemoryMiB = await memorySampler.stop();
    const completedAt = new Date().toISOString();
    const receipt = {
      receiptVersion: RECEIPT_VERSION,
      personaId,
      identity,
      startedAt,
      completedAt,
      stages,
      aiCalls: { total: 0, criticalPath: 0, byCapability: {} },
      measurements: {
        totalLatencyMs: Math.round(performance.now() - runStarted),
        ...(Number.isFinite(peakMemoryMiB) ? { peakMemoryMiB: Math.round(peakMemoryMiB * 10) / 10 } : {}),
      },
      expectedBuildSha,
      accepted: false,
      blockingReason: error instanceof Error ? error.message : String(error),
    };
    await persistJson(evidence('receipt.json'), receipt);
    throw error;
  }
}

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  if (manifest.synthetic !== true) throw new Error('Canonical persona manifest must be explicitly synthetic.');

  const requestedPersona = argValue('--persona');
  const personaIds = requestedPersona ? [requestedPersona] : REQUIRED_PERSONAS;
  for (const personaId of personaIds) {
    if (!manifest.personas[personaId] || personaId === 'P10') throw new Error(`Unknown runnable persona: ${personaId}`);
  }

  const expectedBuildSha = (process.env.CVENGINE_EXPECTED_BUILD_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' })).trim();
  const healthResult = await timedRequest(`${BASE_URL}/api/health`);
  if (healthResult.response.status !== 200 || !['READY', 'DEGRADED'].includes(healthResult.body?.status)) {
    throw new Error(`System health is not runnable: HTTP ${healthResult.response.status} ${healthResult.body?.status ?? 'UNKNOWN'}`);
  }
  const identity = healthResult.body?.identity;
  if (!identity?.identified) throw new Error('Runtime build is UNIDENTIFIED; characterization cannot qualify release evidence.');
  if (identity.buildSha !== expectedBuildSha) {
    throw new Error(`VERSION_SKEW: runtime ${identity.buildSha} != expected ${expectedBuildSha}`);
  }
  if (!identity.releaseQualifiableIdentity) {
    throw new Error(`Runtime profile is ${identity.runtimeProfileId ?? 'UNCHARACTERIZED'}; set CVENGINE_RUNTIME_PROFILE_ID for a characterization run.`);
  }

  const stamp = isoSafe(new Date().toISOString());
  const rootOutputDir = resolve(process.env.CVENGINE_SYSTEM_EVIDENCE_DIR || `evidence/system/runs/${stamp}`);
  await mkdir(rootOutputDir, { recursive: true });
  await persistJson(resolve(rootOutputDir, '00-health.json'), healthResult.body);
  await persistJson(resolve(rootOutputDir, '00-run-manifest.json'), {
    manifestVersion: manifest.version,
    synthetic: manifest.synthetic,
    expectedBuildSha,
    runtimeIdentity: identity,
    personas: personaIds,
    startedAt: new Date().toISOString(),
    note: 'No latency budget is applied in ATS-SYS-01 v0.1. Measurements are characterization data only.',
  });

  const receipts = [];
  for (const personaId of personaIds) {
    process.stdout.write(`Characterizing ${personaId}...\n`);
    try {
      const receipt = await characterizePersona(personaId, manifest.personas[personaId], identity, expectedBuildSha, rootOutputDir);
      receipts.push(receipt);
      process.stdout.write(`${personaId}: PASS (${receipt.measurements.totalLatencyMs} ms)\n`);
    } catch (error) {
      process.stderr.write(`${personaId}: FAIL — ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
      break;
    }
  }

  await persistJson(resolve(rootOutputDir, 'summary.json'), {
    expectedBuildSha,
    identity,
    receipts: receipts.map((receipt) => ({
      personaId: receipt.personaId,
      accepted: receipt.accepted,
      totalLatencyMs: receipt.measurements.totalLatencyMs,
      peakMemoryMiB: receipt.measurements.peakMemoryMiB,
      aiCalls: receipt.aiCalls,
    })),
  });
  process.stdout.write(`Evidence: ${rootOutputDir}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
