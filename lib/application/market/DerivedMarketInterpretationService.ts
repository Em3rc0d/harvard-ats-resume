import { createHash } from 'node:crypto';
import {
  DERIVED_MARKET_INTERPRETATION_SCHEMA_VERSION,
  MARKET_INTERPRETATION_POLICY_VERSION,
  domainId,
  type CanonicalEmploymentType,
  type CanonicalSeniority,
  type CanonicalWorkModel,
  type DerivedMarketEvidence,
  type DerivedMarketField,
  type DerivedMarketInterpretation,
  type DerivedMarketInterpretationFields,
  type DerivedMarketSourceField,
  type MarketObservation,
  type ObservedMarketField,
} from '../../domain';
import { validateMarketObservation } from './MarketObservationService';

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

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function requireInterpretation(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`DerivedMarketInterpretation integrity: ${message}`);
}

function normalizeText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeToken(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function observedField(
  observation: MarketObservation,
  sourceField: DerivedMarketSourceField,
): ObservedMarketField | undefined {
  return observation.explicitFields[sourceField];
}

function evidenceFor(
  observation: MarketObservation,
  sourceField: DerivedMarketSourceField,
  field: ObservedMarketField,
): DerivedMarketEvidence {
  return {
    marketObservationId: observation.id,
    sourceField,
    sourceValue: field.value,
    sourcePath: field.evidence.sourcePath,
    sourceExcerpt: field.evidence.sourceExcerpt,
  };
}

function silentUnknown(): DerivedMarketField {
  return { status: 'UNKNOWN', reason: 'SOURCE_SILENT' };
}

function normalizedExplicit(
  observation: MarketObservation,
  sourceField: DerivedMarketSourceField,
): DerivedMarketField {
  const field = observedField(observation, sourceField);
  if (!field) return silentUnknown();

  const value = normalizeText(field.value);
  if (!value) {
    return {
      status: 'UNKNOWN',
      reason: 'INVALID_SOURCE_VALUE',
      evidence: evidenceFor(observation, sourceField, field),
    };
  }

  return {
    status: 'KNOWN',
    value,
    derivation: 'NORMALIZED_EXPLICIT',
    evidence: evidenceFor(observation, sourceField, field),
  };
}

function controlledClassification<TValue extends string>(
  observation: MarketObservation,
  sourceField: DerivedMarketSourceField,
  values: Readonly<Record<string, TValue>>,
): DerivedMarketField<TValue> {
  const field = observedField(observation, sourceField);
  if (!field) return { status: 'UNKNOWN', reason: 'SOURCE_SILENT' };

  const canonical = values[normalizeToken(field.value)];
  if (!canonical) {
    return {
      status: 'UNKNOWN',
      reason: 'UNRECOGNIZED_SOURCE_VALUE',
      evidence: evidenceFor(observation, sourceField, field),
    };
  }

  return {
    status: 'KNOWN',
    value: canonical,
    derivation: 'CONTROLLED_CLASSIFICATION',
    evidence: evidenceFor(observation, sourceField, field),
  };
}

const WORK_MODEL_VALUES: Readonly<Record<string, CanonicalWorkModel>> = {
  remote: 'REMOTE',
  remoto: 'REMOTE',
  'fully remote': 'REMOTE',
  '100% remote': 'REMOTE',
  '100% remoto': 'REMOTE',
  hybrid: 'HYBRID',
  hibrido: 'HYBRID',
  onsite: 'ONSITE',
  'on site': 'ONSITE',
  presencial: 'ONSITE',
};

const EMPLOYMENT_TYPE_VALUES: Readonly<Record<string, CanonicalEmploymentType>> = {
  'full time': 'FULL_TIME',
  fulltime: 'FULL_TIME',
  'tiempo completo': 'FULL_TIME',
  'part time': 'PART_TIME',
  parttime: 'PART_TIME',
  'medio tiempo': 'PART_TIME',
  contract: 'CONTRACT',
  contractor: 'CONTRACT',
  contrato: 'CONTRACT',
  temporary: 'TEMPORARY',
  temp: 'TEMPORARY',
  temporal: 'TEMPORARY',
  internship: 'INTERNSHIP',
  intern: 'INTERNSHIP',
  practicas: 'INTERNSHIP',
  practicante: 'INTERNSHIP',
};

const SENIORITY_VALUES: Readonly<Record<string, CanonicalSeniority>> = {
  intern: 'INTERN',
  internship: 'INTERN',
  practicante: 'INTERN',
  entry: 'ENTRY',
  'entry level': 'ENTRY',
  junior: 'ENTRY',
  jr: 'ENTRY',
  mid: 'MID',
  'mid level': 'MID',
  intermediate: 'MID',
  senior: 'SENIOR',
  sr: 'SENIOR',
  'senior level': 'SENIOR',
  lead: 'LEAD',
  'tech lead': 'LEAD',
  'team lead': 'LEAD',
  manager: 'MANAGER',
  director: 'DIRECTOR',
  executive: 'EXECUTIVE',
  vp: 'EXECUTIVE',
  'vice president': 'EXECUTIVE',
};

function normalizedDate(
  observation: MarketObservation,
  sourceField: 'postedAt' | 'expiresAt',
): DerivedMarketField {
  const field = observedField(observation, sourceField);
  if (!field) return silentUnknown();

  const value = normalizeText(field.value);
  const evidence = evidenceFor(observation, sourceField, field);

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsedDate = Date.parse(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(parsedDate) || new Date(parsedDate).toISOString().slice(0, 10) !== value) {
      return { status: 'UNKNOWN', reason: 'INVALID_SOURCE_VALUE', evidence };
    }
    return {
      status: 'KNOWN',
      value,
      derivation: 'NORMALIZED_EXPLICIT',
      evidence,
    };
  }

  const timezoneAwareIso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/i;
  if (!timezoneAwareIso.test(value)) {
    return { status: 'UNKNOWN', reason: 'INVALID_SOURCE_VALUE', evidence };
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return { status: 'UNKNOWN', reason: 'INVALID_SOURCE_VALUE', evidence };
  }

  return {
    status: 'KNOWN',
    value: new Date(parsed).toISOString(),
    derivation: 'ISO_DATE_NORMALIZATION',
    evidence,
  };
}

function deriveFields(observation: MarketObservation): DerivedMarketInterpretationFields {
  return {
    companyName: normalizedExplicit(observation, 'companyName'),
    roleTitle: normalizedExplicit(observation, 'roleTitle'),
    location: normalizedExplicit(observation, 'location'),
    workModel: controlledClassification(observation, 'workModel', WORK_MODEL_VALUES),
    employmentType: controlledClassification(observation, 'employmentType', EMPLOYMENT_TYPE_VALUES),
    seniority: controlledClassification(observation, 'seniority', SENIORITY_VALUES),
    compensation: normalizedExplicit(observation, 'compensation'),
    postedAt: normalizedDate(observation, 'postedAt'),
    expiresAt: normalizedDate(observation, 'expiresAt'),
    description: normalizedExplicit(observation, 'description'),
  };
}

function interpretationSemantic(input: {
  marketObservationId: MarketObservation['id'];
  observationContentSha256: string;
  policyVersion: string;
  fields: DerivedMarketInterpretationFields;
}) {
  return {
    schemaVersion: DERIVED_MARKET_INTERPRETATION_SCHEMA_VERSION,
    marketObservationId: input.marketObservationId,
    observationContentSha256: input.observationContentSha256,
    policyVersion: input.policyVersion,
    fields: input.fields,
    scopeBoundary: 'DERIVED_MARKET_INTERPRETATION_NOT_SOURCE_FACT_OR_JOB_REQUIREMENT' as const,
  };
}

function validateEvidenceShape(evidence: DerivedMarketEvidence): void {
  requireInterpretation(Boolean(evidence.sourceField), 'derived evidence requires a source field.');
  requireInterpretation(Boolean(evidence.sourceValue.trim()), 'derived evidence sourceValue cannot be blank.');
  if (evidence.sourcePath !== undefined) {
    requireInterpretation(Boolean(evidence.sourcePath.trim()), 'derived evidence sourcePath cannot be blank.');
  }
  if (evidence.sourceExcerpt !== undefined) {
    requireInterpretation(Boolean(evidence.sourceExcerpt.trim()), 'derived evidence sourceExcerpt cannot be blank.');
  }
}

function validateFieldShape(field: DerivedMarketField, label: string): void {
  if (field.status === 'KNOWN') {
    requireInterpretation(Boolean(field.value.trim()), `${label} known value cannot be blank.`);
    requireInterpretation(
      field.derivation === 'NORMALIZED_EXPLICIT'
        || field.derivation === 'CONTROLLED_CLASSIFICATION'
        || field.derivation === 'ISO_DATE_NORMALIZATION',
      `${label} has an unsupported derivation kind.`,
    );
    validateEvidenceShape(field.evidence);
    return;
  }

  requireInterpretation(
    field.reason === 'SOURCE_SILENT'
      || field.reason === 'UNRECOGNIZED_SOURCE_VALUE'
      || field.reason === 'INVALID_SOURCE_VALUE',
    `${label} has an unsupported UNKNOWN reason.`,
  );
  if (field.reason === 'SOURCE_SILENT') {
    requireInterpretation(field.evidence === undefined, `${label} SOURCE_SILENT cannot claim source evidence.`);
  } else {
    requireInterpretation(Boolean(field.evidence), `${label} ${field.reason} must preserve source evidence.`);
    validateEvidenceShape(field.evidence!);
  }
}

/** Content-addressed integrity validation that does not require source lookup. */
export function validateDerivedMarketInterpretationIntegrity(
  interpretation: DerivedMarketInterpretation,
): void {
  requireInterpretation(
    interpretation.schemaVersion === DERIVED_MARKET_INTERPRETATION_SCHEMA_VERSION,
    `unsupported schema version: ${interpretation.schemaVersion}`,
  );
  requireInterpretation(Boolean(interpretation.policyVersion.trim()), 'policyVersion cannot be blank.');
  requireInterpretation(
    /^[a-f0-9]{64}$/.test(interpretation.observationContentSha256),
    'observationContentSha256 must be a canonical SHA-256 digest.',
  );
  requireInterpretation(Number.isFinite(Date.parse(interpretation.generatedAt)), 'generatedAt must be a valid timestamp.');
  requireInterpretation(
    interpretation.scopeBoundary === 'DERIVED_MARKET_INTERPRETATION_NOT_SOURCE_FACT_OR_JOB_REQUIREMENT',
    'scope boundary changed.',
  );

  Object.entries(interpretation.fields).forEach(([label, field]) => {
    validateFieldShape(field, label);
    if (!field.evidence) return;
    requireInterpretation(
      field.evidence.marketObservationId === interpretation.marketObservationId,
      `${label} evidence points to a different MarketObservation.`,
    );
    requireInterpretation(
      field.evidence.sourceField === label,
      `${label} evidence points to a different source field.`,
    );
  });

  const semantic = interpretationSemantic({
    marketObservationId: interpretation.marketObservationId,
    observationContentSha256: interpretation.observationContentSha256,
    policyVersion: interpretation.policyVersion,
    fields: interpretation.fields,
  });
  const expectedHash = sha256(stableJson(semantic));
  requireInterpretation(interpretation.contentSha256 === expectedHash, 'content hash mismatch.');
  requireInterpretation(
    interpretation.id === `derived-market-interpretation:${expectedHash.slice(0, 32)}`,
    'identity is not content-addressed.',
  );
}

/**
 * Full semantic validation against the authoritative MarketObservation.
 * Re-derivation under the current policy prevents a caller from inventing a
 * derived value and merely recomputing its hash.
 */
export function validateDerivedMarketInterpretation(
  interpretation: DerivedMarketInterpretation,
  observation: MarketObservation,
): void {
  validateMarketObservation(observation);
  validateDerivedMarketInterpretationIntegrity(interpretation);
  requireInterpretation(
    interpretation.policyVersion === MARKET_INTERPRETATION_POLICY_VERSION,
    `unsupported interpretation policy: ${interpretation.policyVersion}`,
  );
  requireInterpretation(
    interpretation.marketObservationId === observation.id,
    'marketObservationId does not match the authoritative observation.',
  );
  requireInterpretation(
    interpretation.observationContentSha256 === observation.contentSha256,
    'observation content hash does not match the authoritative observation.',
  );

  const expectedFields = deriveFields(observation);
  requireInterpretation(
    stableJson(interpretation.fields) === stableJson(expectedFields),
    'derived fields do not match deterministic policy output for the observation.',
  );

  Object.values(interpretation.fields).forEach((field) => {
    if (!field.evidence) return;
    requireInterpretation(
      field.evidence.marketObservationId === observation.id,
      'derived evidence points to a different MarketObservation.',
    );
    const sourceField = observation.explicitFields[field.evidence.sourceField];
    requireInterpretation(Boolean(sourceField), `derived evidence references absent source field ${field.evidence.sourceField}.`);
    requireInterpretation(sourceField!.value === field.evidence.sourceValue, 'derived evidence changed the source value.');
    requireInterpretation(
      sourceField!.evidence.sourcePath === field.evidence.sourcePath,
      'derived evidence sourcePath differs from MarketObservation evidence.',
    );
    requireInterpretation(
      sourceField!.evidence.sourceExcerpt === field.evidence.sourceExcerpt,
      'derived evidence sourceExcerpt differs from MarketObservation evidence.',
    );
  });
}

/**
 * M4B-04 deterministic interpretation boundary.
 *
 * It reads only source-explicit MarketObservation fields. Raw description text
 * is never mined to fill a different missing field. Source silence therefore
 * remains UNKNOWN rather than becoming an inferred market fact.
 */
export function deriveMarketInterpretation(
  observation: MarketObservation,
  options: { generatedAt?: string } = {},
): DerivedMarketInterpretation {
  validateMarketObservation(observation);
  const fields = deriveFields(observation);
  const semantic = interpretationSemantic({
    marketObservationId: observation.id,
    observationContentSha256: observation.contentSha256,
    policyVersion: MARKET_INTERPRETATION_POLICY_VERSION,
    fields,
  });
  const contentSha256 = sha256(stableJson(semantic));
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  requireInterpretation(Number.isFinite(Date.parse(generatedAt)), 'generatedAt must be a valid timestamp.');

  const interpretation: DerivedMarketInterpretation = {
    ...semantic,
    id: domainId('DerivedMarketInterpretation', `derived-market-interpretation:${contentSha256.slice(0, 32)}`),
    contentSha256,
    generatedAt,
  };
  validateDerivedMarketInterpretation(interpretation, observation);
  return interpretation;
}
