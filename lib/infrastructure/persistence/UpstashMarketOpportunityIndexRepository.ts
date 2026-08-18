import { Redis } from '@upstash/redis';
import {
  MarketOpportunityIndexUnavailableError,
  validateMarketOpportunityIndexSnapshot,
  type MarketOpportunityIndexRepository,
  type MarketOpportunityIndexSnapshot,
} from '../../application/market/MarketOpportunityIndexHistory';
import { validateMarketOpportunityLinkIntegrity } from '../../application/market/MarketOpportunityIdentityLifecycleService';
import type { MarketOpportunityLink } from '../../domain';
import {
  UpstashPartitionedMarketPersistenceBackend,
  immutablePartitionRecord,
  mergeImmutableRecordsById,
  readPartitionedMarketCollection,
  type PartitionedMarketPersistenceBackend,
} from './PartitionedMarketPersistence';

const LEGACY_KEY = 'ats2:market-opportunity-index:v1';
const NAMESPACE = 'ats2:market-opportunity-index:v2';
const MIGRATION_MARKER = `${NAMESPACE}:migration-complete`;
const LINK_KIND = 'link';

function semanticKey(link: MarketOpportunityLink): string {
  return link.marketObservationId;
}

function compareLinks(first: MarketOpportunityLink, second: MarketOpportunityLink): number {
  const byTime = Date.parse(first.linkedAt) - Date.parse(second.linkedAt);
  return byTime !== 0 ? byTime : semanticKey(first).localeCompare(semanticKey(second));
}

export class PartitionedMarketOpportunityIndexRepository implements MarketOpportunityIndexRepository {
  constructor(private readonly backend: PartitionedMarketPersistenceBackend) {}

  private async commitLink(link: MarketOpportunityLink): Promise<void> {
    validateMarketOpportunityLinkIntegrity(link);
    const key = semanticKey(link);
    await this.backend.commitImmutableRecords([
      immutablePartitionRecord({
        namespace: NAMESPACE,
        kind: LINK_KIND,
        id: key,
        record: link,
      }),
    ]);
  }

  private async ensureLegacyMigrated(): Promise<void> {
    if (await this.backend.get<string>(MIGRATION_MARKER)) return;
    const legacy = await this.backend.get<MarketOpportunityIndexSnapshot>(LEGACY_KEY);
    if (legacy) {
      validateMarketOpportunityIndexSnapshot(legacy);
      await Promise.all(legacy.links.map((link) => this.commitLink(link)));
    }
    await this.backend.set(MIGRATION_MARKER, 'complete');
  }

  async load(): Promise<MarketOpportunityIndexSnapshot | null> {
    const [partitioned, legacy] = await Promise.all([
      readPartitionedMarketCollection<MarketOpportunityLink>({
        backend: this.backend,
        namespace: NAMESPACE,
        kind: LINK_KIND,
      }),
      this.backend.get<MarketOpportunityIndexSnapshot>(LEGACY_KEY),
    ]);
    if (legacy) validateMarketOpportunityIndexSnapshot(legacy);

    const links = [...mergeImmutableRecordsById(
      legacy?.links ?? [],
      partitioned,
      semanticKey,
    )].sort(compareLinks);
    if (links.length === 0) return null;

    const snapshot: MarketOpportunityIndexSnapshot = {
      schemaVersion: 'market-opportunity-index-v1',
      links,
      revision: links.length,
      createdAt: links[0].linkedAt,
      updatedAt: links[links.length - 1].linkedAt,
    };
    validateMarketOpportunityIndexSnapshot(snapshot);
    return snapshot;
  }

  async append(link: MarketOpportunityLink): Promise<void> {
    await this.ensureLegacyMigrated();
    await this.commitLink(link);
  }

  async save(snapshot: MarketOpportunityIndexSnapshot): Promise<void> {
    validateMarketOpportunityIndexSnapshot(snapshot);
    await this.ensureLegacyMigrated();
    await Promise.all(snapshot.links.map((link) => this.commitLink(link)));
  }
}

export class UpstashMarketOpportunityIndexRepository
extends PartitionedMarketOpportunityIndexRepository {
  constructor(redis: Redis) {
    super(new UpstashPartitionedMarketPersistenceBackend(redis));
  }
}

export interface MarketOpportunityIndexEnvironment {
  readonly UPSTASH_REDIS_REST_URL?: string;
  readonly UPSTASH_REDIS_REST_TOKEN?: string;
}

function processEnvironment(): MarketOpportunityIndexEnvironment {
  return {
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  };
}

export function createMarketOpportunityIndexRepositoryFromEnv(
  env: MarketOpportunityIndexEnvironment = processEnvironment(),
): MarketOpportunityIndexRepository {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new MarketOpportunityIndexUnavailableError(
      'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required for durable market opportunity identity.',
    );
  }
  return new UpstashMarketOpportunityIndexRepository(new Redis({ url, token }));
}
