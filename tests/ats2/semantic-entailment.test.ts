import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ResumeRequest } from '../../lib/schemas';
import { projectLegacyResumeRequest } from '../../lib/application/legacy/LegacyResumeAdapter';
import { evaluateGeneratedResumeSemanticGrounding } from '../../lib/application/grounding/SemanticEntailmentEvaluator';

function fixture(description: string, summary = 'Backend engineer focused on APIs.'): ResumeRequest {
  return {
    personalInfo: {
      fullName: 'Semantic Candidate',
      location: 'Lima, Peru',
      email: 'semantic@example.com',
      linkedin: '',
      github: '',
    },
    summary,
    experience: [
      {
        company: 'Acme',
        role: 'Backend Engineer',
        startDate: '2023',
        endDate: '2025',
        description,
        technologies: ['TypeScript'],
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
      hardSkills: ['TypeScript'],
      softSkills: ['Collaboration'],
    },
    projects: [],
    certifications: [],
    languages: [{ language: 'Spanish', proficiency: 'Native' }],
    jobDescription: '',
  };
}

function evaluate(description: string, generatedClaim: string, summary?: string) {
  const data = fixture(description, summary);
  const projection = projectLegacyResumeRequest(data, {
    projectionKey: 'semantic-corpus',
    capturedAt: '2026-08-11T12:00:00.000Z',
  });

  return evaluateGeneratedResumeSemanticGrounding(
    `EXPERIENCE\n${generatedClaim}`,
    projection.assertions,
  );
}

function issueKinds(result: ReturnType<typeof evaluateGeneratedResumeSemanticGrounding>): string[] {
  return result.issues.map((issue) => issue.kind);
}

test('semantic entailment blocks participation rewritten as leadership', () => {
  const result = evaluate(
    'Participated in the backend migration and implemented migration scripts.',
    'Led the backend migration and implemented migration scripts.',
  );

  assert.equal(result.status, 'NEEDS_USER_CONFIRMATION');
  assert.ok(issueKinds(result).includes('RESPONSIBILITY_ESCALATION'));
  assert.equal(result.evaluatedClaims[0]?.verdict, 'NOT_ENTAILED');
});

test('semantic entailment allows equivalent delivery wording', () => {
  const result = evaluate(
    'Built backend APIs for internal business workflows.',
    'Developed backend APIs for internal business workflows.',
  );

  assert.equal(result.status, 'APPROVED');
  assert.equal(result.issues.length, 0);
});

test('semantic entailment blocks unsupported design responsibility', () => {
  const result = evaluate(
    'Implemented backend APIs for internal business workflows.',
    'Designed backend APIs for internal business workflows.',
  );

  assert.equal(result.status, 'NEEDS_USER_CONFIRMATION');
  assert.ok(issueKinds(result).includes('DESIGN_ESCALATION'));
});

test('semantic entailment blocks design rewritten as architecture ownership', () => {
  const result = evaluate(
    'Designed backend services for internal business workflows.',
    'Architected backend services for internal business workflows.',
  );

  assert.equal(result.status, 'NEEDS_USER_CONFIRMATION');
  assert.ok(issueKinds(result).includes('ARCHITECTURE_ESCALATION'));
});

test('semantic entailment allows architecture wording when candidate evidence contains it', () => {
  const result = evaluate(
    'Architected backend services for internal business workflows.',
    'Architected backend services for internal business workflows.',
  );

  assert.equal(result.status, 'APPROVED');
  assert.equal(result.issues.length, 0);
});

test('semantic entailment blocks unsupported ownership wording', () => {
  const result = evaluate(
    'Built backend services for the billing workflow.',
    'Owned backend services for the billing workflow.',
  );

  assert.equal(result.status, 'NEEDS_USER_CONFIRMATION');
  assert.ok(issueKinds(result).includes('OWNERSHIP_ESCALATION'));
});

test('semantic entailment requires confirmation for unsupported scale qualifiers', () => {
  const result = evaluate(
    'Built backend APIs for internal business workflows.',
    'Built enterprise-scale backend APIs for internal business workflows.',
  );

  assert.equal(result.status, 'NEEDS_USER_CONFIRMATION');
  assert.ok(issueKinds(result).includes('UNSUPPORTED_SCOPE_QUALIFIER'));
  assert.equal(result.evaluatedClaims[0]?.verdict, 'PARTIALLY_ENTAILED');
});

test('semantic entailment allows scale qualifier when candidate evidence supports it', () => {
  const result = evaluate(
    'Built enterprise-scale backend APIs for internal business workflows.',
    'Built enterprise-scale backend APIs for internal business workflows.',
  );

  assert.equal(result.status, 'APPROVED');
  assert.equal(result.issues.length, 0);
});

test('semantic entailment requires confirmation for unsupported impact-strength wording', () => {
  const result = evaluate(
    'Improved API performance for internal business workflows.',
    'Significantly improved API performance for internal business workflows.',
  );

  assert.equal(result.status, 'NEEDS_USER_CONFIRMATION');
  assert.ok(issueKinds(result).includes('UNSUPPORTED_IMPACT_QUALIFIER'));
});

test('semantic entailment catches Spanish participation rewritten as leadership', () => {
  const result = evaluate(
    'Participé en la migración del backend e implementé scripts de migración.',
    'Lideré la migración del backend e implementé scripts de migración.',
    'Ingeniero backend enfocado en APIs confiables.',
  );

  assert.equal(result.status, 'NEEDS_USER_CONFIRMATION');
  assert.ok(issueKinds(result).includes('RESPONSIBILITY_ESCALATION'));
});

test('semantic entailment allows Spanish equivalent delivery wording', () => {
  const result = evaluate(
    'Desarrollé APIs backend para flujos internos.',
    'Construí APIs backend para flujos internos.',
    'Ingeniero backend enfocado en APIs.',
  );

  assert.equal(result.status, 'APPROVED');
  assert.equal(result.issues.length, 0);
});

test('semantic guard reports evaluated coverage without claiming universal entailment', () => {
  const result = evaluate(
    'Built backend APIs for internal workflows.',
    'Built scalable backend APIs for internal workflows.',
  );

  assert.ok(result.coverage.generatedNarrativeClaims >= 1);
  assert.equal(result.coverage.highRiskClaimsEvaluated, 1);
  assert.ok(result.coverage.candidateAssertionsAvailable > 0);
});
