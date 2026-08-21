export const CVENGINE_ARCHITECTURE_VERSION = 'ats-sys-01-v0.1' as const;
export const UNIDENTIFIED_BUILD_SHA = 'UNIDENTIFIED' as const;
export const UNCHARACTERIZED_RUNTIME_PROFILE = 'UNCHARACTERIZED' as const;

export interface RuntimeIdentity {
  readonly buildSha: string;
  readonly architectureVersion: string;
  readonly runtimeProfileId: string;
  readonly identified: boolean;
  readonly releaseQualifiableIdentity: boolean;
  readonly source: 'CVENGINE_BUILD_SHA' | 'VERCEL_GIT_COMMIT_SHA' | 'GITHUB_SHA' | 'UNIDENTIFIED';
}

type RuntimeIdentityEnv = Readonly<Record<string, string | undefined>>;

function firstNonEmpty(...values: readonly (string | undefined)[]): string | undefined {
  return values.map((value) => value?.trim()).find((value) => Boolean(value));
}

export function resolveRuntimeIdentity(env: RuntimeIdentityEnv = process.env): RuntimeIdentity {
  const explicitBuild = firstNonEmpty(env.CVENGINE_BUILD_SHA);
  const vercelBuild = firstNonEmpty(env.VERCEL_GIT_COMMIT_SHA);
  const githubBuild = firstNonEmpty(env.GITHUB_SHA);
  const buildSha = explicitBuild ?? vercelBuild ?? githubBuild ?? UNIDENTIFIED_BUILD_SHA;
  const source: RuntimeIdentity['source'] = explicitBuild
    ? 'CVENGINE_BUILD_SHA'
    : vercelBuild
      ? 'VERCEL_GIT_COMMIT_SHA'
      : githubBuild
        ? 'GITHUB_SHA'
        : 'UNIDENTIFIED';

  const architectureVersion = firstNonEmpty(
    env.CVENGINE_ARCHITECTURE_VERSION,
    CVENGINE_ARCHITECTURE_VERSION,
  )!;
  const runtimeProfileId = firstNonEmpty(
    env.CVENGINE_RUNTIME_PROFILE_ID,
    UNCHARACTERIZED_RUNTIME_PROFILE,
  )!;

  const identified = buildSha !== UNIDENTIFIED_BUILD_SHA;
  const releaseQualifiableIdentity = identified && runtimeProfileId !== UNCHARACTERIZED_RUNTIME_PROFILE;

  return {
    buildSha,
    architectureVersion,
    runtimeProfileId,
    identified,
    releaseQualifiableIdentity,
    source,
  };
}
