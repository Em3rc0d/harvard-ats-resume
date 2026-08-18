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
import { buildLegacyTruthContext } from '../../lib/application/legacy/LegacyResumeAdapter';
import {
  analyzeSelectedMarketCandidates,
  MARKET_CANDIDATE_ANALYSIS_MAX_DEEP_ANALYSIS,
} from '../../lib/application/market/MarketCandidateAnalysisService';
import type {
  DerivedMarketInterpretationHistoryRepository,
  DerivedMarketInterpretationHistorySnapshot,
} from '../../lib/application/market/DerivedMarketInterpretationHistory';
import type {
  MarketJobProjectionHistoryRepository,
  MarketJobProjectionHistorySnapshot,
} from '../../lib/application/market/MarketJobProjectionHistory';
import {
  persistMarketObservationHistory,
  type MarketObservationHistoryRepository,
  type MarketObservationHistorySnapshot,
} from '../../lib/application/market/MarketObservationHistory';
import { createMarketObservation } from '../../lib/application/market/MarketObservationService';
import type {
  MarketOpportunityIndexRepository,
  MarketOpportunityIndexSnapshot,
} from '../../lib/application/market/MarketOpportunityIndexHistory';
import type {
  OpportunityHistoryRepository,
  OpportunityHistorySnapshot,
} from '../../lib/application/opportunity/OpportunityHistory';
import type {
  OpportunitySpaceHistory,
  OpportunitySpaceRepository,
} from '../../lib/application/opportunity/OpportunitySpaceHistory';
import {
  persistCareerTarget,
  type CareerTargetPortfolio,
  type CareerTargetRepository,
} from '../../lib/application/target/CareerTargetPortfolio';
import { createCareerTarget } from '../../lib/application/target/CareerTargetService';
import type { ResumeRequest } from '../../lib/schemas';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

class MemoryObservationRepository implements MarketObservationHistoryRepository {
  state: MarketObservationHistorySnapshot | null = null;
  async load() { return this.state; }
  async save(snapshot: MarketObservationHistorySnapshot) { this.state = snapshot; }
}

class MemoryInterpretationRepository implements DerivedMarketInterpretationHistoryRepository {
  state: DerivedMarketInterpretationHistorySnapshot | null = null;
  async load() { return this.state; }
  async save(snapshot: DerivedMarketInterpretationHistorySnapshot) { this.state = snapshot; }
}

class MemoryProjectionRepository implements MarketJobProjectionHistoryRepository {
  state: MarketJobProjectionHistorySnapshot | null = null;
  async load() { return this.state; }
  async save(snapshot: MarketJobProjectionHistorySnapshot) { this.state = snapshot; }
}

class MemoryOpportunityHistoryRepository implements OpportunityHistoryRepository {
  state: OpportunityHistorySnapshot | null = null;
  async load(candidateProfileId: CandidateProfileId) {
    if (!this.state || this.state.candidateProfileId !== candidateProfileId) return null;
    return this.state;
  }
  async save(snapshot: OpportunityHistorySnapshot) { this.state = snapshot; }
}

class MemoryTargetRepository implements CareerTargetRepository {
  state: CareerTargetPortfolio | null = null;
  async load(candidateProfileId: CandidateProfileId) {
    if (!this.state || this.state.candidateProfileId !== candidateProfileId) return null;
    return this.state;
  }
  async save(portfolio: CareerTargetPortfolio) { this.state = portfolio; }
}

class MemoryOpportunityIndexRepository implements MarketOpportunityIndexRepository {
  state: MarketOpportunityIndexSnapshot | null = null;
  async load() { return this.state; }
  async save(snapshot: MarketOpportunityIndexSnapshot) { this.state = snapshot; }
}

class MemoryOpportunitySpaceRepository implements OpportunitySpaceRepository {
  state: OpportunitySpaceHistory | null = null;
  async load(candidateProfileId: CandidateProfileId) {
    if (!this.state || this.state.candidateProfileId !== candidateProfileId) return null;
    return this.state;
  }
  async save(history: OpportunitySpaceHistory) { this.state = history; }
}

function candidateData(): ResumeRequest {
  return {
    personalInfo: {
      fullName: 'Selected Market Candidate',
      location: 'Lima, Peru',
      email: 'selected@example.com',
      linkedin: '',
      github: '',
    },
    summary: 'Backend developer building reliable TypeScript and cloud services.',
    experience: [{
      company: 'Example Systems',
      role: 'Backend Developer',
      startDate: '2021',
      endDate: '2026',
      description: 'Built production TypeScript and Node.js APIs on AWS.',
      technologies: ['TypeScript', 'Node.js', 'AWS'],
    }],
    education: [{
      institution: 'Example University',
      degree: 'Bachelor of Systems Engineering',
      startDate: '2017',
      endDate: '2021',
    }],
    skills: {
      hardSkills: ['TypeScript', 'Node.js', 'AWS'],
      softSkills: ['Communication'],
    },
    projects: [],
    certifications: [],
    languages: [{ language: 'English', proficiency: 'Advanced' }],
  };
}

function candidateTruth() {
  return buildLegacyTruthContext(candidateData(), {
    projectionKey: 'm4b-11-candidate',
    candidateProfileId: domainId('CandidateProfile', 'candidate:m4b-11'),
    capturedAt: '2026-08-17T08:00:00.000Z',
    truthClass: 'CANDIDATE_ASSERTED',
  });
}

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
  roleTitle: string;
  description?: string;
  observedAt?: string;
  location?: string;
}): MarketObservation {
  const explicitFields: ObservedJobFields = {
    companyName: observedField('Example Co', '$.company'),
    roleTitle: observedField(input.roleTitle, '$.title'),
    location: input.location ? observedField(input.location, '$.location') : undefined,
    workModel: observedField('Remote', '$.workModel'),
    employmentType: observedField('Full-time', '$.employmentType'),
    description: input.description ? observedField(input.description, '$.description') : undefined,
  };
  const payload = {
    id: input.jobId,
    company: 'Example Co',
    title: input.roleTitle,
    location: input.location,
    workModel: 'Remote',
    employmentType: 'Full-time',
    description: input.description,
  };
  return createMarketObservation({
    source: {
      type: 'PROVIDER_API',
      provider: 'GREENHOUSE',
      label: 'Example board',
    },
    payload: {
      format: 'JSON',
      content: JSON.stringify(payload),
    },
    explicitFields,
    provenance: {
      captureMethod: 'PROVIDER_ADAPTER',
      sourceUrl: `https://boards-api.greenhouse.io/v1/boards/example/jobs/${input.jobId}`,
      externalId: input.jobId,
      adapter: {
        adapterId: 'greenhouse-job-board',
        adapterVersion: '1.0.0',
      },
    },
    observedAt: input.observedAt ?? '2026-08-17T10:00:00.000Z',
  });
}

async function fixture(observations: readonly MarketObservation[]) {
  const truth = candidateTruth();
  const observationRepository = new MemoryObservationRepository();
  for (const observation of observations) {
    await persistMarketObservationHistory({ observation, repository: observationRepository });
  }
  const target = createCareerTarget(truth.candidateProfile.id, {
    roleTitle: 'Backend Engineer',
    preferredSeniority: 'ANY',
    preferredLocations: ['Lima, Peru'],
    workModels: ['REMOTE'],
    employmentTypes: ['FULL_TIME'],
    priority: 1,
  }, '2026-08-17T08:00:00.000Z');
  const targetRepository = new MemoryTargetRepository();
  await persistCareerTarget(targetRepository, target, '2026-08-17T08:00:00.000Z');
  return {
    truth,
    target,
    dependencies: {
      observationRepository,
      interpretationRepository: new MemoryInterpretationRepository(),
      projectionRepository: new MemoryProjectionRepository(),
      opportunityHistoryRepository: new MemoryOpportunityHistoryRepository(),
      targetRepository,
      opportunityIndexRepository: new MemoryOpportunityIndexRepository(),
      opportunitySpaceRepository: new MemoryOpportunitySpaceRepository(),
    },
  };
}

const validDescription = 'Requirements:\n- 3 years TypeScript required\n- Node.js required\n- AWS preferred';

test('M4B-11 runs only selected current observations through the trusted deep-analysis chain', async () => {
  const first = providerObservation({
    jobId: '501',
    roleTitle: 'Backend Engineer',
    description: validDescription,
    location: 'Lima, Peru',
  });
  const { truth, target, dependencies } = await fixture([first]);
  const result = await analyzeSelectedMarketCandidates({
    candidate: truth.candidateProfile,
    sources: truth.sources,
    evidence: truth.evidence,
    assertions: truth.assertions,
    candidateSnapshotSha256: 'a'.repeat(64),
    target,
    generatedAt: '2026-08-17T12:00:00.000Z',
  }, dependencies);

  assert.equal(result.run.outcome, 'COMPLETE');
  assert.equal(result.run.items.length, 1);
  assert.equal(result.run.items[0].status, 'ANALYZED');
  assert.equal(result.run.items[0].marketObservationId, first.id);
  assert.ok(result.run.items[0].derivedMarketInterpretationId);
  assert.ok(result.run.items[0].marketJobProjectionId);
  assert.ok(result.run.items[0].jobSnapshotId);
  assert.ok(result.run.items[0].opportunityAssessmentId);
  assert.equal(dependencies.opportunityHistoryRepository.state?.assessments.length, 1);
  assert.equal(result.run.opportunitySpace.status, 'INSUFFICIENT_SUCCESSFUL_ASSESSMENTS');
  assert.equal(result.opportunitySpace, undefined);
});

test('one selected item can fail projection without rolling back an earlier durable assessment', async () => {
  const valid = providerObservation({
    jobId: '502',
    roleTitle: 'Backend Engineer',
    description: validDescription,
    location: 'Lima, Peru',
    observedAt: '2026-08-17T11:00:00.000Z',
  });
  const projectionFailure = providerObservation({
    jobId: '503',
    roleTitle: 'Backend Engineer',
    observedAt: '2026-08-17T10:00:00.000Z',
  });
  const { truth, target, dependencies } = await fixture([valid, projectionFailure]);
  const result = await analyzeSelectedMarketCandidates({
    candidate: truth.candidateProfile,
    sources: truth.sources,
    evidence: truth.evidence,
    assertions: truth.assertions,
    candidateSnapshotSha256: 'b'.repeat(64),
    target,
    generatedAt: '2026-08-17T12:00:00.000Z',
  }, dependencies);

  assert.equal(result.run.outcome, 'PARTIAL_SUCCESS');
  assert.equal(result.run.summary.analyzedCount, 1);
  assert.equal(result.run.summary.failedCount, 1);
  assert.equal(result.run.items[0].status, 'ANALYZED');
  assert.equal(result.run.items[1].status, 'FAILED');
  assert.equal(result.run.items[1].failedStage, 'PROJECTION');
  assert.equal(result.run.items[1].failureCode, 'PROJECTION_FAILED');
  assert.equal(dependencies.opportunityHistoryRepository.state?.assessments.length, 1);
  assert.equal(dependencies.targetRepository.state?.opportunityEvaluations.length, 1);
  assert.equal(result.run.opportunitySpace.status, 'INSUFFICIENT_SUCCESSFUL_ASSESSMENTS');
  assert.doesNotMatch(JSON.stringify(result.run.items[1]), /CLOSED/);
});

test('two successful selected analyses compose and durably persist OpportunitySpace from exact assessments', async () => {
  const first = providerObservation({
    jobId: '504',
    roleTitle: 'Backend Engineer',
    description: validDescription,
    location: 'Lima, Peru',
    observedAt: '2026-08-17T11:00:00.000Z',
  });
  const second = providerObservation({
    jobId: '505',
    roleTitle: 'Backend Platform Engineer',
    description: 'Requirements:\n- TypeScript required\n- Node.js required\n- Cloud experience preferred',
    location: 'Lima, Peru',
    observedAt: '2026-08-17T10:30:00.000Z',
  });
  const { truth, target, dependencies } = await fixture([first, second]);
  const result = await analyzeSelectedMarketCandidates({
    candidate: truth.candidateProfile,
    sources: truth.sources,
    evidence: truth.evidence,
    assertions: truth.assertions,
    candidateSnapshotSha256: 'c'.repeat(64),
    target,
    generatedAt: '2026-08-17T12:00:00.000Z',
  }, dependencies);

  assert.equal(result.run.outcome, 'COMPLETE');
  assert.equal(result.run.summary.analyzedCount, 2);
  assert.equal(result.run.opportunitySpace.status, 'DURABLE');
  assert.ok(result.opportunitySpace);
  assert.equal(result.opportunitySpace?.entries.length, 2);
  assert.equal(dependencies.opportunityHistoryRepository.state?.assessments.length, 2);
  assert.equal(dependencies.targetRepository.state?.opportunityEvaluations.length, 2);
  assert.equal(dependencies.opportunitySpaceRepository.state?.spaces.length, 1);
  assert.equal(dependencies.opportunitySpaceRepository.state?.spaces[0].id, result.opportunitySpace?.id);
});

test('M4B-11 run identity excludes wall-clock generation time when semantic artifacts and outcomes do not change', async () => {
  const observation = providerObservation({
    jobId: '506',
    roleTitle: 'Backend Engineer',
    description: validDescription,
    location: 'Lima, Peru',
  });
  const firstFixture = await fixture([observation]);
  const secondFixture = await fixture([observation]);
  const input = {
    candidate: firstFixture.truth.candidateProfile,
    sources: firstFixture.truth.sources,
    evidence: firstFixture.truth.evidence,
    assertions: firstFixture.truth.assertions,
    candidateSnapshotSha256: 'd'.repeat(64),
    target: firstFixture.target,
  } as const;
  const first = await analyzeSelectedMarketCandidates({
    ...input,
    generatedAt: '2026-08-17T12:00:00.000Z',
  }, firstFixture.dependencies);
  const second = await analyzeSelectedMarketCandidates({
    ...input,
    generatedAt: '2026-08-17T13:00:00.000Z',
  }, secondFixture.dependencies);

  assert.equal(first.run.id, second.run.id);
  assert.equal(first.run.contentSha256, second.run.contentSha256);
});

test('deep-analysis workload is bounded by server policy and not by retrieval volume', async () => {
  const observations = Array.from({ length: MARKET_CANDIDATE_ANALYSIS_MAX_DEEP_ANALYSIS + 3 }, (_, index) => providerObservation({
    jobId: String(600 + index),
    roleTitle: 'Backend Engineer',
    description: validDescription,
    location: 'Lima, Peru',
  }));
  const { truth, target, dependencies } = await fixture(observations);
  const result = await analyzeSelectedMarketCandidates({
    candidate: truth.candidateProfile,
    sources: truth.sources,
    evidence: truth.evidence,
    assertions: truth.assertions,
    candidateSnapshotSha256: 'e'.repeat(64),
    target,
    generatedAt: '2026-08-17T12:00:00.000Z',
  }, dependencies);

  assert.equal(result.run.summary.attemptedCount, MARKET_CANDIDATE_ANALYSIS_MAX_DEEP_ANALYSIS);
  assert.equal(result.run.summary.maxDeepAnalysis, MARKET_CANDIDATE_ANALYSIS_MAX_DEEP_ANALYSIS);
});

test('service reuses M4B-04, M4B-05, M4B-06 and M4A authorities instead of creating a second matcher or parser', () => {
  const service = source('lib/application/market/MarketCandidateAnalysisService.ts');
  assert.match(service, /interpretMarketObservation\(/);
  assert.match(service, /projectDurableMarketObservationToJobIntelligence\(/);
  assert.match(service, /assessDurableMarketJobSnapshot\(/);
  assert.match(service, /buildOpportunitySpace\(/);
  assert.match(service, /recordTargetOpportunityEvaluation\(/);
  assert.match(service, /registerDurableMarketOpportunityLifecycle\(/);
  assert.doesNotMatch(service, /matchJobToCandidate\s*\(/);
  assert.doesNotMatch(service, /analyzeJobDescription\s*\(/);
  assert.doesNotMatch(service, /generateResume\s*\(/);
});

test('public M4B-11 route keeps target, selected observations, budgets, lifecycle, JobSnapshot and scores server-owned', () => {
  const route = source('app/api/market-candidate-analysis/route.ts');
  assert.match(route, /careerVaultId/);
  assert.match(route, /targetRepository\.load/);
  assert.match(route, /analyzeSelectedMarketCandidates\(/);
  assert.match(route, /rateLimitPublicApiRequest\(request\.headers, 'market-candidate-analysis'\)/);
  assert.doesNotMatch(route, /careerTarget:\s*z\./);
  assert.doesNotMatch(route, /marketObservationIds:\s*z\./);
  assert.doesNotMatch(route, /marketCandidateSetId:\s*z\./);
  assert.doesNotMatch(route, /maxDeepAnalysis:\s*z\./);
  assert.doesNotMatch(route, /jobSnapshotId:\s*z\./);
  assert.doesNotMatch(route, /lifecycle:\s*z\./);
  assert.doesNotMatch(route, /score:\s*z\./);
});
