import type { CandidateProfileId, CareerTargetId } from '../shared/identifiers';

export type CareerTargetSeniority =
  | 'ENTRY'
  | 'JUNIOR'
  | 'MID'
  | 'SENIOR'
  | 'LEAD'
  | 'STAFF'
  | 'PRINCIPAL'
  | 'MANAGER'
  | 'DIRECTOR'
  | 'ANY';

export type CareerTargetWorkModel = 'REMOTE' | 'HYBRID' | 'ONSITE' | 'FLEXIBLE';
export type CareerTargetEmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERNSHIP' | 'ANY';
export type CareerTargetRelocation = 'OPEN' | 'NOT_OPEN' | 'UNSPECIFIED';

/**
 * Candidate-owned strategic direction. This is preference/intent, not evidence
 * of capability. It can rank or filter opportunities but can never satisfy a
 * JobRequirement or create CareerEvidence.
 */
export interface CareerTarget {
  readonly id: CareerTargetId;
  readonly candidateProfileId: CandidateProfileId;
  readonly roleTitle: string;
  readonly jobFamily?: string;
  readonly preferredSeniority: CareerTargetSeniority;
  readonly preferredLocations: readonly string[];
  readonly workModels: readonly CareerTargetWorkModel[];
  readonly employmentTypes: readonly CareerTargetEmploymentType[];
  readonly industries: readonly string[];
  readonly relocation: CareerTargetRelocation;
  readonly priority: 1 | 2 | 3 | 4 | 5;
  readonly contentSha256: string;
  readonly createdAt: string;
}
