import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { intakeMarketObservation } from '../../lib/application/market/MarketIntakeService';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

test('manual text intake preserves exact source material and creates no inferred structured facts', () => {
  const text = 'Senior Backend Engineer\nRemote in Peru\nTypeScript required.';
  const result = intakeMarketObservation({
    kind: 'MANUAL_TEXT',
    text,
    observedAt: '2026-08-13T01:00:00.000Z',
  });

  assert.equal(result.policyVersion, 'market-intake-v1');
  assert.equal(result.intakeKind, 'MANUAL_TEXT');
  assert.equal(result.persistence, 'NOT_PERSISTED_M4B_02A');
  assert.equal(result.observation.source.type, 'MANUAL_TEXT');
  assert.equal(result.observation.payload.format, 'TEXT');
  assert.equal(result.observation.payload.content, text);
  assert.deepEqual(result.observation.explicitFields, {});
  assert.equal(result.observation.explicitFields.seniority, undefined);
  assert.equal(result.observation.explicitFields.workModel, undefined);
  assert.equal(result.observation.provenance.captureMethod, 'USER_SUPPLIED_TEXT');
});

test('structured payload creates only caller-supplied source-explicit fields with adapter-owned JSON paths', () => {
  const result = intakeMarketObservation({
    kind: 'STRUCTURED_PAYLOAD',
    job: {
      companyName: 'Acme Corp',
      roleTitle: 'Senior Backend Engineer',
      location: 'Lima, Peru',
      description: 'Build distributed APIs with TypeScript.',
    },
    observedAt: '2026-08-13T01:00:00.000Z',
  });

  assert.equal(result.observation.source.type, 'MANUAL_STRUCTURED');
  assert.equal(result.observation.payload.format, 'JSON');
  assert.equal(result.observation.provenance.captureMethod, 'USER_SUPPLIED_STRUCTURED');
  assert.equal(result.observation.explicitFields.companyName?.value, 'Acme Corp');
  assert.equal(result.observation.explicitFields.companyName?.evidence.sourcePath, '$.companyName');
  assert.equal(result.observation.explicitFields.roleTitle?.evidence.sourcePath, '$.roleTitle');
  assert.equal(result.observation.explicitFields.description?.evidence.sourcePath, '$.description');
  assert.equal(result.observation.explicitFields.seniority, undefined);
  assert.equal(result.observation.explicitFields.workModel, undefined);

  const payload = JSON.parse(result.observation.payload.content) as Record<string, string>;
  assert.deepEqual(payload, {
    companyName: 'Acme Corp',
    roleTitle: 'Senior Backend Engineer',
    location: 'Lima, Peru',
    description: 'Build distributed APIs with TypeScript.',
  });
});

test('structured intake representation is deterministic across caller object key order', () => {
  const first = intakeMarketObservation({
    kind: 'STRUCTURED_PAYLOAD',
    job: {
      companyName: 'Acme',
      roleTitle: 'Backend Engineer',
      description: 'Build APIs.',
    },
    observedAt: '2026-08-13T01:00:00.000Z',
  });
  const reordered = intakeMarketObservation({
    kind: 'STRUCTURED_PAYLOAD',
    job: {
      description: 'Build APIs.',
      roleTitle: 'Backend Engineer',
      companyName: 'Acme',
    },
    observedAt: '2026-08-14T01:00:00.000Z',
  });

  assert.equal(reordered.observation.payload.content, first.observation.payload.content);
  assert.equal(reordered.observation.id, first.observation.id);
  assert.equal(reordered.observation.contentSha256, first.observation.contentSha256);
  assert.notEqual(reordered.observation.observedAt, first.observation.observedAt);
});

test('changed structured source fact creates a different MarketObservation identity', () => {
  const first = intakeMarketObservation({
    kind: 'STRUCTURED_PAYLOAD',
    job: { roleTitle: 'Backend Engineer', location: 'Lima' },
  });
  const changed = intakeMarketObservation({
    kind: 'STRUCTURED_PAYLOAD',
    job: { roleTitle: 'Backend Engineer', location: 'Arequipa' },
  });

  assert.notEqual(changed.observation.id, first.observation.id);
  assert.notEqual(changed.observation.contentSha256, first.observation.contentSha256);
});

test('source URL is preserved only as user-supplied provenance and does not turn intake into URL acquisition', () => {
  const result = intakeMarketObservation({
    kind: 'MANUAL_TEXT',
    text: 'Backend Engineer role at Acme.',
    sourceUrl: ' https://jobs.example.com/roles/123 ',
  });

  assert.equal(result.observation.source.type, 'MANUAL_TEXT');
  assert.equal(result.observation.provenance.captureMethod, 'USER_SUPPLIED_TEXT');
  assert.equal(result.observation.provenance.sourceUrl, 'https://jobs.example.com/roles/123');
});

test('market intake rejects unsafe source URL references without attempting acquisition', () => {
  assert.throws(() => intakeMarketObservation({
    kind: 'MANUAL_TEXT',
    text: 'Backend Engineer role.',
    sourceUrl: 'file:///etc/passwd',
  }), /sourceUrl must use HTTP or HTTPS/);

  assert.throws(() => intakeMarketObservation({
    kind: 'STRUCTURED_PAYLOAD',
    job: { roleTitle: 'Backend Engineer' },
    sourceUrl: 'https://user:password@example.com/job/1',
  }), /must not contain embedded credentials/);
});

test('structured intake rejects empty or blank-only market facts', () => {
  assert.throws(() => intakeMarketObservation({
    kind: 'STRUCTURED_PAYLOAD',
    job: {},
  }), /must contain at least one explicit job field/);

  assert.throws(() => intakeMarketObservation({
    kind: 'STRUCTURED_PAYLOAD',
    job: { roleTitle: '   ' },
  }), /roleTitle cannot be blank/);
});

test('MarketIntake result has no candidate identity and makes no durability or derived-analysis claim', () => {
  const result = intakeMarketObservation({
    kind: 'STRUCTURED_PAYLOAD',
    job: { roleTitle: 'Backend Engineer' },
  });
  const record = result as unknown as Record<string, unknown>;

  assert.equal('candidateProfileId' in record, false);
  assert.equal('careerVaultId' in record, false);
  assert.equal('jobSnapshot' in record, false);
  assert.equal('opportunityAssessment' in record, false);
  assert.equal(result.persistence, 'NOT_PERSISTED_M4B_02A');
  assert.equal(
    result.scopeBoundary,
    'INTAKE_CREATES_OBSERVED_MARKET_FACT_ONLY_NO_DERIVED_INTERPRETATION_OR_PERSISTENCE',
  );
});

test('market-intake API is bounded and does not fetch URLs or invoke downstream intelligence', () => {
  const route = source('app/api/market-intake/route.ts');
  const contentLengthAt = route.indexOf("request.headers.get('content-length')");
  const rateLimitAt = route.indexOf("await rateLimitPublicApiRequest(request.headers, 'market-intake')");
  const jsonAt = route.indexOf('await request.json()');
  const intakeAt = route.indexOf('intakeMarketObservation(validation.data)');

  assert.ok(contentLengthAt >= 0 && rateLimitAt >= 0 && jsonAt >= 0 && intakeAt >= 0);
  assert.ok(contentLengthAt < rateLimitAt);
  assert.ok(rateLimitAt < jsonAt);
  assert.ok(jsonAt < intakeAt);
  assert.doesNotMatch(route, /\bfetch\s*\(/);
  assert.doesNotMatch(route, /analyzeJobDescription|matchJobToCandidate|persistMarket|persistOpportunity/);
  assert.match(route, /NOT_PERSISTED|does not fetch URLs|does not fetch/);
});
