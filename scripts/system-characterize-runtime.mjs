import { execFileSync, spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { cpus, freemem, platform, release, totalmem } from 'node:os';
import { resolve } from 'node:path';

const SERVICES = ['app', 'ollama', 'redis', 'redis-http'];

function isoSafe(value) {
  return value.replace(/[:.]/g, '-');
}

function parseMiB(text) {
  const value = String(text || '').split('/')[0].trim();
  const match = value.match(/^([0-9.]+)\s*(B|KiB|MiB|GiB)$/i);
  if (!match) return undefined;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === 'b') return amount / (1024 * 1024);
  if (unit === 'kib') return amount / 1024;
  if (unit === 'mib') return amount;
  if (unit === 'gib') return amount * 1024;
  return undefined;
}

function parsePercent(text) {
  const value = Number(String(text || '').replace('%', '').trim());
  return Number.isFinite(value) ? value : undefined;
}

function containerId(service) {
  try {
    return execFileSync('docker', ['compose', 'ps', '-q', service], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function serviceSnapshot(service, id) {
  if (!id) return undefined;
  try {
    const output = execFileSync(
      'docker',
      ['stats', '--no-stream', '--format', '{{.CPUPerc}}|{{.MemUsage}}', id],
      { encoding: 'utf8' },
    ).trim();
    const [cpuText, memoryText] = output.split('|');
    return { cpuPercent: parsePercent(cpuText), memoryMiB: parseMiB(memoryText) };
  } catch {
    return undefined;
  }
}

async function main() {
  const stamp = isoSafe(new Date().toISOString());
  const bundleDir = resolve(process.env.CVENGINE_SYSTEM_BUNDLE_DIR || `evidence/system/characterization/${stamp}`);
  const personaDir = resolve(bundleDir, 'personas');
  await mkdir(personaDir, { recursive: true });

  const ids = Object.fromEntries(SERVICES.map((service) => [service, containerId(service)]));
  const maxMemoryMiBByService = Object.fromEntries(SERVICES.map((service) => [service, 0]));
  const maxCpuPercentByService = Object.fromEntries(SERVICES.map((service) => [service, 0]));
  let maxAggregateMemoryMiB = 0;
  let samples = 0;
  let busy = false;
  let stopped = false;

  const sample = async () => {
    if (busy || stopped) return;
    busy = true;
    try {
      let aggregate = 0;
      for (const service of SERVICES) {
        const snapshot = serviceSnapshot(service, ids[service]);
        if (!snapshot) continue;
        if (Number.isFinite(snapshot.memoryMiB)) {
          maxMemoryMiBByService[service] = Math.max(maxMemoryMiBByService[service], snapshot.memoryMiB);
          aggregate += snapshot.memoryMiB;
        }
        if (Number.isFinite(snapshot.cpuPercent)) {
          maxCpuPercentByService[service] = Math.max(maxCpuPercentByService[service], snapshot.cpuPercent);
        }
      }
      maxAggregateMemoryMiB = Math.max(maxAggregateMemoryMiB, aggregate);
      samples += 1;
    } finally {
      busy = false;
    }
  };

  await sample();
  const timer = setInterval(sample, 1000);
  const startedAt = new Date().toISOString();
  const child = spawn(process.execPath, ['scripts/system-characterize.mjs', ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, CVENGINE_SYSTEM_EVIDENCE_DIR: personaDir },
  });
  const exitCode = await new Promise((resolvePromise, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolvePromise(code ?? 1));
  });
  stopped = true;
  clearInterval(timer);
  await sample();

  const observation = {
    observationVersion: 'ats-sys-01-runtime-observation-v0.1',
    startedAt,
    completedAt: new Date().toISOString(),
    host: {
      platform: platform(),
      release: release(),
      logicalCpuCount: cpus().length,
      cpuModel: cpus()[0]?.model ?? 'UNKNOWN',
      totalMemoryGiB: Math.round((totalmem() / (1024 ** 3)) * 100) / 100,
      freeMemoryGiBAtCompletion: Math.round((freemem() / (1024 ** 3)) * 100) / 100,
    },
    dockerServices: {
      ids,
      samples,
      sampleIntervalMs: 1000,
      maxMemoryMiBByService,
      maxAggregateMemoryMiB: Math.round(maxAggregateMemoryMiB * 10) / 10,
      maxCpuPercentByService,
    },
    personaEvidenceDir: personaDir,
    characterizationExitCode: exitCode,
    status: exitCode === 0 ? 'OBSERVED' : 'OBSERVED_WITH_FAILURE',
    policy: 'Measurements are observations only. ATS-SYS-01 v0.1 applies no latency, CPU, or memory budget.',
  };

  await writeFile(resolve(bundleDir, 'runtime-observation.json'), `${JSON.stringify(observation, null, 2)}\n`, 'utf8');
  process.stdout.write(`Runtime observation: ${resolve(bundleDir, 'runtime-observation.json')}\n`);
  process.exitCode = exitCode;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
