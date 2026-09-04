# B9 / P1 Integration Receipt

Status: CANDIDATE — NOT RELEASE CLOSED
Date: 2026-09-04 (America/Lima)

## Purpose

Record the explicit integration decision between the divergent P1 presentation prototype currently reachable from `main` history and the B9 Presentation Engine candidate.

This receipt does not claim B9 is closed. It exists to make the authority decision reviewable and testable before Production browser certification.

## Conflict discovered

The two lines cannot be mechanically merged:

- P1 defines a plan-centric `presentation_revisions` authority tied to `presentation_plans`.
- B9 defines an evidence-revision-centric `presentation_revisions` authority and places final selection in `ResumePlan`.
- Both lines use the same durable table name with incompatible schemas.
- Keeping both would create two competing meanings for approved presentation state and would fail clean-database migration ordering.

## Runtime inspection

The connected production Supabase project was inspected read-only before this integration decision.

At inspection time:

- `presentation_plans` was absent;
- `presentation_plan_evidence` was absent;
- `presentation_revisions` was absent;
- `presentation_revision_evidence` was absent;
- B9 `resume_plans`, `resume_artifacts`, and `resume_profiles` were absent;
- production therefore contained no P1/B9 presentation rows requiring transformation or destructive migration.

Only pre-presentation authorities such as Career Evidence, Job Snapshot, and Opportunity Assessment were present from the relevant inventory.

No production DDL or data mutation was performed during that inspection.

## Authority decision

B9 supersedes the divergent P1 presentation prototype for the integrated product lineage.

```text
CareerEvidence
    = WHAT IS TRUE

PresentationRevision (B9)
    = HOW ONE EXACT EVIDENCE REVISION MAY BE EXPRESSED AFTER VALIDATION + USER APPROVAL

ResumeProfile
    = WHO / HOW TO CONTACT

ResumePlan
    = WHAT VERIFIED EVIDENCE TO SHOW + ORDER + EMPHASIS

ResumeArtifact
    = FINAL IMMUTABLE PROFESSIONAL DOCUMENT
```

P1 remains preserved in Git history through the second parent of the integration merge commit. Its runtime files are intentionally not carried into the integrated tree because doing so would reintroduce a second presentation authority.

## Why B9 is the surviving authority

B9 provides the downstream boundaries required by the signed B9 contract:

- exact Career Evidence revision binding;
- application-owned fact-preservation validation;
- explicit before/after approval;
- provider provenance without secrets;
- deterministic no-AI source fallback;
- GENERAL and TARGETED ResumePlan with selection receipts;
- Job Truth exclusion from candidate claims;
- source-backed professional summary;
- ResumeProfile identity/contact authority;
- canonical ResumeArtifact;
- DOCX/PDF/TXT/provenance JSON exports;
- canonical content parity and fail-closed rendering behavior;
- browser certification harness.

The earlier P1 history remains useful research evidence but is not an additional runtime source of truth.

## Integration proof requirements

The integration is acceptable only when all of the following hold on the integrated lineage:

1. clean-database migrations apply without duplicate presentation authority;
2. inherited B0–B9 CI is green on one exact SHA;
3. B9 static and physical presentation contracts are green;
4. no P1 runtime migration/workflow is reintroduced as a competing authority;
5. the exact integrated SHA receives a Vercel deployment;
6. private real-CV dogfood remains truth-preserving;
7. Production browser upload-to-final-artifact E2E passes before B9 is marked CLOSED.

Until those conditions are complete:

```text
UPLOAD_TO_IMPROVED_CV = NOT_PROVEN
RELEASE_READY = NO
PRODUCTION_QUALIFIED = NO
```
