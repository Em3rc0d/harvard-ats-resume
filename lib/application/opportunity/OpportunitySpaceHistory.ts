import type { CandidateProfileId, OpportunitySpace } from '../../domain';
import { validateOpportunitySpace } from './OpportunitySpaceService';

export const OPPORTUNITY_SPACE_HISTORY_SCHEMA_VERSION = 'opportunity-space-history-v1' as const;

export interface OpportunitySpaceHistory {
  readonly schemaVersion: typeof OPPORTUNITY_SPACE_HISTORY_SCHEMA_VERSION;
  readonly candidateProfileId: CandidateProfileId;
  readonly spaces: readonly OpportunitySpace[];
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface OpportunitySpaceRepository {
  load(candidateProfileId: CandidateProfileId): Promise<OpportunitySpaceHistory | null>;
  save(history: OpportunitySpaceHistory): Promise<void>;
}

function assertHistory(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`OpportunitySpace history integrity: ${message}`);
}

export function validateOpportunitySpaceHistory(history: OpportunitySpaceHistory): void {
  assertHistory(history.schemaVersion === OPPORTUNITY_SPACE_HISTORY_SCHEMA_VERSION, 'unsupported schema version.');
  assertHistory(Number.isInteger(history.revision) && history.revision >= 1, 'revision must be positive.');
  assertHistory(new Set(history.spaces.map((space) => space.id)).size === history.spaces.length, 'duplicate OpportunitySpace IDs.');
  history.spaces.forEach((space) => {
    assertHistory(space.candidateProfileId === history.candidateProfileId, `space ${space.id} belongs to another candidate.`);
    validateOpportunitySpace(space);
  });
}

/**
 * Persists immutable OpportunitySpace snapshots. Repeating the same semantic
 * space is idempotent. A changed CareerSnapshot, CareerTarget, job set or
 * priority semantics creates a new content-addressed space and keeps history.
 */
export async function persistOpportunitySpace(
  repository: OpportunitySpaceRepository,
  space: OpportunitySpace,
  capturedAt = new Date().toISOString(),
): Promise<OpportunitySpaceHistory> {
  validateOpportunitySpace(space);
  const existing = await repository.load(space.candidateProfileId);
  if (existing) validateOpportunitySpaceHistory(existing);

  const prior = existing?.spaces.find((item) => item.id === space.id);
  if (prior) {
    assertHistory(prior.contentSha256 === space.contentSha256, `identity collision changed semantic meaning: ${space.id}`);
    return existing!;
  }

  const next: OpportunitySpaceHistory = {
    schemaVersion: OPPORTUNITY_SPACE_HISTORY_SCHEMA_VERSION,
    candidateProfileId: space.candidateProfileId,
    spaces: [...(existing?.spaces ?? []), space],
    revision: (existing?.revision ?? 0) + 1,
    createdAt: existing?.createdAt ?? capturedAt,
    updatedAt: capturedAt,
  };
  validateOpportunitySpaceHistory(next);
  await repository.save(next);

  const reloaded = await repository.load(space.candidateProfileId);
  assertHistory(Boolean(reloaded), 'saved history could not be reloaded.');
  validateOpportunitySpaceHistory(reloaded!);
  assertHistory(reloaded!.spaces.some((item) => item.id === space.id), 'saved OpportunitySpace was not durably committed.');
  return reloaded!;
}
