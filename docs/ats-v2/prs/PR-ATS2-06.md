# PR-ATS2-06 — Job Intelligence & Explainable Match Engine

## Objective

Replace the concept of raw keyword comparison as the future matching authority with explicit JobRequirements matched against evidence-backed CareerAssertions.

## DURING

- Enriched `JobRequirement` with optional canonical concept, aliases, minimum years, and extraction confidence.
- Added deterministic EN/ES first-pass `JobIntelligenceEngine`.
- Extracts explicit skill requirements with canonical concepts and aliases.
- Classifies requirement necessity as `REQUIRED`, `PREFERRED`, or `UNKNOWN` from source wording.
- Classifies non-skill requirements including experience, responsibility, education, certification, language, location, and work authorization.
- Added `JobMatchEngine` that consumes existing CareerAssertions only.
- Skill matching uses explicit concepts/aliases with token boundaries so `Java` does not match `JavaScript` by substring.
- Non-skill matching uses explainable lexical evidence and can return `MATCH`, `POTENTIAL_MATCH`, `GAP`, or `BLOCKER`.
- Required requirements carry more score weight than preferred requirements.
- `/api/generate-resume` now executes Job Intelligence and Match v2 whenever a Job Description exists and returns an explainable `jobMatch` report.
- The old `atsScore` remains temporarily for UI compatibility; it is not the authority of the new Job Match report.

## Invariants

- `INV-017`: JobRequirements derive only from JobDescription source text.
- `INV-018`: JobMatch creates inference artifacts only and never creates CareerAssertions.
- `INV-019`: required requirements weigh more than preferred requirements.
- `INV-020`: a missing job skill remains a gap; it may never be copied into candidate truth.
- `INV-021`: no Job Description means no Job Match report.

## Gate

`G7 JOB_MATCH_V2`

PASS requires:
- clean `npm ci`
- lint PASS
- typecheck PASS
- build PASS
- explicit JobRequirement extraction from source text
- candidate/job truth remain independent
- matching references existing CareerAssertion identifiers
- exact skill boundary avoids substring matches such as Java/JavaScript
- explainable rationale returned for each requirement
- weighted Job Match score returned independently of the legacy ATS score
