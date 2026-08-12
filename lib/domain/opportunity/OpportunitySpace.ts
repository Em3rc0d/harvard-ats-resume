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

export interface OpportunitySpaceEntry {
  readonly jobSnapshotId: JobSnapshotId;
  readonly opportunityAssessmentId: OpportunityAssessmentId;
  readonly priority: OpportunityPriorityBand;
  readonly recommendation: 'READY_NOW' | 'STRONG_STRETCH' | 'BUILDABLE' | 'ASPIRATIONAL' | 'LOW_ALIGNMENT';
  readonly targetRelevance: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
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
