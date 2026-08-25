import { readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';

const REVIEW_DIRNAME = '.ats-sys-03e-review';
const OPAQUE_DOCUMENT_ID = /^RW-\d{3,6}$/;
const OPAQUE_CORPUS_ID = /^CORPUS-\d{8}(?:-[A-Z0-9]{1,8})?$/;
const VALID_OUTCOMES = new Set(['SUCCESS_TRUTH_SAFE', 'SAFE_REFUSAL']);

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function inside(root, target) {
  const rel = relative(root, target);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('en-US');
}

function containsNormalized(haystack, needle) {
  return normalize(haystack).includes(normalize(needle));
}

function reviewedString(value, label) {
  if (typeof value !== 'string' || !value.trim() || value === 'REVIEW_REQUIRED') {
    throw new Error(`${label} must be human-reviewed and cannot remain REVIEW_REQUIRED.`);
  }
  return value.trim();
}

function reviewedBoolean(value, label) {
  if (typeof value !== 'boolean') throw new Error(`${label} must be true or false after source review.`);
  return value;
}

function reviewedCount(value, label) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer after source review.`);
  return value;
}

function stringArray(value, label, { min = 0 } = {}) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  const cleaned = value.map((item) => reviewedString(item, label));
  if (cleaned.length < min) throw new Error(`${label} must contain at least ${min} reviewed value(s).`);
  return cleaned;
}

async function main() {
  const suppliedManifest = argValue('--manifest') || process.env.CVENGINE_REAL_CORPUS_MANIFEST;
  if (!suppliedManifest) throw new Error('Pass --manifest /absolute/private/manifest.json or set CVENGINE_REAL_CORPUS_MANIFEST.');

  const manifestPath = resolve(suppliedManifest);
  const repoRoot = resolve(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
  if (inside(repoRoot, manifestPath)) throw new Error('ATS-SYS-03E finalizer requires a manifest outside the repository.');

  const corpusRoot = dirname(manifestPath);
  const reviewRoot = resolve(corpusRoot, REVIEW_DIRNAME);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

  if (!OPAQUE_CORPUS_ID.test(manifest.corpusId ?? '')) {
    throw new Error('corpusId must use the privacy-safe CORPUS-YYYYMMDD[-SUFFIX] form.');
  }
  if (!Array.isArray(manifest.documents) || manifest.documents.length === 0) {
    throw new Error('ATS-SYS-03E finalizer requires at least one inventoried document.');
  }

  const finalizedDocuments = [];
  for (const document of manifest.documents) {
    if (!OPAQUE_DOCUMENT_ID.test(document.id ?? '')) {
      throw new Error('ATS-SYS-03E finalizer requires opaque RW-### document ids.');
    }

    const templatePath = resolve(reviewRoot, document.id, 'ground-truth.template.json');
    const sourcePath = resolve(reviewRoot, document.id, 'source.txt');
    if (!inside(reviewRoot, templatePath) || !inside(reviewRoot, sourcePath)) {
      throw new Error(`Review paths escaped private review root for ${document.id}.`);
    }

    const template = JSON.parse(await readFile(templatePath, 'utf8'));
    const sourceText = await readFile(sourcePath, 'utf8');
    if (template.documentId !== document.id) throw new Error(`${document.id} template documentId mismatch.`);
    if (String(template.sourceSha256 ?? '').toLowerCase() !== String(document.sha256 ?? '').toLowerCase()) {
      throw new Error(`${document.id} template/source sha256 does not match inventory.`);
    }

    const review = template.reviewRequired ?? {};
    const locale = reviewedString(review.locale, `${document.id}.locale`);
    const layout = reviewedString(review.layout, `${document.id}.layout`);
    const careerLevel = reviewedString(review.careerLevel, `${document.id}.careerLevel`);
    const expectedOutcome = reviewedString(review.expectedOutcome, `${document.id}.expectedOutcome`);
    if (!VALID_OUTCOMES.has(expectedOutcome)) {
      throw new Error(`${document.id}.expectedOutcome must be SUCCESS_TRUTH_SAFE or SAFE_REFUSAL.`);
    }

    const finalized = {
      id: document.id,
      file: document.file,
      sha256: document.sha256,
      format: document.format,
      sourceClass: document.sourceClass,
      locale,
      layout,
      careerLevel,
      expectedOutcome,
    };

    if (expectedOutcome === 'SUCCESS_TRUTH_SAFE') {
      const requiredStrings = stringArray(review.requiredStrings, `${document.id}.requiredStrings`, { min: 1 });
      const forbiddenStrings = stringArray(review.forbiddenStrings, `${document.id}.forbiddenStrings`, { min: 1 });

      for (const required of requiredStrings) {
        if (!containsNormalized(sourceText, required)) {
          throw new Error(`${document.id} requiredStrings contains a value not present in source.txt. Ground truth must stay source-backed.`);
        }
      }
      for (const forbidden of forbiddenStrings) {
        if (containsNormalized(sourceText, forbidden)) {
          throw new Error(`${document.id} forbiddenStrings contains a value that is actually present in source.txt.`);
        }
      }

      finalized.expectedTruth = {
        summaryPresent: reviewedBoolean(review.summaryPresent, `${document.id}.summaryPresent`),
        experienceCount: reviewedCount(review.experienceCount, `${document.id}.experienceCount`),
        educationCount: reviewedCount(review.educationCount, `${document.id}.educationCount`),
        requiredStrings,
        forbiddenStrings,
      };
    } else {
      finalized.allowedErrorCodes = stringArray(review.allowedErrorCodes, `${document.id}.allowedErrorCodes`, { min: 1 });
    }

    finalizedDocuments.push(finalized);
  }

  const finalizedManifest = {
    manifestVersion: manifest.manifestVersion,
    corpusId: manifest.corpusId,
    documents: finalizedDocuments,
  };

  await writeFile(manifestPath, `${JSON.stringify(finalizedManifest, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  process.stdout.write('ATS-SYS-03E private ground truth finalized.\n');
  process.stdout.write(`Corpus: ${manifest.corpusId}\n`);
  process.stdout.write(`Documents: ${finalizedDocuments.length}\n`);
  process.stdout.write('Oracle: HUMAN_AUTHORED_FROM_SOURCE_ONLY\n');
  process.stdout.write(`Manifest: ${manifestPath}\n`);
  process.stdout.write('Status: READY_FOR_EVIDENCE_CAMPAIGN\n');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
