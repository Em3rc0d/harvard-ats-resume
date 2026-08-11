# PR-ATS2-08 — Trusted Import & Source Provenance

## Objective

Make resume import an explicit source-provenance boundary instead of treating extractor output as equivalent to candidate truth.

## Architecture

```text
Browser
  ↓
/api/import-resume
  ↓
ResumeImportProvider
  ↓
N8nResumeImportProvider
  ↓
ImportedCandidateDraft + EvidenceMap
  ↓
SourceReceipt (SHA-256 + file/importer metadata)
  ↓
Candidate review
  ├─ unchanged → RESUME_UPLOAD evidence / CANDIDATE_CONFIRMED
  ├─ edited    → original retained + MANUAL_REVIEW / CANDIDATE_EDITED
  └─ added     → MANUAL_REVIEW / CANDIDATE_ADDED
  ↓
CareerAssertion = CANDIDATE_ASSERTED
```

## Invariants

1. Browser code never receives or calls the n8n resume webhook URL.
2. `N8N_RESUME_URL` is server-only configuration.
3. Resume import output cannot provide Job Description truth.
4. Every accepted uploaded document receives a SHA-256 receipt with original name, MIME type, byte size, capture time, importer and importer version.
5. Evidence can retain source-document or extraction-output locators plus extractor confidence when available.
6. Imported values can never become `VERIFIED_FACT` merely because an extractor returned them.
7. Candidate edits no longer claim the uploaded document as their supporting source; they are supported by `MANUAL_REVIEW` evidence while the original extraction remains available for audit.
8. Provenance travels separately from candidate facts into generation and is not forwarded to Gemini.

## Validation

Remote CI on head `4bf3e3778257618bf6c2ba57c03ee135f23cb71d`, run `31456827117`:
- `npm ci` PASS
- lint PASS
- typecheck PASS
- behavior tests PASS
- build PASS
- Vercel PASS

The first CI attempt correctly caught a typed `BlobPart` incompatibility in the Node upload adapter. The buffer conversion was corrected and the entire gate was rerun successfully.

## Gate

```text
G8 TRUSTED_IMPORT
  IMPORT_BOUNDARY            PASS
  SOURCE_RECEIPT             PASS
  SOURCE_PROVENANCE          PASS
  CANDIDATE_REVIEW_LINEAGE   PASS
  JD_SEPARATION              PASS
  INDEPENDENT_VERIFICATION   NOT CLAIMED
```

`Evidence is authority` now has an executable import provenance path, but source-document presence is still not the same as independent verification that a career claim occurred in the real world.
