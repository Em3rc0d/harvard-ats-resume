export type CharacterizationStatus = 'UNCHARACTERIZED' | 'OBSERVED' | 'PASS' | 'FAIL';

export type FailureClass =
  | 'INPUT'
  | 'EXTRACTION'
  | 'MODEL'
  | 'PERFORMANCE'
  | 'CONFIGURATION'
  | 'PERSISTENCE'
  | 'TRUTH'
  | 'GROUNDING'
  | 'PROVENANCE'
  | 'DURABILITY'
  | 'VERSION_SKEW'
  | 'UI_STATE';

export type AIDependency = 'NONE' | 'BOUNDED_ASSIST' | 'OPTIONAL_ENHANCEMENT';

export type TruthAuthority =
  | 'SOURCE_DOCUMENT'
  | 'CAREER_EVIDENCE'
  | 'JOB_SNAPSHOT'
  | 'APPLICATION_RULES'
  | 'DURABLE_STATE';

export interface CapabilityContract {
  readonly id: string;
  readonly purpose: string;
  readonly truthAuthority: TruthAuthority;
  readonly aiDependency: AIDependency;
  readonly criticalPath: boolean;
  readonly failurePolicy: string;
}

export interface FailureClassContract {
  readonly id: FailureClass;
  readonly detect: string;
  readonly contain: string;
  readonly degrade: string;
  readonly recover: string;
  readonly observe: string;
  readonly test: string;
}

export interface RuntimeProfile {
  readonly id: string;
  readonly status: CharacterizationStatus;
  readonly minimumSupportedRuntime: boolean;
  readonly cpu: string;
  readonly memoryGiB: number;
  readonly containerized: boolean;
  readonly gpuRequired: boolean;
  readonly notes: string;
}

export interface SystemIncident {
  readonly id: string;
  readonly status: 'VERIFIED' | 'SUSPECTED';
  readonly failureClass: FailureClass;
  readonly symptom: string;
  readonly systemLesson: string;
}

export interface ReleaseCriterion {
  readonly id: string;
  readonly description: string;
}

export interface ReleaseCriterionResult {
  readonly criterionId: string;
  readonly status: CharacterizationStatus;
  readonly evidenceRefs: readonly string[];
}

export const REFERENCE_RUNTIME: RuntimeProfile = {
  id: 'REFERENCE-CPU-01',
  status: 'OBSERVED',
  minimumSupportedRuntime: false,
  cpu: 'Intel Core i5-9300H CPU @ 2.40GHz',
  memoryGiB: 7.7,
  containerized: true,
  gpuRequired: false,
  notes: 'Observed during Docker dogfood. This is evidence, not yet a minimum-support promise.',
};

export const CAPABILITY_CONTRACTS: readonly CapabilityContract[] = [
  {
    id: 'resume-import',
    purpose: 'Convert a source resume into candidate evidence proposals.',
    truthAuthority: 'SOURCE_DOCUMENT',
    aiDependency: 'BOUNDED_ASSIST',
    criticalPath: false,
    failurePolicy: 'Reject unsupported extraction, preserve source truth, and allow manual career-evidence recovery.',
  },
  {
    id: 'career-evidence',
    purpose: 'Represent candidate-controlled career facts.',
    truthAuthority: 'CAREER_EVIDENCE',
    aiDependency: 'NONE',
    criticalPath: true,
    failurePolicy: 'Never manufacture missing evidence.',
  },
  {
    id: 'job-intelligence',
    purpose: 'Normalize market truth from a captured job snapshot.',
    truthAuthority: 'JOB_SNAPSHOT',
    aiDependency: 'NONE',
    criticalPath: true,
    failurePolicy: 'Do not promote job requirements into candidate facts.',
  },
  {
    id: 'job-match',
    purpose: 'Compare candidate assertions with job requirements.',
    truthAuthority: 'APPLICATION_RULES',
    aiDependency: 'NONE',
    criticalPath: true,
    failurePolicy: 'Return no trusted match conclusion when the inference contract cannot be satisfied.',
  },
  {
    id: 'inline-optimize',
    purpose: 'Optionally improve presentation of one bounded candidate-owned field.',
    truthAuthority: 'CAREER_EVIDENCE',
    aiDependency: 'OPTIONAL_ENHANCEMENT',
    criticalPath: false,
    failurePolicy: 'Preserve the original candidate wording and continue the product flow.',
  },
  {
    id: 'resume-assembly',
    purpose: 'Materialize an ATS-readable resume from approved candidate evidence.',
    truthAuthority: 'CAREER_EVIDENCE',
    aiDependency: 'NONE',
    criticalPath: true,
    failurePolicy: 'Compose deterministically; model availability must not block final assembly.',
  },
  {
    id: 'grounding',
    purpose: 'Reject generated/materialized facts that exceed candidate evidence.',
    truthAuthority: 'CAREER_EVIDENCE',
    aiDependency: 'NONE',
    criticalPath: true,
    failurePolicy: 'Fail closed before ResumeVersion emission.',
  },
  {
    id: 'provenance',
    purpose: 'Bind every material resume claim to supporting assertions/evidence.',
    truthAuthority: 'APPLICATION_RULES',
    aiDependency: 'NONE',
    criticalPath: true,
    failurePolicy: 'No complete provenance means no trusted ResumeVersion.',
  },
  {
    id: 'durability',
    purpose: 'Persist and verify trusted product state.',
    truthAuthority: 'DURABLE_STATE',
    aiDependency: 'NONE',
    criticalPath: true,
    failurePolicy: 'Never claim durable state when commit/read-back verification fails.',
  },
] as const;

export const FAILURE_CLASS_CONTRACTS: readonly FailureClassContract[] = [
  ['INPUT', 'Validate source/request shape', 'Reject invalid boundary input', 'Offer supported/manual intake', 'Correct or replace input', 'Structured input failure', 'Invalid/unsupported fixture'],
  ['EXTRACTION', 'Compare expected source sections to extracted coverage', 'Reject incomplete/unsupported proposals', 'Manual evidence recovery', 'Retry bounded extraction or edit evidence', 'Section coverage + rejected paths', 'Known-truth resume fixtures'],
  ['MODEL', 'Health/model presence/structured response checks', 'Keep model output untrusted', 'Skip optional AI or fail assisted capability only', 'Restore model/runtime', 'Provider/model/error-kind telemetry', 'Missing model + malformed output'],
  ['PERFORMANCE', 'Measure latency/throughput/memory against workload budget', 'Terminate bounded workload', 'Use non-AI or smaller bounded path where contract allows', 'Change workload-model pairing after evidence', 'Latency/throughput/peak-memory receipt', 'Slow-runtime profile'],
  ['CONFIGURATION', 'Validate resolved runtime configuration', 'Refuse contradictory/unsafe startup state', 'Use explicit safe defaults only where defined', 'Correct deployment configuration', 'Resolved-config fingerprint', 'Stale/invalid env fixture'],
  ['PERSISTENCE', 'Backend readiness and operation errors', 'Stop before false persistence claims', 'Read-only/non-durable UI only when explicitly modeled', 'Restore backend', 'Persistence stage/reason', 'Redis unavailable'],
  ['TRUTH', 'Source/evidence reconciliation', 'Reject unsupported candidate facts', 'Keep supported subset only', 'Add/confirm real evidence', 'Rejected claim/evidence references', 'JD leakage/adversarial claim'],
  ['GROUNDING', 'Grounding and semantic-grounding reports', 'Block ResumeVersion', 'Return review-required state', 'Correct candidate evidence or wording', 'Grounding issue IDs', 'Overstatement fixture'],
  ['PROVENANCE', 'Claim-to-assertion completeness validation', 'Block trusted materialization', 'No trusted resume version', 'Repair composition mapping', 'Untraceable claim IDs', 'Missing assertion binding'],
  ['DURABILITY', 'Commit plus read-after-write verification', 'Do not emit durability claim', 'Keep operation explicitly uncommitted', 'Retry after backend recovery', 'Revision/commit verification receipt', 'Write succeeds/read-back fails'],
  ['VERSION_SKEW', 'Expose build/runtime identity and compare expected revision', 'Reject misleading diagnostics for unknown runtime', 'Require explicit stale-runtime state', 'Rebuild/recreate correct artifact', 'Build SHA + architecture version', 'Run stale artifact against expected revision'],
  ['UI_STATE', 'Compare UI state with backend failure contract', 'Do not mislabel failure class', 'Render precise recoverability guidance', 'Refresh/retry only when policy allows', 'Failure class + UI surface', 'Provider-vs-non-provider failure rendering'],
].map(([id, detect, contain, degrade, recover, observe, test]) => ({
  id: id as FailureClass,
  detect,
  contain,
  degrade,
  recover,
  observe,
  test,
}));

export const SYSTEM_INCIDENTS: readonly SystemIncident[] = [
  {
    id: 'ATS-SYS-INC-001',
    status: 'VERIFIED',
    failureClass: 'PERFORMANCE',
    symptom: 'Whole-resume import on qwen3:8b exceeded the bounded Docker CPU latency envelope.',
    systemLesson: 'Characterize workload-model-runtime pairings before placing them on a product path.',
  },
  {
    id: 'ATS-SYS-INC-002',
    status: 'VERIFIED',
    failureClass: 'PERFORMANCE',
    symptom: 'Whole-resume generation on qwen3:8b exhausted a 240-second request budget before useful completion.',
    systemLesson: 'Final materialization must not depend on an unbounded local-model workload.',
  },
  {
    id: 'ATS-SYS-INC-003',
    status: 'SUSPECTED',
    failureClass: 'VERSION_SKEW',
    symptom: 'Observed runtime behavior did not match the later repository architecture that removed whole-resume model generation.',
    systemLesson: 'Runtime/build identity must be observable before diagnosing application behavior.',
  },
] as const;

export const RELEASE_GATE_CRITERIA: readonly ReleaseCriterion[] = [
  { id: 'canonical-personas', description: 'All required canonical personas complete the end-to-end acceptance path.' },
  { id: 'failure-degradation', description: 'Required injected failure classes degrade or fail according to contract.' },
  { id: 'runtime-envelope', description: 'The declared minimum runtime profile satisfies measured product budgets.' },
  { id: 'truth-invariants', description: 'Candidate truth, market truth and model proposals remain separated.' },
  { id: 'durable-readback', description: 'Trusted state survives commit verification and read-after-write.' },
  { id: 'latency-budgets', description: 'Measured workloads satisfy approved latency budgets.' },
  { id: 'build-identity', description: 'Runtime exposes exact build SHA and architecture version.' },
  { id: 'docker-cold-start', description: 'The supported Docker topology reaches ready state from a cold start.' },
] as const;

export function evaluateReleaseGate(results: readonly ReleaseCriterionResult[]): {
  readonly ready: boolean;
  readonly missing: readonly string[];
} {
  const byId = new Map(results.map((result) => [result.criterionId, result]));
  const missing = RELEASE_GATE_CRITERIA
    .filter((criterion) => {
      const result = byId.get(criterion.id);
      return !result || result.status !== 'PASS' || result.evidenceRefs.length === 0;
    })
    .map((criterion) => criterion.id);

  return { ready: missing.length === 0, missing };
}
