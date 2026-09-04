# B9 Private Dogfood Receipt

Status: IN_PROGRESS
Date: 2026-09-04 (America/Lima)

## Privacy boundary

The real CV input and the manually curated golden CV remain private user-owned artifacts and are not committed to this public repository. This receipt contains only non-identifying structural observations and acceptance criteria.

## Private corpus shape

- Input document: DOCX, 2 pages.
- Golden document: DOCX, 1 page.
- Target profile family: backend / full-stack software development.
- Golden treatment: stronger active wording, reduced redundancy, selected projects/training, grouped technical skills, single-page density.
- Fabricated metrics: forbidden and not required by the golden.

## Dogfood findings closed in code

The private comparison exposed structural product gaps that synthetic happy-path fixtures alone did not make obvious. They were corrected without moving the Career Evidence truth boundary:

1. **Line-level import proposals are not always semantic resume units.** A project, employment entry or education entry can span several source lines. B9 now supports explicit user-selected grouping of source-contiguous pending proposals into one `NEEDS_REVIEW` CareerEvidence item. No kind is inferred automatically and no source wording is synthesized.
2. **Contiguity must follow the original document, not compressed proposal order.** Group acceptance now validates consecutive `sourceLine` values from the same import receipt, so blank/document boundaries cannot be crossed silently merely because proposal ordinals are adjacent.
3. **Source-preserved blocks must remain blocks in exports.** Approved multiline text is carried through the canonical semantic projection so TXT, DOCX and PDF preserve the same line structure instead of flattening source line breaks into whitespace.
4. **Editorial selection needs auditable balancing.** ResumePlan v3 persists the balanced density policy and section budgets as immutable provenance while retaining source-selection receipts for every eligible Career Evidence item.

All of these changes remain downstream from explicit candidate review. Imported material is still `NEEDS_REVIEW` until the user verifies it.

## Required engine capabilities reconciled against the golden

| Capability | Required by private golden | B9 implementation |
| --- | --- | --- |
| Career facts remain authoritative | Yes | CareerEvidence + immutable revisions |
| Imported multi-line resume units preserve source boundaries | Yes | explicit source-contiguous proposal grouping -> one NEEDS_REVIEW CareerEvidence |
| Wording can improve without rewriting truth | Yes | PresentationRevision + fact validator + explicit user approval |
| Identity/contact are not fake career claims | Yes | ResumeProfile + immutable profile revisions |
| Relevance and omissions are explainable | Yes | ResumePlan v3 + immutable source-selection receipts |
| Editorial density policy is reproducible | Yes | b9-balanced-one-page-density-v2 persisted in ResumePlan provenance |
| Professional summary is source-backed | Yes | ResumeComposition v2 summary source receipts |
| One-page intent is explicit without deleting career history | Yes | targetPages=1 + deterministic per-section budgets; CareerEvidence remains intact |
| Final document is canonical and immutable | Yes | ResumeArtifact v2 |
| Header is version-bound | Yes | ResumeArtifact v2 -> ResumeProfile revision/hash |
| DOCX/PDF/TXT tell the same story | Yes | shared buildResumeSemanticLines projection, including approved multiline source structure |
| Provenance is exportable | Yes | provenance JSON v2 |
| Unsupported PDF characters are never silently replaced | Yes | fail-closed WinAnsi renderer guard |

## Golden comparison policy

B9 does not claim that an unreviewed model output should reproduce a manually written golden word-for-word. A wording change becomes usable only after it passes source-preservation validation and explicit user approval. Therefore the private golden is an editorial target, not a second source of career truth.

Acceptance is based on:

1. no new unsupported facts or metrics;
2. exact source/revision provenance for every included claim;
3. explicit provenance for identity/contact;
4. explainable inclusion/omission decisions;
5. source-backed summary composition;
6. deterministic semantic parity across TXT, DOCX and PDF;
7. one-page density intent without deleting the underlying Career Evidence;
8. preservation of source structure for explicitly grouped resume blocks;
9. preservation of historical artifacts after later evidence/profile changes.

## Current certification evidence

- Planner v3 and balanced-density policy were physically tested with over-supplied synthetic sections and omission receipts.
- Explicit import grouping and its account lifecycle were physically tested in PostgreSQL.
- Source-line contiguity and multiline export parity are part of the current B9 certification candidate.
- Full inherited B0-B9 exact-head CI passed on the immediately preceding implementation SHA before this documentation-only receipt update.
- Private source and golden remain outside Git; no real candidate PII is introduced by this receipt.

This document update intentionally does **not** mark the dogfood PASS. The final candidate SHA created by this receipt must rerun full exact-head CI and the real browser upload-to-final-artifact flow before B9 closure.

## Closure condition

This receipt becomes PASS only after the B9 profile-bound artifact contract, B9 TypeScript/rendering gates, full inherited exact-head CI, the user-facing B9 ResumeWorkspace flow, exact-runtime browser certification, and the private real-CV dogfood decision are all green on the same final candidate lineage.
