import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ResumeRequest } from '../../lib/schemas';
import type { JobRequirementKind, RequirementMatchStatus } from '../../lib/domain';
import { projectLegacyResumeRequest } from '../../lib/application/legacy/LegacyResumeAdapter';
import { analyzeJobDescription } from '../../lib/application/job/JobIntelligenceEngine';
import { matchJobToCandidate } from '../../lib/application/matching/JobMatchEngine';

interface CandidateSpec {
  readonly summary?: string;
  readonly location?: string;
  readonly hardSkills?: readonly string[];
  readonly softSkills?: readonly string[];
  readonly experience?: ResumeRequest['experience'];
  readonly education?: ResumeRequest['education'];
  readonly certifications?: NonNullable<ResumeRequest['certifications']>;
  readonly languages?: NonNullable<ResumeRequest['languages']>;
}

interface RequirementSelector {
  readonly canonicalConcept?: string;
  readonly kind?: JobRequirementKind;
  readonly statementIncludes?: string;
}

interface BenchmarkCase {
  readonly name: string;
  readonly category: 'SKILL' | 'TENURE' | 'RESPONSIBILITY' | 'EDUCATION' | 'LANGUAGE' | 'LOCATION' | 'WORK_AUTHORIZATION' | 'CERTIFICATION' | 'SCORING' | 'EXTRACTION';
  readonly jd: string;
  readonly candidate: CandidateSpec;
  readonly selector?: RequirementSelector;
  readonly expectedStatus?: RequirementMatchStatus;
  readonly expectedRequirementCount?: number;
  readonly expectedScore?: number;
}

function experience(
  description: string,
  technologies: readonly string[] = [],
  startDate = '2023',
  endDate = '2025',
): ResumeRequest['experience'][number] {
  return {
    company: 'Acme',
    role: 'Backend Engineer',
    startDate,
    endDate,
    description,
    technologies: [...technologies],
  };
}

function resumeFixture(spec: CandidateSpec): ResumeRequest {
  return {
    personalInfo: {
      fullName: 'Benchmark Candidate',
      location: spec.location ?? 'Lima, Peru',
      email: 'benchmark@example.com',
      linkedin: '',
      github: '',
    },
    summary: spec.summary ?? 'Backend engineer building reliable business software.',
    experience: spec.experience ?? [experience('Built backend APIs with TypeScript.', ['TypeScript'])],
    education: spec.education ?? [
      {
        institution: 'Universidad Nacional',
        degree: 'Bachelor of Science in Computer Science',
        startDate: '2018',
        endDate: '2022',
      },
    ],
    skills: {
      hardSkills: [...(spec.hardSkills ?? ['TypeScript'])],
      softSkills: [...(spec.softSkills ?? ['Collaboration'])],
    },
    projects: [],
    certifications: [...(spec.certifications ?? [])],
    languages: [...(spec.languages ?? [{ language: 'Spanish', proficiency: 'Native' }])],
    jobDescription: '',
  };
}

const CASES: readonly BenchmarkCase[] = [
  {
    name: 'exact TypeScript evidence matches required TypeScript',
    category: 'SKILL',
    jd: 'Requirements:\n- TypeScript',
    candidate: { hardSkills: ['TypeScript'] },
    selector: { canonicalConcept: 'TypeScript' },
    expectedStatus: 'MATCH',
  },
  {
    name: 'missing TypeScript is a gap',
    category: 'SKILL',
    jd: 'Requirements:\n- TypeScript',
    candidate: { hardSkills: ['Python'], experience: [experience('Built backend APIs with Python.', ['Python'])] },
    selector: { canonicalConcept: 'TypeScript' },
    expectedStatus: 'GAP',
  },
  {
    name: 'Java does not match JavaScript',
    category: 'SKILL',
    jd: 'Requirements:\n- Java',
    candidate: { hardSkills: ['JavaScript'], experience: [experience('Built APIs with JavaScript.', ['JavaScript'])] },
    selector: { canonicalConcept: 'Java' },
    expectedStatus: 'GAP',
  },
  {
    name: 'C sharp requirement matches dotnet alias evidence',
    category: 'SKILL',
    jd: 'Requirements:\n- C#',
    candidate: { hardSkills: ['.NET'], experience: [experience('Built services with .NET.', ['.NET'])] },
    selector: { canonicalConcept: 'C#' },
    expectedStatus: 'MATCH',
  },
  {
    name: 'Go requirement matches explicit Go candidate skill',
    category: 'SKILL',
    jd: 'Requirements:\n- Go',
    candidate: { hardSkills: ['Go'], experience: [experience('Built services with Go.', ['Go'])] },
    selector: { canonicalConcept: 'Go' },
    expectedStatus: 'MATCH',
    expectedRequirementCount: 1,
  },
  {
    name: 'Kubernetes requirement matches k8s alias evidence',
    category: 'SKILL',
    jd: 'Requirements:\n- Kubernetes',
    candidate: { hardSkills: ['k8s'], experience: [experience('Deployed workloads with k8s.', ['k8s'])] },
    selector: { canonicalConcept: 'Kubernetes' },
    expectedStatus: 'MATCH',
  },
  {
    name: 'AWS does not match Azure',
    category: 'SKILL',
    jd: 'Requirements:\n- AWS',
    candidate: { hardSkills: ['Azure'], experience: [experience('Deployed services on Azure.', ['Azure'])] },
    selector: { canonicalConcept: 'AWS' },
    expectedStatus: 'GAP',
  },
  {
    name: 'PostgreSQL requirement matches postgres alias',
    category: 'SKILL',
    jd: 'Requirements:\n- PostgreSQL',
    candidate: { hardSkills: ['Postgres'], experience: [experience('Built data services with Postgres.', ['Postgres'])] },
    selector: { canonicalConcept: 'PostgreSQL' },
    expectedStatus: 'MATCH',
  },
  {
    name: 'REST APIs requirement matches REST API wording',
    category: 'SKILL',
    jd: 'Requirements:\n- REST APIs',
    candidate: { hardSkills: ['REST API'], experience: [experience('Built REST API endpoints.', ['REST API'])] },
    selector: { canonicalConcept: 'REST APIs' },
    expectedStatus: 'MATCH',
  },
  {
    name: 'preferred React requirement preserves preference and matches',
    category: 'SKILL',
    jd: 'Preferred:\n- React',
    candidate: { hardSkills: ['React'], experience: [experience('Built user interfaces with React.', ['React'])] },
    selector: { canonicalConcept: 'React' },
    expectedStatus: 'MATCH',
  },
  {
    name: 'five-year TypeScript requirement rejects documented two-year period',
    category: 'TENURE',
    jd: 'Requirements:\n- 5+ years TypeScript',
    candidate: { hardSkills: ['TypeScript'], experience: [experience('Built APIs with TypeScript.', ['TypeScript'], '2023', '2025')] },
    selector: { canonicalConcept: 'TypeScript' },
    expectedStatus: 'GAP',
    expectedRequirementCount: 1,
  },
  {
    name: 'two-year TypeScript requirement matches documented two-year period',
    category: 'TENURE',
    jd: 'Requirements:\n- 2+ years TypeScript',
    candidate: { hardSkills: ['TypeScript'], experience: [experience('Built APIs with TypeScript.', ['TypeScript'], '2023', '2025')] },
    selector: { canonicalConcept: 'TypeScript' },
    expectedStatus: 'MATCH',
    expectedRequirementCount: 1,
  },
  {
    name: 'unparseable tenure remains potential rather than fabricated match',
    category: 'TENURE',
    jd: 'Requirements:\n- 3+ years TypeScript',
    candidate: { hardSkills: ['TypeScript'], experience: [experience('Built APIs with TypeScript.', ['TypeScript'], 'Spring 2022', 'Current')] },
    selector: { canonicalConcept: 'TypeScript' },
    expectedStatus: 'POTENTIAL_MATCH',
    expectedRequirementCount: 1,
  },
  {
    name: 'design responsibility matches explicit design evidence',
    category: 'RESPONSIBILITY',
    jd: 'Requirements:\n- Design distributed systems',
    candidate: { hardSkills: [], experience: [experience('Designed distributed systems for internal workflows.')] },
    selector: { kind: 'RESPONSIBILITY' },
    expectedStatus: 'MATCH',
  },
  {
    name: 'implementation in distributed architecture is only potential for design responsibility',
    category: 'RESPONSIBILITY',
    jd: 'Requirements:\n- Design distributed systems',
    candidate: { hardSkills: [], experience: [experience('Implemented services in a distributed architecture.')] },
    selector: { kind: 'RESPONSIBILITY' },
    expectedStatus: 'POTENTIAL_MATCH',
  },
  {
    name: 'collaboration must not satisfy leadership responsibility',
    category: 'RESPONSIBILITY',
    jd: 'Requirements:\n- Lead engineering teams',
    candidate: { hardSkills: [], experience: [experience('Collaborated with engineering teams on backend delivery.')] },
    selector: { kind: 'RESPONSIBILITY' },
    expectedStatus: 'GAP',
  },
  {
    name: 'maintenance must not satisfy architecture responsibility',
    category: 'RESPONSIBILITY',
    jd: 'Requirements:\n- Architect cloud platforms',
    candidate: { hardSkills: [], experience: [experience('Maintained cloud platforms for internal applications.')] },
    selector: { kind: 'RESPONSIBILITY' },
    expectedStatus: 'GAP',
  },
  {
    name: 'explicit leadership evidence matches leadership responsibility',
    category: 'RESPONSIBILITY',
    jd: 'Requirements:\n- Lead engineering teams',
    candidate: { hardSkills: [], experience: [experience('Led engineering teams delivering backend services.')] },
    selector: { kind: 'RESPONSIBILITY' },
    expectedStatus: 'MATCH',
  },
  {
    name: 'bachelor degree requirement matches bachelor evidence',
    category: 'EDUCATION',
    jd: 'Requirements:\n- Bachelor degree in Computer Science',
    candidate: {},
    selector: { kind: 'EDUCATION' },
    expectedStatus: 'MATCH',
  },
  {
    name: 'master degree must not match bachelor degree',
    category: 'EDUCATION',
    jd: 'Requirements:\n- Master degree in Computer Science',
    candidate: {},
    selector: { kind: 'EDUCATION' },
    expectedStatus: 'GAP',
  },
  {
    name: 'English requirement matches fluent English evidence',
    category: 'LANGUAGE',
    jd: 'Requirements:\n- Fluent English',
    candidate: { languages: [{ language: 'English', proficiency: 'Fluent' }] },
    selector: { kind: 'LANGUAGE' },
    expectedStatus: 'MATCH',
  },
  {
    name: 'English requirement does not match Spanish-only evidence',
    category: 'LANGUAGE',
    jd: 'Requirements:\n- Fluent English',
    candidate: { languages: [{ language: 'Spanish', proficiency: 'Native' }] },
    selector: { kind: 'LANGUAGE' },
    expectedStatus: 'GAP',
  },
  {
    name: 'Lima location requirement matches candidate location',
    category: 'LOCATION',
    jd: 'Requirements:\n- Must be located in Lima, Peru',
    candidate: { location: 'Lima, Peru' },
    selector: { kind: 'LOCATION' },
    expectedStatus: 'MATCH',
  },
  {
    name: 'New York location requirement does not match Lima',
    category: 'LOCATION',
    jd: 'Requirements:\n- Must be located in New York, USA',
    candidate: { location: 'Lima, Peru' },
    selector: { kind: 'LOCATION' },
    expectedStatus: 'GAP',
  },
  {
    name: 'missing work authorization remains unknown',
    category: 'WORK_AUTHORIZATION',
    jd: 'Requirements:\n- Must be authorized to work in the United States',
    candidate: {},
    selector: { kind: 'WORK_AUTHORIZATION' },
    expectedStatus: 'UNKNOWN',
  },
  {
    name: 'explicit work authorization evidence matches',
    category: 'WORK_AUTHORIZATION',
    jd: 'Requirements:\n- Must be authorized to work in the United States',
    candidate: { summary: 'Backend engineer authorized to work in the United States.' },
    selector: { kind: 'WORK_AUTHORIZATION' },
    expectedStatus: 'MATCH',
  },
  {
    name: 'PMP certification requirement matches explicit certification',
    category: 'CERTIFICATION',
    jd: 'Requirements:\n- PMP certification required',
    candidate: { certifications: [{ name: 'PMP', issuer: 'PMI', date: '2024' }] },
    selector: { kind: 'CERTIFICATION' },
    expectedStatus: 'MATCH',
  },
  {
    name: 'PMP certification requirement is gap when absent',
    category: 'CERTIFICATION',
    jd: 'Requirements:\n- PMP certification required',
    candidate: { certifications: [] },
    selector: { kind: 'CERTIFICATION' },
    expectedStatus: 'GAP',
  },
  {
    name: 'required match outweighs preferred gap in score',
    category: 'SCORING',
    jd: 'Requirements:\n- TypeScript\nPreferred:\n- AWS',
    candidate: { hardSkills: ['TypeScript'], experience: [experience('Built APIs with TypeScript.', ['TypeScript'])] },
    expectedRequirementCount: 2,
    expectedScore: 67,
  },
  {
    name: 'preferred match cannot compensate for required gap',
    category: 'SCORING',
    jd: 'Requirements:\n- TypeScript\nPreferred:\n- AWS',
    candidate: { hardSkills: ['AWS'], experience: [experience('Deployed services on AWS.', ['AWS'])] },
    expectedRequirementCount: 2,
    expectedScore: 33,
  },
  {
    name: 'uncatalogued required Snowflake requirement is retained and matched lexically',
    category: 'EXTRACTION',
    jd: 'Requirements:\n- Snowflake',
    candidate: { summary: 'Data engineer working with Snowflake pipelines.', hardSkills: [] },
    selector: { kind: 'OTHER', statementIncludes: 'Snowflake' },
    expectedStatus: 'MATCH',
    expectedRequirementCount: 1,
  },
  {
    name: 'uncatalogued required Snowflake requirement is a gap without evidence',
    category: 'EXTRACTION',
    jd: 'Requirements:\n- Snowflake',
    candidate: { summary: 'Backend engineer building APIs.', hardSkills: [] },
    selector: { kind: 'OTHER', statementIncludes: 'Snowflake' },
    expectedStatus: 'GAP',
    expectedRequirementCount: 1,
  },
];

function selectRequirementIndex(
  requirements: ReturnType<typeof analyzeJobDescription>['requirements'],
  selector: RequirementSelector,
): number {
  return requirements.findIndex((requirement) => {
    if (selector.canonicalConcept && requirement.canonicalConcept !== selector.canonicalConcept) return false;
    if (selector.kind && requirement.kind !== selector.kind) return false;
    if (
      selector.statementIncludes &&
      !requirement.statement.toLowerCase().includes(selector.statementIncludes.toLowerCase())
    ) return false;
    return true;
  });
}

test('controlled job-match benchmark meets calibration contract', () => {
  const mismatches: Array<Record<string, unknown>> = [];
  const byCategory = new Map<string, { correct: number; total: number }>();
  let statusChecks = 0;
  let statusCorrect = 0;
  let falseMatch = 0;
  let falseGap = 0;

  CASES.forEach((benchmarkCase, index) => {
    const data = resumeFixture(benchmarkCase.candidate);
    const job = analyzeJobDescription(benchmarkCase.jd, {
      projectionKey: `benchmark-job-${index}`,
      capturedAt: '2026-08-11T00:00:00.000Z',
    });
    const projection = projectLegacyResumeRequest(data, {
      projectionKey: `benchmark-candidate-${index}`,
      capturedAt: '2026-08-11T00:00:00.000Z',
    });
    const result = matchJobToCandidate(job, projection.assertions, {
      projectionKey: `benchmark-match-${index}`,
      generatedAt: '2026-08-11T00:00:00.000Z',
    });

    const category = byCategory.get(benchmarkCase.category) ?? { correct: 0, total: 0 };
    category.total += 1;
    let caseCorrect = true;

    if (
      benchmarkCase.expectedRequirementCount !== undefined &&
      job.requirements.length !== benchmarkCase.expectedRequirementCount
    ) {
      caseCorrect = false;
      mismatches.push({
        name: benchmarkCase.name,
        category: benchmarkCase.category,
        dimension: 'requirement-count',
        expected: benchmarkCase.expectedRequirementCount,
        actual: job.requirements.length,
        requirements: job.requirements.map((requirement) => ({
          kind: requirement.kind,
          concept: requirement.canonicalConcept,
          statement: requirement.statement,
          necessity: requirement.necessity,
        })),
      });
    }

    if (benchmarkCase.expectedScore !== undefined && result.score !== benchmarkCase.expectedScore) {
      caseCorrect = false;
      mismatches.push({
        name: benchmarkCase.name,
        category: benchmarkCase.category,
        dimension: 'score',
        expected: benchmarkCase.expectedScore,
        actual: result.score,
        statuses: result.report.matches.map((match) => match.status),
      });
    }

    if (benchmarkCase.selector && benchmarkCase.expectedStatus) {
      statusChecks += 1;
      const requirementIndex = selectRequirementIndex(job.requirements, benchmarkCase.selector);
      const actualStatus = requirementIndex >= 0
        ? result.report.matches[requirementIndex]?.status
        : undefined;

      if (actualStatus === benchmarkCase.expectedStatus) {
        statusCorrect += 1;
      } else {
        caseCorrect = false;
        mismatches.push({
          name: benchmarkCase.name,
          category: benchmarkCase.category,
          dimension: 'status',
          selector: benchmarkCase.selector,
          expected: benchmarkCase.expectedStatus,
          actual: actualStatus ?? 'REQUIREMENT_NOT_EXTRACTED',
          requirements: job.requirements.map((requirement, requirementIndexValue) => ({
            kind: requirement.kind,
            concept: requirement.canonicalConcept,
            statement: requirement.statement,
            necessity: requirement.necessity,
            status: result.report.matches[requirementIndexValue]?.status,
          })),
        });
      }

      if (
        actualStatus === 'MATCH' &&
        (benchmarkCase.expectedStatus === 'GAP' || benchmarkCase.expectedStatus === 'UNKNOWN')
      ) {
        falseMatch += 1;
      }
      if (actualStatus === 'GAP' && benchmarkCase.expectedStatus === 'MATCH') {
        falseGap += 1;
      }
    }

    if (caseCorrect) category.correct += 1;
    byCategory.set(benchmarkCase.category, category);
  });

  const exactStatusAccuracy = statusChecks === 0 ? 1 : statusCorrect / statusChecks;
  const summary = {
    cases: CASES.length,
    statusChecks,
    exactStatusAccuracy: Number(exactStatusAccuracy.toFixed(4)),
    falseMatch,
    falseGap,
    categories: Object.fromEntries(
      Array.from(byCategory.entries()).map(([category, value]) => [
        category,
        { ...value, accuracy: Number((value.correct / value.total).toFixed(4)) },
      ]),
    ),
    mismatches,
  };

  console.log(`MATCH_BENCHMARK ${JSON.stringify(summary)}`);

  assert.equal(
    mismatches.length,
    0,
    `Controlled benchmark mismatches:\n${JSON.stringify(summary, null, 2)}`,
  );
  assert.equal(falseMatch, 0, 'Controlled benchmark permits no false MATCH on labeled GAP/UNKNOWN cases.');
  assert.equal(falseGap, 0, 'Controlled benchmark permits no false GAP on labeled MATCH cases.');
  assert.equal(exactStatusAccuracy, 1, 'Controlled deterministic benchmark must reproduce all labeled statuses.');
});
