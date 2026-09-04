# B9 Private Dogfood Receipt

Status: IN_PROGRESS
Date: 2026-09-03 (America/Lima)

## Privacy boundary

The real CV input and the manually curated golden CV remain private user-owned artifacts and are not committed to this public repository. This receipt contains only non-identifying structural observations and acceptance criteria.

## Private corpus shape

- Input document: DOCX, 2 pages.
- Golden document: DOCX, 1 page.
- Target profile family: backend / full-stack software development.
- Golden treatment: stronger active wording, reduced redundancy, selected projects/training, grouped technical skills, single-page density.
- Fabricated metrics: forbidden and not required by the golden.

## Required engine capabilities reconciled against the golden

| Capability | Required by private golden | B9 implementation |
| --- | --- | --- |
| Career facts remain authoritative | Yes | CareerEvidence + immutable revisions |
| Wording can improve without rewriting truth | Yes | PresentationRevision + fact validator + explicit user approval |
| Identity/contact are not fake career claims | Yes | ResumeProfile + immutable profile revisions |
| Relevance and omissions are explainable | Yes | ResumePlan v2 source-selection receipts |
| Professional summary is source-backed | Yes | ResumeComposition v2 summary source receipts |
| One-page intent is explicit | Yes | b9-one-page-density-v1 |
| Final document is canonical and immutable | Yes | ResumeArtifact v2 |
| Header is version-bound | Yes | ResumeArtifact v2 -> ResumeProfile revision/hash |
| DOCX/PDF/TXT tell the same story | Yes | shared buildResumeSemanticLines projection |
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
8. preservation of historical artifacts after later evidence/profile changes.

## Closure condition

This receipt becomes PASS only after the B9 profile-bound artifact contract, B9 TypeScript/rendering gates, full inherited exact-head CI and the user-facing B9 ResumeWorkspace flow are all green on the same commit.
