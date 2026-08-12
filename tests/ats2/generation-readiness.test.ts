import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { evaluateGenerationReadiness } from '../../lib/application/product/GenerationReadiness';

function validCandidate() {
  return {
    personalInfo: {
      fullName: 'Jane Candidate',
      location: 'Lima, Peru',
      email: 'jane@example.com',
      linkedin: 'https://linkedin.com/in/jane-candidate',
      github: 'https://github.com/jane-candidate',
    },
    summary: 'Backend engineer focused on building reliable APIs and data services.',
    experience: [{
      company: 'Example Co',
      role: 'Backend Engineer',
      startDate: 'Jan 2024',
      endDate: 'Present',
      description: 'Developed REST APIs and maintained backend services for internal products.',
      technologies: ['TypeScript', 'Node.js'],
    }],
    education: [{
      institution: 'Example University',
      degree: 'Computer Science',
      startDate: '2020',
      endDate: '2024',
    }],
    skills: {
      hardSkills: ['TypeScript', 'Node.js'],
      softSkills: [],
    },
    projects: [],
    certifications: [],
    languages: [],
    jobDescription: '',
  };
}

test('generation readiness accepts a complete candidate without creating new facts', () => {
  const result = evaluateGenerationReadiness(validCandidate());
  assert.equal(result.ready, true);
  assert.deepEqual(result.issues, []);
});

test('generation readiness preserves incomplete import data and identifies exact review paths', () => {
  const candidate = validCandidate();
  candidate.education[0].startDate = '';
  candidate.experience[0].description = 'short';

  const result = evaluateGenerationReadiness(candidate);
  assert.equal(result.ready, false);
  assert.ok(result.issues.some((issue) => issue.fieldPath === 'education[0].startDate'));
  assert.ok(result.issues.some((issue) => issue.fieldPath === 'experience[0].description'));
});

test('generation API validates request before distributed rate limiting and returns field-safe diagnostics', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/generate-resume/route.ts'), 'utf8');
  const validationIndex = route.indexOf('resumeGenerationInputSchema.safeParse(body)');
  const rateLimitIndex = route.indexOf('await rateLimit(');

  assert.ok(validationIndex >= 0);
  assert.ok(rateLimitIndex > validationIndex);
  assert.match(route, /inputValidation:\s*\{/);
  assert.match(route, /REVIEW_REQUIRED/);
  assert.match(route, /generationValidationIssues/);
  assert.doesNotMatch(route, /console\.(?:log|warn)\([^\n]*body/);
});

test('target job step blocks generation until candidate generation readiness passes', () => {
  const target = readFileSync(join(process.cwd(), 'components/TargetJobStep.tsx'), 'utf8');

  assert.match(target, /evaluateGenerationReadiness\(data\)/);
  assert.match(target, /!readiness\.ready/);
  assert.match(target, /readiness\.issues/);
  assert.match(target, /disabled=!\{?canGenerate\}?|disabled=\{!canGenerate\}/);
});

test('targeted resume generation requires a current target-aware Opportunity Assessment before build', () => {
  const target = readFileSync(join(process.cwd(), 'components/TargetJobStep.tsx'), 'utf8');

  assert.match(target, /fetch\('\/api\/assess-opportunity'/);
  assert.match(target, /return Boolean\(currentAssessment && targetRelevance\)/);
  assert.match(target, /assessedTargetKey === targetKey/);
  assert.match(target, /mode === 'GENERAL'\) return true/);
  assert.match(target, /currentAssessment && <OpportunityAssessmentCard assessment=\{currentAssessment\}/);
});

test('editing the target job or CareerTarget invalidates the previous target-aware assessment', () => {
  const target = readFileSync(join(process.cwd(), 'components/TargetJobStep.tsx'), 'utf8');
  const invalidationStart = target.indexOf('const invalidateAssessment =');
  const assessStart = target.indexOf('const assess = async');
  const invalidationBlock = target.slice(invalidationStart, assessStart);

  assert.ok(invalidationStart >= 0);
  assert.ok(assessStart > invalidationStart);
  assert.match(invalidationBlock, /setAssessment\(null\)/);
  assert.match(invalidationBlock, /setTargetRelevance\(null\)/);
  assert.match(invalidationBlock, /setAssessedJobDescription\(''\)/);
  assert.match(invalidationBlock, /setAssessedTargetKey\(''\)/);
  assert.match(target, /setJobDescription\(event\.target\.value\); invalidateAssessment\(\)/);
  assert.match(target, /setTargetRole\(event\.target\.value\); invalidateAssessment\(\)/);
});
