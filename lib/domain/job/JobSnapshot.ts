import type { JobSnapshotId } from '../shared/identifiers';
import type { JobDescription } from './JobDescription';
import type { JobRequirement } from './JobRequirement';

/**
 * Historical market truth used by one opportunity comparison. Requirements are
 * embedded with the source JobDescription so later parser changes cannot
 * silently rewrite what an old assessment meant.
 */
export interface JobSnapshot {
  readonly id: JobSnapshotId;
  readonly jobDescription: JobDescription;
  readonly requirements: readonly JobRequirement[];
  readonly language: 'EN' | 'ES' | 'UNKNOWN';
  readonly analyzerVersion: string;
  readonly contentSha256: string;
  readonly capturedAt: string;
}
