import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { ImportedCandidateDraft } from '../../lib/application/import/ResumeImportProvider';
import { resolveResumeMimeType } from '../../lib/application/import/ResumeImportService';
import {
  DEFAULT_OLLAMA_IMPORT_MODEL,
  IMPORT_MAX_OUTPUT_TOKENS,
  deriveCandidateEvidence,
  extractResumeText,
  materialCandidateFieldPaths,
  reconcileCandidateToSource,
  resolveResumeImportTimeoutMs,
  validateAndMapEvidence,
  type ExtractedResumeTextDocument,
} from '../../lib/infrastructure/import/NativeResumeImportProvider';

function candidateFixture(): ImportedCandidateDraft {
  return {
    personalInfo: {
      fullName: 'Jane Candidate',
      email: 'jane@example.com',
      location: 'Lima, Peru',
      linkedin: '',
      github: '',
    },
    summary: '',
    experience: [{
      company: 'Acme',
      role: 'Backend Engineer',
      startDate: '2023',
      endDate: '2025',
      description: 'Built TypeScript APIs for internal workflows.',
      technologies: ['TypeScript'],
    }],
    education: [],
    skills: { hardSkills: ['TypeScript'], softSkills: [] },
    projects: [],
    certifications: [],
    languages: [],
  };
}

function documentFixture(): ExtractedResumeTextDocument {
  const pageOne = 'Jane Candidate jane@example.com Lima, Peru Acme Backend Engineer 2023 2025 Built TypeScript APIs for internal workflows. TypeScript';
  return {
    format: 'PDF',
    text: `[PAGE 1]\n${pageOne}`,
    pages: [{ page: 1, text: pageOne }],
  };
}

function completeEvidence() {
  return [
    { fieldPath: 'personalInfo.fullName', excerpt: 'Jane Candidate', page: 1 },
    { fieldPath: 'personalInfo.email', excerpt: 'jane@example.com', page: 1 },
    { fieldPath: 'personalInfo.location', excerpt: 'Lima, Peru', page: 1 },
    { fieldPath: 'experience[0].company', excerpt: 'Acme', page: 1 },
    { fieldPath: 'experience[0].role', excerpt: 'Backend Engineer', page: 1 },
    { fieldPath: 'experience[0].startDate', excerpt: '2023', page: 1 },
    { fieldPath: 'experience[0].endDate', excerpt: '2025', page: 1 },
    { fieldPath: 'experience[0].description', excerpt: 'Built TypeScript APIs for internal workflows.', page: 1 },
    { fieldPath: 'experience[0].technologies[0]', excerpt: 'TypeScript', page: 1 },
    { fieldPath: 'skills.hardSkills[0]', excerpt: 'TypeScript', page: 1 },
  ];
}

test('native PDF text extraction executes in the Node runtime used by ATS', async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([612, 792]);
  page.drawText('Jane Candidate jane@example.com Lima Peru Backend Engineer TypeScript APIs 2023 2025', { x: 48, y: 720, size: 12, font });
  const bytes = await pdf.save();

  const extracted = await extractResumeText({
    originalFileName: 'candidate.pdf',
    mimeType: 'application/pdf',
    byteSize: bytes.byteLength,
    bytes,
  });

  assert.equal(extracted.format, 'PDF');
  assert.equal(extracted.pages.length, 1);
  assert.match(extracted.pages[0]?.text ?? '', /Jane Candidate/);
  assert.match(extracted.pages[0]?.text ?? '', /TypeScript APIs/);
});

test('native import requires source-backed evidence for every non-empty extracted candidate field', () => {
  const candidate = candidateFixture();
  const mapped = validateAndMapEvidence(candidate, completeEvidence(), documentFixture());
  assert.deepEqual(mapped.map((item) => item.fieldPath).sort(), materialCandidateFieldPaths(candidate).sort());
  assert.ok(mapped.every((item) => item.locator.scope === 'SOURCE_DOCUMENT'));
  assert.ok(mapped.every((item) => item.locator.granularity === 'PAGE'));
});

test('native import derives complete evidence deterministically from candidate values and source text', () => {
  const candidate = candidateFixture();
  const mapped = deriveCandidateEvidence(candidate, documentFixture());
  assert.deepEqual(mapped.map((item) => item.fieldPath).sort(), materialCandidateFieldPaths(candidate).sort());
  assert.ok(mapped.every((item) => item.locator.scope === 'SOURCE_DOCUMENT'));
  assert.ok(mapped.every((item) => item.locator.granularity === 'PAGE'));
  assert.ok(mapped.every((item) => item.locator.page === 1));
});

test('deterministic evidence handles conservative PDF whitespace around URL punctuation', () => {
  const candidate = candidateFixture();
  candidate.personalInfo.linkedin = 'https://linkedin.com/in/jane-candidate';
  const document = documentFixture();
  const pageText = `${document.pages[0]?.text ?? ''} https : // linkedin . com / in / jane-candidate`;
  const urlDocument: ExtractedResumeTextDocument = {
    format: 'PDF',
    text: `[PAGE 1]\n${pageText}`,
    pages: [{ page: 1, text: pageText }],
  };
  const mapped = deriveCandidateEvidence(candidate, urlDocument);
  assert.ok(mapped.some((item) => item.fieldPath === 'personalInfo.linkedin'));
});

test('deterministic evidence rejects an extracted candidate value absent from the source', () => {
  const candidate = candidateFixture();
  candidate.experience[0] = { ...candidate.experience[0], role: 'Principal Architect' };
  assert.throws(() => deriveCandidateEvidence(candidate, documentFixture()), /value is not present in source text for experience\[0\]\.role/);
});

test('runtime source reconciliation drops one unsupported leaf without discarding supported experience evidence', () => {
  const candidate = candidateFixture();
  candidate.experience[0] = { ...candidate.experience[0], description: 'Architected an enterprise platform with global impact.' };
  const reconciled = reconcileCandidateToSource(candidate, documentFixture());

  assert.equal(reconciled.candidate.experience.length, 1);
  assert.equal(reconciled.candidate.experience[0]?.company, 'Acme');
  assert.equal(reconciled.candidate.experience[0]?.role, 'Backend Engineer');
  assert.equal(reconciled.candidate.experience[0]?.description, '');
  assert.ok(reconciled.rejectedFieldPaths.includes('experience[0].description'));
  assert.ok(reconciled.evidenceMap.some((item) => item.fieldPath === 'experience[0].role'));
  assert.ok(!reconciled.evidenceMap.some((item) => item.fieldPath === 'experience[0].description'));
  assert.deepEqual(reconciled.evidenceMap.map((item) => item.fieldPath).sort(), materialCandidateFieldPaths(reconciled.candidate).sort());
});

test('native import rejects candidate values without source evidence', () => {
  const evidence = completeEvidence().filter((item) => item.fieldPath !== 'experience[0].role');
  assert.throws(() => validateAndMapEvidence(candidateFixture(), evidence, documentFixture()), /missing source evidence for experience\[0\]\.role/);
});

test('native import rejects evidence excerpts that are absent from the source document', () => {
  const evidence = completeEvidence().map((item) => item.fieldPath === 'experience[0].role' ? { ...item, excerpt: 'Principal Architect' } : item);
  assert.throws(() => validateAndMapEvidence(candidateFixture(), evidence, documentFixture()), /evidence is not present in source text for experience\[0\]\.role/);
});

test('legacy binary DOC is rejected rather than routed through an opaque converter', () => {
  assert.throws(() => resolveResumeMimeType('candidate.doc', 'application/msword'), /Use PDF or DOCX/);
});

test('native resume import uses a bounded local extraction budget', () => {
  assert.equal(DEFAULT_OLLAMA_IMPORT_MODEL, 'qwen3:4b-instruct');
  assert.equal(IMPORT_MAX_OUTPUT_TOKENS, 3_072);
  assert.equal(resolveResumeImportTimeoutMs(undefined), 180_000);
  assert.equal(resolveResumeImportTimeoutMs('240000'), 240_000);
});

test('native resume import rejects unsafe timeout configuration', () => {
  assert.throws(() => resolveResumeImportTimeoutMs('1000'), /between 30000 and 300000/);
  assert.throws(() => resolveResumeImportTimeoutMs('not-a-number'), /between 30000 and 300000/);
  assert.throws(() => resolveResumeImportTimeoutMs('400000'), /between 30000 and 300000/);
});

test('runtime resume import derives source evidence in ATS and classifies each safe failure boundary', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/import-resume/route.ts'), 'utf8');
  const nativeProvider = readFileSync(join(process.cwd(), 'lib/infrastructure/import/NativeResumeImportProvider.ts'), 'utf8');

  assert.match(route, /NativeResumeImportProvider/);
  assert.match(route, /ResumeImportTimeoutError/);
  assert.match(route, /status: 504/);
  assert.match(route, /RESUME_IMPORT_TIMEOUT/);
  assert.match(route, /SOURCE_RECONCILIATION_REJECTED/);
  assert.match(route, /classifyImportFailure/);
  assert.match(nativeProvider, /reconcileCandidateToSource\(candidate, document\)/);
  assert.match(nativeProvider, /deriveCandidateEvidence\(reconciled, document\)/);
  assert.match(nativeProvider, /no source match -> no imported fact/i);
  assert.doesNotMatch(nativeProvider, /rawImportExtractionSchema|evidenceMap: z\.array/);
  assert.doesNotMatch(route, /N8nResumeImportProvider|NEXT_PUBLIC_N8N_RESUME_URL/);
  assert.doesNotMatch(nativeProvider, /fetch\(.*N8N|NEXT_PUBLIC_N8N_RESUME_URL/);
});
