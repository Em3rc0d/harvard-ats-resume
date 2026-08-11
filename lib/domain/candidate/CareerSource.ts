import type { CandidateProfileId, CareerSourceId } from '../shared/identifiers';

export type CareerSourceKind =
  | 'CANDIDATE_PROVIDED'
  | 'RESUME_UPLOAD'
  | 'LINKEDIN_PROFILE'
  | 'CERTIFICATE_UPLOAD'
  | 'MANUAL_REVIEW';

export interface CareerSource {
  readonly id: CareerSourceId;
  readonly candidateProfileId: CandidateProfileId;
  readonly kind: CareerSourceKind;
  readonly label: string;
  readonly capturedAt: string;
}

export function createCareerSource(input: CareerSource): CareerSource {
  if (!input.label.trim()) {
    throw new Error('CareerSource label is required');
  }

  return input;
}
