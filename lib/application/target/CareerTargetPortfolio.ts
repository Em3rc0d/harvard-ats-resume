import type { CandidateProfileId, CareerTarget, CareerTargetId } from '../../domain';

export const CAREER_TARGET_PORTFOLIO_SCHEMA = 'career-target-portfolio-v1' as const;

export interface CareerTargetPortfolio {
  readonly schemaVersion: typeof CAREER_TARGET_PORTFOLIO_SCHEMA;
  readonly candidateProfileId: CandidateProfileId;
  readonly targets: readonly CareerTarget[];
  readonly activeTargetId: CareerTargetId;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CareerTargetRepository {
  load(candidateProfileId: CandidateProfileId): Promise<CareerTargetPortfolio | null>;
  save(portfolio: CareerTargetPortfolio): Promise<void>;
}

function assertPortfolio(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`CareerTarget portfolio integrity: ${message}`);
}

export function validateCareerTargetPortfolio(portfolio: CareerTargetPortfolio): void {
  assertPortfolio(portfolio.schemaVersion === CAREER_TARGET_PORTFOLIO_SCHEMA, 'unsupported schema version.');
  assertPortfolio(Number.isInteger(portfolio.revision) && portfolio.revision >= 1, 'revision must be positive.');
  assertPortfolio(portfolio.targets.length >= 1, 'at least one target is required.');
  assertPortfolio(new Set(portfolio.targets.map((target) => target.id)).size === portfolio.targets.length, 'duplicate target IDs.');
  portfolio.targets.forEach((target) => assertPortfolio(
    target.candidateProfileId === portfolio.candidateProfileId,
    `target ${target.id} belongs to another candidate.`,
  ));
  assertPortfolio(portfolio.targets.some((target) => target.id === portfolio.activeTargetId), 'active target is missing.');
}

/**
 * Stores candidate intent separately from career evidence. A candidate can keep
 * several strategic directions and switch which one is active without rewriting
 * or deleting previous targets.
 */
export async function persistCareerTarget(
  repository: CareerTargetRepository,
  target: CareerTarget,
  capturedAt = new Date().toISOString(),
): Promise<CareerTargetPortfolio> {
  const existing = await repository.load(target.candidateProfileId);
  if (existing) validateCareerTargetPortfolio(existing);

  const priorTarget = existing?.targets.find((item) => item.id === target.id);
  if (priorTarget && priorTarget.contentSha256 !== target.contentSha256) {
    throw new Error(`CareerTarget identity collision changed semantic meaning: ${target.id}`);
  }

  if (existing && priorTarget && existing.activeTargetId === target.id) return existing;

  const next: CareerTargetPortfolio = {
    schemaVersion: CAREER_TARGET_PORTFOLIO_SCHEMA,
    candidateProfileId: target.candidateProfileId,
    targets: priorTarget ? existing!.targets : [...(existing?.targets ?? []), target],
    activeTargetId: target.id,
    revision: (existing?.revision ?? 0) + 1,
    createdAt: existing?.createdAt ?? capturedAt,
    updatedAt: capturedAt,
  };
  validateCareerTargetPortfolio(next);
  await repository.save(next);

  const reloaded = await repository.load(target.candidateProfileId);
  assertPortfolio(Boolean(reloaded), 'saved portfolio could not be reloaded.');
  validateCareerTargetPortfolio(reloaded!);
  assertPortfolio(reloaded!.activeTargetId === target.id, 'reloaded active target differs from committed target.');
  return reloaded!;
}
