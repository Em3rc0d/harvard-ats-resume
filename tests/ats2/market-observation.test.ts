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
  const changed = manualObservation(
    '2026-08-13T18:00:00.000Z',
    'Senior Backend Engineer\nHybrid in Lima\nTypeScript and AWS required.',
  );

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

test('blank explicit evidence metadata is rejected instead of pretending provenance exists', () => {
  assert.throws(() => createMarketObservation({
    source: { type: 'MANUAL_TEXT' },
    payload: { format: 'TEXT', content: 'Backend Engineer' },
    explicitFields: {
      roleTitle: {
        value: 'Backend Engineer',
        evidence: { origin: 'SOURCE_EXPLICIT', sourceExcerpt: '   ' },
      },
    },
    provenance: { captureMethod: 'USER_SUPPLIED_TEXT' },
  }), /sourceExcerpt cannot be blank/);
});

test('tampering with MarketObservation content is rejected by content-addressed validation', () => {
  const observation = manualObservation('2026-08-12T18:00:00.000Z');
  const tampered: MarketObservation = {
    ...observation,
    payload: { ...observation.payload, content: 'Tampered vacancy content' },
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
