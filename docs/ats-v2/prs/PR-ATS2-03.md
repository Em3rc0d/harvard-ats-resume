# PR-ATS2-03 — Legacy Truth Adapter & Claim Ledger

## Objective

Connect the existing v1 request contract to the ATS v2 truth model without replacing the current UI or generation behavior.

## BEFORE

The ATS v2 domain existed in `lib/domain`, but production requests still flowed directly from `ResumeRequest` to Gemini/scoring without first becoming evidence-backed candidate assertions.

## DURING

- Added `LegacyResumeAdapter` to project the existing `ResumeRequest` DTO into:
  - `CandidateProfile`
  - one explicit `CareerSource`
  - `CareerEvidence[]`
  - `CareerAssertion[]`
- Deliberately excludes `jobDescription` from candidate evidence.
- Added immutable-style `ClaimLedger` registration helpers.
- Added canonical claims whose wording is exactly the source assertion statement.
- Wired `/api/generate-resume` so every valid request crosses the ATS v2 truth boundary before Gemini executes.
- Existing Gemini/scoring response behavior remains intentionally unchanged in this PR.

## Invariants

- `INV-007`: `jobDescription` MUST NOT become candidate evidence through the legacy adapter.
- `INV-008`: every canonical `ResumeClaim` MUST reference an existing `CareerAssertion`.
- `INV-009`: a request that cannot produce evidence-backed claims MUST NOT proceed to probabilistic generation.
- Existing `INV-001` through `INV-006` remain authoritative.

## Gate

`G4 EVIDENCE_CLAIM_LEDGER`

PASS requires:
- clean `npm ci`
- lint PASS
- typecheck PASS
- build PASS
- legacy DTO projects into candidate evidence/assertions
- job description is structurally excluded from candidate projection
- canonical claims are created only through the ClaimLedger
- generation endpoint establishes the truth context before calling Gemini
- no intentional UI/output contract change
