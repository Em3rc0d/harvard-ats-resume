# CV Engine — B5 Closure Receipt

Status: **CLOSED CANDIDATE — promotion exact-head certification required**

Node: **B5 — Trusted import convenience**

B5 realizes optional resume import without granting imported text candidate-truth authority. PDF/DOCX handling is bounded and mechanical; every extracted line remains a review proposal until explicit user acceptance, and accepted proposals enter Career Evidence as `NEEDS_REVIEW`, never `VERIFIED`.

## Signed contract realized

```text
PDF / DOCX source bytes
        ↓ request-scoped only
bounded mechanical extraction
        ↓
review proposals + hashes
        ↓ explicit user action
IMPORTED_RESUME Career Evidence
        ↓ NEEDS_REVIEW
B1 review / verification authority
```

Import remains optional. Unsupported, scanned, encrypted, malformed or otherwise non-defensible documents fail closed to manual Career Evidence.

## Closed invariants

```text
PDF_BOUNDED_MECHANICAL_EXTRACTION       PASS
DOCX_BOUNDED_MECHANICAL_EXTRACTION      PASS
UNSUPPORTED_DOCUMENT_FAIL_CLOSED        PASS
RAW_SOURCE_BYTES_NOT_DURABLE            PASS
SOURCE_SHA256_RECEIPT                   PASS
EXTRACTED_TEXT_HASH                     PASS
PROPOSAL_TEXT_HASH                      PASS
DETERMINISTIC_PROPOSALS                 PASS
IMPORT_REPLAY_IDEMPOTENCE               PASS
PROPOSAL_REVIEW_REQUIRED                PASS
USER_SELECTS_EVIDENCE_KIND              PASS
CLIENT_CANNOT_REPLACE_PROPOSAL_TEXT     PASS
ACCEPTANCE_TRANSACTIONAL                PASS
IMPORTED_SOURCE_PROVENANCE              PASS
ACCEPTED_STATUS_NEEDS_REVIEW            PASS
IMPORT_NEVER_AUTO_VERIFIES              PASS
DISMISSED_PROPOSAL_CANNOT_BE_ACCEPTED   PASS
HASH_MISMATCH_ATOMIC_ROLLBACK           PASS
MANUAL_FALLBACK                         PASS
OWNER_SCOPED_RLS                        PASS
ANONYMOUS_MUTATION_DENIAL               PASS
CROSS_USER_IDOR_DENIAL                  PASS
B1_REGRESSION                           PASS
B2_REGRESSION                           PASS
B3_REGRESSION                           PASS
B4_REGRESSION                           PASS
CONSTRUCTION                            PASS
```

## Trust boundary

The browser may upload source bytes for a single request and may choose an evidence kind when accepting a stored proposal. It may not author the stored proposal text, source hash, accepted Career Evidence text, owner identity or verification status.

Raw PDF/DOCX bytes are not stored in PostgreSQL. Durable state contains only bounded receipt/proposal metadata and provenance hashes.

## Failure semantics

- empty/oversized/unsupported media → reject or manual fallback;
- encrypted DOCX/PDF → unsupported/manual fallback;
- non-extractable/scanned PDF → unsupported/manual fallback;
- proposal hash mismatch → rollback complete receipt transaction;
- dismissed/already resolved proposal → cannot be accepted again;
- acceptance creates `IMPORTED_RESUME + NEEDS_REVIEW`, never trusted `VERIFIED` candidate truth.

## Evidence incidents closed during qualification

Two evidence defects were found by the certification process and corrected without weakening contracts:

1. `psql` variables were originally referenced inside dollar-quoted `DO` blocks. The physical gate was rewritten to pass state through temporary SQL tables so PostgreSQL executes the intended assertions.
2. strict TypeScript (`noUncheckedIndexedAccess` / `exactOptionalPropertyTypes`) rejected unsafe indexed accesses and optional RequestInit properties. The extractor/UI were made strict-type safe rather than relaxing compiler rules.

## Physical evidence

Final implementation head before promotion:

```text
e37649ecb8382f9d4897f8101844147c914dcb72
```

Exact-head qualification:

```text
CV Engine vNext Construction   run 33507517079  SUCCESS
CV Engine B1 PostgreSQL Gate   run 33507517051  SUCCESS
CV Engine B2 PostgreSQL Gate   run 33507517049  SUCCESS
CV Engine B3 PostgreSQL Gate   run 33507517151  SUCCESS
CV Engine B4 PostgreSQL Gate   run 33507517135  SUCCESS
CV Engine B5 PostgreSQL Gate   run 33507517082  SUCCESS
```

B5 PostgreSQL physically proves durable receipt/proposal behavior, idempotent replay, explicit acceptance/dismissal semantics, `NEEDS_REVIEW` creation, no auto-verification, hash mismatch rollback, raw-byte exclusion, ownership isolation and anonymous/client-write denial.

## Promotion rule

B5 is authoritatively CLOSED only when the promotion head containing this receipt and the canonical ledger update passes Construction + B1 + B2 + B3 + B4 + B5 on that same SHA.

After promotion certification:

```text
B5 = CLOSED
B6 = READY_TO_BUILD
```

Reopen B5 only under `docs/build/CLOSURE-PROTOCOL.md` when new contradictory executable evidence appears.
