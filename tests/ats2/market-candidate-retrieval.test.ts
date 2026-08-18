import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  domainId,
  type CandidateProfileId,
  type MarketObservation,
  type ObservedJobFields,
} from '../../lib/domain';
import { createCareerTarget } from '../../lib/application/target/CareerTargetService';
import {
  buildMarketCandidateSet,
  MARKET_CANDIDATE_RETRIEVAL_SELECTED_LIMIT,
} from '../../lib/application/market/MarketCandidateRetrievalService';
import { createObservationOccurrence } from '../../lib/application/market/MarketObservationHistory';
import { intakeAcquiredProviderObservation } from '../../lib/application/market/MarketIntakeService';
import type { AcquiredProviderMarketIntake } from '../../lib/application/market/ControlledSourceAcquisition';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

const candidateProfileId: CandidateProfileId = domainId('CandidateProfile', 'candidate-profile:retrieval-test');

const target = createCareerTarget(candidateProfileId, {
  roleTitle: 'Backend Engineer',
  preferredSeniority: 'ANY',
  preferredLocations: ['Lima, Peru'],
  workModels: ['REMOTE'],
  employmentTypes: ['FULL_TIME'],
  priority: 1,
}, '2026-08-01T00:00:00.000Z');

function observedField(value: string, sourcePath: string) {
  return {
    value,
    evidence: {
      origin: 'SOURCE_EXPLICIT' as const,
      sourcePath,
    },
  };
}

function providerObservation(input: {
  jobId: string;
  observedAt: string;
  roleTitle?: string;
  location?: string;
  workModel?: string;
  employmentType?: string;
  seniority?: string;
  expiresAt?: string;
  description?: string;
}): MarketObservation {
  const explicitFields: ObservedJobFields = {
    roleTitle: input.roleTitle ? observedField(input.roleTitle, '$.title') : undefined,
    location: input.location ? observedField(input.location, '$.location') : undefined,
    workModel: input.workModel ? observedField(input.workModel, '$.workModel') : undefined,
    employmentType: input.employmentType ? observedField(input.employmentType, '$.employmentType') : undefined,
    seniority: input.seniority ? observedField(input.seniority, '$.seniority') : undefined,
    expiresAt: input.expiresAt ? observedField(input.expiresAt, '$.expiresAt') : undefined,
    description: input.description ? observedField(input.description, '$.description') : undefined,
  };
  const payload = {
    id: input.jobId,
    title: input.roleTitle,
    location: input.location,
    workModel: input.workModel,
    employmentType: input.employmentType,
    seniority: input.seniority,
    expiresAt: input.expiresAt,
    description: input.description,
  };
  const acquired: AcquiredProviderMarketIntake = {
    provider: 'GREENHOUSE',
    sourceLabel: 'Greenhouse board acme',
    payloadContent: JSON.stringify(payload),
    explicitFields,
    sourceUrl: `https://boards-api.greenhouse.io/v1/boards/acme/jobs/${input.jobId}`,
    externalId: input.jobId,
    adapterId: 'greenhouse-job-board',
    adapterVersion: '1.0.0',
  };
  return intakeAcquiredProviderObservation(acquired, input.observedAt).observation;
}

function history(observations: readonly MarketObservation[]) {
  const occurrences = observations.map(createObservationOccurrence);
  const timestamps = occurrences.map((item) => Date.parse(item.observedAt));
  return {
    schemaVersion: 'market-observation-history-v1' as const,
    observations,
    occurrences,
    revision: occurrences.length,
    createdAt: new Date(Math.min(...timestamps)).toISOString(),
    updatedAt: new Date(Math.max(...timestamps)).toISOString(),
  };
}

function candidateByRole(result: ReturnType<typeof buildMarketCandidateSet>, role: string) {
  return [...result.candidates, ...result.refreshFirst].find((item) => item.roleTitle === role);
}

test('OPEN source-explicit target role with compatible constraints becomes a retrieval candidate, not a Job Match', () => {
  const observation = providerObservation({
    jobId: '101',
    observedAt: '2026-08-17T10:00:00.000Z',
    roleTitle: 'Senior Backend Engineer',
    location: 'Lima, Peru',
    workModel: 'Remote',
    employmentType: 'Full-time',
  });
  const result = buildMarketCandidateSet({
    target,
    observationHistory: history([observation]),
    evaluatedAt: '2026-08-17T12:00:00.000Z',
  });

  assert.equal(result.candidates.length, 1);
  assert.equal(candidateByRole(result, 'Senior Backend Engineer')?.disposition, 'CANDIDATE');
  assert.equal(result.candidates[0].lifecycle.status, 'OPEN');
  assert.equal(result.candidates[0].signals.find((item) => item.dimension === 'ROLE')?.status, 'ALIGNED');
  assert.equal(result.scopeBoundary, 'TARGET_BOUND_MARKET_PREFILTER_NOT_JOB_MATCH_HIRING_PROBABILITY_OR_CANDIDATE_TRUTH');
  assert.equal(result.persistence, 'NOT_PERSISTED_CURRENT_RETRIEVAL_VIEW_M4B_10');
});

test('retrieval refuses to mine description text into role alignment when source-explicit role title is absent', () => {
  const observation = providerObservation({
    jobId: '102',
    observedAt: '2026-08-17T10:00:00.000Z',
    description: 'We are hiring a Backend Engineer to build distributed systems.',
    workModel: 'Remote',
    employmentType: 'Full-time',
  });
  const result = buildMarketCandidateSet({
    target,
    observationHistory: history([observation]),
    evaluatedAt: '2026-08-17T12:00:00.000Z',
  });

  assert.equal(result.candidates.length, 0);
  assert.equal(result.summary.insufficientSignalCount, 1);
});

test('explicit work-model conflict downgrades retrieval to REVIEW instead of pretending the candidate is unqualified', () => {
  const observation = providerObservation({
    jobId: '103',
    observedAt: '2026-08-17T10:00:00.000Z',
    roleTitle: 'Backend Engineer',
    workModel: 'On-site',
    employmentType: 'Full-time',
  });
  const result = buildMarketCandidateSet({
    target,
    observationHistory: history([observation]),
    evaluatedAt: '2026-08-17T12:00:00.000Z',
  });

  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].disposition, 'REVIEW');
  assert.equal(result.candidates[0].signals.find((item) => item.dimension === 'WORK_MODEL')?.status, 'CONFLICT');
});

test('STALE relevant opportunity is routed to refreshFirst while CLOSED is excluded from current retrieval', () => {
  const stale = providerObservation({
    jobId: '104',
    observedAt: '2026-08-10T00:00:00.000Z',
    roleTitle: 'Backend Engineer',
    workModel: 'Remote',
    employmentType: 'Full-time',
  });
  const closed = providerObservation({
    jobId: '105',
    observedAt: '2026-08-17T10:00:00.000Z',
    roleTitle: 'Backend Engineer',
    workModel: 'Remote',
    employmentType: 'Full-time',
    expiresAt: '2026-08-16',
  });
  const result = buildMarketCandidateSet({
    target,
    observationHistory: history([stale, closed]),
    evaluatedAt: '2026-08-17T12:00:00.000Z',
  });

  assert.equal(result.candidates.length, 0);
  assert.equal(result.refreshFirst.length, 1);
  assert.equal(result.refreshFirst[0].marketObservationId, stale.id);
  assert.equal(result.refreshFirst[0].disposition, 'REFRESH_FIRST');
  assert.equal(result.summary.excludedClosedCount, 1);
});

test('same provider-native opportunity with changed content appears once using only the current material observation', () => {
  const first = providerObservation({
    jobId: '106',
    observedAt: '2026-08-17T08:00:00.000Z',
    roleTitle: 'Backend Engineer',
    workModel: 'Remote',
    employmentType: 'Full-time',
    description: 'Build APIs.',
  });
  const changed = providerObservation({
    jobId: '106',
    observedAt: '2026-08-17T10:00:00.000Z',
    roleTitle: 'Backend Engineer',
    workModel: 'Remote',
    employmentType: 'Full-time',
    description: 'Build APIs and distributed systems.',
  });
  assert.notEqual(first.id, changed.id);

  const result = buildMarketCandidateSet({
    target,
    observationHistory: history([first, changed]),
    evaluatedAt: '2026-08-17T12:00:00.000Z',
  });

  assert.equal(result.summary.logicalOpportunityCount, 1);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].marketObservationId, changed.id);
});

test('retrieval identity is deterministic across history order and wall-clock evaluation while lifecycle state is unchanged', () => {
  const first = providerObservation({
    jobId: '107',
    observedAt: '2026-08-17T10:00:00.000Z',
    roleTitle: 'Backend Engineer',
    workModel: 'Remote',
    employmentType: 'Full-time',
  });
  const second = providerObservation({
    jobId: '108',
    observedAt: '2026-08-17T09:00:00.000Z',
    roleTitle: 'Platform Engineer',
    workModel: 'Remote',
    employmentType: 'Full-time',
  });
  const original = history([first, second]);
  const reversed = {
    ...original,
    observations: [...original.observations].reverse(),
    occurrences: [...original.occurrences].reverse(),
  };

  const a = buildMarketCandidateSet({ target, observationHistory: original, evaluatedAt: '2026-08-17T12:00:00.000Z' });
  const b = buildMarketCandidateSet({ target, observationHistory: reversed, evaluatedAt: '2026-08-17T13:00:00.000Z' });
  assert.equal(a.id, b.id);
  assert.equal(a.contentSha256, b.contentSha256);
});

test('selected market candidates are bounded deterministically by server policy', () => {
  const observations = Array.from({ length: MARKET_CANDIDATE_RETRIEVAL_SELECTED_LIMIT + 7 }, (_, index) => providerObservation({
    jobId: String(200 + index),
    observedAt: `2026-08-17T${String(10 + (index % 2)).padStart(2, '0')}:00:00.000Z`,
    roleTitle: 'Backend Engineer',
    workModel: 'Remote',
    employmentType: 'Full-time',
  }));
  const result = buildMarketCandidateSet({
    target,
    observationHistory: history(observations),
    evaluatedAt: '2026-08-17T12:00:00.000Z',
  });
  assert.equal(result.summary.candidateCount, observations.length);
  assert.equal(result.candidates.length, MARKET_CANDIDATE_RETRIEVAL_SELECTED_LIMIT);
  assert.equal(result.summary.selectedLimit, MARKET_CANDIDATE_RETRIEVAL_SELECTED_LIMIT);
});

test('retrieval candidate signals contain target intent and source market values but no candidate evidence payload', () => {
  const observation = providerObservation({
    jobId: '109',
    observedAt: '2026-08-17T10:00:00.000Z',
    roleTitle: 'Backend Engineer',
    location: 'Lima, Peru',
    workModel: 'Remote',
    employmentType: 'Full-time',
  });
  const result = buildMarketCandidateSet({
    target,
    observationHistory: history([observation]),
    evaluatedAt: '2026-08-17T12:00:00.000Z',
  });
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /CareerEvidence|CareerAssertion|MatchReport|OpportunityAssessment/);
  assert.match(serialized, /Backend Engineer/);
  assert.match(serialized, /Remote/);
});

test('M4B-10 service never consumes candidate capability or invokes downstream matching/generation', () => {
  const service = source('lib/application/market/MarketCandidateRetrievalService.ts');
  assert.doesNotMatch(service, /analyzeJobDescription\s*\(|matchJobToCandidate\s*\(|buildOpportunityAssessment\s*\(|generateResume\s*\(/);
  assert.doesNotMatch(service, /type\s+CareerAssertion|type\s+CareerEvidence|type\s+CareerSnapshot/);
  assert.doesNotMatch(service, /careerSnapshot\s*\.\s*(assertions|evidence)|candidate\s*\.\s*assertions/);
  assert.match(service, /input\.field\?\.evidence\.sourcePath/);
});

test('public retrieval API accepts only opaque career identity and keeps target, market pool, limit and downstream work server-owned', () => {
  const route = source('app/api/market-candidate-retrieval/route.ts');
  assert.match(route, /careerVaultId/);
  assert.match(route, /candidateProfileIdFromCareerVaultCapability/);
  assert.match(route, /targetRepository\.load/);
  assert.match(route, /marketRepository\.load/);
  assert.match(route, /rateLimitPublicApiRequest\(request\.headers, 'market-candidate-retrieval'\)/);
  assert.doesNotMatch(route, /roleTitle:\s*z\.|careerTarget:\s*z\.|marketObservationIds:\s*z\.|selectedLimit:\s*z\.|score:\s*z\./);
  assert.doesNotMatch(route, /analyzeJobDescription\s*\(|matchJobToCandidate\s*\(|generateResume\s*\(/);
  assert.doesNotMatch(route, /from\s+['"][^'"]*(OpportunityAssessment|matching\/|job\/JobIntelligence)[^'"]*['"]/);
});
