import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ResumeRequest } from '../../lib/schemas';
import { buildLegacyTruthContext } from '../../lib/application/legacy/LegacyResumeAdapter';
import { analyzeJobDescription } from '../../lib/application/job/JobIntelligenceEngine';
import { matchJobToCandidate } from '../../lib/application/matching/JobMatchEngine';
import { toExplainableJobMatch } from '../../lib/application/product/ExplainableJobMatchMapper';
import { assessOpportunity } from '../../lib/application/opportunity/OpportunityAssessment';
import { deriveCareerVaultIdentity } from '../../lib/application/career-vault/CareerVaultIdentity';
import {
  buildOpportunityHistoryArtifacts,
  OpportunityHistoryIntegrityError,
  persistOpportunityAssessmentHistory,
  type OpportunityHistoryRepository,
  type OpportunityHistorySnapshot,
  type PersistOpportunityHistoryInput,
} from '../../lib/application/opportunity/OpportunityHistory';
import type { CandidateProfileId } from '../../lib/domain';

const VAULT_ID = '123e4567-e89b-42d3-a456-426614174000';

class MemoryOpportunityHistoryRepository implements OpportunityHistoryRepository {
  snapshot: OpportunityHistorySnapshot | null = null;

  async load(candidateProfileId: CandidateProfileId): Promise<OpportunityHistorySnapshot | null> {
    if (!this.snapshot || this.snapshot.candidateProfileId !== candidateProfileId) return null;
    return structuredClone(this.snapshot);
  }

  async save(snapshot: OpportunityHistorySnapshot): Promise<void> {
    this.snapshot = structuredClone(snapshot);
  }
}

function candidate(overrides: Partial<ResumeRequest> = {}): ResumeRequest {
  return {
    personalInfo: {
      fullName: 'Jane Candidate',
      location: 'Lima, Peru',
      email: 'jane@example.com',
      linkedin: 'https://linkedin.com/in/jane-candidate',
      github: 'https://github.com/jane-candidate',
    },
    summary: 'Backend engineer focused on reliable APIs and data services.',
    experience: [{
      company: 'Example Co',
      role: 'Backend Engineer',
      startDate: 'Jan 2023',
      endDate: 'Present',
      description: 'Designed and maintained REST APIs and Node.js services for production systems.',
      technologies: ['TypeScript', 'Node.js'],
    }],
    education: [{
      institution: 'Example University',
      degree: 'Computer Science',
      startDate: '2019',
      endDate: '2023',
    }],
    skills: {
      hardSkills: ['TypeScript', 'Node.js'],
      softSkills: ['Collaboration'],
    },
    projects: [],
    certifications: [],
    languages: [{ language: 'English', proficiency: 'Professional' }],
    jobDescription: [
      'Backend Engineer',
      'Requirements:',
      'TypeScript is required.',
      'Node.js is required.',
      'AWS experience is preferred.',
      'Responsibilities include designing REST APIs.',
    ].join('\n'),
    ...overrides,
  };
}

function historyInput(
  data: ResumeRequest,
  repository: OpportunityHistoryRepository,
  capturedAt: string,
): PersistOpportunityHistoryInput {
  const identity = deriveCareerVaultIdentity(data, VAULT_ID);
  const truth = buildLegacyTruthContext(data, {
    projectionKey: identity.candidateProjectionKey,
    candidateProfileId: identity.candidateProfileId,
    capturedAt,
    truthClass: 'CANDIDATE_ASSERTED',
  });
  const job = analyzeJobDescription(data.jobDescription ?? '', {
    projectionKey: identity.jobProjectionKey!,
    capturedAt,
  });
  const match = matchJobToCandidate(job, truth.assertions, {
    projectionKey: identity.matchProjectionKey!,
    generatedAt: capturedAt,
  });
  const assessment = assessOpportunity(toExplainableJobMatch(match, job, truth.assertions));

  return {
    repository,
    candidate: truth.candidateProfile,
    sources: truth.sources,
    evidence: truth.evidence,
    assertions: truth.assertions,
    jobIntelligence: job,
    jobMatch: match,
    assessment,
    capturedAt,
  };
}

test('same semantic career and job create stable content-addressed snapshot and assessment identities', () => {
  const repository = new MemoryOpportunityHistoryRepository();
  const first = buildOpportunityHistoryArtifacts(historyInput(candidate(), repository, '2026-08-12T10:00:00.000Z'));
  const second = buildOpportunityHistoryArtifacts(historyInput(candidate(), repository, '2026-08-12T11:00:00.000Z'));

  assert.equal(second.careerSnapshot.id, first.careerSnapshot.id);
  assert.equal(second.jobSnapshot.id, first.jobSnapshot.id);
  assert.equal(second.assessmentRecord.id, first.assessmentRecord.id);
  assert.equal(second.careerSnapshot.contentSha256, first.careerSnapshot.contentSha256);
  assert.equal(second.jobSnapshot.contentSha256, first.jobSnapshot.contentSha256);
});

test('reassessing unchanged semantic inputs is idempotent and does not duplicate history', async () => {
  const repository = new MemoryOpportunityHistoryRepository();
  const first = await persistOpportunityAssessmentHistory(
    historyInput(candidate(), repository, '2026-08-12T10:00:00.000Z'),
  );
  const second = await persistOpportunityAssessmentHistory(
    historyInput(candidate(), repository, '2026-08-12T11:00:00.000Z'),
  );

  assert.equal(first.revision, 1);
  assert.equal(second.revision, 1);
  assert.equal(second.careerSnapshots.length, 1);
  assert.equal(second.jobSnapshots.length, 1);
  assert.equal(second.assessments.length, 1);
});

test('career evolution creates a new CareerSnapshot while preserving the prior assessment', async () => {
  const repository = new MemoryOpportunityHistoryRepository();
  const first = await persistOpportunityAssessmentHistory(
    historyInput(candidate(), repository, '2026-08-12T10:00:00.000Z'),
  );
  const evolved = candidate({
    summary: 'Backend engineer with AWS production experience and reliable API delivery.',
    skills: {
      hardSkills: ['TypeScript', 'Node.js', 'AWS'],
      softSkills: ['Collaboration'],
    },
  });
  const second = await persistOpportunityAssessmentHistory(
    historyInput(evolved, repository, '2026-09-12T10:00:00.000Z'),
  );

  assert.equal(first.careerSnapshots.length, 1);
  assert.equal(second.careerSnapshots.length, 2);
  assert.equal(second.jobSnapshots.length, 1);
  assert.equal(second.assessments.length, 2);
  assert.equal(second.revision, 2);
  assert.notEqual(second.assessments[0].careerSnapshotId, second.assessments[1].careerSnapshotId);
  assert.equal(second.assessments[0].jobSnapshotId, second.assessments[1].jobSnapshotId);
});

test('job change creates a new JobSnapshot without rewriting historical market truth', async () => {
  const repository = new MemoryOpportunityHistoryRepository();
  await persistOpportunityAssessmentHistory(
    historyInput(candidate(), repository, '2026-08-12T10:00:00.000Z'),
  );
  const changedJob = candidate({
    jobDescription: [
      'Platform Engineer',
      'Requirements:',
      'TypeScript is required.',
      'Kubernetes is required.',
      'Terraform is preferred.',
    ].join('\n'),
  });
  const second = await persistOpportunityAssessmentHistory(
    historyInput(changedJob, repository, '2026-08-13T10:00:00.000Z'),
  );

  assert.equal(second.careerSnapshots.length, 1);
  assert.equal(second.jobSnapshots.length, 2);
  assert.equal(second.assessments.length, 2);
  assert.notEqual(second.assessments[0].jobSnapshotId, second.assessments[1].jobSnapshotId);
});

test('tampered historical snapshot is rejected before another assessment can be appended', async () => {
  const repository = new MemoryOpportunityHistoryRepository();
  await persistOpportunityAssessmentHistory(
    historyInput(candidate(), repository, '2026-08-12T10:00:00.000Z'),
  );

  const current = repository.snapshot!;
  repository.snapshot = {
    ...current,
    careerSnapshots: current.careerSnapshots.map((snapshot, index) => index === 0
      ? { ...snapshot, contentSha256: '0'.repeat(64) }
      : snapshot),
  };

  await assert.rejects(
    () => persistOpportunityAssessmentHistory(
      historyInput(candidate(), repository, '2026-08-12T11:00:00.000Z'),
    ),
    OpportunityHistoryIntegrityError,
  );
});
