import type {
  DerivedMarketInterpretationId,
  JobSnapshotId,
  MarketJobProjectionId,
  MarketObservationId,
} from '../shared/identifiers';
import type { JobDescription } from './JobDescription';
import type { JobRequirement } from './JobRequirement';

export interface MarketJobSnapshotProvenance {
  readonly marketObservationId: MarketObservationId;
  readonly derivedMarketInterpretationId: DerivedMarketInterpretationId;
  readonly marketJobProjectionId: MarketJobProjectionId;
  readonly projectionPolicyVersion: string;
  readonly scopeBoundary: 'JOB_SNAPSHOT_MARKET_PROVENANCE_NOT_CANDIDATE_TRUTH';
}

/**
 * Historical market truth used by one opportunity comparison. Requirements are
 * embedded with the source JobDescription so later parser changes cannot
 * silently rewrite what an old assessment meant.
 *
 * marketProvenance is additive: legacy/manual JobSnapshots remain valid without
 * it, while M4B-05 snapshots can prove which observed/interpreted market state
 * authorized the Job Intelligence input.
 */
export interface JobSnapshot {
  readonly id: JobSnapshotId;
  readonly jobDescription: JobDescription;
  readonly requirements: readonly JobRequirement[];
  readonly language: 'EN' | 'ES' | 'UNKNOWN';
  readonly analyzerVersion: string;
  readonly marketProvenance?: MarketJobSnapshotProvenance;
  readonly contentSha256: string;
  readonly capturedAt: string;
}
