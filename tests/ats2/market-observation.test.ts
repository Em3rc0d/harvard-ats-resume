import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMarketObservation,
  createMarketSource,
  validateMarketObservation,
} from '../../lib/application/market/MarketObservationService';
import type { MarketObservation } from '../../lib/domain';

function manualObservation(observedAt: string, content = 'Senior Backend Engineer\nRemote in Peru\nTypeScript required.') {
  return createMarketObservation({
    source: { type: 'MANUAL_TEXT', label: 'Candidate supplied vacancy text' },
    payload: { format: 'TEXT', content },
    explicitFields: {
      roleTitle: {
        value: 'Senior Backend Engineer',
        evidence: { origin: 'SOURCE_EXPLICIT', sourceExcerpt: 'Senior Backend Engineer' },
      },
      location: {
        value: 'Peru',
        evidence: { origin: 'SOURCE_EXPLICIT', sourceExcerpt: 'Remote in Peru' },
      },
    },
    provenance: { captureMethod: 'USER_SUPPLIED_TEXT' },
    observedAt,
  });
}

test('MarketObservation identity is semantic and excludes observation wall-clock time', () => {
  const first = manualObservation('2026-08-12T18:00:00.000Z');
  const second = manualObservation('2026-08-13T18:00:00.000Z');

  assert.equal(second.id, first.id);
  assert.equal(second.contentSha256, first.contentSha256);
  assert.notEqual(second.observedAt, first.observedAt);
});

test('changing raw source material creates a new MarketObservation without rewriting the prior one', () => {
  const first = manualObservation('2026-08-12T18:00:00.000Z');
  const changed = createMarketObservation({
    source: { type: 'MANUAL_TEXT', label: 'Candidate supplied vacancy text' },
    payload: { format: 'TEXT', content: 'Senior Backend Engineer\nHybrid in Lima\nTypeScript and AWS required.' },
    explicitFields: {
      roleTitle: {
        value: 'Senior Backend Engineer',
        evidence: { origin: 'SOURCE_EXPLICIT', sourceExcerpt: 'Senior Backend Engineer' },
      },
      location: {
        value: 'Lima',
        evidence: { origin: 'SOURCE_EXPLICIT', sourceExcerpt: 'Hybrid in Lima' },
      },
    },
    provenance: { captureMethod: 'USER_SUPPLIED_TEXT' },
    observedAt: '2026-08-13T18:00:00.000Z',
  });

  assert.notEqual(changed.id, first.id);
  assert.notEqual(changed.contentSha256, first.contentSha256);
  assert.equal(first.payload.content.includes('Remote in Peru'), true);
});

test('source-explicit role title does not silently become inferred seniority or work model', () => {
  const observation = manualObservation('2026-08-12T18:00:00.000Z');

  assert.equal(observation.explicitFields.roleTitle?.value, 'Senior Backend Engineer');
  assert.equal(observation.explicitFields.seniority, undefined);
  assert.equal(observation.explicitFields.workModel, undefined);
  assert.equal(observation.scopeBoundary, 'OBSERVED_MARKET_FACT_NOT_CANDIDATE_EVIDENCE_OR_DERIVED_INTERPRETATION');
});

test('MarketObservation contains no candidate identity or candidate evidence boundary', () => {
  const observation = manualObservation('2026-08-12T18:00:00.000Z');
  const record = observation as unknown as Record<string, unknown>;

  assert.equal('candidateProfileId' in record, false);
  assert.equal('careerEvidenceIds' in record, false);
  assert.equal('careerAssertionIds' in record, false);
  assert.equal('evidenceIds' in record, false);
});

test('structured explicit fields participate in semantic identity', () => {
  const base = createMarketObservation({
    source: { type: 'PROVIDER_API', provider: 'Example ATS' },
    payload: { format: 'JSON', content: '{"id":"job-1","title":"Backend Engineer"}' },
    explicitFields: {
      roleTitle: {
        value: 'Backend Engineer',
        evidence: { origin: 'SOURCE_EXPLICIT', sourcePath: '$.title' },
      },
    },
    provenance: {
      captureMethod: 'PROVIDER_ADAPTER',
      externalId: 'job-1',
      adapter: { adapterId: 'example-ats', adapterVersion: '1.0.0' },
    },
    observedAt: '2026-08-12T18:00:00.000Z',
  });
  const enriched = createMarketObservation({
    source: { type: 'PROVIDER_API', provider: 'Example ATS' },
    payload: { format: 'JSON', content: '{"id":"job-1","title":"Backend Engineer"}' },
    explicitFields: {
      roleTitle: {
        value: 'Backend Engineer',
        evidence: { origin: 'SOURCE_EXPLICIT', sourcePath: '$.title' },
      },
      seniority: {
        value: 'Senior',
        evidence: { origin: 'SOURCE_EXPLICIT', sourcePath: '$.seniority' },
      },
    },
    provenance: {
      captureMethod: 'PROVIDER_ADAPTER',
      externalId: 'job-1',
      adapter: { adapterId: 'example-ats', adapterVersion: '1.0.0' },
    },
    observedAt: '2026-08-12T18:00:00.000Z',
  });

  assert.notEqual(enriched.id, base.id);
});

test('provider adapter capture requires adapter provenance', () => {
  assert.throws(() => createMarketObservation({
    source: { type: 'PROVIDER_API', provider: 'Example ATS' },
    payload: { format: 'JSON', content: '{"id":"job-1"}' },
    provenance: { captureMethod: 'PROVIDER_ADAPTER', externalId: 'job-1' },
  }), /requires adapter provenance/);
});

test('PROVIDER_API source requires provider identity instead of an anonymous provider class', () => {
  assert.throws(() => createMarketSource({ type: 'PROVIDER_API' }), /requires a provider identity/);
});

test('public URL capture requires the observed source URL', () => {
  assert.throws(() => createMarketObservation({
    source: { type: 'JOB_URL' },
    payload: { format: 'TEXT', content: 'Backend Engineer' },
    provenance: { captureMethod: 'PUBLIC_URL_FETCH' },
  }), /requires sourceUrl provenance/);
});

test('TEXT explicit facts require an exact source excerpt instead of a provenance assertion alone', () => {
  assert.throws(() => createMarketObservation({
    source: { type: 'MANUAL_TEXT' },
    payload: { format: 'TEXT', content: 'Backend Engineer' },
    explicitFields: {
      roleTitle: {
        value: 'Backend Engineer',
        evidence: { origin: 'SOURCE_EXPLICIT' },
      },
    },
    provenance: { captureMethod: 'USER_SUPPLIED_TEXT' },
  }), /must identify where the explicit source value came from/);
});

test('fabricated source excerpt is rejected when it is absent from the raw payload', () => {
  assert.throws(() => createMarketObservation({
    source: { type: 'MANUAL_TEXT' },
    payload: { format: 'TEXT', content: 'Backend Engineer' },
    explicitFields: {
      roleTitle: {
        value: 'Principal Engineer',
        evidence: { origin: 'SOURCE_EXPLICIT', sourceExcerpt: 'Principal Engineer' },
      },
    },
    provenance: { captureMethod: 'USER_SUPPLIED_TEXT' },
  }), /sourceExcerpt is not present in the raw source payload/);
});

test('source excerpt must actually contain the raw explicit value', () => {
  assert.throws(() => createMarketObservation({
    source: { type: 'MANUAL_TEXT' },
    payload: { format: 'TEXT', content: 'Backend Engineer in Lima' },
    explicitFields: {
      roleTitle: {
        value: 'Principal Engineer',
        evidence: { origin: 'SOURCE_EXPLICIT', sourceExcerpt: 'Backend Engineer' },
      },
    },
    provenance: { captureMethod: 'USER_SUPPLIED_TEXT' },
  }), /raw value is not present in its sourceExcerpt/);
});

test('JSON-labeled payload must be valid JSON source material', () => {
  assert.throws(() => createMarketObservation({
    source: { type: 'PROVIDER_API', provider: 'Example ATS' },
    payload: { format: 'JSON', content: '{not-json' },
    provenance: {
      captureMethod: 'PROVIDER_ADAPTER',
      adapter: { adapterId: 'example-ats', adapterVersion: '1.0.0' },
    },
  }), /JSON payload must contain valid JSON source material/);
});

test('invalid observation timestamp is rejected even though time is excluded from semantic identity', () => {
  assert.throws(() => manualObservation('not-a-time'), /observedAt must be a valid timestamp/);
});

test('tampering with MarketObservation semantic hash is rejected by content-addressed validation', () => {
  const observation = manualObservation('2026-08-12T18:00:00.000Z');
  const tampered: MarketObservation = {
    ...observation,
    contentSha256: '0'.repeat(64),
  };

  assert.throws(() => validateMarketObservation(tampered), /content hash mismatch/);
});

test('MarketSource identity is deterministic and provider names remain provider data, not domain enum values', () => {
  const first = createMarketSource({ type: 'PROVIDER_API', provider: 'Example ATS', label: 'Jobs API' });
  const second = createMarketSource({ type: 'PROVIDER_API', provider: ' Example ATS ', label: ' Jobs API ' });

  assert.equal(first.id, second.id);
  assert.equal(first.provider, 'Example ATS');
  assert.equal(first.type, 'PROVIDER_API');
});
