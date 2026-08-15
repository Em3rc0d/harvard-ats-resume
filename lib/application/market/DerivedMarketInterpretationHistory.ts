import type { DerivedMarketInterpretation, MarketObservation } from '../../domain';
import {
  validateDerivedMarketInterpretation,
  validateDerivedMarketInterpretationIntegrity,
} from './DerivedMarketInterpretationService';

export const DERIVED_MARKET_INTERPRETATION_HISTORY_SCHEMA_VERSION = 'derived-market-interpretation-history-v1' as const;

export interface DerivedMarketInterpretationHistorySnapshot {
  readonly schemaVersion: typeof DERIVED_MARKET_INTERPRETATION_HISTORY_SCHEMA_VERSION;
  readonly interpretations: readonly DerivedMarketInterpretation[];
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DerivedMarketInterpretationHistoryRepository {
  load(): Promise<DerivedMarketInterpretationHistorySnapshot | null>;
  save(snapshot: DerivedMarketInterpretationHistorySnapshot): Promise<void>;
}

export class DerivedMarketInterpretationHistoryIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DerivedMarketInterpretationHistoryIntegrityError';
  }
}

export class DerivedMarketInterpretationHistoryUnavailableError extends Error {
  constructor(message = 'Durable derived market interpretation history storage is not configured.') {
    super(message);
    this.name = 'DerivedMarketInterpretationHistoryUnavailableError';
  }
}

function requireHistory(condition: boolean, message: string): asserts condition {
  if (!condition) throw new DerivedMarketInterpretationHistoryIntegrityError(message);
}

function requireTimestamp(value: string, label: string): void {
  requireHistory(Number.isFinite(Date.parse(value)), `${label} must be a valid timestamp.`);
}

export function validateDerivedMarketInterpretationHistorySnapshot(
  snapshot: DerivedMarketInterpretationHistorySnapshot,
): void {
  requireHistory(
    snapshot.schemaVersion === DERIVED_MARKET_INTERPRETATION_HISTORY_SCHEMA_VERSION,
    `Unsupported derived market interpretation history schema: ${snapshot.schemaVersion}`,
  );
  requireHistory(
    Number.isInteger(snapshot.revision) && snapshot.revision >= 1,
    'Derived market interpretation history revision must be a positive integer.',
  );
  requireTimestamp(snapshot.createdAt, 'Derived market interpretation history createdAt');
  requireTimestamp(snapshot.updatedAt, 'Derived market interpretation history updatedAt');

  const ids = snapshot.interpretations.map((item) => item.id);
  requireHistory(new Set(ids).size === ids.length, 'Derived market interpretation history contains duplicate identifiers.');

  const semanticKeys = snapshot.interpretations.map(
    (item) => `${item.marketObservationId}:${item.policyVersion}`,
  );
  requireHistory(
    new Set(semanticKeys).size === semanticKeys.length,
    'One MarketObservation + interpretation policy may have only one deterministic interpretation.',
  );

  snapshot.interpretations.forEach(validateDerivedMarketInterpretationIntegrity);
}

function earlierTimestamp(first: string, second: string): string {
  return Date.parse(first) <= Date.parse(second) ? first : second;
}

function laterTimestamp(first: string, second: string): string {
  return Date.parse(first) >= Date.parse(second) ? first : second;
}

export interface PersistDerivedMarketInterpretationInput {
  readonly observation: MarketObservation;
  readonly interpretation: DerivedMarketInterpretation;
  readonly repository: DerivedMarketInterpretationHistoryRepository;
}

export interface PersistDerivedMarketInterpretationResult {
  readonly snapshot: DerivedMarketInterpretationHistorySnapshot;
  readonly interpretation: DerivedMarketInterpretation;
  readonly interpretationAdded: boolean;
}

/**
 * Durable M4B-04 history boundary. Interpretation identity is semantic, so
 * regenerating the same observation under the same policy is idempotent.
 * Changing the source observation or policy preserves the prior interpretation.
 */
export async function persistDerivedMarketInterpretation(
  input: PersistDerivedMarketInterpretationInput,
): Promise<PersistDerivedMarketInterpretationResult> {
  validateDerivedMarketInterpretation(input.interpretation, input.observation);

  const existing = await input.repository.load();
  if (existing) validateDerivedMarketInterpretationHistorySnapshot(existing);

  const semanticKey = `${input.interpretation.marketObservationId}:${input.interpretation.policyVersion}`;
  const priorForSemanticKey = existing?.interpretations.find(
    (item) => `${item.marketObservationId}:${item.policyVersion}` === semanticKey,
  );

  if (priorForSemanticKey) {
    requireHistory(
      priorForSemanticKey.id === input.interpretation.id,
      'Deterministic interpretation collision: same observation + policy produced a different identity.',
    );
    requireHistory(
      priorForSemanticKey.contentSha256 === input.interpretation.contentSha256,
      'Derived interpretation identity collision changed historical meaning.',
    );
    return {
      snapshot: existing!,
      interpretation: priorForSemanticKey,
      interpretationAdded: false,
    };
  }

  const next: DerivedMarketInterpretationHistorySnapshot = {
    schemaVersion: DERIVED_MARKET_INTERPRETATION_HISTORY_SCHEMA_VERSION,
    interpretations: [...(existing?.interpretations ?? []), input.interpretation],
    revision: (existing?.revision ?? 0) + 1,
    createdAt: existing
      ? earlierTimestamp(existing.createdAt, input.interpretation.generatedAt)
      : input.interpretation.generatedAt,
    updatedAt: existing
      ? laterTimestamp(existing.updatedAt, input.interpretation.generatedAt)
      : input.interpretation.generatedAt,
  };
  validateDerivedMarketInterpretationHistorySnapshot(next);
  await input.repository.save(next);

  const reloaded = await input.repository.load();
  requireHistory(Boolean(reloaded), 'Derived market interpretation history save could not be reloaded for verification.');
  validateDerivedMarketInterpretationHistorySnapshot(reloaded!);
  requireHistory(
    reloaded!.revision === next.revision,
    `Expected interpretation history revision ${next.revision} but reloaded ${reloaded!.revision}.`,
  );
  const persisted = reloaded!.interpretations.find((item) => item.id === input.interpretation.id);
  requireHistory(Boolean(persisted), 'Reload could not find the persisted derived market interpretation.');
  requireHistory(
    persisted!.contentSha256 === input.interpretation.contentSha256,
    'Reloaded derived market interpretation content hash changed.',
  );

  return {
    snapshot: reloaded!,
    interpretation: persisted!,
    interpretationAdded: true,
  };
}
