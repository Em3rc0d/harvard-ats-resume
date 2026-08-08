# Characterization Fixtures — PR-ATS2-00

These fixtures describe cases that future automated suites must preserve or intentionally change with an explicit decision.

## C-001 — Manual resume

Candidate with one job, one education entry, hard/soft skills and no job description.

Observe:
- form validation behavior
- generated resume structure
- score behavior without JD
- PDF output

## C-002 — Targeted resume

Candidate plus English job description.

Observe:
- keyword extraction
- matched/missing keywords
- suggestions
- generated resume

## C-003 — Spanish JD

Spanish candidate content and Spanish job description.

Observe current engine behavior without assuming parity with English.

## C-004 — Junior/student

Candidate with education/projects and limited formal experience.

Record whether current schema/UI can represent the case honestly.

## C-005 — CV import with missing dates

Imported experience lacking one or both date endpoints.

Record current mapped values exactly.

## C-006 — Certificate with graduation year only

Record whether current flow synthesizes a start year.

## C-007 — Java vs JavaScript

Record current keyword/matching behavior for a known substring-risk pair.

## C-008 — Unsupported JD skill

Candidate has no Kubernetes; JD requires Kubernetes.

Record whether generated content, suggestions or scoring introduce/confuse the requirement.

## Future automation

These documentation fixtures become executable tests as the test harness is introduced. PR-00 does not add a testing framework.
