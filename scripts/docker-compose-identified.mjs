import { execFileSync, spawnSync } from 'node:child_process';

const ARCHITECTURE_VERSION = 'ats-sys-01-v0.1';

function currentBuildSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch (error) {
    console.error('Unable to resolve git HEAD. Refusing to create an identified Docker runtime.', error);
    process.exit(1);
  }
}

const composeArgs = process.argv.slice(2);
const requestedArgs = composeArgs.length > 0 ? composeArgs : ['up', '--build'];
const buildSha = currentBuildSha();

console.log(`CV Engine identified Docker runtime: ${buildSha} / ${ARCHITECTURE_VERSION}`);

const result = spawnSync('docker', ['compose', ...requestedArgs], {
  stdio: 'inherit',
  env: {
    ...process.env,
    CVENGINE_BUILD_SHA: buildSha,
    CVENGINE_ARCHITECTURE_VERSION: ARCHITECTURE_VERSION,
  },
});

if (result.error) {
  console.error('Unable to execute Docker Compose.', result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
