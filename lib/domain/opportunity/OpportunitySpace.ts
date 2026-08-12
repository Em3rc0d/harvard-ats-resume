import type {
  CandidateProfileId,
  CareerSnapshotId,
  CareerTargetId,
  JobSnapshotId,
  OpportunityAssessmentId,
  OpportunitySpaceId,
} from '../shared/identifiers';

export type OpportunityPriorityBand =
  | 'PRIORITIZE_NOW'
  | 'APPLY_SELECTIVELY'
  | 'BUILD_TOWARD'
  | 'EXPLORE'
  | 'DEPRIORITIZE'
  | 'INSUFFICIENT_SIGNAL';

export type OpportunitySpaceTargetDimensionStatus =
  | 'ALIGNED'
  | 'PARTIAL'
  | 'CONFLICT'
  | 'UNKNOWN'
  | 'NOT_CONSTRAINED';

export interface OpportunitySpaceTargetRelevance {
  readonly policyVersion: string;
  readonly level: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  readonly role: OpportunitySpaceTargetDimensionStatus;
  readonly seniority: OpportunitySpaceTargetDimensionStatus;
  readonly location: OpportunitySpaceTargetDimensionStatus;
  readonly workModel: OpportunitySpaceTargetDimensionStatus;
  readonly employmentType: OpportunitySpaceTargetDimensionStatus;
  readonly reasons: readonly string[];
  readonly scopeBoundary: 'PREFERENCE_ALIGNMENT_NOT_CAPABILITY_EVIDENCE';
}

export interface OpportunitySpaceEntry {
  readonly jobSnapshotId: JobSnapshotId;
  readonly opportunityAssessmentId: OpportunityAssessmentId;
  readonly priority: OpportunityPriorityBand;
  readonly recommendation: 'READY_NOW' | 'STRONG_STRETCH' | 'BUILDABLE' | 'ASPIRATIONAL' | 'LOW_ALIGNMENT';
  readonly targetRelevance: OpportunitySpaceTargetRelevance;
  readonly eligibility: 'CLEAR' | 'UNCERTAIN' | 'BLOCKED';
  readonly criticalGapCount: number;
  readonly rationale: string;
}

export interface OpportunitySpace {
  readonly id: OpportunitySpaceId;
  readonly candidateProfileId: CandidateProfileId;
  readonly careerSnapshotId: CareerSnapshotId;
  readonly careerTargetId: CareerTargetId;
  readonly policyVersion: string;
  readonly entries: readonly OpportunitySpaceEntry[];
  readonly contentSha256: string;
  readonly generatedAt: string;
  readonly scopeBoundary: 'DERIVED_PRIORITY_NOT_CAREER_OR_MARKET_FACT';
}
