import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname, isAbsolute, relative, resolve, sep } from 'node:path';

const MANIFEST_VERSION = 'ats-sys-03e-real-world-corpus-manifest-v0.1';

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

async function main() {
  const supplied = argValue('--corpus-dir') || process.env.CVENGINE_REAL_CORPUS_DIR;
  if (!supplied) throw new Error('Pass --corpus-dir /absolute/private/corpus or set CVENGINE_REAL_CORPUS_DIR.');
  const corpusDir = resolve(supplied);
  const repoRoot = resolve(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
  if (inside(repoRoot, corpusDir)) {
    throw new Error('ATS-SYS-03E private corpus directory must live outside the repository.');
  }

  const entries = (await readdir(corpusDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && ['.pdf', '.docx'].includes(extname(entry.name).toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (entries.length === 0) throw new Error('No PDF/DOCX files found in the corpus directory.');

  const documents = [];
  for (const [index, entry] of entries.entries()) {
    const filePath = resolve(corpusDir, entry.name);
    const bytes = await readFile(filePath);
    const extension = extname(entry.name).toLowerCase();
    documents.push({
      id: `RW-${String(index + 1).padStart(3, '0')}`,
      file: basename(entry.name),
      sha256: sha256(bytes),
      format: extension === '.pdf' ? 'PDF' : 'DOCX',
      sourceClass: 'REAL_USER_PROVIDED',
      locale: 'REVIEW_REQUIRED',
      layout: 'REVIEW_REQUIRED',
      careerLevel: 'REVIEW_REQUIRED',
      expectedOutcome: 'REVIEW_REQUIRED',
      groundTruthStatus: 'REVIEW_REQUIRED',
    });
  }

  const manifest = {
    manifestVersion: MANIFEST_VERSION,
    corpusId: `private-corpus-${new Date().toISOString().slice(0, 10)}`,
    inventoryOnly: true,
    generatedAt: new Date().toISOString(),
    instructions: [
      'This inventory is intentionally not executable until every document is manually ground-truthed.',
      'Replace REVIEW_REQUIRED metadata and expectedOutcome for every document.',
      'For SUCCESS_TRUTH_SAFE add expectedTruth.requiredStrings and expectedTruth.forbiddenStrings; optional summary/experience/education counts are recommended.',
      'For SAFE_REFUSAL add allowedErrorCodes.',
      'Remove inventoryOnly and groundTruthStatus fields after review.',
      'Keep this manifest and all source CVs outside Git.',
    ],
    documents,
  };

  const outputPath = resolve(corpusDir, 'ats-sys-03e-manifest.inventory.json');
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  process.stdout.write(`ATS-SYS-03E private corpus inventory created.\n`);
  process.stdout.write(`Documents: ${documents.length}\n`);
  process.stdout.write(`Manifest: ${outputPath}\n`);
  process.stdout.write('Status: REVIEW_REQUIRED — do not run the evidence campaign until ground truth is complete.\n');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
