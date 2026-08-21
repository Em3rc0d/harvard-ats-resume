import type { FailureClass } from './SystemCharacterizationContract';
import type { RuntimeIdentity } from './RuntimeIdentity';

export const SYSTEM_ACCEPTANCE_RECEIPT_VERSION = 'ats-sys-01-receipt-v0.1' as const;

export type SystemStageId =
  | 'sourceIntake'
  | 'careerEvidence'
  | 'careerTarget'
  | 'jobSnapshot'
  | 'jobIntelligence'
  | 'jobMatch'
  | 'opportunityAssessment'
  | 'resumeAssembly'
  | 'grounding'
  | 'semanticGrounding'
  | 'provenance'
  | 'persistence'
  | 'readBack';

export type StageReceiptStatus = 'PASS' | 'FAIL' | 'SKIPPED' | 'UNCHARACTERIZED';

export interface StageReceipt {
  readonly status: StageReceiptStatus;
  readonly evidenceRefs: readonly string[];
  readonly latencyMs?: number;
  readonly failureClass?: FailureClass;
  readonly detail?: string;
}

export interface SystemAcceptanceReceipt {
  readonly receiptVersion: typeof SYSTEM_ACCEPTANCE_RECEIPT_VERSION;
  readonly personaId: string;
  readonly identity: RuntimeIdentity;
  /**
   * ATS-SYS-02 evidence pointer to the canonical RuntimeIdentityEvidence
   * artifact captured from the exact running build. Kept optional in the
   * structural type so historical ATS-SYS-01 receipts remain readable;
   * current acceptance evaluation fails closed when it is absent.
   */
  readonly runtimeIdentityRef?: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly stages: Readonly<Partial<Record<SystemStageId, StageReceipt>>>;
  readonly aiCalls: {
    readonly total: number;
    readonly criticalPath: number;
    readonly byCapability: Readonly<Record<string, number>>;
  };
  readonly measurements: {
    readonly totalLatencyMs: number;
    readonly peakMemoryMiB?: number;
  };
}

export const CORE_ACCEPTANCE_STAGES: readonly SystemStageId[] = [
  'sourceIntake',
  'careerEvidence',
  'resumeAssembly',
  'grounding',
  'semanticGrounding',
  'provenance',
  'persistence',
  'readBack',
] as const;

export interface AcceptanceEvaluation {
  readonly accepted: boolean;
  readonly blockingReasons: readonly string[];
}

export function evaluateAcceptanceReceipt(
  receipt: SystemAcceptanceReceipt,
  requiredStages: readonly SystemStageId[] = CORE_ACCEPTANCE_STAGES,
): AcceptanceEvaluation {
  const blockingReasons: string[] = [];

  if (!receipt.identity.releaseQualifiableIdentity) {
    blockingReasons.push('runtime-identity');
  }
  if (!receipt.runtimeIdentityRef?.trim()) {
    blockingReasons.push('runtime-identity-ref');
  }

  for (const stageId of requiredStages) {
    const stage = receipt.stages[stageId];
    if (!stage) {
      blockingReasons.push(`stage:${stageId}:missing`);
      continue;
    }
    if (stage.status !== 'PASS') {
      blockingReasons.push(`stage:${stageId}:${stage.status.toLowerCase()}`);
      continue;
    }
    if (stage.evidenceRefs.length === 0) {
      blockingReasons.push(`stage:${stageId}:missing-evidence`);
    }
  }

  if (!Number.isFinite(receipt.measurements.totalLatencyMs) || receipt.measurements.totalLatencyMs < 0) {
    blockingReasons.push('measurement:total-latency');
  }

  return {
    accepted: blockingReasons.length === 0,
    blockingReasons,
  };
}