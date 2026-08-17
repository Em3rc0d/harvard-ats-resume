import type { MarketOpportunityLink } from '../../domain';
import { validateMarketOpportunityLinkIntegrity } from './MarketOpportunityIdentityLifecycleService';

export const MARKET_OPPORTUNITY_INDEX_SCHEMA_VERSION = 'market-opportunity-index-v1' as const;

export interface MarketOpportunityIndexSnapshot {
  readonly schemaVersion: typeof MARKET_OPPORTUNITY_INDEX_SCHEMA_VERSION;
  readonly links: readonly MarketOpportunityLink[];
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MarketOpportunityIndexRepository {
  load(): Promise<MarketOpportunityIndexSnapshot | null>;
  save(snapshot: MarketOpportunityIndexSnapshot): Promise<void>;
}

export class MarketOpportunityIndexIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MarketOpportunityIndexIntegrityError';
  }
}

export class MarketOpportunityIndexUnavailableError extends Error {
  constructor(message = 'Durable market opportunity index storage is not configured.') {
    super(message);
    this.name = 'MarketOpportunityIndexUnavailableError';
  }
}

function requireIndex(condition: boolean, message: string): asserts condition {
  if (!condition) throw new MarketOpportunityIndexIntegrityError(message);
}

function requireTimestamp(value: string, label: string): void {
  requireIndex(Number.isFinite(Date.parse(value)), `${label} must be a valid timestamp.`);
}

export function validateMarketOpportunityIndexSnapshot(snapshot: MarketOpportunityIndexSnapshot): void {
  requireIndex(
    snapshot.schemaVersion === MARKET_OPPORTUNITY_INDEX_SCHEMA_VERSION,
    `Unsupported market opportunity index schema: ${snapshot.schemaVersion}`,
  );
  requireIndex(Number.isInteger(snapshot.revision) && snapshot.revision >= 1, 'Market opportunity index revision must be positive.');
  requireTimestamp(snapshot.createdAt, 'Market opportunity index createdAt');
  requireTimestamp(snapshot.updatedAt, 'Market opportunity index updatedAt');
  const linkIds = snapshot.links.map((item) => item.id);
  const observationIds = snapshot.links.map((item) => item.marketObservationId);
  requireIndex(new Set(linkIds).size === linkIds.length, 'Market opportunity index contains duplicate link identifiers.');
  requireIndex(
    new Set(observationIds).size === observationIds.length,
    'One MarketObservation cannot be linked to more than one logical market opportunity.',
  );
  snapshot.links.forEach(validateMarketOpportunityLinkIntegrity);
}

function earlierTimestamp(first: string, second: string): string {
  return Date.parse(first) <= Date.parse(second) ? first : second;
}

function laterTimestamp(first: string, second: string): string {
  return Date.parse(first) >= Date.parse(second) ? first : second;
}

export async function persistMarketOpportunityLink(input: {
  readonly link: MarketOpportunityLink;
  readonly repository: MarketOpportunityIndexRepository;
}): Promise<{ readonly snapshot: MarketOpportunityIndexSnapshot; readonly linkAdded: boolean }> {
  validateMarketOpportunityLinkIntegrity(input.link);
  const existing = await input.repository.load();
  if (existing) validateMarketOpportunityIndexSnapshot(existing);

  const priorByObservation = existing?.links.find((item) => item.marketObservationId === input.link.marketObservationId);
  if (priorByObservation) {
    requireIndex(
      priorByObservation.id === input.link.id
        && priorByObservation.marketOpportunityId === input.link.marketOpportunityId
        && priorByObservation.contentSha256 === input.link.contentSha256,
      `MarketObservation ${input.link.marketObservationId} is already linked with different logical meaning.`,
    );
    return { snapshot: existing!, linkAdded: false };
  }

  const next: MarketOpportunityIndexSnapshot = {
    schemaVersion: MARKET_OPPORTUNITY_INDEX_SCHEMA_VERSION,
    links: [...(existing?.links ?? []), input.link],
    revision: (existing?.revision ?? 0) + 1,
    createdAt: existing
      ? earlierTimestamp(existing.createdAt, input.link.linkedAt)
      : input.link.linkedAt,
    updatedAt: existing
      ? laterTimestamp(existing.updatedAt, input.link.linkedAt)
      : input.link.linkedAt,
  };
  validateMarketOpportunityIndexSnapshot(next);
  await input.repository.save(next);

  const reloaded = await input.repository.load();
  requireIndex(Boolean(reloaded), 'Market opportunity index save could not be reloaded for verification.');
  validateMarketOpportunityIndexSnapshot(reloaded!);
  requireIndex(reloaded!.revision === next.revision, `Expected market opportunity index revision ${next.revision} but reloaded ${reloaded!.revision}.`);
  requireIndex(
    reloaded!.links.some((item) => item.id === input.link.id),
    'Reloaded market opportunity index does not contain the persisted link.',
  );
  return { snapshot: reloaded!, linkAdded: true };
}
