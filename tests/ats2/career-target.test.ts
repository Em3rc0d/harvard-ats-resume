import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ResumeRequest } from '../../lib/schemas';
import { buildLegacyTruthContext } from '../../lib/application/legacy/LegacyResumeAdapter';
import { analyzeJobDescription } from '../../lib/application/job/JobIntelligenceEngine';
import { matchJobToCandidate } from '../../lib/application/matching/JobMatchEngine';
import { deriveCareerVaultIdentity } from '../../lib/application/career-vault/CareerVaultIdentity';
import {
  assessCareerTargetRelevance,
  createCareerTarget,
} from '../../lib/application/target/CareerTargetService';
import {
  persistCareerTarget,
  recordTargetOpportunityEvaluation,
  type CareerTargetPortfolio,
  type CareerTargetRepository,
} from '../../lib/application/target/CareerTargetPortfolio';
import { domainId, type CandidateProfileId } from '../../lib/domain';

const VAULT_ID = '123e4567-e89b-42d3-a456-426614174000';

class MemoryTargetRepository implements CareerTargetRepository {
  snapshot: CareerTargetPortfolio | null = null;

  async load(candidateProfileId: CandidateProfileId): Promise<CareerTargetPortfolio | null> {
    if (!this.snapshot || this.snapshot.candidateProfileId !== candidateProfileId) return null;
    return structuredClone(this.snapshot);
  }

  async save(portfolio: CareerTargetPortfolio): Promise<void> {
    this.snapshot = structuredClone(portfolio);
  }
}

function candidate(): ResumeRequest {
  return {
    personalInfo: {
      fullName: 'Jane Candidate',
      location: 'Lima, Peru',
      email: 'jane@example.com',
      linkedin: 'https://linkedin.com/in/jane-candidate',
      github: 'https://github.com/jane-candidate',
    },
    summary: 'Backend engineer focused on reliable APIs and services.',
    experience: [{
      company: 'Example Co',
      role: 'Backend Engineer',
      startDate: 'Jan 2023',
      endDate: 'Present',
      description: 'Designed REST APIs and Node.js services for production systems.',
      technologies: ['TypeScript', 'Node.js'],
    }],
    education: [{ institution: 'Example University', degree: 'Computer Science', startDate: '2019', endDate: '2023' }],
    skills: { hardSkills: ['TypeScript', 'Node.js'], softSkills: [] },
    projects: [], certifications: [], languages: [],
    jobDescription: [
      'Senior Backend Engineer — Lima, Peru — Hybrid — Full-time',
      'Requirements:',
      'TypeScript is required.',
      'Node.js is required.',
      'AWS is preferred.',
    ].join('\n'),
  };
}

test('CareerTarget identity is stable across timestamps and remains separate from candidate evidence', () => {
  const data = candidate();
  const identity = deriveCareerVaultIdentity(data, VAULT_ID);
  const first = createCareerTarget(identity.candidateProfileId, {
    roleTitle: 'Senior Backend Engineer',
    preferredSeniority: 'SENIOR',
    preferredLocations: ['Lima, Peru'],
    workModels: ['HYBRID'],
  }, '2026-08-12T10:00:00.000Z');
  const second = createCareerTarget(identity.candidateProfileId, {
    roleTitle: 'Senior Backend Engineer',
    preferredSeniority: 'SENIOR',
    preferredLocations: ['Lima, Peru'],
    workModels: ['HYBRID'],
  }, '2026-08-13T10:00:00.000Z');

  assert.equal(second.id, first.id);
  assert.equal(second.contentSha256, first.contentSha256);
  assert.notEqual(second.createdAt, first.createdAt);
  assert.equal('evidenceIds' in first, false);
  assert.equal('assertions' in first, false);
});

test('target relevance can change while evidence-backed Job Match remains identical', () => {
  const data = candidate();
  const identity = deriveCareerVaultIdentity(data, VAULT_ID);
  const truth = buildLegacyTruthContext(data, {
    projectionKey: identity.candidateProjectionKey,
    candidateProfileId: identity.candidateProfileId,
    capturedAt: '2026-08-12T10:00:00.000Z',
    truthClass: 'CANDIDATE_ASSERTED',
  });
  const job = analyzeJobDescription(data.jobDescription ?? '', {
    projectionKey: identity.jobProjectionKey!,
    capturedAt: '2026-08-12T10:00:00.000Z',
  });
  const matchBefore = matchJobToCandidate(job, truth.assertions, {
    projectionKey: identity.matchProjectionKey!,
    generatedAt: '2026-08-12T10:00:00.000Z',
  });

  const aligned = createCareerTarget(identity.candidateProfileId, {
    roleTitle: 'Senior Backend Engineer', preferredSeniority: 'SENIOR', workModels: ['HYBRID'],
  });
  const conflicting = createCareerTarget(identity.candidateProfileId, {
    roleTitle: 'Frontend Engineer', preferredSeniority: 'JUNIOR', workModels: ['REMOTE'],
  });
  const alignedRelevance = assessCareerTargetRelevance(aligned, data.jobDescription ?? '');
  const conflictingRelevance = assessCareerTargetRelevance(conflicting, data.jobDescription ?? '');
  const matchAfter = matchJobToCandidate(job, truth.assertions, {
    projectionKey: identity.matchProjectionKey!,
    generatedAt: '2026-08-13T10:00:00.000Z',
  });

  assert.equal(alignedRelevance.level, 'HIGH');
  assert.equal(conflictingRelevance.level, 'LOW');
  assert.equal(alignedRelevance.scopeBoundary, 'PREFERENCE_ALIGNMENT_NOT_CAPABILITY_EVIDENCE');
  assert.equal(matchAfter.score, matchBefore.score);
  assert.deepEqual(matchAfter.breakdown, matchBefore.breakdown);
});

test('CareerTarget portfolio preserves multiple directions and switches active target without overwriting history', async () => {
  const repository = new MemoryTargetRepository();
  const identity = deriveCareerVaultIdentity(candidate(), VAULT_ID);
  const backend = createCareerTarget(identity.candidateProfileId, { roleTitle: 'Senior Backend Engineer' });
  const architect = createCareerTarget(identity.candidateProfileId, { roleTitle: 'Software Architect' });

  const first = await persistCareerTarget(repository, backend, '2026-08-12T10:00:00.000Z');
  const second = await persistCareerTarget(repository, architect, '2026-08-13T10:00:00.000Z');

  assert.equal(first.targets.length, 1);
  assert.equal(second.targets.length, 2);
  assert.equal(second.activeTargetId, architect.id);
  assert.ok(second.targets.some((target) => target.id === backend.id));
  assert.ok(second.targets.some((target) => target.id === architect.id));
});

test('target-to-assessment relevance link is durable and idempotent', async () => {
  const repository = new MemoryTargetRepository();
  const data = candidate();
  const identity = deriveCareerVaultIdentity(data, VAULT_ID);
  const target = createCareerTarget(identity.candidateProfileId, {
    roleTitle: 'Senior Backend Engineer', preferredSeniority: 'SENIOR', workModels: ['HYBRID'],
  });
  const relevance = assessCareerTargetRelevance(target, data.jobDescription ?? '');
  await persistCareerTarget(repository, target, '2026-08-12T10:00:00.000Z');
  const assessmentId = domainId('OpportunityAssessment', 'opportunity-assessment:test-target-link');

  const linked = await recordTargetOpportunityEvaluation(repository, target, assessmentId, relevance, '2026-08-12T10:01:00.000Z');
  const repeated = await recordTargetOpportunityEvaluation(repository, target, assessmentId, relevance, '2026-08-12T11:00:00.000Z');

  assert.equal(linked.opportunityEvaluations.length, 1);
  assert.equal(repeated.opportunityEvaluations.length, 1);
  assert.equal(repeated.revision, linked.revision);
  assert.equal(repeated.opportunityEvaluations[0].careerTargetId, target.id);
  assert.equal(repeated.opportunityEvaluations[0].opportunityAssessmentId, assessmentId);
});

test('targeted UX invalidates an assessment when CareerTarget changes and requires target-aware durability', () => {
  const targetStep = readFileSync(join(process.cwd(), 'components/TargetJobStep.tsx'), 'utf8');
  const route = readFileSync(join(process.cwd(), 'app/api/assess-opportunity/route.ts'), 'utf8');

  assert.match(targetStep, /assessedTargetKey === targetKey/);
  assert.match(targetStep, /const targetSnapshot =/);
  assert.match(targetStep, /careerTarget:\s*targetSnapshot/);
  assert.match(targetStep, /const jobSnapshot = normalizedJobDescription/);
  assert.match(targetStep, /change\(\);\s*invalidateAssessment\(\)/);
  assert.match(targetStep, /!result\.data\.careerTarget\?\.relevance/);
  assert.match(route, /TARGET_PREFERENCE_DOES_NOT_CHANGE_JOB_MATCH/);
  assert.match(route, /recordTargetOpportunityEvaluation/);
});
