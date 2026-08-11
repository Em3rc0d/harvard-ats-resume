import type {
  CandidateProfile,
  CandidateProfileId,
  CareerAssertion,
  CareerEvidence,
  CareerSource,
  JobDescription,
  JobRequirement,
  MatchReport,
  ResumeClaim,
  ResumeManifest,
  ResumeVersion,
} from '../../domain';
import type { JobLanguage } from '../job/JobIntelligenceEngine';
import type { JobMatchBreakdown } from '../matching/JobMatchEngine';

export const CAREER_VAULT_SCHEMA_VERSION = 'ats2-career-vault-v1' as const;

export interface PersistedJobAnalysis {
  readonly jobDescriptionId: JobDescription['id'];
  readonly language: JobLanguage;
}

export interface PersistedMatchEvaluation {
  readonly matchReportId: MatchReport['id'];
  readonly score: number;
  readonly breakdown: JobMatchBreakdown;
}

/**
 * Durable ATS v2 aggregate stored for one logical candidate identity.
 *
 * Candidate truth, job truth, match inference, and rendered resume artifacts
 * remain separate collections even though this first persistence adapter stores
 * them atomically as one snapshot. That keeps the domain boundaries visible and
 * prevents partial provenance graphs from being committed.
 */
export interface CareerVaultSnapshot {
  readonly schemaVersion: typeof CAREER_VAULT_SCHEMA_VERSION;
  readonly candidate: CandidateProfile;
  readonly sources: readonly CareerSource[];
  readonly evidence: readonly CareerEvidence[];
  readonly assertions: readonly CareerAssertion[];
  readonly jobs: readonly JobDescription[];
  readonly jobRequirements: readonly JobRequirement[];
  readonly jobAnalyses: readonly PersistedJobAnalysis[];
  readonly matchReports: readonly MatchReport[];
  readonly matchEvaluations: readonly PersistedMatchEvaluation[];
  readonly resumeClaims: readonly ResumeClaim[];
  readonly resumeVersions: readonly ResumeVersion[];
  readonly resumeManifests: readonly ResumeManifest[];
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CareerVaultRepository {
  load(candidateProfileId: CandidateProfileId): Promise<CareerVaultSnapshot | null>;
  save(snapshot: CareerVaultSnapshot): Promise<void>;
}

export class CareerVaultUnavailableError extends Error {
  constructor(message = 'Durable Career Vault storage is not configured.') {
    super(message);
    this.name = 'CareerVaultUnavailableError';
  }
}
