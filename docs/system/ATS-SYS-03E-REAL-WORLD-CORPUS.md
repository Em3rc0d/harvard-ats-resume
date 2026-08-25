# ATS-SYS-03E — Real-World Resume Corpus

## Purpose

ATS-SYS-03A-D established the current import architecture, endpoint pressure behavior and one-model-call-per-CV Ollama capacity on the identified `REFERENCE-CPU-01` runtime.

ATS-SYS-03E answers the remaining product question:

> Does the trusted resume-import boundary preserve real candidate truth across representative resume formats, layouts, languages and career shapes?

This phase is about **document diversity and correctness**, not throughput.

## Non-negotiable rules

```text
UNKNOWN != PASS
OBSERVED != SUPPORTED
SAFE REFUSAL != CORRUPTED TRUTH
REAL-WORLD != SYNTHETIC
RAW CV / PII != GIT ARTIFACT
```

Every accepted fact must remain source-backed. A safe refusal is a robustness failure when success was expected, but it is preferable to accepting unsupported Career Evidence.

## Privacy boundary

Real resumes and their PII-bearing ground-truth manifests must live outside the repository.

Recommended location on the reference host:

```text
/home/eduardo/cv-engine-real-corpus/
```

Do not commit:

- PDF/DOCX source files;
- names, emails, phone numbers or addresses from real candidates;
- PII-bearing `requiredStrings` / `forbiddenStrings` ground truth.

ATS-SYS-03E evidence receipts persist only:

- document ID;
- source SHA-256;
- format;
- source class;
- locale;
- layout classification;
- career-level classification;
- expected outcome;
- HTTP/error classification;
- latency;
- truth issue **kind**, never the truth string itself;
- importer version;
- rejected-field count.

The raw document, source path and ground-truth strings are intentionally excluded from the receipt.

## Source classes

Each document must be labelled:

```text
REAL_USER_PROVIDED
PUBLIC_SANITIZED
SYNTHETIC_STRESS
```

Only `REAL_USER_PROVIDED` and `PUBLIC_SANITIZED` contribute real-world evidence. `SYNTHETIC_STRESS` remains useful for regression pressure but must never be counted as proof of real-world coverage.

## Supported benchmark formats

Initial ATS-SYS-03E execution accepts:

```text
DOCX
PDF
```

PDF evidence is currently scoped to machine-readable text unless the expected outcome is an explicit safe refusal. OCR/image-only support must not be inferred from this phase.

## Ground-truth contract

A success-expected document uses:

```json
{
  "id": "RW-001",
  "file": "candidate.docx",
  "sha256": "<64 hex characters>",
  "format": "DOCX",
  "sourceClass": "REAL_USER_PROVIDED",
  "locale": "es-PE",
  "layout": "SINGLE_COLUMN",
  "careerLevel": "JUNIOR",
  "expectedOutcome": "SUCCESS_TRUTH_SAFE",
  "expectedTruth": {
    "summaryPresent": true,
    "experienceCount": 1,
    "educationCount": 1,
    "requiredStrings": ["<explicit source fact>"],
    "forbiddenStrings": ["<fact absent from source>"]
  }
}
```

A document intentionally outside the supported import envelope uses:

```json
{
  "id": "RW-099",
  "file": "image-only.pdf",
  "sha256": "<64 hex characters>",
  "format": "PDF",
  "sourceClass": "REAL_USER_PROVIDED",
  "locale": "es-PE",
  "layout": "IMAGE_ONLY_SCAN",
  "careerLevel": "MID",
  "expectedOutcome": "SAFE_REFUSAL",
  "allowedErrorCodes": ["RESUME_TEXT_UNREADABLE"]
}
```

The SHA-256 freezes the exact source used to author the ground truth. If the file changes, the harness refuses to run that document.

## Inventory helper

Create a private corpus directory outside Git and place the source PDF/DOCX documents there.

Then run:

```bash
npm run system:real-corpus:inventory -- --corpus-dir /home/eduardo/cv-engine-real-corpus
```

The helper:

1. discovers PDF/DOCX files;
2. assigns privacy-safe `RW-###` IDs;
3. calculates SHA-256;
4. records format;
5. writes `ats-sys-03e-manifest.inventory.json` beside the source files.

The inventory is deliberately **not executable**. Every `REVIEW_REQUIRED` field must be manually classified and ground-truthed before evidence collection.

## Execution limit and rate limiting

One ATS-SYS-03E run accepts at most **40 documents**.

This is intentional: the public `/api/import-resume` rate limiter remains enabled at the real product boundary. Larger corpora must be split into cohorts, for example:

```text
CORPUS-A  25 documents
CORPUS-B  25 documents
CORPUS-C  25 documents
CORPUS-D  25 documents
```

A cohort is evidence for its exact documents only. Cohort aggregation is interpretation; it does not create population-wide success-rate claims automatically.

## Coverage dimensions

The growing corpus should deliberately cover:

### Format

- DOCX;
- machine-readable PDF;
- malformed/unreadable PDF expected to fail safely;
- image-only scan expected to fail safely unless OCR is separately qualified.

### Layout

- single column;
- two column;
- sidebar;
- table-heavy;
- text boxes;
- unusual ordering;
- headers/footers/page numbers.

### Career shape

- student / no experience;
- junior;
- mid;
- senior;
- manager;
- executive;
- contractor/freelance;
- multi-role same employer;
- career gaps;
- multiple degrees;
- no education;
- no projects;
- dense certifications.

### Language

Initial priority:

- English;
- Spanish.

Additional locales become supported only after evidence exists.

### AI pressure

Include documents requiring:

- zero AI-backed sections;
- one AI-backed section;
- multiple AI-backed sections.

ATS-SYS-03D proved one model-backed section per import under pressure. ATS-SYS-03E must expose whether real documents with multiple ambiguous sections remain correct and acceptably bounded.

## Result classifications

```text
SUCCESS_TRUTH_SAFE
SAFE_REFUSAL_EXPECTED
ROBUSTNESS_FAILURE_SAFE
ROBUSTNESS_FAILURE_TRANSPORT
ROBUSTNESS_FAILURE_OTHER
ROBUSTNESS_FAILURE_UNEXPECTED_ACCEPTANCE
UNSAFE_SUCCESS
UNSAFE_FAILURE_WITH_ACCEPTED_DATA
CONTROL_PLANE_RATE_LIMIT
```

Hard safety failures:

```text
UNSAFE_SUCCESS
UNSAFE_FAILURE_WITH_ACCEPTED_DATA
```

A success-expected CV that safely refuses is not truth corruption, but it is a product robustness failure and blocks that cohort from PASS.

## Isolated reference execution

After every source file has ground truth:

```bash
export CVENGINE_RUNTIME_PROFILE_ID=REFERENCE-CPU-01
export CVENGINE_REAL_CORPUS_MANIFEST=/home/eduardo/cv-engine-real-corpus/manifest.json
npm run system:real-corpus:reference
```

The runner:

1. requires committed CV Engine source;
2. owns the isolated `cv-engine-reference` Compose project;
3. verifies dedicated app/Ollama/Redis ports;
4. builds exact HEAD into an identified production image;
5. waits for same-build `READY`;
6. clears stale benchmark-owned rate-limit keys while leaving the limiter enabled;
7. executes every external corpus document serially through the real `/api/import-resume` endpoint;
8. writes a PII-safe receipt.

## Evidence target

A cohort can reach:

```text
ATS-SYS-03E corpus: EVIDENCE_CAPTURED
Unsafe accepted truth: 0
```

only when every document meets its authored expected outcome, there is no rate-limit confound and there is no unsupported accepted candidate truth.

## Claim boundary

A passing corpus may establish:

- those exact real/sanitized documents behaved correctly;
- coverage observations by format/layout/locale/career level;
- safe refusal behavior for explicitly unsupported documents;
- observed latency distribution for the cohort.

It may not establish by itself:

- arbitrary CV support;
- a global success percentage;
- OCR support;
- support for locales absent from the corpus;
- production concurrency SLA;
- support on another runtime fingerprint.

The supported import envelope is approved only after the corpus is large and representative enough to justify an explicit policy.
