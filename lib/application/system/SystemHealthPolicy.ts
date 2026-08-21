export type DependencyReadiness = 'READY' | 'UNAVAILABLE';
export type SystemHealthStatus = 'READY' | 'DEGRADED' | 'UNAVAILABLE';

export interface SystemHealthInput {
  readonly localAI: DependencyReadiness;
  readonly durableRedis: DependencyReadiness;
}

export interface SystemHealthDecision {
  readonly status: SystemHealthStatus;
  readonly httpStatus: 200 | 503;
  readonly trustedCoreAvailable: boolean;
  readonly degradedCapabilities: readonly string[];
}

/**
 * System-level health policy derived from ATS-SYS-01 degradation contracts.
 *
 * Local AI assists bounded import/optimization capabilities and may degrade
 * without taking the trusted core offline. Durable Redis is currently required
 * for trusted Career Vault / ResumeVersion state and therefore remains a core
 * availability dependency.
 */
export function evaluateSystemHealth(input: SystemHealthInput): SystemHealthDecision {
  if (input.durableRedis !== 'READY') {
    return {
      status: 'UNAVAILABLE',
      httpStatus: 503,
      trustedCoreAvailable: false,
      degradedCapabilities: input.localAI === 'READY'
        ? ['durable-state']
        : ['durable-state', 'resume-import-ai', 'inline-optimize'],
    };
  }

  if (input.localAI !== 'READY') {
    return {
      status: 'DEGRADED',
      httpStatus: 200,
      trustedCoreAvailable: true,
      degradedCapabilities: ['resume-import-ai', 'inline-optimize'],
    };
  }

  return {
    status: 'READY',
    httpStatus: 200,
    trustedCoreAvailable: true,
    degradedCapabilities: [],
  };
}
