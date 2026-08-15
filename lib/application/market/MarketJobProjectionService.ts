import { createHash } from 'node:crypto';
import {
  MARKET_JOB_PROJECTION_POLICY_VERSION,
  MARKET_JOB_PROJECTION_SCHEMA_VERSION,
  domainId,
  type DerivedMarketInterpretation,
  type JobSnapshot,
  type MarketJobProjection,
  type MarketObservation,
} from '../../domain';
import {
  JOB_INTELLIGENCE_PERSISTENCE_VERSION,
  stableJson,
} from '../career-vault/CareerVaultIdentity';
import {
  analyzeJobDescription,
  type JobIntelligenceResult,
} from '../job/JobIntelligenceEngine';
import { validateDerivedMarketInterpretation } from './DerivedMarketInterpretationService';
import { validateMarketObservation } from './MarketObservationService';

const TEMPORAL_KEYS = new Set(['capturedAt', 'generatedAt', 'observedAt', 'projectedAt', 'updatedAt', 'createdAt']);

export class MarketJobProjectionIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MarketJobProjectionIntegrityError';
  }
}

export class MarketJobProjectionUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MarketJobProjectionUnavailableError';
  }
}

function requireProjection(condition: boolean, message: string): asserts condition {
  if (!condition) throw new MarketJobProjectionIntegrityError(message);
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((result, key) => {
      const item = (value as Record<string, unknown>)[key];
      if (item !== undefined) result[key] = stableValue(item);
      return result;
    }, {});
}

function semanticValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(semanticValue);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value as Record<string, unknown>)
    .filter((key) => !TEMPORAL_KEYS.has(key))
    .sort()
    .reduce<Record<string, unknown>>((result, key) => {
      const item = (value as Record<string, unknown>)[key];
      if (item !== undefined) result[key] = semanticValue(item);
      return result;
    }, {});
}

function authorizedSourceText(
  observation: MarketObservation,
  interpretation: DerivedMarketInterpretation,
): Pick<MarketJobProjection, 'sourceText' | 'sourceTextOrigin'> {
  if (observation.payload.format === 'TEXT') {
    return {
      sourceText: observation.payload.content,
      sourceTextOrigin: 'RAW_TEXT_PAYLOAD',
    };
  }

  const description = interpretation.fields.description;
  if (description.status !== 'KNOWN') {
    throw new MarketJobProjectionUnavailableError(
      `MarketObservation ${observation.id} has JSON source material but no source-explicit description authorized for Job Intelligence.`,
    );
  }
  requireProjection(
    description.evidence.sourceField === 'description',
    'KNOWN description evidence must point to the description source field.',
  );

  return {
    sourceText: description.evidence.sourceValue,
    sourceTextOrigin: 'EXPLICIT_DESCRIPTION_FIELD',
  };
}

function optionalKnownValue(field: DerivedMarketInterpretation['fields']['roleTitle']): string | undefined {
  return field.status === 'KNOWN' ? field.value : undefined;
}

function projectionSemantic(input: {
  observation: MarketObservation;
  interpretation: DerivedMarketInterpretation;
  sourceText: string;
  sourceTextOrigin: MarketJobProjection['sourceTextOrigin'];
}) {
  return {
    schemaVersion: MARKET_JOB_PROJECTION_SCHEMA_VERSION,
    marketObservationId: input.observation.id,
    derivedMarketInterpretationId: input.interpretation.id,
    observationContentSha256: input.observation.contentSha256,
    interpretationContentSha256: input.interpretation.contentSha256,
    policyVersion: MARKET_JOB_PROJECTION_POLICY_VERSION,
    sourceText: input.sourceText,
    sourceTextOrigin: input.sourceTextOrigin,
    sourceTextSha256: sha256(input.sourceText),
    roleTitle: optionalKnownValue(input.interpretation.fields.roleTitle),
    companyName: optionalKnownValue(input.interpretation.fields.companyName),
    scopeBoundary: 'MARKET_TO_JOB_INTELLIGENCE_INPUT_NOT_JOB_REQUIREMENT_OR_CANDIDATE_TRUTH' as const,
  };
}

export function createMarketJobProjection(
  observation: MarketObservation,
  interpretation: DerivedMarketInterpretation,
  options: { projectedAt?: string } = {},
): MarketJobProjection {
  validateMarketObservation(observation);
  validateDerivedMarketInterpretation(interpretation, observation);
  const authorized = authorizedSourceText(observation, interpretation);
  requireProjection(Boolean(authorized.sourceText.trim()), 'authorized Job Intelligence source text cannot be blank.');

  const semantic = projectionSemantic({ observation, interpretation, ...authorized });
  const contentSha256 = sha256(JSON.stringify(stableValue(semantic)));
  const projectedAt = options.projectedAt ?? new Date().toISOString();
  requireProjection(Number.isFinite(Date.parse(projectedAt)), 'projectedAt must be a valid timestamp.');

  const projection: MarketJobProjection = {
    ...semantic,
    id: domainId('MarketJobProjection', `market-job-projection:${contentSha256.slice(0, 32)}`),
    contentSha256,
    projectedAt,
  };
  validateMarketJobProjection(projection, observation, interpretation);
  return projection;
}

/** Intrinsic validation accepts historical policy versions. */
export function validateMarketJobProjectionIntegrity(projection: MarketJobProjection): void {
  requireProjection(
    projection.schemaVersion === MARKET_JOB_PROJECTION_SCHEMA_VERSION,
    `unsupported schema version: ${projection.schemaVersion}`,
  );
  requireProjection(Boolean(projection.policyVersion.trim()), 'projection policyVersion cannot be blank.');
  requireProjection(Boolean(projection.sourceText.trim()), 'sourceText cannot be blank.');
  requireProjection(
    projection.sourceTextOrigin === 'RAW_TEXT_PAYLOAD'
      || projection.sourceTextOrigin === 'EXPLICIT_DESCRIPTION_FIELD',
    'unsupported sourceTextOrigin.',
  );
  requireProjection(
    projection.sourceTextSha256 === sha256(projection.sourceText),
    'sourceTextSha256 does not match sourceText.',
  );
  requireProjection(Number.isFinite(Date.parse(projection.projectedAt)), 'projectedAt must be a valid timestamp.');
  requireProjection(
    projection.scopeBoundary === 'MARKET_TO_JOB_INTELLIGENCE_INPUT_NOT_JOB_REQUIREMENT_OR_CANDIDATE_TRUTH',
    'scope boundary changed.',
  );

  const semantic = {
    schemaVersion: projection.schemaVersion,
    marketObservationId: projection.marketObservationId,
    derivedMarketInterpretationId: projection.derivedMarketInterpretationId,
    observationContentSha256: projection.observationContentSha256,
    interpretationContentSha256: projection.interpretationContentSha256,
    policyVersion: projection.policyVersion,
    sourceText: projection.sourceText,
    sourceTextOrigin: projection.sourceTextOrigin,
    sourceTextSha256: projection.sourceTextSha256,
    roleTitle: projection.roleTitle,
    companyName: projection.companyName,
    scopeBoundary: projection.scopeBoundary,
  };
  const expectedHash = sha256(JSON.stringify(stableValue(semantic)));
  requireProjection(projection.contentSha256 === expectedHash, 'content hash mismatch.');
  requireProjection(
    projection.id === `market-job-projection:${expectedHash.slice(0, 32)}`,
    'identity is not content-addressed.',
  );
}

/** Full validation pins new/current projection semantics to the active policy. */
export function validateMarketJobProjection(
  projection: MarketJobProjection,
  observation: MarketObservation,
  interpretation: DerivedMarketInterpretation,
): void {
  validateMarketObservation(observation);
  validateDerivedMarketInterpretation(interpretation, observation);
  validateMarketJobProjectionIntegrity(projection);
  requireProjection(
    projection.policyVersion === MARKET_JOB_PROJECTION_POLICY_VERSION,
    `unsupported current projection policy: ${projection.policyVersion}`,
  );
  requireProjection(projection.marketObservationId === observation.id, 'projection points to another MarketObservation.');
  requireProjection(
    projection.derivedMarketInterpretationId === interpretation.id,
    'projection points to another DerivedMarketInterpretation.',
  );
  requireProjection(
    projection.observationContentSha256 === observation.contentSha256,
    'projection observation hash does not match authoritative market state.',
  );
  requireProjection(
    projection.interpretationContentSha256 === interpretation.contentSha256,
    'projection interpretation hash does not match authoritative interpretation.',
  );

  const authorized = authorizedSourceText(observation, interpretation);
  const expected = projectionSemantic({ observation, interpretation, ...authorized });
  const actual = {
    schemaVersion: projection.schemaVersion,
    marketObservationId: projection.marketObservationId,
    derivedMarketInterpretationId: projection.derivedMarketInterpretationId,
    observationContentSha256: projection.observationContentSha256,
    interpretationContentSha256: projection.interpretationContentSha256,
    policyVersion: projection.policyVersion,
    sourceText: projection.sourceText,
    sourceTextOrigin: projection.sourceTextOrigin,
    sourceTextSha256: projection.sourceTextSha256,
    roleTitle: projection.roleTitle,
    companyName: projection.companyName,
    scopeBoundary: projection.scopeBoundary,
  };
  requireProjection(
    JSON.stringify(stableValue(actual)) === JSON.stringify(stableValue(expected)),
    'projection does not match the deterministic authorization policy.',
  );
}

function jobSnapshotSemantic(input: {
  jobIntelligence: JobIntelligenceResult;
  projection: MarketJobProjection;
}) {
  return {
    jobDescription: semanticValue(input.jobIntelligence.jobDescription),
    requirements: semanticValue(input.jobIntelligence.requirements),
    language: input.jobIntelligence.language,
    analyzerVersion: JOB_INTELLIGENCE_PERSISTENCE_VERSION,
    marketProvenance: {
      marketObservationId: input.projection.marketObservationId,
      derivedMarketInterpretationId: input.projection.derivedMarketInterpretationId,
      marketJobProjectionId: input.projection.id,
      projectionPolicyVersion: input.projection.policyVersion,
      scopeBoundary: 'JOB_SNAPSHOT_MARKET_PROVENANCE_NOT_CANDIDATE_TRUTH' as const,
    },
  };
}

/** Intrinsic validation accepts historical analyzer versions. */
export function validateMarketProjectedJobSnapshotIntegrity(snapshot: JobSnapshot): void {
  requireProjection(Boolean(snapshot.marketProvenance), 'market-projected JobSnapshot requires market provenance.');
  requireProjection(
    snapshot.marketProvenance!.scopeBoundary === 'JOB_SNAPSHOT_MARKET_PROVENANCE_NOT_CANDIDATE_TRUTH',
    'JobSnapshot market provenance boundary changed.',
  );
  requireProjection(Boolean(snapshot.analyzerVersion.trim()), 'JobSnapshot analyzerVersion cannot be blank.');
  requireProjection(Boolean(snapshot.marketProvenance!.projectionPolicyVersion.trim()), 'projectionPolicyVersion cannot be blank.');
  requireProjection(Boolean(snapshot.jobDescription.sourceText.trim()), 'JobSnapshot sourceText cannot be blank.');
  requireProjection(Number.isFinite(Date.parse(snapshot.capturedAt)), 'JobSnapshot capturedAt must be valid.');

  const requirementIds = snapshot.requirements.map((item) => item.id);
  requireProjection(new Set(requirementIds).size === requirementIds.length, 'JobSnapshot contains duplicate requirement ids.');
  snapshot.requirements.forEach((requirement) => requireProjection(
    requirement.jobDescriptionId === snapshot.jobDescription.id,
    `JobRequirement ${requirement.id} references another JobDescription.`,
  ));

  const semantic = {
    jobDescription: semanticValue(snapshot.jobDescription),
    requirements: semanticValue(snapshot.requirements),
    language: snapshot.language,
    analyzerVersion: snapshot.analyzerVersion,
    marketProvenance: snapshot.marketProvenance,
  };
  const expectedHash = sha256(stableJson(semantic));
  requireProjection(snapshot.contentSha256 === expectedHash, 'JobSnapshot content hash mismatch.');
  requireProjection(
    snapshot.id === `job-snapshot:${expectedHash.slice(0, 32)}`,
    'JobSnapshot identity is not content-addressed.',
  );
}

export interface MarketJobProjectionResult {
  readonly projection: MarketJobProjection;
  readonly jobIntelligence: JobIntelligenceResult;
  readonly jobSnapshot: JobSnapshot;
  readonly scopeBoundary: 'JOB_INTELLIGENCE_OUTPUT_FROM_AUTHORIZED_MARKET_TEXT_NOT_CANDIDATE_TRUTH';
}

/**
 * The only M4B-05 bridge into the existing Job Intelligence engine.
 * Structured market metadata is never concatenated into sourceText, preventing
 * work model, seniority, title, or compensation from becoming requirements by
 * construction.
 */
export function projectMarketToJobIntelligence(
  observation: MarketObservation,
  interpretation: DerivedMarketInterpretation,
  options: { projectedAt?: string } = {},
): MarketJobProjectionResult {
  const projection = createMarketJobProjection(observation, interpretation, options);
  const analyzed = analyzeJobDescription(projection.sourceText, {
    projectionKey: projection.id,
    capturedAt: projection.projectedAt,
  });
  const jobIntelligence: JobIntelligenceResult = {
    ...analyzed,
    jobDescription: {
      ...analyzed.jobDescription,
      title: projection.roleTitle,
      company: projection.companyName,
    },
  };
  const semantic = jobSnapshotSemantic({ jobIntelligence, projection });
  const contentSha256 = sha256(stableJson(semantic));
  const jobSnapshot: JobSnapshot = {
    id: domainId('JobSnapshot', `job-snapshot:${contentSha256.slice(0, 32)}`),
    jobDescription: jobIntelligence.jobDescription,
    requirements: [...jobIntelligence.requirements],
    language: jobIntelligence.language,
    analyzerVersion: JOB_INTELLIGENCE_PERSISTENCE_VERSION,
    marketProvenance: semantic.marketProvenance,
    contentSha256,
    capturedAt: projection.projectedAt,
  };
  validateMarketProjectedJobSnapshotIntegrity(jobSnapshot);
  requireProjection(
    jobSnapshot.jobDescription.sourceText === projection.sourceText,
    'Job Intelligence changed the authorized sourceText.',
  );

  return {
    projection,
    jobIntelligence,
    jobSnapshot,
    scopeBoundary: 'JOB_INTELLIGENCE_OUTPUT_FROM_AUTHORIZED_MARKET_TEXT_NOT_CANDIDATE_TRUTH',
  };
}
