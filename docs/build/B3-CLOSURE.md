# B3 — Evidence-backed Assessment Closure

Status: **CLOSED — implementation and physical contract proven**

Contract authority:

- `REBUILD-CONTRACT.md`
- `docs/build/CONTRACT-SIGNOFF.md`
- `docs/market-v0.1/MARKET-04B-06-MARKET-ASSESSMENT-INTEGRATION.md`

## Closed vertical slice

```text
Career Evidence + Job Truth
        ↓
RequirementMatch
MATCH / POTENTIAL_MATCH / GAP / UNKNOWN / BLOCKER
        ↓
MatchReport
        ↓
OpportunityAssessment
        ↓
explainable action without hiring-probability theater
```

B3 is derived analysis. It does not become candidate truth, market truth or career intent.

## Truth and state semantics

```text
CareerEvidence  = candidate truth input
JobRequirement  = market truth input
Assessment      = derived, versioned analysis
```

Signed state rules:

1. `MATCH`, `POTENTIAL_MATCH`, `GAP` and `BLOCKER` are determinate states and MUST carry Career Evidence support/provenance.
2. `UNKNOWN` is the only state allowed to have zero supporting evidence.
3. Missing evidence is `UNKNOWN`; it is never silently converted to `MATCH`, `GAP` or `BLOCKER`.
4. A JobRequirement never becomes Career Evidence.
5. CareerTarget intent never counts as capability evidence.
6. The browser cannot submit owner identity, match state, support evidence, score or recommendation.
7. The assessment is not a hiring probability, recruiter decision or commercial ATS score.

The current deterministic v1 matcher intentionally emits `MATCH`, `POTENTIAL_MATCH` and `UNKNOWN`. It does **not** infer `GAP/BLOCKER` from absence because B1 does not claim Career Evidence is exhaustive and currently exposes no typed contradiction authority. `GAP/BLOCKER` remain valid evidence-backed domain states for a future trusted contradiction rule; domain and PostgreSQL reject either state without evidence. This is a truth-safety constraint, not an unfinished inference rule.

## Matching evidence

The B3 matcher provides:

```text
DETERMINISTIC_ENGINE_VERSION          PASS
REQUIREMENT_SOURCE_PRESERVED          PASS
MATCH_REQUIRES_EVIDENCE               PASS
POTENTIAL_MATCH_REQUIRES_EVIDENCE     PASS
GAP_REQUIRES_EVIDENCE                 PASS
BLOCKER_REQUIRES_EVIDENCE             PASS
UNKNOWN_REQUIRES_ZERO_SUPPORT         PASS
MISSING_EVIDENCE_STAYS_UNKNOWN        PASS
EXPLAINABLE_RATIONALE                 PASS
NO_PUBLIC_MATCH_SCORE                 PASS
NO_HIRING_PROBABILITY                 PASS
TOKEN_BOUNDARY_REGRESSION             PASS
```

The matcher uses deterministic normalized technical-token overlap. Exact meaningful-term coverage produces `MATCH`; material partial coverage may produce `POTENTIAL_MATCH`; unsupported requirements remain `UNKNOWN`.

## Historical provenance and versioning

Each `RequirementMatch` persists an immutable snapshot of supporting Career Evidence including:

```text
evidence id
revision number
kind
verification status
canonical text at assessment time
```

`MatchReport` identity includes:

```text
JobSnapshot semantic identity
CareerEvidence fingerprint
match engine version
```

Therefore:

- replaying the same semantic inputs is idempotent;
- changing Career Evidence creates a new MatchReport/Assessment;
- an older assessment is not retroactively rewritten when new evidence appears.

## Opportunity Assessment policy

B3 exposes qualitative decisions rather than pseudo-precise scores:

```text
READY_NOW
STRONG_STRETCH
EVIDENCE_INCOMPLETE
BUILDABLE
LOW_ALIGNMENT
```

The policy is explainable from required requirement states and evidence strength.

Key safety behavior physically proven:

```text
required UNKNOWN
→ EVIDENCE_INCOMPLETE
→ NOT_YET
→ CLARIFY_EVIDENCE
→ UNCERTAIN
```

When every explicit REQUIRED requirement is an exact `MATCH` backed by VERIFIED evidence:

```text
READY_NOW
→ YES
→ APPLY
→ CLEAR
→ STRONG evidence
```

This remains evidence alignment only and makes no prediction about hiring outcome.

## Persistence and trust boundary

Trusted RPC:

```text
cv_engine_create_opportunity_assessment(jobSnapshotId)
```

The authenticated caller supplies only the Job Snapshot identifier. PostgreSQL derives owner identity, JobRequirements, current Career Evidence, evidence fingerprint, matches, support snapshots, basis and OpportunityAssessment.

Direct authenticated writes to:

```text
match_reports
requirement_matches
opportunity_assessments
```

are revoked. RLS permits owner-scoped reads only.

Derived artifacts are immutable after their application-owned creation/finalization.

## Physical evidence

Workflow:

```text
.github/workflows/b3-db-ci.yml
```

Physical surfaces:

```text
tests/b3/assessment.sql
tests/b3/state-guards.sql
tests/b3/isolation.sql
tests/b3/readback.sql
```

Proven behavior:

```text
CLEAN_DB_MIGRATIONS                    PASS
DETERMINISTIC_ASSESSMENT               PASS
SEMANTIC_REPLAY_IDEMPOTENT             PASS
ASSESSMENT_DOES_NOT_MUTATE_TRUTH       PASS
MISSING_EVIDENCE_UNKNOWN               PASS
UNKNOWN_NOT_SILENTLY_PASSED            PASS
SUPPORTED_MATCH_HAS_PROVENANCE         PASS
UNSUPPORTED_GAP_REJECTED               PASS
UNSUPPORTED_BLOCKER_REJECTED           PASS
EVIDENCE_CHANGE_VERSIONS_ASSESSMENT    PASS
HISTORICAL_ASSESSMENT_PRESERVED        PASS
VERIFIED_REQUIRED_SUPPORT_READY_NOW     PASS
CROSS_USER_RLS_DENIAL                  PASS
FOREIGN_JOB_ASSESSMENT_DENIAL          PASS
ANONYMOUS_RPC_DENIAL                   PASS
DIRECT_CLIENT_WRITE_DENIAL             PASS
FRESH_CONNECTION_READBACK              PASS
B1_POSTGRES_REGRESSION                 PASS
B2_POSTGRES_REGRESSION                 PASS
CONSTRUCTION_CI                        PASS
```

## Exact pre-promotion receipts

Final implementation head before ledger promotion:

```text
head_sha      aa7d40e0744e47bc794c768dbd88270ad7182d00
construction  33359163193 success
b1_postgres   33359163195 success
b2_postgres   33359163192 success
b3_postgres   33359163184 success
```

## UI/application boundary

The authenticated product shell now exposes four separate surfaces:

```text
Career Evidence
Career Target
Job Truth
Assessment
```

Assessment UI shows recommendation/action, evidence strength, rationale, required unknowns and supporting evidence. It does not expose a hiring probability or fabricated ATS score.

## Scope boundary

B3 does **not** claim:

```text
ResumeVersion
resume composition/export
trusted PDF/DOCX import
Gemini/Ollama production runtime
Opportunity Space discovery
production qualification
```

Those remain downstream nodes.

## Closure rule

This promotion is valid only if the exact promotion head also passes:

```text
CV Engine vNext Construction
CV Engine B1 PostgreSQL Gate
CV Engine B2 PostgreSQL Gate
CV Engine B3 PostgreSQL Gate
```

Contradictory evidence reopens B3 under `docs/build/CLOSURE-PROTOCOL.md`.

```text
B3 = CLOSED
B4 = READY_TO_BUILD
```
