# CV Engine — Canonical Build Graph

Status: **AUTHORITATIVE CONSTRUCTION LEDGER**

Closure policy: `docs/build/CLOSURE-PROTOCOL.md`
Contract sign-off: `docs/build/CONTRACT-SIGNOFF.md`

This file is the single status ledger for the zero-based rebuild. Historical PRs, archived implementation notes and older status documents do not override it.

## Current graph

```text
Documentation / architecture   CLOSED
PF0                            CLOSED
B0                             CLOSED
B0.5                           CLOSED
B1                             CLOSED
B2                             CLOSED
B3                             CLOSED
B4                             CLOSED
B5                             CLOSED
B6                             CLOSED
B7                             CLOSED
B8                             CLOSED
B9                             SIGNED_IMPLEMENTATION_NOT_STARTED
CVENGINE_V1_0_0                BLOCKED_BY_B9
```

## Accepted scope revision

The trusted-core release through B8 was physically certified in Production at:

```text
fa331f9b88c1f5a0d9e4ef3fa4960a4fd3394989
```

Subsequent real-CV dogfood exposed a product-definition gap: deterministic provenance-backed ResumeVersion generation is not equivalent to end-to-end professional CV improvement.

The accepted stronger product promise is now:

> CV Engine must convert defensible Career Evidence into the strongest professional presentation it can support, while remaining able to prove that every material statement is still grounded in candidate truth.

Under `CLOSURE-PROTOCOL.md`, this does not rewrite B1–B8. It creates B9 Presentation Engine.

Therefore the current release ledger is intentionally reopened:

```text
RELEASE_READY         = NO
PRODUCTION_QUALIFIED  = NO
UPLOAD_TO_IMPROVED_CV = NOT_PROVEN
```

## Closed-node receipts

```text
PF0   docs/vnext/04-BUILD-READINESS-AUDIT.md
B0    docs/build/B0-FOUNDATION-STATUS.md
B0.5  docs/build/B0.5-CLOSURE.md
B1    docs/build/B1-CLOSURE.md
B2    docs/build/B2-CLOSURE.md
B3    docs/build/B3-CLOSURE.md
B4    docs/build/B4-CLOSURE.md
B5    docs/build/B5-CLOSURE.md
B6    docs/build/B6-CLOSURE.md
B7    docs/build/B7-CLOSURE.md
B8    docs/build/B8-CLOSURE.md
```

All CLOSED nodes satisfy the canonical equation applicable to their scope:

```text
NODE_CLOSED =
    CONTRACT_SIGNED
 && IMPLEMENTED
 && WIRED
 && EXECUTABLY_TESTED
 && PHYSICALLY_PROVEN_WHERE_REQUIRED
 && NO_OPEN_CONTRADICTIONS
```

## B9 — Presentation Engine

Contract: `docs/build/B9-PRESENTATION-ENGINE-CONTRACT.md`

Status:

```text
CONTRACT_SIGNED              PASS
IMPLEMENTATION               NOT_STARTED
WIRING                       NOT_STARTED
EXECUTABLE_TESTS             NOT_STARTED
REAL_BROWSER_E2E             NOT_STARTED
PRIVATE_REAL_CV_DOGFOOD      NOT_STARTED
STATUS                       SIGNED_IMPLEMENTATION_NOT_STARTED
```

B9 owns the downstream boundary:

```text
CareerEvidence
    = WHAT IS TRUE

PresentationRevision
    = HOW AN APPROVED FACT MAY BE EXPRESSED

ResumePlan
    = WHICH APPROVED FACTS/PRESENTATIONS ARE USED AND IN WHAT ORDER

ResumeArtifact
    = THE FINAL RENDERED DOCUMENT
```

B9 must not weaken B4 source/provenance authority. It adds a separately validated and user-approved presentation layer.

### Required B9 closure predicates

```text
PRESENTATION_REVISION_DOMAIN
SOURCE_REVISION_IMMUTABLE_BINDING
WORDING_AI_CAPABILITY_PHYSICALLY_WIRED
NO_AI_PATH_PRESERVES_SOURCE_WORDING
BEFORE_AFTER_REVIEW_UI
NO_DEFAULT_APPROVAL
FACT_ADDITION_REJECTION
METRIC_ADDITION_REJECTION
METRIC_CHANGE_REJECTION
SENIORITY_STRENGTHENING_REJECTION
SKILL_ADDITION_REJECTION
STALE_SOURCE_REVISION_GUARD
APPROVAL_DURABLE
REJECTION_DURABLE
GENERAL_RESUME_PLAN
TARGETED_RESUME_PLAN
JOB_TRUTH_NEVER_BECOMES_CANDIDATE_CLAIM
PROFESSIONAL_SUMMARY_PROVENANCE
CONTENT_SELECTION_PROVENANCE
ATS_SAFE_SINGLE_COLUMN_RENDERER
DOCX_EXPORT
PDF_EXPORT
TXT_EXPORT
PROVENANCE_JSON_EXPORT
DOCX_PDF_CANONICAL_CONTENT_PARITY
CROSS_USER_IDOR_DENIAL
ANONYMOUS_MUTATION_DENIAL
AI_SECRET_CANARY
PROVIDER_FAILURE_DEGRADATION
REAL_BROWSER_UPLOAD_TO_FINAL_ARTIFACT_E2E
PRIVATE_REAL_CV_DOGFOOD
NO_OPEN_TRUTH_CONTRADICTIONS
```

## B9 golden path

```text
NEW USER
↓
Trust + Auth + AI choice
↓
Upload supported CV
↓
Review/import candidate facts
↓
Verify Career Evidence
↓
Generate wording proposals
↓
Review BEFORE / AFTER
↓
Approve safe PresentationRevisions
↓
Choose Career Target
↓
General OR captured Job
↓
Assessment if targeted
↓
Generate ResumePlan
↓
Preview final resume
↓
Download DOCX
↓
Download PDF
↓
Download TXT / provenance JSON
↓
Reload
↓
Historical artifact remains reproducible and traceable
```

## v1.0.0 release equation — revised scope

```text
CVENGINE_V1_0_0 =
  B0_CLOSED
  && B0_5_CLOSED
  && B1_CLOSED
  && B2_CLOSED
  && B3_CLOSED
  && B4_CLOSED
  && B5_CLOSED
  && B6_CLOSED
  && B7_CLOSED
  && B8_CLOSED
  && B9_CLOSED
```

Only then may the current stronger product release ledger state:

```text
RELEASE_READY = YES
PRODUCTION_QUALIFIED = YES
UPLOAD_TO_IMPROVED_CV = PROVEN
```

A future contradiction reopens only the affected node unless evidence proves an upstream contract itself invalid.
