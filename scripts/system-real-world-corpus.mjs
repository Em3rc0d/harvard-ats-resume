import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { captureCanonicalRuntimeIdentity } from './system-runtime-identity.mjs';
import {
  classifyAcceptedTruthIssues,
  isUnsafeAcceptedTruthClassification,
} from './system-real-world-corpus-classification.mjs';

const BASE_URL = (process.env.CV_ENGINE_E2E_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const MANIFEST_VERSION = 'ats-sys-03e-real-world-corpus-manifest-v0.1';
const RECEIPT_VERSION = 'ats-sys-03e-real-world-corpus-v0.1';
const MAX_DOCUMENTS_PER_RUN = 40;
const OPAQUE_CORPUS_ID = /^CORPUS-\d{8}(?:-[A-Z0-9]{1,8})?$/;
const OPAQUE_DOCUMENT_ID = /^RW-\d{3,6}$/;
const SAFE_ERROR_CODES = new Set([
  'RESUME_IMPORT_TIMEOUT',
  'RESUME_EXTRACTION_INCOMPLETE',
  'NO_SOURCE_BACKED_CANDIDATE_CONTENT',
  'NO_CANDIDATE_CONTENT',
  'SOURCE_RECONCILIATION_REJECTED',
  'RESUME_IMPORT_RUNTIME_FAILURE',
  'RESUME_TEXT_UNREADABLE',
  'INVALID_RESUME_FILE',
]);
const SUPPORTED_FORMATS = new Set(['DOCX', 'PDF']);
const SUPPORTED_SOURCE_CLASSES = new Set(['REAL_USER_PROVIDED', 'PUBLIC_SANITIZED', 'SYNTHETIC_STRESS']);
const SUPPORTED_OUTCOMES = new Set(['SUCCESS_TRUTH_SAFE', 'SAFE_REFUSAL']);

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function isoSafe(value) {
  return value.replace(/[:.]/g, '-');
}

function normalize(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase();
}

function hasString(haystack, needle) {
  return normalize(haystack).includes(normalize(needle));
}

function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

function inside(root, target) {
  const rel = relative(root, target);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
  return value.trim();
}

function validateManifest(manifest) {
  if (manifest?.manifestVersion !== MANIFEST_VERSION) {
    throw new Error(`Expected manifestVersion ${MANIFEST_VERSION}.`);
  }
  const corpusId = assertString(manifest.corpusId, 'corpusId');
  if (!OPAQUE_CORPUS_ID.test(corpusId)) {
    throw new Error('corpusId must be an opaque identifier like CORPUS-20260825 or CORPUS-20260825-A; names and other PII are forbidden in evidence identifiers.');
  }
  if (!Array.isArray(manifest.documents) || manifest.documents.length === 0) {
    throw new Error('ATS-SYS-03E manifest must contain at least one document.');
  }
  if (manifest.documents.length > MAX_DOCUMENTS_PER_RUN) {
    throw new Error(`ATS-SYS-03E limits one public-API corpus run to ${MAX_DOCUMENTS_PER_RUN} documents so the existing 50-request/hour limiter remains enabled. Split larger corpora into cohorts.`);
  }
  const ids = new Set();
  for (const [index, document] of manifest.documents.entries()) {
    const prefix = `documents[${index}]`;
    const id = assertString(document.id, `${prefix}.id`);
    if (!OPAQUE_DOCUMENT_ID.test(id)) {
      throw new Error(`${prefix}.id must use the privacy-safe RW-### form; names and other PII are forbidden in evidence identifiers.`);
    }
    if (ids.has(id)) throw new Error(`Duplicate corpus document id: ${id}.`);
    ids.add(id);
    assertString(document.file, `${prefix}.file`);
    if (isAbsolute(document.file) || document.file.split(/[\\/]+/).includes('..')) {
      throw new Error(`${prefix}.file must be relative to the external manifest directory.`);
    }
    if (!SUPPORTED_FORMATS.has(document.format)) throw new Error(`${prefix}.format must be DOCX or PDF.`);
    if (!SUPPORTED_SOURCE_CLASSES.has(document.sourceClass)) throw new Error(`${prefix}.sourceClass is invalid.`);
    if (!SUPPORTED_OUTCOMES.has(document.expectedOutcome)) throw new Error(`${prefix}.expectedOutcome is invalid.`);
    if (!/^[a-f0-9]{64}$/i.test(document.sha256 ?? '')) throw new Error(`${prefix}.sha256 must pin the exact source document.`);
    assertString(document.locale, `${prefix}.locale`);
    assertString(document.layout, `${prefix}.layout`);
    assertString(document.careerLevel, `${prefix}.careerLevel`);
    if (document.expectedOutcome === 'SUCCESS_TRUTH_SAFE') {
      if (!document.expectedTruth || !Array.isArray(document.expectedTruth.requiredStrings) || !Array.isArray(document.expectedTruth.forbiddenStrings)) {
        throw new Error(`${prefix}.expectedTruth requiredStrings/forbiddenStrings are required for SUCCESS_TRUTH_SAFE.`);
      }
    } else if (!Array.isArray(document.allowedErrorCodes) || document.allowedErrorCodes.length === 0) {
      throw new Error(`${prefix}.allowedErrorCodes is required for SAFE_REFUSAL.`);
    }
  }
}

function validateTruth(candidate, expected) {
  const issues = [];
  const serialized = JSON.stringify(candidate);
  if (typeof expected.summaryPresent === 'boolean') {
    const actual = Boolean(candidate?.summary?.trim?.());
    if (actual !== expected.summaryPresent) issues.push('SUMMARY_PRESENCE_MISMATCH');
  }
  if (Number.isInteger(expected.experienceCount)) {
    const actual = Array.isArray(candidate?.experience) ? candidate.experience.length : 0;
    if (actual !== expected.experienceCount) issues.push('EXPERIENCE_COUNT_MISMATCH');
  }
  if (Number.isInteger(expected.educationCount)) {
    const actual = Array.isArray(candidate?.education) ? candidate.education.length : 0;
    if (actual !== expected.educationCount) issues.push('EDUCATION_COUNT_MISMATCH');
  }
  for (const required of expected.requiredStrings ?? []) {
    if (!hasString(serialized, required)) issues.push('REQUIRED_SOURCE_TRUTH_MISSING');
  }
  for (const forbidden of expected.forbiddenStrings ?? []) {
    if (hasString(serialized, forbidden)) issues.push('FORBIDDEN_CANDIDATE_TRUTH_PRESENT');
  }
  return issues;
}

async function persist(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function health(expectedBuildSha) {
  const response = await fetch(`${BASE_URL}/api/health`);
  const body = await response.json();
  if (response.status !== 200 || body?.status !== 'READY') {
    throw new Error(`ATS-SYS-03E requires READY runtime; received HTTP ${response.status} / ${body?.status ?? 'UNKNOWN'}.`);
  }
  if (!body?.identity?.releaseQualifiableIdentity || body.identity.buildSha !== expectedBuildSha) {
    throw new Error(`Runtime identity mismatch: expected ${expectedBuildSha}, received ${body?.identity?.buildSha ?? 'UNKNOWN'}.`);
  }
  return body;
}

function mimeFor(format) {
  return format === 'PDF'
    ? 'application/pdf'
    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
}

async function importDocument(document, corpusRoot) {
  const filePath = resolve(corpusRoot, document.file);
  const bytes = await readFile(filePath);
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mimeFor(document.format) }), basename(filePath));

  const started = performance.now();
  let response;
  let body;
  try {
    response = await fetch(`${BASE_URL}/api/import-resume`, {
      method: 'POST',
      body: form,
      headers: { 'x-ats-sys-03e-document-id': document.id },
    });
    const text = await response.text();
    try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  } catch {
    return {
      documentId: document.id,
      sourceClass: document.sourceClass,
      format: document.format,
      locale: document.locale,
      layout: document.layout,
      careerLevel: document.careerLevel,
      sourceSha256: document.sha256,
      expectedOutcome: document.expectedOutcome,
      latencyMs: Math.round(performance.now() - started),
      classification: 'ROBUSTNESS_FAILURE_TRANSPORT',
      httpStatus: null,
      errorCode: 'FETCH_FAILURE',
      section: null,
      acceptedCandidateTruth: false,
      truthIssueKinds: [],
      importerVersion: null,
      rejectedFieldCount: 0,
    };
  }

  const latencyMs = Math.round(performance.now() - started);
  const success = response.ok && body?.success && body?.data?.resume;
  if (success) {
    if (document.expectedOutcome === 'SAFE_REFUSAL') {
      return {
        documentId: document.id,
        sourceClass: document.sourceClass,
        format: document.format,
        locale: document.locale,
        layout: document.layout,
        careerLevel: document.careerLevel,
        sourceSha256: document.sha256,
        expectedOutcome: document.expectedOutcome,
        latencyMs,
        classification: 'ROBUSTNESS_FAILURE_UNEXPECTED_ACCEPTANCE',
        httpStatus: response.status,
        errorCode: null,
        section: null,
        acceptedCandidateTruth: true,
        truthIssueKinds: [],
        importerVersion: body.data.context?.receipt?.importerVersion ?? null,
        rejectedFieldCount: body.data.context?.rejectedFieldPaths?.length ?? 0,
      };
    }
    const truthIssueKinds = validateTruth(body.data.resume, document.expectedTruth);
    return {
      documentId: document.id,
      sourceClass: document.sourceClass,
      format: document.format,
      locale: document.locale,
      layout: document.layout,
      careerLevel: document.careerLevel,
      sourceSha256: document.sha256,
      expectedOutcome: document.expectedOutcome,
      latencyMs,
      classification: classifyAcceptedTruthIssues(truthIssueKinds),
      httpStatus: response.status,
      errorCode: null,
      section: null,
      acceptedCandidateTruth: true,
      truthIssueKinds,
      importerVersion: body.data.context?.receipt?.importerVersion ?? null,
      rejectedFieldCount: body.data.context?.rejectedFieldPaths?.length ?? 0,
    };
  }

  const acceptedCandidateTruth = Boolean(body?.data?.resume || body?.data?.context);
  const errorCode = typeof body?.errorCode === 'string' ? body.errorCode : `HTTP_${response.status}`;
  let classification;
  if (acceptedCandidateTruth) classification = 'UNSAFE_FAILURE_WITH_ACCEPTED_DATA';
  else if (errorCode === 'RESUME_IMPORT_RATE_LIMITED') classification = 'CONTROL_PLANE_RATE_LIMIT';
  else if (document.expectedOutcome === 'SAFE_REFUSAL' && document.allowedErrorCodes.includes(errorCode)) classification = 'SAFE_REFUSAL_EXPECTED';
  else if (SAFE_ERROR_CODES.has(errorCode) || errorCode.startsWith('AI_PROVIDER_')) classification = 'ROBUSTNESS_FAILURE_SAFE';
  else classification = 'ROBUSTNESS_FAILURE_OTHER';

  return {
    documentId: document.id,
    sourceClass: document.sourceClass,
    format: document.format,
    locale: document.locale,
    layout: document.layout,
    careerLevel: document.careerLevel,
    sourceSha256: document.sha256,
    expectedOutcome: document.expectedOutcome,
    latencyMs,
    classification,
    httpStatus: response.status,
    errorCode,
    section: body?.section ?? null,
    acceptedCandidateTruth,
    truthIssueKinds: [],
    importerVersion: null,
    rejectedFieldCount: 0,
  };
}

function summarize(requests) {
  const counts = {};
  const latencies = [];
  for (const request of requests) {
    counts[request.classification] = (counts[request.classification] ?? 0) + 1;
    if (Number.isFinite(request.latencyMs)) latencies.push(request.latencyMs);
  }
  return {
    documents: requests.length,
    counts,
    expectedPasses: (counts.SUCCESS_TRUTH_SAFE ?? 0) + (counts.SAFE_REFUSAL_EXPECTED ?? 0),
    truthSafeSuccesses: counts.SUCCESS_TRUTH_SAFE ?? 0,
    expectedSafeRefusals: counts.SAFE_REFUSAL_EXPECTED ?? 0,
    robustnessFailuresSafe: (counts.ROBUSTNESS_FAILURE_SAFE ?? 0) + (counts.ROBUSTNESS_FAILURE_TRANSPORT ?? 0) + (counts.ROBUSTNESS_FAILURE_OTHER ?? 0),
    unexpectedAcceptedUnsupportedDocuments: counts.ROBUSTNESS_FAILURE_UNEXPECTED_ACCEPTANCE ?? 0,
    acceptedStructuralTruthMismatches: counts.STRUCTURAL_TRUTH_MISMATCH ?? 0,
    acceptedIncompleteTruth: counts.ROBUSTNESS_FAILURE_INCOMPLETE_ACCEPTANCE ?? 0,
    unsupportedTruthAccepted: counts.UNSUPPORTED_TRUTH_ACCEPTED ?? 0,
    unsafeAcceptedTruth: requests.filter((request) =>
      isUnsafeAcceptedTruthClassification(request.classification)).length,
    rateLimited: counts.CONTROL_PLANE_RATE_LIMIT ?? 0,
    latencyMs: {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      max: latencies.length ? Math.max(...latencies) : null,
      min: latencies.length ? Math.min(...latencies) : null,
    },
  };
}

async function main() {
  const manifestPath = resolve(argValue('--manifest') || process.env.CVENGINE_REAL_CORPUS_MANIFEST || '');
  if (!manifestPath || manifestPath === resolve('')) {
    throw new Error('Set CVENGINE_REAL_CORPUS_MANIFEST or pass --manifest /absolute/path/to/manifest.json.');
  }
  const repoRoot = resolve(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
  if (inside(repoRoot, manifestPath)) {
    throw new Error('ATS-SYS-03E real corpus manifest must live outside the repository so PII-bearing truth envelopes cannot be committed accidentally.');
  }
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  validateManifest(manifest);
  const corpusRoot = dirname(manifestPath);

  for (const document of manifest.documents) {
    const filePath = resolve(corpusRoot, document.file);
    if (!inside(corpusRoot, filePath)) throw new Error(`Document ${document.id} escapes corpus root.`);
    if (inside(repoRoot, filePath)) throw new Error(`Document ${document.id} must live outside the repository.`);
    const info = await stat(filePath);
    if (!info.isFile() || info.size === 0) throw new Error(`Document ${document.id} is missing or empty.`);
    const extension = extname(filePath).toLowerCase();
    if ((document.format === 'PDF' && extension !== '.pdf') || (document.format === 'DOCX' && extension !== '.docx')) {
      throw new Error(`Document ${document.id} format/extension mismatch.`);
    }
    const bytes = await readFile(filePath);
    const actualSha = sha256(bytes);
    if (actualSha !== document.sha256.toLowerCase()) throw new Error(`Document ${document.id} sha256 mismatch; source changed after ground truth was authored.`);
  }

  const expectedBuildSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const healthBody = await health(expectedBuildSha);
  const runtimeIdentity = await captureCanonicalRuntimeIdentity({
    expectedBuildSha,
    healthStatusCode: 200,
    healthBody,
  });

  const startedAt = new Date().toISOString();
  const outputDir = resolve(process.env.CVENGINE_SYS03E_EVIDENCE_DIR || `evidence/ats-sys-03/real-world-corpus/${isoSafe(startedAt)}`);
  await mkdir(outputDir, { recursive: true });

  const requests = [];
  for (const document of manifest.documents) {
    const result = await importDocument(document, corpusRoot);
    requests.push(result);
    process.stdout.write(`ATS-SYS-03E ${document.id}: ${result.classification} ${result.latencyMs} ms\n`);
  }

  const aggregate = summarize(requests);
  const coverage = {
    sourceClasses: Object.fromEntries([...new Set(requests.map((item) => item.sourceClass))].map((value) => [value, requests.filter((item) => item.sourceClass === value).length])),
    formats: Object.fromEntries([...new Set(requests.map((item) => item.format))].map((value) => [value, requests.filter((item) => item.format === value).length])),
    locales: Object.fromEntries([...new Set(requests.map((item) => item.locale))].map((value) => [value, requests.filter((item) => item.locale === value).length])),
    layouts: Object.fromEntries([...new Set(requests.map((item) => item.layout))].map((value) => [value, requests.filter((item) => item.layout === value).length])),
    careerLevels: Object.fromEntries([...new Set(requests.map((item) => item.careerLevel))].map((value) => [value, requests.filter((item) => item.careerLevel === value).length])),
  };

  const result = aggregate.expectedPasses === requests.length
    && aggregate.unsafeAcceptedTruth === 0
    && aggregate.rateLimited === 0
    && aggregate.unexpectedAcceptedUnsupportedDocuments === 0
    ? 'EVIDENCE_CAPTURED'
    : 'FAILED';

  const receipt = {
    receiptVersion: RECEIPT_VERSION,
    startedAt,
    completedAt: new Date().toISOString(),
    corpusId: manifest.corpusId,
    corpusManifestVersion: manifest.manifestVersion,
    corpusDocumentCount: manifest.documents.length,
    expectedBuildSha,
    runtimeProfileId: process.env.CVENGINE_RUNTIME_PROFILE_ID ?? 'UNDECLARED',
    runtimeIdentityRef: runtimeIdentity.runtimeIdentityRef,
    runtimeFingerprint: runtimeIdentity.runtimeIdentity,
    baseUrl: BASE_URL,
    privacy: {
      rawDocumentsPersistedInEvidence: false,
      groundTruthStringsPersistedInEvidence: false,
      sourcePathsPersistedInEvidence: false,
      documentIdentity: 'opaque RW-### id + sha256 only',
    },
    coverage,
    documents: requests,
    aggregate,
    result,
    claimBoundary: [
      'ATS-SYS-03E receipts describe only documents explicitly present in the external ground-truthed corpus.',
      'A passing cohort is observational; it does not establish arbitrary CV support or a population-wide success rate.',
      'REAL_USER_PROVIDED and PUBLIC_SANITIZED documents are real-world evidence; SYNTHETIC_STRESS documents remain synthetic.',
      'Raw resumes and PII-bearing expected truth remain outside Git and are intentionally excluded from evidence receipts.',
    ],
  };
  await persist(resolve(outputDir, 'receipt.json'), receipt);
  process.stdout.write(`\nATS-SYS-03E corpus: ${result}\n`);
  process.stdout.write(`Documents: ${aggregate.expectedPasses}/${requests.length} met expected outcome\n`);
  process.stdout.write(`Unsafe accepted truth: ${aggregate.unsafeAcceptedTruth}\n`);
  process.stdout.write(`Evidence: ${outputDir}\n`);
  if (result !== 'EVIDENCE_CAPTURED') process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
