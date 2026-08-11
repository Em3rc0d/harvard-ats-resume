import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ResumeRequest } from '../../lib/schemas';
import { buildLegacyTruthContext } from '../../lib/application/legacy/LegacyResumeAdapter';
import { analyzeJobDescription } from '../../lib/application/job/JobIntelligenceEngine';
import { matchJobToCandidate } from '../../lib/application/matching/JobMatchEngine';
import { composeApprovedResumeVersion } from '../../lib/application/resume/ResumeCompositionService';
import { deriveCareerVaultIdentity } from '../../lib/application/career-vault/CareerVaultIdentity';
import {
  persistCareerVault,
  validateCareerVaultSnapshot,
} from '../../lib/application/career-vault/CareerVaultService';
import type {
  CareerVaultRepository,
  CareerVaultSnapshot,
} from '../../lib/application/career-vault/CareerVaultRepository';
import { createCareerVaultRepositoryFromEnv } from '../../lib/infrastructure/persistence/UpstashCareerVaultRepository';

const T0 = '2026-08-11T20:00:00.000Z';
const T1 = '2026-08-11T21:00:00.000Z';
const GENERATION = {
  provider: 'google-gemini',
  model: 'gemini-2.5-flash',
  contractVersion: 'ats2-structured-resume-v1',
} as const;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

class MemoryCareerVaultRepository implements CareerVaultRepository {
  private readonly snapshots = new Map<string, CareerVaultSnapshot>();
  failOnSave = false;
  saveCalls = 0;

  async load(candidateProfileId: CareerVaultSnapshot['candidate']['id']): Promise<CareerVaultSnapshot | null> {
    const snapshot = this.snapshots.get(candidateProfileId);
    return snapshot ? clone(snapshot) : null;
  }

  async save(snapshot: CareerVaultSnapshot): Promise<void> {
    this.saveCalls += 1;
    if (this.failOnSave) throw new Error('simulated durable-store failure');
    this.snapshots.set(snapshot.candidate.id, clone(snapshot));
  }
}

function resumeFixture(
  jobDescription = 'Requirements:\n- TypeScript\n- Docker',
  email = 'jane@example.com',
): ResumeRequest {
  return {
    personalInfo: {
      fullName: 'Jane Candidate',
      location: 'Lima, Peru',
      email,
      linkedin: '',
      github: '',
    },
    summary: 'Backend engineer focused on reliable APIs and TypeScript services.',
    experience: [
      {
        company: 'Acme',
        role: 'Backend Engineer',
        startDate: '2023',
        endDate: '2025',
        description: 'Built APIs with TypeScript for internal business workflows.',
        technologies: ['TypeScript', 'Docker'],
      },
    ],
    education: [
      {
        institution: 'Universidad Nacional',
        degree: 'Computer Science',
        startDate: '2018',
        endDate: '2022',
      },
    ],
    skills: {
      hardSkills: ['TypeScript', 'Docker'],
      softSkills: ['Collaboration'],
    },
    projects: [],
    certifications: [],
    languages: [{ language: 'Spanish', proficiency: 'Native' }],
    jobDescription,
  };
}

const FORMATTED_RESUME = `JANE CANDIDATE
Lima, Peru | jane@example.com

PROFESSIONAL SUMMARY
Backend engineer focused on reliable APIs and TypeScript services.

EXPERIENCE
ACME — BACKEND ENGINEER
2023 - 2025
• Built APIs with TypeScript for internal business workflows.

EDUCATION
Universidad Nacional
Computer Science, 2018 - 2022

SKILLS
Technical Skills: TypeScript, Docker
Soft Skills: Collaboration

LANGUAGES
Spanish: Native`;

function artifacts(data: ResumeRequest, capturedAt = T0) {
  const identity = deriveCareerVaultIdentity(data);
  const truth = buildLegacyTruthContext(data, {
    projectionKey: identity.candidateProjectionKey,
    candidateProfileId: identity.candidateProfileId,
    capturedAt,
  });
  const job = data.jobDescription?.trim()
    ? analyzeJobDescription(data.jobDescription, {
        projectionKey: identity.jobProjectionKey!,
        capturedAt,
      })
    : undefined;
  const match = job && job.requirements.length > 0
    ? matchJobToCandidate(job, truth.assertions, {
        projectionKey: identity.matchProjectionKey!,
        generatedAt: capturedAt,
      })
    : undefined;
  const composition = composeApprovedResumeVersion({
    formattedResume: FORMATTED_RESUME,
    candidateProfileId: truth.candidateProfile.id,
    assertions: truth.assertions,
    targetedJobDescriptionId: job?.jobDescription.id,
    targetJobDescription: job?.jobDescription.sourceText,
    matchReportId: match?.report.id,
    generation: GENERATION,
    createdAt: capturedAt,
  });

  return { identity, truth, job, match, composition };
}

async function persist(
  repository: CareerVaultRepository,
  data: ResumeRequest,
  capturedAt = T0,
) {
  const built = artifacts(data, capturedAt);
  const snapshot = await persistCareerVault({
    repository,
    candidate: built.truth.candidateProfile,
    sources: built.truth.sources,
    evidence: built.truth.evidence,
    assertions: built.truth.assertions,
    jobIntelligence: built.job,
    jobMatch: built.match,
    resumeComposition: built.composition,
    persistedAt: capturedAt,
  });
  return { ...built, snapshot };
}

test('Career Vault identity is stable across request time and target changes without exposing raw email', () => {
  const first = deriveCareerVaultIdentity(resumeFixture('Requirements:\n- Docker', 'Jane@Example.com'));
  const sameCandidateDifferentTarget = deriveCareerVaultIdentity(
    resumeFixture('Requirements:\n- PostgreSQL', 'jane@example.com'),
  );

  assert.equal(first.candidateProfileId, sameCandidateDifferentTarget.candidateProfileId);
  assert.equal(first.candidateProjectionKey, sameCandidateDifferentTarget.candidateProjectionKey);
  assert.notEqual(first.jobProjectionKey, sameCandidateDifferentTarget.jobProjectionKey);
  assert.equal(String(first.candidateProfileId).includes('jane@example.com'), false);
});

test('first durable save survives repository reload with complete candidate→job→resume provenance', async () => {
  const repository = new MemoryCareerVaultRepository();
  const { snapshot, identity } = await persist(
    repository,
    resumeFixture('Requirements:\n- TypeScript\n- Kubernetes'),
  );

  assert.equal(snapshot.revision, 1);
  assert.equal(snapshot.candidate.id, identity.candidateProfileId);
  assert.equal(snapshot.resumeVersions.length, 1);
  assert.equal(snapshot.resumeManifests.length, 1);
  assert.equal(snapshot.jobs.length, 1);
  assert.equal(snapshot.matchReports.length, 1);
  assert.ok(snapshot.assertions.length > 0);
  assert.equal(snapshot.assertions.some((item) => item.statement.includes('Kubernetes')), false);

  const reloaded = await repository.load(identity.candidateProfileId);
  assert.ok(reloaded);
  validateCareerVaultSnapshot(reloaded);
  assert.deepEqual(reloaded.resumeManifests, snapshot.resumeManifests);
});

test('repeating the same candidate/job/version increments revision without duplicating immutable history', async () => {
  const repository = new MemoryCareerVaultRepository();
  const first = await persist(repository, resumeFixture(), T0);
  const second = await persist(repository, resumeFixture(), T1);

  assert.equal(second.snapshot.revision, 2);
  assert.equal(second.snapshot.sources.length, first.snapshot.sources.length);
  assert.equal(second.snapshot.evidence.length, first.snapshot.evidence.length);
  assert.equal(second.snapshot.assertions.length, first.snapshot.assertions.length);
  assert.equal(second.snapshot.jobs.length, 1);
  assert.equal(second.snapshot.matchReports.length, 1);
  assert.equal(second.snapshot.resumeVersions.length, 1);
  assert.equal(second.snapshot.resumeManifests.length, 1);
  assert.equal(second.snapshot.createdAt, T0);
  assert.equal(second.snapshot.updatedAt, T1);
});

test('a different target Job Description creates separate durable job/match/version history', async () => {
  const repository = new MemoryCareerVaultRepository();
  const first = await persist(repository, resumeFixture('Requirements:\n- TypeScript\n- Docker'), T0);
  const second = await persist(repository, resumeFixture('Requirements:\n- TypeScript\n- PostgreSQL'), T1);

  assert.equal(first.identity.candidateProfileId, second.identity.candidateProfileId);
  assert.equal(first.identity.candidateProjectionKey, second.identity.candidateProjectionKey);
  assert.equal(second.snapshot.jobs.length, 2);
  assert.equal(second.snapshot.matchReports.length, 2);
  assert.equal(second.snapshot.resumeVersions.length, 2);
  assert.equal(second.snapshot.resumeManifests.length, 2);
});

test('invalid partial manifest is rejected before repository save', async () => {
  const repository = new MemoryCareerVaultRepository();
  const built = artifacts(resumeFixture());
  const firstEntry = built.composition.manifest.entries[0];
  assert.ok(firstEntry);

  const brokenComposition = {
    ...built.composition,
    manifest: {
      ...built.composition.manifest,
      entries: [
        { ...firstEntry, assertionIds: [] },
        ...built.composition.manifest.entries.slice(1),
      ],
    },
  };

  await assert.rejects(
    () => persistCareerVault({
      repository,
      candidate: built.truth.candidateProfile,
      sources: built.truth.sources,
      evidence: built.truth.evidence,
      assertions: built.truth.assertions,
      jobIntelligence: built.job,
      jobMatch: built.match,
      resumeComposition: brokenComposition,
      persistedAt: T0,
    }),
    /complete provenance/i,
  );
  assert.equal(repository.saveCalls, 0);
});

test('failed durable save leaves the previously committed snapshot intact', async () => {
  const repository = new MemoryCareerVaultRepository();
  const first = await persist(repository, resumeFixture('Requirements:\n- Docker'), T0);
  repository.failOnSave = true;

  await assert.rejects(
    () => persist(repository, resumeFixture('Requirements:\n- PostgreSQL'), T1),
    /simulated durable-store failure/,
  );

  const reloaded = await repository.load(first.identity.candidateProfileId);
  assert.ok(reloaded);
  assert.equal(reloaded.revision, 1);
  assert.equal(reloaded.jobs.length, 1);
  assert.equal(reloaded.resumeVersions.length, 1);
});

test('durable repository configuration fails closed instead of falling back to memory', () => {
  assert.throws(
    () => createCareerVaultRepositoryFromEnv({}),
    /required for durable Career Vault persistence/i,
  );
});
