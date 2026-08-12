# PR-ATS2-14 — Native Resume Import & n8n Runtime Removal

## Gate

`G14 NATIVE_RESUME_IMPORT — PASS (SOURCE-BOUND EXTRACTION, N8N RESUME RUNTIME REMOVED)`

## Why this gate exists

G8 established a trusted resume-import boundary, but its first infrastructure adapter depended on an external n8n webhook. The workflow was operationally external to the repository and could disappear or become unavailable while the ATS application itself remained healthy.

G14 removes n8n from the resume-import runtime path without weakening the G8 trust model.

## Architecture

```text
Browser
  ↓
POST /api/import-resume
  ↓
ResumeImportService
  ↓
NativeResumeImportProvider
  ↓
Deterministic text extraction
  ├─ PDF  → pdfjs-dist
  └─ DOCX → mammoth
  ↓
Machine-readable text gate
  ↓
Constrained Gemini structured extraction
  ↓
Zod response validation
  ↓
Candidate draft + EvidenceMap
  ↓
Mandatory source-evidence validation
  ↓
SourceReceipt + SHA-256
  ↓
Candidate review
  ↓
CareerEvidence / CareerAssertions
```

## Trust invariants preserved

1. The uploaded resume is candidate source material, not independently verified truth.
2. Imported values never become `VERIFIED_FACT` merely because an extractor produced them.
3. Job Description data never enters the resume-import contract and never becomes candidate evidence.
4. Every non-empty material field produced by the structured extractor must have a matching source-evidence entry.
5. Every evidence excerpt must be present in the extracted source text; PDF page references must resolve to the claimed page.
6. Missing or unsupported extraction evidence fails closed rather than silently entering candidate truth.
7. Candidate review remains the promotion boundary. Existing G8 behavior for unchanged, edited, and candidate-added fields is preserved.
8. The original upload receipt remains content-addressed with SHA-256 and retains file name, MIME type, byte size, capture timestamp, importer, and importer version.

## Native extraction

### PDF

Text-based PDF files are parsed server-side with `pdfjs-dist`. Page text is retained separately so evidence can be bound to a page number.

Image-only or text-poor PDFs are not OCR'd in this gate. They fail with an explicit message requesting a text-based PDF or DOCX.

### DOCX

DOCX files are parsed server-side with `mammoth.extractRawText`. DOCX extraction currently provides document-level source evidence rather than artificial page numbers.

### Legacy `.doc`

Binary Word `.doc` files are intentionally not accepted. G14 does not introduce LibreOffice, an external converter, or another opaque service merely to preserve this legacy format. Users must convert `.doc` to PDF or DOCX.

## Structured extraction

G14 reuses the existing server-side `GEMINI_API_KEY` and a constrained JSON schema.

The extraction instruction explicitly treats resume text as untrusted data and requires:

- explicit-source facts only;
- no invented or inferred metrics, dates, technologies, seniority, ownership, scope, achievements, locations, education, certifications, or language proficiency;
- no generated professional summary when the source does not contain one;
- empty values instead of guesses;
- one source excerpt for every non-empty extracted leaf field;
- no Job Description content.

The AI output is still only an extraction proposal. Source binding and candidate review remain authoritative trust controls.

## Runtime dependency change

Removed:

```text
/api/import-resume
  ↓
N8nResumeImportProvider
  ↓
N8N_RESUME_URL
  ↓
external n8n workflow
```

Current:

```text
/api/import-resume
  ↓
NativeResumeImportProvider
  ↓
pdfjs-dist / mammoth
  ↓
Gemini structured extraction
```

`N8nResumeImportProvider.ts` is removed from the repository and `/api/import-resume` no longer reads or calls the n8n resume webhook.

An empty `N8N_RESUME_URL` line remains temporarily in `.env.example` only as an inert historical G8 compatibility sentinel for an existing browser-isolation regression. Native resume import does not read it. This sentinel can be deleted when the historical regression assertion is migrated; it is not a runtime dependency.

Other pre-existing n8n variables for unrelated optimize/suggestion browser integrations are outside this gate.

## Behavioral coverage

G14 adds coverage for:

- real PDF text extraction in the Node runtime using an in-memory PDF fixture;
- complete evidence coverage for every non-empty extracted candidate field;
- rejection when candidate fields lack source evidence;
- rejection when evidence excerpts do not exist in source text;
- rejection of legacy binary `.doc`;
- assertion that the runtime import route is native and no longer references the n8n resume provider.

The behavior TypeScript manifest was also hardened from an explicit hand-maintained list of test files to `tests/ats2/*.test.ts`, preventing future ATS2 regression files from silently being omitted.

## CI incident and correction

The first implementation CI runs were green but still reported the pre-G14 total of 49 tests. That revealed that the newly added test file was not included by `tsconfig.behavior.json` because the manifest enumerated historical tests one by one.

The green result was not accepted as authoritative. The manifest was changed to include all `tests/ats2/*.test.ts`, then the full pipeline was rerun.

## Authoritative validation before documentation head

Feature head `2ca9a47b570d7d66322bb1d70d12e3a7d7ff00c7`, GitHub Actions run `31549961224`:

- `npm ci` — PASS
- lint — PASS (pre-existing warnings remain)
- typecheck — PASS
- ATS v2 behavior tests — **55/55 PASS**
- native Node PDF extraction regression — PASS
- G10 controlled Job Match benchmark — **42/42 cases preserved, 0 false MATCH, 0 false GAP**
- production build — PASS
- Vercel deployment — PASS

### PDF.js observation

The synthetic PDF regression emits a PDF.js warning that `standardFontDataUrl` is not configured for its standard-font fixture. Text extraction still succeeds and the regression passes. G14 intentionally does not add a filesystem or deployment-specific standard-font asset path merely to suppress this warning. This should be revisited if real-world corpus testing shows extraction degradation on PDFs that rely on non-embedded standard fonts.

## Explicit non-goals / claims not made

G14 does **not** claim:

- OCR support for scanned/image-only resumes;
- support for legacy binary `.doc`;
- that AI extraction independently verifies candidate claims;
- universal extraction accuracy across arbitrary resume layouts;
- real-world calibration of resume import quality;
- removal of unrelated n8n optimize/suggestion integrations;
- changes to authentication, Career Vault ownership, retention, concurrency, or privacy controls.

## Result

Resume ingestion is now repository-owned and server-side. Losing an n8n resume workflow can no longer break the ATS resume-import capability, while G8 source provenance and candidate-truth boundaries remain intact.
