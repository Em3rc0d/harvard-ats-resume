# PR-ATS2-05 — Deterministic Grounding & Candidate Confirmation

## Objective

Ensure probabilistic resume output cannot become an accepted resume until deterministic hard-fact checks confirm that its factual surface is supported by candidate data.

## BEFORE

ATS v2 already separated candidate truth from job truth and forced Gemini through a structured provider. However, schema-valid model output could still contain an unsupported fact because structural validity is not factual validity.

## DURING

- Added `GroundingValidator` as a deterministic post-generation gate.
- Candidate catalog is built only from candidate data; `jobDescription` is excluded.
- Added hard blockers for unsupported:
  - numbers / percentages / money-like numeric tokens
  - employers
  - roles/titles
  - project names
  - certification names
  - skills/technologies
- Unsupported generated values that exist only in the target job description are classified as `JD_REQUIREMENT_LEAKAGE` and rejected.
- Other unsupported generated facts produce `NEEDS_USER_CONFIRMATION`.
- `/api/generate-resume` now returns HTTP 422 instead of accepting an ungrounded resume.
- Candidate confirmation is evidence-first: the API tells the user which proposed facts require review and instructs them to add those facts to the form only when true, then regenerate. The system never promotes an AI proposal directly into CareerEvidence.

## Invariants

- `INV-013`: probabilistic output is a proposal until grounding is `APPROVED`.
- `INV-014`: a job-description-only fact may never be accepted as candidate truth.
- `INV-015`: unsupported generated hard facts may never enter scoring/export as an accepted resume.
- `INV-016`: candidate confirmation occurs by updating candidate-provided evidence, never by blindly accepting the model proposal.

## Gate

`G6 GROUNDED_GENERATION`

PASS requires:
- clean `npm ci`
- lint PASS
- typecheck PASS
- build PASS
- deterministic grounding executes after AI generation and before scoring
- JD-only candidate-fact leakage returns `REJECTED`
- unsupported generated facts return `NEEDS_USER_CONFIRMATION`
- only `APPROVED` generated content reaches scoring/output
- confirmation guidance names facts to review without auto-promoting them to candidate evidence
