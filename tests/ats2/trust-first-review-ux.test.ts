import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ResumeRequest } from '../../lib/schemas';
import type { ResumeImportContext } from '../../lib/application/import/ResumeImportProvider';
import { buildImportedResumeReviewModel } from '../../lib/application/presentation/ImportedResumeReviewModel';

const resume: ResumeRequest = {
  personalInfo: {
    fullName: 'Jane Candidate',
    location: 'Lima, Peru',
    email: 'jane@example.com',
    linkedin: 'https://linkedin.com/in/jane',
    github: 'https://github.com/jane',
  },
  summary: 'Backend engineer focused on source-backed delivery.',
  experience: [{
    company: 'Example Co',
    role: 'Backend Engineer',
    startDate: '2024',
    endDate: 'Present',
    description: 'Developed REST APIs with TypeScript and PostgreSQL.',
    technologies: ['TypeScript', 'PostgreSQL'],
  }],
  education: [{
    institution: 'Example University',
    degree: 'Computer Science',
    startDate: '2020',
    endDate: '2024',
  }],
  skills: {
    hardSkills: ['TypeScript', 'PostgreSQL'],
    softSkills: ['Communication'],
  },
  projects: [{
    name: 'Evidence API',
    description: 'Built an evidence-backed API for career facts.',
    technologies: ['TypeScript'],
    link: '',
  }],
  certifications: [{ name: 'Cloud Fundamentals', issuer: 'Example', date: '2025' }],
  languages: [{ language: 'Spanish', proficiency: 'Native' }],
  jobDescription: '',
};

const evidencePaths = [
  'personalInfo.fullName',
  'personalInfo.location',
  'personalInfo.email',
  'personalInfo.linkedin',
  'personalInfo.github',
  'summary',
  'experience[0].company',
  'experience[0].role',
  'experience[0].startDate',
  'experience[0].endDate',
  'experience[0].description',
  'experience[0].technologies[0]',
  'experience[0].technologies[1]',
  'education[0].institution',
  'education[0].degree',
  'education[0].startDate',
  'education[0].endDate',
  'skills.hardSkills[0]',
  'skills.hardSkills[1]',
  'skills.softSkills[0]',
  'projects[0].name',
  'projects[0].description',
  'projects[0].technologies[0]',
  'certifications[0].name',
  'certifications[0].issuer',
  'certifications[0].date',
  'languages[0].language',
  'languages[0].proficiency',
];

const context: ResumeImportContext = {
  receipt: {
    receiptId: 'receipt-1',
    originalFileName: 'jane-resume.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    byteSize: 1234,
    sha256: 'a'.repeat(64),
    capturedAt: '2026-08-12T00:00:00.000Z',
    importer: 'native',
    importerVersion: 'native-text-gemini-v2',
  },
  evidenceMap: evidencePaths.map((fieldPath) => ({
    fieldPath,
    excerpt: fieldPath,
    locator: {
      scope: 'SOURCE_DOCUMENT' as const,
      granularity: 'DOCUMENT' as const,
      fieldPath,
    },
  })),
};

test('imported review model keeps source receipt and section counts separate from Job Description', () => {
  const model = buildImportedResumeReviewModel(resume, context);
  assert.equal(model.sourceFileName, 'jane-resume.docx');
  assert.equal(model.totalEvidenceFields, evidencePaths.length);
  assert.equal(model.sections.find((section) => section.id === 'experience')?.itemCount, 1);
  assert.equal(model.sections.find((section) => section.id === 'skills')?.itemCount, 3);
  assert.equal(model.sections.find((section) => section.id === 'projects')?.itemCount, 1);
});

test('imported flow routes through Career Review and Target before trusted generation', () => {
  const page = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8');
  assert.match(page, /IMPORTED_REVIEW/);
  assert.match(page, /stage === 'TARGET'/);
  assert.match(page, /ImportedResumeReview/);
  assert.match(page, /TargetJobStep/);
});

test('target job UX keeps Job Description and CareerTarget outside candidate evidence', () => {
  const target = readFileSync(join(process.cwd(), 'components/TargetJobStep.tsx'), 'utf8');
  assert.match(target, /Missing requirements stay missing/i);
  assert.match(target, /Neither a Career Target nor a Job Description can create/i);
  assert.match(target, /Intent is not evidence/i);
  assert.doesNotMatch(target, /matching keywords/i);
});

test('imported review exposes experience technologies that were previously hidden in review', () => {
  const review = readFileSync(join(process.cwd(), 'components/ImportedResumeReview.tsx'), 'utf8');
  assert.match(review, /item\.technologies\.map/);
  assert.match(review, /sourceSha256/);
  assert.match(review, /From CV/);
});

test('resume upload implements actual drag and drop instead of copy-only affordance', () => {
  const upload = readFileSync(join(process.cwd(), 'components/CVUpload.tsx'), 'utf8');
  assert.match(upload, /onDragOver=\{handleDragOver\}/);
  assert.match(upload, /onDrop=\{handleDrop\}/);
  assert.match(upload, /event\.dataTransfer\.files/);
});

test('grounding and semantic grounding failures are surfaced as actionable evidence review', () => {
  const guardrail = readFileSync(join(process.cwd(), 'components/GenerationGuardrailPanel.tsx'), 'utf8');
  assert.match(guardrail, /factsToConfirm/);
  assert.match(guardrail, /generatedClaim/);
  assert.match(guardrail, /Edit my career evidence/);
  assert.match(guardrail, /invented evidence is not/i);
});
