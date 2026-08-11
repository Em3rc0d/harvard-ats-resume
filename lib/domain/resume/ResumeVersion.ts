import type {
  CandidateProfileId,
  JobDescriptionId,
  ResumeClaimId,
  ResumeVersionId,
} from '../shared/identifiers';

export interface ResumeVersion {
  readonly id: ResumeVersionId;
  readonly candidateProfileId: CandidateProfileId;
  readonly targetedJobDescriptionId?: JobDescriptionId;
  readonly claimIds: readonly ResumeClaimId[];
  readonly createdAt: string;
}

export function createResumeVersion(input: ResumeVersion): ResumeVersion {
  return input;
}
