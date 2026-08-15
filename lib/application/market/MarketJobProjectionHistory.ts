import type { JobSnapshot, MarketJobProjection } from '../../domain';
import {
  MarketJobProjectionIntegrityError,
  validateMarketJobProjectionIntegrity,
  validateMarketProjectedJobSnapshotIntegrity,
} from './MarketJobProjectionService';

export const MARKET_JOB_PROJECTION_HISTORY_SCHEMA_VERSION = 'market-job-projection-history-v1' as const;

export interface MarketJobProjectionHistoryRecord {
  readonly projection: MarketJobProjection;
  readonly jobSnapshot: JobSnapshot;
}

export interface MarketJobProjectionHistorySnapshot {
  readonly schemaVersion: typeof MARKET_JOB_PROJECTION_HISTORY_SCHEMA_VERSION;
  readonly records: readonly MarketJobProjectionHistoryRecord[];
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MarketJobProjectionHistoryRepository {
  load(): Promise<MarketJobProjectionHistorySnapshot | null>;
  save(snapshot: MarketJobProjectionHistorySnapshot): Promise<void>;
}

export class MarketJobProjectionHistoryIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MarketJobProjectionHistoryIntegrityError';
  }
}

export class MarketJobProjectionHistoryUnavailableError extends Error {
  constructor(message = 'Durable market job projection history storage is not configured.') {
    super(message);
    this.name = 'MarketJobProjectionHistoryUnavailableError';
  }
}

function requireHistory(condition: boolean, message: string): asserts condition {
  if (!condition) throw new MarketJobProjectionHistoryIntegrityError(message);
}

function requireTimestamp(value: string, label: string): void {
  requireHistory(Number.isFinite(Date.parse(value)), `${label} must be a valid timestamp.`);
}

export function validateMarketJobProjectionHistorySnapshot(
  snapshot: MarketJobProjectionHistorySnapshot,
): void {
  requireHistory(
    snapshot.schemaVersion === MARKET_JOB_PROJECTION_HISTORY_SCHEMA_VERSION,
    `Unsupported market job projection history schema: ${snapshot.schemaVersion}`,
  );
  requireHistory(
    Number.isInteger(snapshot.revision) && snapshot.revision >= 1,
    'Market job projection history revision must be a positive integer.',
  );
  requireTimestamp(snapshot.createdAt, 'Market job projection history createdAt');
  requireTimestamp(snapshot.updatedAt, 'Market job projection history updatedAt');

  const projectionIds = snapshot.records.map((item) => item.projection.id);
  const snapshotIds = snapshot.records.map((item) => item.jobSnapshot.id);
  requireHistory(new Set(projectionIds).size === projectionIds.length, 'Projection history contains duplicate projection ids.');
  requireHistory(new Set(snapshotIds).size === snapshotIds.length, 'Projection history contains duplicate JobSnapshot ids.');

  snapshot.records.forEach(({ projection, jobSnapshot }) => {
    try {
      validateMarketJobProjectionIntegrity(projection);
      validateMarketProjectedJobSnapshotIntegrity(jobSnapshot);
    } catch (error) {
      if (error instanceof MarketJobProjectionIntegrityError) {
        throw new MarketJobProjectionHistoryIntegrityError(error.message);
      }
      throw error;
    }
    requireHistory(
      jobSnapshot.marketProvenance!.marketObservationId === projection.marketObservationId,
      'JobSnapshot marketObservationId does not match its projection.',
    );
    requireHistory(
      jobSnapshot.marketProvenance!.derivedMarketInterpretationId === projection.derivedMarketInterpretationId,
      'JobSnapshot interpretation id does not match its projection.',
    );
    requireHistory(
      jobSnapshot.marketProvenance!.marketJobProjectionId === projection.id,
      'JobSnapshot projection id does not match its projection.',
    );
    requireHistory(
      jobSnapshot.marketProvenance!.projectionPolicyVersion === projection.policyVersion,
      'JobSnapshot projection policy does not match its projection.',
    );
    requireHistory(
      jobSnapshot.jobDescription.sourceText === projection.sourceText,
      'JobSnapshot sourceText differs from the authorized projection text.',
    );
  });
}

function earlierTimestamp(first: string, second: string): string {
  return Date.parse(first) <= Date.parse(second) ? first : second;
}

function laterTimestamp(first: string, second: string): string {
  return Date.parse(first) >= Date.parse(second) ? first : second;
}

export interface PersistMarketJobProjectionInput {
  readonly projection: MarketJobProjection;
  readonly jobSnapshot: JobSnapshot;
  readonly repository: MarketJobProjectionHistoryRepository;
}

export interface PersistMarketJobProjectionResult {
  readonly snapshot: MarketJobProjectionHistorySnapshot;
  readonly record: MarketJobProjectionHistoryRecord;
  readonly recordAdded: boolean;
}

export async function persistMarketJobProjection(
  input: PersistMarketJobProjectionInput,
): Promise<PersistMarketJobProjectionResult> {
  validateMarketJobProjectionIntegrity(input.projection);
  validateMarketProjectedJobSnapshotIntegrity(input.jobSnapshot);

  const incoming: MarketJobProjectionHistoryRecord = {
    projection: input.projection,
    jobSnapshot: input.jobSnapshot,
  };
  const existing = await input.repository.load();
  if (existing) validateMarketJobProjectionHistorySnapshot(existing);

  const prior = existing?.records.find((item) => item.projection.id === input.projection.id);
  if (prior) {
    requireHistory(
      prior.projection.contentSha256 === input.projection.contentSha256,
      'MarketJobProjection identity collision changed historical meaning.',
    );
    requireHistory(
      prior.jobSnapshot.id === input.jobSnapshot.id
        && prior.jobSnapshot.contentSha256 === input.jobSnapshot.contentSha256,
      'The same projection produced a different JobSnapshot under the same analyzer version.',
    );
    return { snapshot: existing!, record: prior, recordAdded: false };
  }

  const next: MarketJobProjectionHistorySnapshot = {
    schemaVersion: MARKET_JOB_PROJECTION_HISTORY_SCHEMA_VERSION,
    records: [...(existing?.records ?? []), incoming],
    revision: (existing?.revision ?? 0) + 1,
    createdAt: existing
      ? earlierTimestamp(existing.createdAt, input.projection.projectedAt)
      : input.projection.projectedAt,
    updatedAt: existing
      ? laterTimestamp(existing.updatedAt, input.projection.projectedAt)
      : input.projection.projectedAt,
  };
  validateMarketJobProjectionHistorySnapshot(next);
  await input.repository.save(next);

  const reloaded = await input.repository.load();
  requireHistory(Boolean(reloaded), 'Market job projection history save could not be reloaded for verification.');
  validateMarketJobProjectionHistorySnapshot(reloaded!);
  requireHistory(
    reloaded!.revision === next.revision,
    `Expected market job projection history revision ${next.revision} but reloaded ${reloaded!.revision}.`,
  );
  const persisted = reloaded!.records.find((item) => item.projection.id === input.projection.id);
  requireHistory(Boolean(persisted), 'Reload could not find the persisted market job projection record.');
  requireHistory(
    persisted!.jobSnapshot.id === input.jobSnapshot.id,
    'Reloaded market job projection points to another JobSnapshot.',
  );

  return { snapshot: reloaded!, record: persisted!, recordAdded: true };
}
