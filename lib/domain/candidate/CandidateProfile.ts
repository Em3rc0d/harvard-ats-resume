import type { CandidateProfileId } from '../shared/identifiers';

export interface CandidateProfile {
  readonly id: CandidateProfileId;
  readonly displayName?: string;
  readonly createdAt: string;
}

export function createCandidateProfile(input: CandidateProfile): CandidateProfile {
  return input;
}
