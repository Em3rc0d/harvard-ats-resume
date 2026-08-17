import { createHash } from 'node:crypto';
import {
  MARKET_OPPORTUNITY_IDENTITY_POLICY_VERSION,
  MARKET_OPPORTUNITY_LIFECYCLE_POLICY_VERSION,
  MARKET_OPPORTUNITY_LINK_SCHEMA_VERSION,
  domainId,
  type MarketObservation,
  type MarketObservationId,
  type MarketOpportunityId,
  type MarketOpportunityIdentityBasis,
  type MarketOpportunityIdentityEvidence,
  type MarketOpportunityLifecycle,
  type MarketOpportunityLink,
} from '../../domain';
import { stableJson } from '../career-vault/CareerVaultIdentity';
import {
  validateMarketObservationHistorySnapshot,
  type MarketObservationHistorySnapshot,
} from './MarketObservationHistory';
import { validateMarketObservation } from './MarketObservationService';

export const MARKET_OPPORTUNITY_DIRECT_FRESHNESS_HOURS = 72;
const DIRECT_FRESHNESS_MS = MARKET_OPPORTUNITY_DIRECT_FRESHNESS_HOURS * 60 * 60 * 1000;

export class MarketOpportunityIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MarketOpportunityIntegrityError';
  }
}

function requireOpportunity(condition: boolean, message: string): asserts condition {
  if (!condition) throw new MarketOpportunityIntegrityError(message);
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function requireTimestamp(value: string, label: string): void {
  requireOpportunity(Number.isFinite(Date.parse(value)), `${label} must be a valid timestamp.`);
}

function normalizedProvider(value: string): string {
  return value.trim().toUpperCase();
}

function identityFor(observation: MarketObservation): {
  readonly basis: MarketOpportunityIdentityBasis;
  readonly evidence: MarketOpportunityIdentityEvidence;
} {
  const provider = observation.source.provider?.trim();
  const sourceUrl = observation.provenance.sourceUrl?.trim();
  const externalId = observation.provenance.externalId?.trim();

  if (
    observation.source.type === 'PROVIDER_API'
    && provider
    && sourceUrl
    && externalId
  ) {
    return {
      basis: 'PROVIDER_NATIVE',
      evidence: {
        sourceType: observation.source.type,
        provider: normalizedProvider(provider),
        sourceUrl,
        externalId,
      },
    };
  }

  return {
    basis: 'OBSERVATION_BOUND',
    evidence: {
      sourceType: observation.source.type,
      observationId: observation.id,
    },
  };
}

function opportunityIdentitySemantic(
  basis: MarketOpportunityIdentityBasis,
  evidence: MarketOpportunityIdentityEvidence,
) {
  return {
    identityPolicyVersion: MARKET_OPPORTUNITY_IDENTITY_POLICY_VERSION,
    identityBasis: basis,
    identityEvidence: evidence,
  };
}

export function deriveMarketOpportunityId(observation: MarketObservation): MarketOpportunityId {
  validateMarketObservation(observation);
  const identity = identityFor(observation);
  const hash = sha256(stableJson(opportunityIdentitySemantic(identity.basis, identity.evidence)));
  return domainId('MarketOpportunity', `market-opportunity:${hash.slice(0, 32)}`);
}

function linkSemantic(input: {
  readonly marketOpportunityId: MarketOpportunityId;
  readonly observation: MarketObservation;
  readonly basis: MarketOpportunityIdentityBasis;
  readonly evidence: MarketOpportunityIdentityEvidence;
}) {
  return {
    schemaVersion: MARKET_OPPORTUNITY_LINK_SCHEMA_VERSION,
    marketOpportunityId: input.marketOpportunityId,
    marketObservationId: input.observation.id,
    observationContentSha256: input.observation.contentSha256,
    identityPolicyVersion: MARKET_OPPORTUNITY_IDENTITY_POLICY_VERSION,
    identityBasis: input.basis,
    identityEvidence: input.evidence,
    scopeBoundary: 'LOGICAL_OPPORTUNITY_LINK_NOT_JOB_FACT_OR_CANDIDATE_TRUTH' as const,
  };
}

export function createMarketOpportunityLink(observation: MarketObservation): MarketOpportunityLink {
  validateMarketObservation(observation);
  requireTimestamp(observation.observedAt, 'MarketObservation observedAt');
  const identity = identityFor(observation);
  const marketOpportunityId = deriveMarketOpportunityId(observation);
  const semantic = linkSemantic({
    marketOpportunityId,
    observation,
    basis: identity.basis,
    evidence: identity.evidence,
  });
  const contentSha256 = sha256(stableJson(semantic));
  const link: MarketOpportunityLink = {
    ...semantic,
    id: domainId('MarketOpportunityLink', `market-opportunity-link:${contentSha256.slice(0, 32)}`),
    contentSha256,
    linkedAt: observation.observedAt,
  };
  validateMarketOpportunityLink(link, observation);
  return link;
}

export function validateMarketOpportunityLinkIntegrity(link: MarketOpportunityLink): void {
  requireOpportunity(
    link.schemaVersion === MARKET_OPPORTUNITY_LINK_SCHEMA_VERSION,
    `Unsupported MarketOpportunityLink schema: ${link.schemaVersion}`,
  );
  requireOpportunity(
    link.identityPolicyVersion === MARKET_OPPORTUNITY_IDENTITY_POLICY_VERSION,
    `Unsupported MarketOpportunity identity policy: ${link.identityPolicyVersion}`,
  );
  requireTimestamp(link.linkedAt, 'MarketOpportunityLink linkedAt');
  requireOpportunity(
    link.scopeBoundary === 'LOGICAL_OPPORTUNITY_LINK_NOT_JOB_FACT_OR_CANDIDATE_TRUTH',
    'MarketOpportunityLink scope boundary changed.',
  );

  const semantic = {
    schemaVersion: link.schemaVersion,
    marketOpportunityId: link.marketOpportunityId,
    marketObservationId: link.marketObservationId,
    observationContentSha256: link.observationContentSha256,
    identityPolicyVersion: link.identityPolicyVersion,
    identityBasis: link.identityBasis,
    identityEvidence: link.identityEvidence,
    scopeBoundary: link.scopeBoundary,
  };
  const expectedHash = sha256(stableJson(semantic));
  requireOpportunity(link.contentSha256 === expectedHash, `MarketOpportunityLink ${link.id} content hash mismatch.`);
  requireOpportunity(
    link.id === `market-opportunity-link:${expectedHash.slice(0, 32)}`,
    `MarketOpportunityLink ${link.id} identity is not content-addressed.`,
  );
}

export function validateMarketOpportunityLink(
  link: MarketOpportunityLink,
  observation: MarketObservation,
): void {
  validateMarketObservation(observation);
  validateMarketOpportunityLinkIntegrity(link);
  const expected = createMarketOpportunityLinkWithoutValidation(observation);
  requireOpportunity(link.marketObservationId === observation.id, 'MarketOpportunityLink references another MarketObservation.');
  requireOpportunity(link.observationContentSha256 === observation.contentSha256, 'MarketOpportunityLink observation hash mismatch.');
  requireOpportunity(link.marketOpportunityId === expected.marketOpportunityId, 'MarketOpportunityLink logical opportunity identity mismatch.');
  requireOpportunity(link.identityBasis === expected.identityBasis, 'MarketOpportunityLink identity basis mismatch.');
  requireOpportunity(
    stableJson(link.identityEvidence) === stableJson(expected.identityEvidence),
    'MarketOpportunityLink identity evidence is not reproducible from its MarketObservation.',
  );
}

function createMarketOpportunityLinkWithoutValidation(observation: MarketObservation): MarketOpportunityLink {
  const identity = identityFor(observation);
  const identityHash = sha256(stableJson(opportunityIdentitySemantic(identity.basis, identity.evidence)));
  const marketOpportunityId = domainId('MarketOpportunity', `market-opportunity:${identityHash.slice(0, 32)}`);
  const semantic = linkSemantic({
    marketOpportunityId,
    observation,
    basis: identity.basis,
    evidence: identity.evidence,
  });
  const contentSha256 = sha256(stableJson(semantic));
  return {
    ...semantic,
    id: domainId('MarketOpportunityLink', `market-opportunity-link:${contentSha256.slice(0, 32)}`),
    contentSha256,
    linkedAt: observation.observedAt,
  };
}

function strictExpiryMillis(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const check = new Date(Date.UTC(year, month - 1, day));
    if (
      check.getUTCFullYear() !== year
      || check.getUTCMonth() !== month - 1
      || check.getUTCDate() !== day
    ) return undefined;
    return Date.UTC(year, month - 1, day, 23, 59, 59, 999);
  }

  if (!/T/.test(trimmed) || !/(Z|[+-]\d{2}:\d{2})$/.test(trimmed)) return undefined;
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function occurrenceTimestamp(value: string): number {
  const parsed = Date.parse(value);
  requireOpportunity(Number.isFinite(parsed), `Invalid observation occurrence timestamp: ${value}`);
  return parsed;
}

export function deriveMarketOpportunityLifecycle(input: {
  readonly marketOpportunityId: MarketOpportunityId;
  readonly links: readonly MarketOpportunityLink[];
  readonly observationHistory: MarketObservationHistorySnapshot;
  readonly evaluatedAt?: string;
}): MarketOpportunityLifecycle {
  validateMarketObservationHistorySnapshot(input.observationHistory);
  const evaluatedAt = input.evaluatedAt ?? new Date().toISOString();
  requireTimestamp(evaluatedAt, 'MarketOpportunity lifecycle evaluatedAt');

  const links = input.links.filter((item) => item.marketOpportunityId === input.marketOpportunityId);
  requireOpportunity(links.length > 0, `No durable observation link exists for ${input.marketOpportunityId}.`);
  const observationsById = new Map(input.observationHistory.observations.map((item) => [item.id, item]));
  links.forEach((link) => {
    const observation = observationsById.get(link.marketObservationId);
    requireOpportunity(Boolean(observation), `MarketOpportunityLink ${link.id} references an observation absent from durable history.`);
    validateMarketOpportunityLink(link, observation!);
  });

  const linkedObservationIds = new Set<MarketObservationId>(links.map((item) => item.marketObservationId));
  const occurrences = input.observationHistory.occurrences.filter((item) => linkedObservationIds.has(item.marketObservationId));
  requireOpportunity(occurrences.length > 0, `MarketOpportunity ${input.marketOpportunityId} has no durable observation occurrences.`);

  const sortedOccurrences = [...occurrences].sort((left, right) => {
    const byTime = occurrenceTimestamp(left.observedAt) - occurrenceTimestamp(right.observedAt);
    return byTime !== 0 ? byTime : left.id.localeCompare(right.id);
  });
  const first = sortedOccurrences[0];
  const current = sortedOccurrences[sortedOccurrences.length - 1];
  const currentObservation = observationsById.get(current.marketObservationId)!;
  const evaluatedMs = occurrenceTimestamp(evaluatedAt);
  const lastObservedMs = occurrenceTimestamp(current.observedAt);
  requireOpportunity(evaluatedMs >= lastObservedMs, 'Lifecycle cannot be evaluated before the latest durable observation.');
  const ageMs = evaluatedMs - lastObservedMs;
  const ageHours = Math.round((ageMs / (60 * 60 * 1000)) * 100) / 100;

  const expiryMs = strictExpiryMillis(currentObservation.explicitFields.expiresAt?.value);
  let status: MarketOpportunityLifecycle['status'];
  let basis: MarketOpportunityLifecycle['basis'];
  if (expiryMs !== undefined && evaluatedMs > expiryMs) {
    status = 'CLOSED';
    basis = 'SOURCE_EXPLICIT_EXPIRY_PASSED';
  } else {
    const direct = currentObservation.provenance.captureMethod === 'PROVIDER_ADAPTER'
      || currentObservation.provenance.captureMethod === 'PUBLIC_URL_FETCH';
    if (direct && ageMs <= DIRECT_FRESHNESS_MS) {
      status = 'OPEN';
      basis = 'RECENT_DIRECT_SOURCE_OBSERVATION';
    } else if (direct) {
      status = 'STALE';
      basis = 'DIRECT_SOURCE_OBSERVATION_AGED_OUT';
    } else {
      status = 'UNKNOWN';
      basis = 'NON_DIRECT_SOURCE_NOT_CURRENTLY_VERIFIED';
    }
  }

  const firstOccurrenceByObservation = new Map<MarketObservationId, number>();
  sortedOccurrences.forEach((occurrence) => {
    const prior = firstOccurrenceByObservation.get(occurrence.marketObservationId);
    const timestamp = occurrenceTimestamp(occurrence.observedAt);
    if (prior === undefined || timestamp < prior) firstOccurrenceByObservation.set(occurrence.marketObservationId, timestamp);
  });
  const observationIds = [...linkedObservationIds].sort((left, right) => {
    const byFirst = firstOccurrenceByObservation.get(left)! - firstOccurrenceByObservation.get(right)!;
    return byFirst !== 0 ? byFirst : left.localeCompare(right);
  });

  return {
    policyVersion: MARKET_OPPORTUNITY_LIFECYCLE_POLICY_VERSION,
    marketOpportunityId: input.marketOpportunityId,
    currentMarketObservationId: current.marketObservationId,
    observationIds,
    materialStateCount: observationIds.length,
    status,
    basis,
    firstObservedAt: first.observedAt,
    lastObservedAt: current.observedAt,
    evaluatedAt,
    ageHours,
    scopeBoundary: 'DERIVED_MARKET_LIFECYCLE_NOT_SOURCE_FACT_OR_APPLICATION_DECISION',
  };
}
