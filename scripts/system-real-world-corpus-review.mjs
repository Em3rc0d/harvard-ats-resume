import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import mammoth from 'mammoth';

const OPAQUE_DOCUMENT_ID = /^RW-\d{3,}$/;
const REVIEW_DIRNAME = '.ats-sys-03e-review';
const MIN_MACHINE_READABLE_TEXT = 80;

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function inside(root, target) {
  const rel = relative(root, target);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function extractPdfText(bytes) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = getDocument({ data: new Uint8Array(bytes) });
  const pdf = await loadingTask.promise;
  try {
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines = [];
      let current = '';

      for (const item of content.items) {
        if (!item || typeof item !== 'object' || !('str' in item)) continue;

        const token = typeof item.str === 'string'
          ? item.str.replace(/\s+/g, ' ').trim()
          : '';

        if (token) current = current ? `${current} ${token}` : token;

        if (item.hasEOL === true) {
          if (current) lines.push(current.trim());
          current = '';
        }
      }

      if (current) lines.push(current.trim());

      const text = lines.filter(Boolean).join('\n').trim();
      pages.push({ page: pageNumber, text });
      page.cleanup();
    }
    return {
      pageCount: pages.length,
      text: pages.map((page) => `[PAGE ${page.page}]\n${page.text}`).join('\n\n').trim(),
    };
  } finally {
    await pdf.destroy();
  }
}

async function extractDocxText(bytes) {
  const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return {
    pageCount: null,
    text: result.value.replace(/\r\n/g, '\n').trim(),
  };
}

async function extractSource(document, corpusRoot) {
  const filePath = resolve(corpusRoot, document.file);
  if (!inside(corpusRoot, filePath)) throw new Error(`Document ${document.id} escapes corpus root.`);
  const bytes = await readFile(filePath);
  const actualSha = sha256(bytes);
  if (actualSha !== String(document.sha256 ?? '').toLowerCase()) {
    throw new Error(`Document ${document.id} sha256 mismatch; source changed after inventory.`);
  }
  if (document.format === 'PDF') return extractPdfText(bytes);
  if (document.format === 'DOCX') return extractDocxText(bytes);
  throw new Error(`Document ${document.id} has unsupported review format ${document.format}.`);
}

async function main() {
  const suppliedManifest = argValue('--manifest') || process.env.CVENGINE_REAL_CORPUS_MANIFEST;
  if (!suppliedManifest) {
    throw new Error('Pass --manifest /absolute/private/manifest.json or set CVENGINE_REAL_CORPUS_MANIFEST.');
  }

  const manifestPath = resolve(suppliedManifest);
  const repoRoot = resolve(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
  if (inside(repoRoot, manifestPath)) {
    throw new Error('ATS-SYS-03E review input must live outside the repository.');
  }

  const corpusRoot = dirname(manifestPath);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (!Array.isArray(manifest.documents) || manifest.documents.length === 0) {
    throw new Error('ATS-SYS-03E review manifest contains no documents.');
  }

  const reviewRoot = resolve(corpusRoot, REVIEW_DIRNAME);
  await mkdir(reviewRoot, { recursive: true, mode: 0o700 });

  const index = {
    generatedAt: new Date().toISOString(),
    corpusId: manifest.corpusId,
    oraclePolicy: 'HUMAN_AUTHORED_FROM_SOURCE_ONLY',
    modelUsed: false,
    importApiUsed: false,
    documents: [],
  };

  for (const document of manifest.documents) {
    if (!OPAQUE_DOCUMENT_ID.test(document.id ?? '')) {
      throw new Error('ATS-SYS-03E review requires opaque RW-### document ids.');
    }
    if (isAbsolute(document.file) || String(document.file).split(/[\\/]+/).includes('..')) {
      throw new Error(`Document ${document.id}.file must be relative to the private corpus root.`);
    }
    const extension = extname(document.file).toLowerCase();
    if ((document.format === 'PDF' && extension !== '.pdf') || (document.format === 'DOCX' && extension !== '.docx')) {
      throw new Error(`Document ${document.id} format/extension mismatch.`);
    }

    const extracted = await extractSource(document, corpusRoot);
    const readableCharacters = extracted.text.replace(/\[PAGE \d+\]/g, '').replace(/\s+/g, ' ').trim().length;
    const documentDir = resolve(reviewRoot, document.id);
    await mkdir(documentDir, { recursive: true, mode: 0o700 });

    await writeFile(resolve(documentDir, 'source.txt'), `${extracted.text}\n`, { encoding: 'utf8', mode: 0o600 });
    const template = {
      documentId: document.id,
      sourceSha256: document.sha256,
      format: document.format,
      sourceReview: {
        pageCount: extracted.pageCount,
        machineReadableCharacters: readableCharacters,
        machineReadableEnoughForCurrentImporter: readableCharacters >= MIN_MACHINE_READABLE_TEXT,
      },
      reviewRequired: {
        locale: 'REVIEW_REQUIRED',
        layout: 'REVIEW_REQUIRED',
        careerLevel: 'REVIEW_REQUIRED',
        expectedOutcome: readableCharacters >= MIN_MACHINE_READABLE_TEXT ? 'REVIEW_REQUIRED' : 'SAFE_REFUSAL_CANDIDATE',
        summaryPresent: 'REVIEW_REQUIRED',
        experienceCount: 'REVIEW_REQUIRED',
        educationCount: 'REVIEW_REQUIRED',
        requiredStrings: [],
        forbiddenStrings: [],
        allowedErrorCodes: readableCharacters >= MIN_MACHINE_READABLE_TEXT ? [] : ['RESUME_TEXT_UNREADABLE'],
      },
      oracleRule: 'Fill this template by reading source.txt/the original document. Do not use CV Engine or Ollama output as ground truth.',
    };
    await writeFile(resolve(documentDir, 'ground-truth.template.json'), `${JSON.stringify(template, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });

    index.documents.push({
      documentId: document.id,
      sourceSha256: document.sha256,
      format: document.format,
      pageCount: extracted.pageCount,
      machineReadableCharacters: readableCharacters,
      machineReadableEnoughForCurrentImporter: readableCharacters >= MIN_MACHINE_READABLE_TEXT,
      reviewDirectory: `${REVIEW_DIRNAME}/${document.id}`,
    });
    process.stdout.write(`ATS-SYS-03E review ${document.id}: ${readableCharacters} machine-readable chars\n`);
  }

  await writeFile(resolve(reviewRoot, 'review-index.json'), `${JSON.stringify(index, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  process.stdout.write(`\nATS-SYS-03E private review materials created.\n`);
  process.stdout.write(`Documents: ${index.documents.length}\n`);
  process.stdout.write(`Review root: ${reviewRoot}\n`);
  process.stdout.write('Oracle: HUMAN_AUTHORED_FROM_SOURCE_ONLY — no model/import output was used.\n');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
