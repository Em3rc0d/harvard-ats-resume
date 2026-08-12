import type {
  CandidateProfileId,
  CareerSnapshotId,
} from '../shared/identifiers';
import type { CandidateProfile } from './CandidateProfile';
import type { CareerAssertion } from './CareerAssertion';
import type { CareerEvidence } from './CareerEvidence';
import type { CareerSource } from './CareerSource';

/**
 * Historical projection of the candidate truth known to CV Engine at a point
 * in the career timeline. The embedded graph makes an old assessment readable
 * even after the current career profile evolves.
 */
export interface CareerSnapshot {
  readonly id: CareerSnapshotId;
  readonly candidateProfileId: CandidateProfileId;
  readonly candidate: CandidateProfile;
  readonly sources: readonly CareerSource[];
  readonly evidence: readonly CareerEvidence[];
  readonly assertions: readonly CareerAssertion[];
  readonly contentSha256: string;
  readonly capturedAt: string;
}
