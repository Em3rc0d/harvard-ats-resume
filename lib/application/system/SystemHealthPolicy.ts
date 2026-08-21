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
  readonly unavailableCapabilities: readonly string[];
}

/**
 * System-level health policy derived from ATS-SYS-01 degradation contracts.
 *
 * Local AI assists bounded import/optimization capabilities and may degrade
 * without taking the trusted core offline. Durable Redis is currently required
 * for trusted Career Vault / ResumeVersion state and therefore remains a core
 * availability dependency.
 *
 * `degradedCapabilities` is retained exactly for ATS-SYS-01 compatibility.
 * ATS-SYS-02 additionally exposes `unavailableCapabilities` so fault receipts
 * can distinguish degraded optional intelligence from a capability whose
 * trusted guarantee is not available at all.
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
      unavailableCapabilities: ['durable-state'],
    };
  }

  if (input.localAI !== 'READY') {
    return {
      status: 'DEGRADED',
      httpStatus: 200,
      trustedCoreAvailable: true,
      degradedCapabilities: ['resume-import-ai', 'inline-optimize'],
      unavailableCapabilities: [],
    };
  }

  return {
    status: 'READY',
    httpStatus: 200,
    trustedCoreAvailable: true,
    degradedCapabilities: [],
    unavailableCapabilities: [],
  };
}