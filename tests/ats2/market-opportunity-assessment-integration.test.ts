import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  domainId,
  type CandidateProfileId,
  type JobSnapshotId,
} from '../../lib/domain';
import { buildLegacyTruthContext } from '../../lib/application/legacy/LegacyResumeAdapter';
import { deriveMarketInterpretation } from '../../lib/application/market/DerivedMarketInterpretationService';
import {
  persistMarketJobProjection,
  type MarketJobProjectionHistoryRepository,
  type MarketJobProjectionHistorySnapshot,
} from '../../lib/application/market/MarketJobProjectionHistory';
import { createMarketObservation } from '../../lib/application/market/MarketObservationService';
import { projectMarketToJobIntelligence } from '../../lib/application/market/MarketJobProjectionService';
import {
  MarketAssessmentJobSnapshotNotFoundError,
  assessDurableMarketJobSnapshot,
} from '../../lib/application/opportunity/MarketOpportunityAssessmentRuntime';
import { assessMarketJobSnapshot } from '../../lib/application/opportunity/MarketOpportunityAssessmentService';
import {
  buildOpportunityHistoryArtifactsFromJobSnapshot,
  type OpportunityHistoryRepository,
  type OpportunityHistorySnapshot,
} from '../../lib/application/opportunity/OpportunityHistory';
import type { ResumeRequest } from '../../lib/schemas';

class MemoryProjectionHistoryRepository implements MarketJobProjectionHistoryRepository {
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

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

function candidateData(): ResumeRequest {
  return {
    personalInfo: {
      fullName: 'Market Candidate',
      location: 'Lima, Peru',
      email: 'candidate@example.com',
      linkedin: '',
      github: '',
    },
    summary: 'Software developer focused on reliable TypeScript and cloud systems.',
    experience: [{
      company: 'Example Systems',
      role: 'Software Developer',
      startDate: '2021',
      endDate: '2026',
      description: 'Built production services and internal tooling for business workflows.',
      technologies: ['TypeScript', 'AWS', 'Node.js'],
    }],
    education: [{
      institution: 'Example University',
      degree: 'Bachelor of Systems Engineering',
      startDate: '2017',
      endDate: '2021',
    }],
    skills: {
      hardSkills: ['TypeScript', 'AWS', 'Node.js'],
      softSkills: ['Communication'],
    },
    projects: [],
    certifications: [],
    languages: [{ language: 'English', proficiency: 'Advanced' }],
  };
}

function candidateTruth(capturedAt = '2026-08-16T15:00:00.000Z') {
  return buildLegacyTruthContext(candidateData(), {
    projectionKey: 'market-assessment-candidate',
    candidateProfileId: domainId('CandidateProfile', 'candidate:market-assessment'),
    capturedAt,
    truthClass: 'CANDIDATE_ASSERTED',
  });
}

function marketProjection() {
  const observation = createMarketObservation({
    source: { type: 'MANUAL_STRUCTURED', label: 'M4B-06 fixture' },
    payload: {
      format: 'TEXT',
      content: 'Requirements:\n- 3 years TypeScript required\n- AWS preferred',
    },
    provenance: { captureMethod: 'USER_SUPPLIED_TEXT' },
    observedAt: '2026-08-16T14:00:00.000Z',
  });
  const interpretation = deriveMarketInterpretation(observation, {
    generatedAt: '2026-08-16T14:01:00.000Z',
  });
  return projectMarketToJobIntelligence(observation, interpretation, {
    projectedAt: '2026-08-16T14:02:00.000Z',
  });
}

async function durableProjectionRepository() {
  const repository = new MemoryProjectionHistoryRepository();
  const projected = marketProjection();
  await persistMarketJobProjection({
    projection: projected.projection,
    jobSnapshot: projected.jobSnapshot,
    repository,
  });
  return { repository, projected };
}

test('M4B-06 assesses the exact M4B-05 JobSnapshot without regenerating job truth', () => {
  const truth = candidateTruth();
  const projected = marketProjection();
  const assertionsBefore = truth.assertions.map((item) => ({ ...item }));
  const result = assessMarketJobSnapshot({
    jobSnapshot: projected.jobSnapshot,
    assertions: truth.assertions,
    candidateSnapshotSha256: 'a'.repeat(64),
    assessedAt: '2026-08-16T15:00:00.000Z',
  });

  assert.strictEqual(result.jobSnapshot, projected.jobSnapshot);
  assert.strictEqual(result.jobMatch.requirements, projected.jobSnapshot.requirements);
  assert.equal(result.jobMatch.report.jobDescriptionId, projected.jobSnapshot.jobDescription.id);
  assert.equal(result.assessment.jobMatchScore, result.jobMatch.score);
  assert.deepEqual(truth.assertions, assertionsBefore);
  assert.equal(
    result.scopeBoundary,
    'PREBUILT_MARKET_JOB_SNAPSHOT_TO_ASSESSMENT_NO_REPARSING_OR_CANDIDATE_TRUTH_MUTATION',
  );
});

test('M4B-06 durable runtime preserves exact JobSnapshot identity through OpportunityHistory', async () => {
  const truth = candidateTruth();
  const { repository: marketProjectionRepository, projected } = await durableProjectionRepository();
  const opportunityHistoryRepository = new MemoryOpportunityHistoryRepository();

  const result = await assessDurableMarketJobSnapshot(
    {
      candidate: truth.candidateProfile,
      sources: truth.sources,
      evidence: truth.evidence,
      assertions: truth.assertions,
      candidateSnapshotSha256: 'b'.repeat(64),
      jobSnapshotId: projected.jobSnapshot.id,
      capturedAt: '2026-08-16T15:00:00.000Z',
    },
    { marketProjectionRepository, opportunityHistoryRepository },
  );

  assert.strictEqual(result.jobSnapshot, projected.jobSnapshot);
  assert.strictEqual(result.artifacts.jobSnapshot, projected.jobSnapshot);
  assert.equal(result.artifacts.assessmentRecord.jobSnapshotId, projected.jobSnapshot.id);
  assert.equal(result.history.jobSnapshots.length, 1);
  assert.equal(result.history.jobSnapshots[0].id, projected.jobSnapshot.id);
  assert.equal(result.history.jobSnapshots[0].contentSha256, projected.jobSnapshot.contentSha256);
  assert.deepEqual(result.history.jobSnapshots[0].marketProvenance, projected.jobSnapshot.marketProvenance);
  assert.equal(result.persistence, 'DURABLE_MARKET_JOB_SNAPSHOT_OPPORTUNITY_HISTORY_M4B_06');
});

test('same CareerSnapshot + exact market JobSnapshot assessment is history-idempotent across runtime timestamps', async () => {
  const truth = candidateTruth();
  const { repository: marketProjectionRepository, projected } = await durableProjectionRepository();
  const opportunityHistoryRepository = new MemoryOpportunityHistoryRepository();

  const first = await assessDurableMarketJobSnapshot(
    {
      candidate: truth.candidateProfile,
      sources: truth.sources,
      evidence: truth.evidence,
      assertions: truth.assertions,
      candidateSnapshotSha256: 'c'.repeat(64),
      jobSnapshotId: projected.jobSnapshot.id,
      capturedAt: '2026-08-16T15:00:00.000Z',
    },
    { marketProjectionRepository, opportunityHistoryRepository },
  );
  const repeated = await assessDurableMarketJobSnapshot(
    {
      candidate: truth.candidateProfile,
      sources: truth.sources,
      evidence: truth.evidence,
      assertions: truth.assertions,
      candidateSnapshotSha256: 'c'.repeat(64),
      jobSnapshotId: projected.jobSnapshot.id,
      capturedAt: '2026-08-16T16:00:00.000Z',
    },
    { marketProjectionRepository, opportunityHistoryRepository },
  );

  assert.equal(first.artifacts.careerSnapshot.id, repeated.artifacts.careerSnapshot.id);
  assert.equal(first.artifacts.jobSnapshot.id, repeated.artifacts.jobSnapshot.id);
  assert.equal(first.artifacts.assessmentRecord.id, repeated.artifacts.assessmentRecord.id);
  assert.equal(repeated.history.revision, 1);
  assert.equal(repeated.history.assessments.length, 1);
});

test('M4B-06 refuses a Job Match whose requirements differ from the stored JobSnapshot', () => {
  const truth = candidateTruth();
  const projected = marketProjection();
  const assessed = assessMarketJobSnapshot({
    jobSnapshot: projected.jobSnapshot,
    assertions: truth.assertions,
    candidateSnapshotSha256: 'd'.repeat(64),
  });
  const mismatched = {
    ...assessed.jobMatch,
    requirements: assessed.jobMatch.requirements.slice(1),
  };

  assert.throws(
    () => buildOpportunityHistoryArtifactsFromJobSnapshot({
      candidate: truth.candidateProfile,
      sources: truth.sources,
      evidence: truth.evidence,
      assertions: truth.assertions,
      jobSnapshot: projected.jobSnapshot,
      jobMatch: mismatched,
      assessment: assessed.assessment,
      capturedAt: '2026-08-16T15:00:00.000Z',
    }),
    /requirements differ from the exact prebuilt market JobSnapshot/,
  );
});

test('M4B-06 rejects a requested JobSnapshot id that is absent from durable projection history', async () => {
  const truth = candidateTruth();
  const { repository: marketProjectionRepository } = await durableProjectionRepository();
  const opportunityHistoryRepository = new MemoryOpportunityHistoryRepository();
  const unknown = 'job-snapshot:00000000000000000000000000000000' as JobSnapshotId;

  await assert.rejects(
    assessDurableMarketJobSnapshot(
      {
        candidate: truth.candidateProfile,
        sources: truth.sources,
        evidence: truth.evidence,
        assertions: truth.assertions,
        candidateSnapshotSha256: 'e'.repeat(64),
        jobSnapshotId: unknown,
      },
      { marketProjectionRepository, opportunityHistoryRepository },
    ),
    (error: unknown) => error instanceof MarketAssessmentJobSnapshotNotFoundError
      && error.jobSnapshotId === unknown,
  );
});

test('tampered market JobSnapshot history fails before assessment can be persisted', async () => {
  const truth = candidateTruth();
  const { repository: marketProjectionRepository, projected } = await durableProjectionRepository();
  const opportunityHistoryRepository = new MemoryOpportunityHistoryRepository();
  marketProjectionRepository.state = {
    ...marketProjectionRepository.state!,
    records: [{
      projection: projected.projection,
      jobSnapshot: {
        ...projected.jobSnapshot,
        jobDescription: {
          ...projected.jobSnapshot.jobDescription,
          sourceText: `${projected.jobSnapshot.jobDescription.sourceText}\nMust have Kubernetes`,
        },
      },
    }],
  };

  await assert.rejects(
    assessDurableMarketJobSnapshot(
      {
        candidate: truth.candidateProfile,
        sources: truth.sources,
        evidence: truth.evidence,
        assertions: truth.assertions,
        candidateSnapshotSha256: 'f'.repeat(64),
        jobSnapshotId: projected.jobSnapshot.id,
      },
      { marketProjectionRepository, opportunityHistoryRepository },
    ),
    /content hash mismatch|sourceText differs from the authorized projection text/,
  );
  assert.equal(opportunityHistoryRepository.state, null);
});

test('M4B-06 service and runtime never invoke Job Intelligence parsing', () => {
  const service = source('lib/application/opportunity/MarketOpportunityAssessmentService.ts');
  const runtime = source('lib/application/opportunity/MarketOpportunityAssessmentRuntime.ts');
  const combined = `${service}\n${runtime}`;

  assert.doesNotMatch(combined, /analyzeJobDescription\s*\(/);
  assert.doesNotMatch(combined, /createJobRequirement\s*\(/);
  assert.match(service, /jobSnapshot\.requirements/);
  assert.match(runtime, /jobSnapshotId/);
});

test('public market assessment route selects exact JobSnapshot and has no job-description override', () => {
  const route = source('app/api/assess-market-opportunity/route.ts');
  const sizeAt = route.indexOf("request.headers.get('content-length')");
  const rateAt = route.indexOf("rateLimitPublicApiRequest(request.headers, 'assess-market-opportunity')");
  const jsonAt = route.indexOf('await request.json()');
  const assessAt = route.indexOf('await assessDurableMarketJobSnapshot');

  assert.ok(sizeAt >= 0 && rateAt >= 0 && jsonAt >= 0 && assessAt >= 0);
  assert.ok(sizeAt < rateAt && rateAt < jsonAt && jsonAt < assessAt);
  assert.match(route, /\.omit\(\{ jobDescription: true \}\)/);
  assert.match(route, /jobSnapshotId:/);
  assert.doesNotMatch(route, /analyzeJobDescription\s*\(/);
  assert.doesNotMatch(route, /requirements:\s*z\./);
  assert.doesNotMatch(route, /sourceText:\s*z\./);
  assert.doesNotMatch(route, /marketObservationId:\s*z\./);
});
