import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { evaluateGenerationReadiness } from '../../lib/application/product/GenerationReadiness';
import { resumeRequestSchema } from '../../lib/schemas';
import { projectLegacyResumeRequest } from '../../lib/application/legacy/LegacyResumeAdapter';

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
    skills: { hardSkills: ['TypeScript', 'Node.js'], softSkills: [] },
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

test('generation readiness accepts honest project-led evidence without forcing summary, employment, or education', () => {
  const candidate = {
    personalInfo: {
      fullName: 'Project Candidate',
      location: 'Lima, Peru',
      email: 'project@example.com',
      linkedin: '',
      github: 'https://github.com/project-candidate',
    },
    summary: '',
    experience: [],
    education: [],
    skills: { hardSkills: ['TypeScript'], softSkills: [] },
    projects: [{
      name: 'Open Source API',
      description: 'Built an API for a public open-source project.',
      technologies: ['TypeScript'],
      link: 'https://github.com/project-candidate/open-source-api',
    }],
    certifications: [],
    languages: [],
    jobDescription: '',
  };

  const result = evaluateGenerationReadiness(candidate);
  assert.equal(result.ready, true);
  assert.deepEqual(result.issues, []);

  const parsed = resumeRequestSchema.parse(candidate);
  const projection = projectLegacyResumeRequest(parsed, { projectionKey: 'project-led' });
  assert.ok(projection.assertions.some((assertion) => assertion.statement.includes('Project Open Source API')));
  assert.ok(!projection.assertions.some((assertion) => assertion.statement === 'Professional summary:'));
  assert.ok(projection.assertions.every((assertion) => assertion.evidenceIds.length > 0));
});

test('generation readiness accepts source-reconciled work evidence with a missing description and dates', () => {
  const candidate = validCandidate();
  candidate.summary = '';
  candidate.education = [];
  candidate.experience[0] = {
    ...candidate.experience[0],
    startDate: '',
    endDate: '',
    description: '',
  };

  const result = evaluateGenerationReadiness(candidate);
  assert.equal(result.ready, true);
  const parsed = resumeRequestSchema.parse(candidate);
  const projection = projectLegacyResumeRequest(parsed, { projectionKey: 'source-reconciled-work' });
  assert.ok(projection.assertions.some((assertion) => assertion.statement.includes('Company: Example Co.')));
  assert.ok(projection.assertions.every((assertion) => assertion.evidenceIds.length > 0));
});

test('generation readiness rejects an identity-only profile with no material career evidence', () => {
  const candidate = validCandidate();
  candidate.summary = '';
  candidate.experience = [];
  candidate.education = [];
  candidate.skills = { hardSkills: [], softSkills: [] };
  candidate.projects = [];
  candidate.certifications = [];
  candidate.languages = [];

  const result = evaluateGenerationReadiness(candidate);
  assert.equal(result.ready, false);
  assert.ok(result.issues.some((issue) => issue.fieldPath === 'careerEvidence'));
});

test('generation readiness rejects empty material records instead of treating their existence as evidence', () => {
  const candidate = validCandidate();
  candidate.summary = '';
  candidate.experience = [{ company: '', role: '', startDate: '', endDate: '', description: '', technologies: [] }];
  candidate.education = [];
  candidate.skills = { hardSkills: [], softSkills: [] };
  candidate.projects = [];
  candidate.certifications = [];
  candidate.languages = [];

  const result = evaluateGenerationReadiness(candidate);
  assert.equal(result.ready, false);
  assert.ok(result.issues.some((issue) => issue.fieldPath === 'experience[0].company'));
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
  assert.match(target, /disabled=\{!canGenerate\}/);
});

test('targeted resume generation requires a current target-aware Opportunity Assessment before build', () => {
  const target = readFileSync(join(process.cwd(), 'components/TargetJobStep.tsx'), 'utf8');
  assert.match(target, /fetch\('\/api\/assess-opportunity'/);
  assert.match(target, /mode === 'TARGETED'.*Boolean\(currentAssessment && targetRelevance\)/s);
  assert.match(target, /assessedTargetKey === targetKey/);
  assert.match(target, /mode === 'GENERAL'/);
  assert.match(target, /currentAssessment && <OpportunityAssessmentCard assessment=\{currentAssessment\}/);
});

test('editing target inputs invalidates previous assessment and controls are frozen while async work runs', () => {
  const target = readFileSync(join(process.cwd(), 'components/TargetJobStep.tsx'), 'utf8');
  assert.match(target, /const busy = isLoading \|\| isAssessing/);
  assert.match(target, /const mutateTarget =/);
  assert.match(target, /if \(busy\) return/);
  assert.match(target, /change\(\);\s*invalidateAssessment\(\)/);
  assert.match(target, /<fieldset disabled=\{busy\}/);
  assert.match(target, /jobSnapshot = normalizedJobDescription/);
  assert.match(target, /targetSnapshot =/);
  assert.doesNotMatch(target, /console\.error/);
});
