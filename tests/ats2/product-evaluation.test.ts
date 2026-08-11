import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ResumeRequest } from '../../lib/schemas';
import { evaluateProductResume } from '../../lib/application/product/ProductEvaluationService';

function candidate(jobDescription = 'Requirements:\n- TypeScript'): ResumeRequest {
  return {
    personalInfo: {
      fullName: 'Jane Candidate',
      location: 'Lima, Peru',
      email: 'jane@example.com',
      linkedin: '',
      github: '',
    },
    summary: 'Backend engineer focused on reliable APIs, maintainable services, and clear delivery practices.',
    experience: [{
      company: 'Acme',
      role: 'Backend Engineer',
      startDate: '2023',
      endDate: '2025',
      description: 'Built reliable backend APIs with TypeScript for internal business workflows.',
      technologies: ['TypeScript', 'Docker'],
    }],
    education: [{
      institution: 'Universidad Nacional',
      degree: 'Computer Science',
      startDate: '2018',
      endDate: '2022',
    }],
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

const RENDERED = `JANE CANDIDATE
Lima, Peru | jane@example.com

PROFESSIONAL SUMMARY
Backend engineer focused on reliable APIs, maintainable services, and clear delivery practices.

EXPERIENCE
ACME — BACKEND ENGINEER
2023 - 2025
Built reliable backend APIs with TypeScript for internal business workflows.

EDUCATION
Universidad Nacional
Computer Science, 2018 - 2022

SKILLS
Technical Skills: TypeScript, Docker
Soft Skills: Collaboration`;

test('resume quality and ATS parseability are deterministic and independent from target Job Description', () => {
  const first = evaluateProductResume(candidate('Requirements:\n- TypeScript'), RENDERED);
  const second = evaluateProductResume(candidate('Requirements:\n- Kubernetes AWS Terraform Kafka TypeScript Docker'), RENDERED);

  assert.deepEqual(first, second);
  assert.ok(first.resumeQuality.score >= 0 && first.resumeQuality.score <= 100);
  assert.ok(first.atsParseability.score >= 0 && first.atsParseability.score <= 100);
});

test('legacy keyword stuffing cannot improve resume quality or structural parseability', () => {
  const baseline = evaluateProductResume(candidate(), RENDERED);
  const stuffed = evaluateProductResume(
    candidate('AWS AWS AWS Kubernetes Kubernetes Terraform TypeScript Docker React Java Go'),
    RENDERED,
  );

  assert.equal(stuffed.resumeQuality.score, baseline.resumeQuality.score);
  assert.equal(stuffed.atsParseability.score, baseline.atsParseability.score);
});

test('quality evaluation never requires fabricated metrics', () => {
  const evaluation = evaluateProductResume(candidate(), RENDERED);
  const metricBoundary = evaluation.resumeQuality.checks.find((check) => check.id === 'quality-metrics-truth-boundary');

  assert.ok(metricBoundary);
  assert.equal(metricBoundary.status, 'INFO');
  assert.equal(metricBoundary.weight, 0);
  assert.match(metricBoundary.detail, /only when they are true and supportable/i);
});

test('table-like formatting reduces structural parseability without changing candidate truth', () => {
  const clean = evaluateProductResume(candidate(), RENDERED);
  const tableLike = evaluateProductResume(candidate(), `${RENDERED}\n| Skill | Level |\n| TypeScript | Advanced |`);

  assert.ok(tableLike.atsParseability.score < clean.atsParseability.score);
  assert.equal(tableLike.resumeQuality.score, clean.resumeQuality.score);
});

test('accented Spanish action verbs are recognized after evaluator normalization', () => {
  const spanishCandidate = candidate();
  spanishCandidate.experience[0] = {
    ...spanishCandidate.experience[0],
    description: 'Automaticé procesos internos con TypeScript para reducir tareas manuales repetitivas.',
  };
  const evaluation = evaluateProductResume(spanishCandidate, RENDERED);
  const actionCheck = evaluation.resumeQuality.checks.find((check) => check.id === 'quality-action-language');

  assert.ok(actionCheck);
  assert.equal(actionCheck.status, 'PASS');
});
