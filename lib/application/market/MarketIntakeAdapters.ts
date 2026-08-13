import type { ObservedJobFields, ObservedMarketField } from '../../domain';
import type { CreateMarketObservationInput } from './MarketObservationService';
import {
  MAX_MARKET_INTAKE_DESCRIPTION_CHARS,
  MAX_MARKET_INTAKE_FIELD_CHARS,
  MAX_MARKET_INTAKE_TEXT_CHARS,
  MAX_MARKET_SOURCE_URL_CHARS,
  type ManualTextMarketIntakeRequest,
  type StructuredMarketJobPayload,
  type StructuredPayloadMarketIntakeRequest,
} from './MarketIntake';

function assertIntake(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`MarketIntake validation: ${message}`);
}

function validateSourceUrlReference(sourceUrl: string | undefined): string | undefined {
  if (sourceUrl === undefined) return undefined;
  const trimmed = sourceUrl.trim();
  assertIntake(Boolean(trimmed), 'sourceUrl cannot be blank.');
  assertIntake(trimmed.length <= MAX_MARKET_SOURCE_URL_CHARS, 'sourceUrl is too long.');

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('MarketIntake validation: sourceUrl must be a valid absolute HTTP(S) URL.');
  }

  assertIntake(parsed.protocol === 'https:' || parsed.protocol === 'http:', 'sourceUrl must use HTTP or HTTPS.');
  assertIntake(!parsed.username && !parsed.password, 'sourceUrl must not contain embedded credentials.');
  return trimmed;
}

function assertSourceText(text: string): void {
  assertIntake(Boolean(text.trim()), 'manual market text cannot be empty.');
  assertIntake(text.length <= MAX_MARKET_INTAKE_TEXT_CHARS, `manual market text exceeds ${MAX_MARKET_INTAKE_TEXT_CHARS} characters.`);
}

const STRUCTURED_FIELDS = [
  'companyName',
  'roleTitle',
  'location',
  'workModel',
  'employmentType',
  'seniority',
  'compensation',
  'postedAt',
  'expiresAt',
  'description',
] as const satisfies readonly (keyof StructuredMarketJobPayload)[];

function validateStructuredValue(key: keyof StructuredMarketJobPayload, value: string): void {
  assertIntake(Boolean(value.trim()), `${key} cannot be blank when supplied.`);
  const maximum = key === 'description'
    ? MAX_MARKET_INTAKE_DESCRIPTION_CHARS
    : MAX_MARKET_INTAKE_FIELD_CHARS;
  assertIntake(value.length <= maximum, `${key} exceeds ${maximum} characters.`);
}

function sourceField(value: string, sourcePath: string): ObservedMarketField {
  return {
    value,
    evidence: {
      origin: 'SOURCE_EXPLICIT',
      sourcePath,
    },
  };
}

function structuredPayload(job: StructuredMarketJobPayload): {
  payloadContent: string;
  explicitFields: ObservedJobFields;
} {
  const suppliedEntries = STRUCTURED_FIELDS
    .filter((key) => job[key] !== undefined)
    .map((key) => [key, job[key]!] as const);

  assertIntake(suppliedEntries.length > 0, 'structured payload must contain at least one explicit job field.');
  suppliedEntries.forEach(([key, value]) => validateStructuredValue(key, value));

  // Fixed field order makes the accepted structured source representation
  // deterministic without changing the exact string values supplied by caller.
  const sourceMaterial = Object.fromEntries(suppliedEntries) as Record<string, string>;
  const payloadContent = JSON.stringify(sourceMaterial);
  const explicitFields: ObservedJobFields = {
    companyName: job.companyName !== undefined ? sourceField(job.companyName, '$.companyName') : undefined,
    roleTitle: job.roleTitle !== undefined ? sourceField(job.roleTitle, '$.roleTitle') : undefined,
    location: job.location !== undefined ? sourceField(job.location, '$.location') : undefined,
    workModel: job.workModel !== undefined ? sourceField(job.workModel, '$.workModel') : undefined,
    employmentType: job.employmentType !== undefined ? sourceField(job.employmentType, '$.employmentType') : undefined,
    seniority: job.seniority !== undefined ? sourceField(job.seniority, '$.seniority') : undefined,
    compensation: job.compensation !== undefined ? sourceField(job.compensation, '$.compensation') : undefined,
    postedAt: job.postedAt !== undefined ? sourceField(job.postedAt, '$.postedAt') : undefined,
    expiresAt: job.expiresAt !== undefined ? sourceField(job.expiresAt, '$.expiresAt') : undefined,
    description: job.description !== undefined ? sourceField(job.description, '$.description') : undefined,
  };

  return { payloadContent, explicitFields };
}

export interface MarketIntakeAdapter<TRequest> {
  toObservationInput(request: TRequest): CreateMarketObservationInput;
}

export const manualTextMarketIntakeAdapter: MarketIntakeAdapter<ManualTextMarketIntakeRequest> = {
  toObservationInput(request) {
    assertSourceText(request.text);
    const sourceUrl = validateSourceUrlReference(request.sourceUrl);
    return {
      source: {
        type: 'MANUAL_TEXT',
        label: 'User supplied job text',
      },
      payload: {
        format: 'TEXT',
        content: request.text,
      },
      explicitFields: {},
      provenance: {
        captureMethod: 'USER_SUPPLIED_TEXT',
        sourceUrl,
      },
      observedAt: request.observedAt,
    };
  },
};

export const structuredPayloadMarketIntakeAdapter: MarketIntakeAdapter<StructuredPayloadMarketIntakeRequest> = {
  toObservationInput(request) {
    const sourceUrl = validateSourceUrlReference(request.sourceUrl);
    const { payloadContent, explicitFields } = structuredPayload(request.job);
    return {
      source: {
        type: 'MANUAL_STRUCTURED',
        label: 'User supplied structured job payload',
      },
      payload: {
        format: 'JSON',
        content: payloadContent,
      },
      explicitFields,
      provenance: {
        captureMethod: 'USER_SUPPLIED_STRUCTURED',
        sourceUrl,
      },
      observedAt: request.observedAt,
    };
  },
};
