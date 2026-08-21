import type { RuntimeIdentity } from './RuntimeIdentity';
import { SYSTEM_ACCEPTANCE_RECEIPT_VERSION } from './SystemAcceptanceReceipt';

export const RUNTIME_IDENTITY_EVIDENCE_VERSION = 'ats-sys-02-runtime-identity-v0.1' as const;
export const RUNTIME_IDENTITY_CONTRACT_VERSION = SYSTEM_ACCEPTANCE_RECEIPT_VERSION;

export type RuntimeEvidenceState =
  | 'READY'
  | 'DEGRADED'
  | 'UNAVAILABLE'
  | 'CONFIGURED'
  | 'UNKNOWN';

export interface RuntimeCapabilityIdentity {
  readonly configured: boolean;
  readonly observedState: RuntimeEvidenceState;
  readonly provider?: string;
  readonly model?: string;
  readonly contractVersion?: string;
  readonly detail?: string;
}

export interface RuntimeIdentityEvidence {
  readonly runtimeIdentityVersion: typeof RUNTIME_IDENTITY_EVIDENCE_VERSION;
  readonly buildSha: string;
  readonly architectureVersion: string;
  readonly contractVersion: string;
  readonly environment: string;
  readonly runtimeProfile: string;
  readonly sourceIdentity: RuntimeIdentity;
  readonly host: {
    readonly profileId: string;
    readonly cpu: string;
    readonly cores: number;
    readonly memoryBytes: number;
    readonly operatingSystem: string;
    readonly architecture: string;
  };
  readonly container: {
    readonly image: string;
    readonly imageDigest: string;
    readonly dockerVersion: string;
  };
  readonly capabilities: {
    readonly resumeImport: RuntimeCapabilityIdentity;
    readonly jobIntelligence: RuntimeCapabilityIdentity;
    readonly opportunityAssessment: RuntimeCapabilityIdentity;
    readonly deterministicComposer: RuntimeCapabilityIdentity;
    readonly inlineOptimize: RuntimeCapabilityIdentity;
    readonly persistence: RuntimeCapabilityIdentity;
  };
  readonly ai: {
    readonly provider: string;
    readonly endpoint: string;
    readonly capabilities: {
      readonly resumeImport: {
        readonly resolvedModel: string;
        readonly modelVersion: string;
        readonly capability: 'resumeImport';
      };
      readonly inlineOptimize: {
        readonly resolvedModel: string;
        readonly modelVersion: string;
        readonly capability: 'inlineOptimize';
      };
    };
  };
  readonly redis: {
    readonly provider: string;
    readonly connectivity: RuntimeEvidenceState;
    readonly namespace: string;
    readonly environment: string;
    readonly endpoint: string;
  };
  readonly capturedAt: string;
}

export interface RuntimeIdentityEvidenceValidation {
  readonly valid: boolean;
  readonly blockingReasons: readonly string[];
}

const REQUIRED_CAPABILITIES = [
  'resumeImport',
  'jobIntelligence',
  'opportunityAssessment',
  'deterministicComposer',
  'inlineOptimize',
  'persistence',
] as const;

export function validateRuntimeIdentityEvidence(
  evidence: RuntimeIdentityEvidence,
): RuntimeIdentityEvidenceValidation {
  const blockingReasons: string[] = [];

  if (evidence.runtimeIdentityVersion !== RUNTIME_IDENTITY_EVIDENCE_VERSION) {
    blockingReasons.push('runtime-identity-version');
  }
  if (evidence.contractVersion !== RUNTIME_IDENTITY_CONTRACT_VERSION) {
    blockingReasons.push('contract-version');
  }
  if (!evidence.sourceIdentity.releaseQualifiableIdentity) {
    blockingReasons.push('source-identity-not-release-qualifiable');
  }
  if (evidence.buildSha !== evidence.sourceIdentity.buildSha) {
    blockingReasons.push('build-sha-mismatch');
  }
  if (evidence.architectureVersion !== evidence.sourceIdentity.architectureVersion) {
    blockingReasons.push('architecture-version-mismatch');
  }
  if (evidence.runtimeProfile !== evidence.sourceIdentity.runtimeProfileId) {
    blockingReasons.push('runtime-profile-mismatch');
  }
  if (evidence.host.profileId !== evidence.runtimeProfile) {
    blockingReasons.push('host-profile-mismatch');
  }
  if (!Number.isInteger(evidence.host.cores) || evidence.host.cores < 1) {
    blockingReasons.push('host-cores');
  }
  if (!Number.isFinite(evidence.host.memoryBytes) || evidence.host.memoryBytes <= 0) {
    blockingReasons.push('host-memory');
  }
  if (!evidence.container.image.trim()) blockingReasons.push('container-image');
  if (!evidence.container.imageDigest.trim()) blockingReasons.push('container-image-digest');
  if (!evidence.container.dockerVersion.trim()) blockingReasons.push('docker-version');

  for (const capability of REQUIRED_CAPABILITIES) {
    if (!evidence.capabilities[capability]) {
      blockingReasons.push(`capability:${capability}`);
    }
  }

  if (!evidence.ai.provider.trim()) blockingReasons.push('ai-provider');
  if (!evidence.ai.endpoint.trim()) blockingReasons.push('ai-endpoint');
  if (!evidence.ai.capabilities.resumeImport.resolvedModel.trim()) {
    blockingReasons.push('ai-resume-import-model');
  }
  if (!evidence.ai.capabilities.inlineOptimize.resolvedModel.trim()) {
    blockingReasons.push('ai-inline-optimize-model');
  }
  if (!evidence.redis.provider.trim()) blockingReasons.push('redis-provider');
  if (!evidence.redis.endpoint.trim()) blockingReasons.push('redis-endpoint');
  if (!Number.isFinite(Date.parse(evidence.capturedAt))) blockingReasons.push('captured-at');

  return {
    valid: blockingReasons.length === 0,
    blockingReasons,
  };
}
