# PR-ATS2-07 — Audit Hardening

## Objective

Correct the concrete overclaims and behavioral gaps found in the post-G7 architecture audit before adding persistence or new product surface.

## Corrections

- Legacy request facts are now `CANDIDATE_ASSERTED`, not automatically `VERIFIED_FACT`.
- Manual-form versus resume-upload provenance is preserved into `CareerSource`.
- Candidate location is projected into candidate assertions for matching.
- Grounding adds conservative narrative-claim checks plus education/language coverage.
- Narrative content substantially copied from the Job Description without candidate support is rejected as `JD_REQUIREMENT_LEAKAGE`.
- Job Intelligence carries REQUIRED/PREFERRED section-header context into bullets.
- Explicit required/preferred requirements outside the canonical skill catalog are retained as `OTHER` rather than silently dropped.
- `minimumYears` is now enforced conservatively against parseable linked candidate date ranges.
- Missing work-authorization evidence is `UNKNOWN`, not a fabricated `BLOCKER`.
- Rate-limit user copy now matches the configured 50 requests/hour.
- CI now runs executable behavioral regression tests before build.

## Behavioral regression cases

1. legacy projection uses `CANDIDATE_ASSERTED` and preserves `RESUME_UPLOAD` source origin;
2. unsupported narrative scope requires candidate confirmation;
3. job-description narrative leakage is rejected;
4. `Requirements:` section context marks child bullets REQUIRED and preserves uncatalogued `Snowflake` as `OTHER`;
5. a 5-year TypeScript requirement does not become MATCH from only a 2-year documented linked period;
6. absent work-authorization evidence remains UNKNOWN rather than BLOCKER;
7. Java does not match JavaScript.

## Validation

GitHub Actions run `31454540397` passed the behavioral head before documentation-only gate recording:
- `npm ci` PASS
- lint PASS
- typecheck PASS
- behavior tests PASS (7/7)
- build PASS

The final documentation head must also pass CI before merge.

## Gate

`G7H AUDIT_HARDENING — PASS`, subject to final-head CI remaining green.
