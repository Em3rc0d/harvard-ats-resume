import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ResumeRequest } from '../../lib/schemas';
import {
  PRODUCT_EVALUATION_VERSION,
  evaluateProductResume,
} from '../../lib/application/product/ProductEvaluationService';

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

test('product evaluation v2 is deterministic and independent from target Job Description', () => {
  const first = evaluateProductResume(candidate('Requirements:\n- TypeScript'), RENDERED);
  const second = evaluateProductResume(candidate('Requirements:\n- Kubernetes AWS Terraform Kafka TypeScript Docker'), RENDERED);

  assert.deepEqual(first, second);
  assert.equal(first.resumeQuality.version, PRODUCT_EVALUATION_VERSION);
  assert.equal(PRODUCT_EVALUATION_VERSION, 'ats2-product-evaluation-v2');
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

test('quality evaluation is language-neutral and does not score hardcoded action verbs', () => {
  const spanishCandidate = candidate();
  spanishCandidate.experience[0] = {
    ...spanishCandidate.experience[0],
    description: 'Ejecutar pruebas funcionales, manuales y de regresión en soluciones empresariales.',
  };
  const evaluation = evaluateProductResume(spanishCandidate, RENDERED);

  assert.equal(evaluation.resumeQuality.checks.some((check) => check.id === 'quality-action-language'), false);
  assert.equal(evaluation.resumeQuality.checks.find((check) => check.id === 'quality-substantive-evidence')?.status, 'PASS');
  assert.match(
    evaluation.resumeQuality.checks.find((check) => check.id === 'quality-action-language-boundary')?.detail ?? '',
    /hardcoded language-specific action-verb list/i,
  );
});

test('long plain-text wrapping alone is not treated as a structural ATS defect', () => {
  const longSummary = `${'Evidence-backed professional summary statement '.repeat(7)}with a normal semantic ending.`;
  const rendered = RENDERED.replace(
    'Backend engineer focused on reliable APIs, maintainable services, and clear delivery practices.',
    longSummary,
  );
  const data = candidate();
  data.summary = longSummary;
  const evaluation = evaluateProductResume(data, rendered);

  assert.equal(evaluation.atsParseability.checks.some((check) => check.id === 'parse-line-density'), false);
  assert.equal(evaluation.atsParseability.checks.find((check) => check.id === 'parse-claim-separation')?.status, 'PASS');
});

test('escaped newlines or compressed bullets reduce claim-separation parseability', () => {
  const clean = evaluateProductResume(candidate(), RENDERED);
  const ambiguous = evaluateProductResume(candidate(), `${RENDERED}\\nEXPERIENCE • Built APIs • Maintained services`);

  assert.ok(ambiguous.atsParseability.score < clean.atsParseability.score);
  assert.equal(ambiguous.atsParseability.checks.find((check) => check.id === 'parse-claim-separation')?.status, 'WARN');
});
