# MARKET-04B-11 — Selected Market Candidate Analysis / Retrieval-to-Assessment Orchestration

## Status

`COMPLETE — merged via PR #41`

Merge commit:

```text
009faa56b723b9939fafec38d2b1eb5974ae43bd
```

## Why this gate exists

M4B-09 gave CV Engine a bounded external market pool. M4B-10 made that pool candidate-specific through the active CareerTarget without creating a second Job Match engine. The remaining Market v0.1 gap was operational: CV Engine still needed a safe way to take only the bounded M4B-10 selection through the expensive, evidence-backed Application Intelligence chain.

M4B-11 closes that gap.

The gate answers:

```text
We found a bounded set of current opportunities worth deeper inspection.
Which of those can now be interpreted, projected, matched and assessed
without losing source provenance, candidate truth boundaries or workload control?
```

## Core architecture

```text
Durable market history + active CareerTarget
                  ↓
          M4B-10 MarketCandidateSet
                  ↓
       selected current candidates only
                  ↓
      ┌──────── per item, sequential ────────┐
      │ M4B-04 Derived Interpretation        │
      │               ↓                      │
      │ M4B-05 Projection + exact JobSnapshot│
      │               ↓                      │
      │ M4B-06 Job Match + Assessment        │
      │               ↓                      │
      │ durable CareerTarget relevance link  │
      │               ↓                      │
      │ M4B-07 current lifecycle verification│
      └──────────────────────────────────────┘
                  ↓
        successful exact assessments
                  ↓
          M4A OpportunitySpace
```

The orchestrator owns sequencing only. It does not become a new truth authority.

## Hard invariants

```text
SelectedForAnalysis != Qualified
AnalysisFailure != MarketClosure
RetrievalOrder != JobMatchScore
BatchAssessment != CandidateTruth
PartialFailure != BatchRollback
BatchReport != DurableItemAuthority
SelectedObservation != CurrentObservationForever
```

M4B-10 selection means only that an opportunity deserves deeper analysis. Qualification is not established until the exact M4B-05 JobSnapshot is matched by the existing M4B-06 matcher against candidate CareerAssertions.

## Server-owned workload boundary

M4B-11 uses a server-owned deep-analysis cap:

```text
maxDeepAnalysis = 10
```

The public caller cannot submit or override:

- selected MarketObservation ids;
- MarketCandidateSet id;
- CareerTarget;
- deep-analysis budget;
- lifecycle state;
- JobSnapshot id;
- Job Requirements;
- Job Match score;
- OpportunityAssessment;
- OpportunitySpace priority.

The public endpoint is:

```text
POST /api/market-candidate-analysis
```

It accepts candidate data plus the opaque `careerVaultId`. CV Engine resolves the durable active CareerTarget and current market selection server-side.

## Exact authority reuse

M4B-11 deliberately calls the already-trusted application boundaries instead of duplicating logic:

```text
interpretMarketObservation()
projectDurableMarketObservationToJobIntelligence()
assessDurableMarketJobSnapshot()
recordTargetOpportunityEvaluation()
registerDurableMarketOpportunityLifecycle()
buildOpportunitySpace()
persistOpportunitySpace()
```

There is no second `analyzeJobDescription()`, no second `matchJobToCandidate()`, and no resume generation path in the batch orchestrator.

## Item lifecycle

Each selected opportunity moves through explicit stages:

```text
INTERPRETATION
PROJECTION
ASSESSMENT
TARGET_LINK
LIFECYCLE
```

A successful item reports `ANALYZED` and carries the exact identities produced by the trusted chain:

- `DerivedMarketInterpretationId`;
- `MarketJobProjectionId`;
- `JobSnapshotId`;
- `OpportunityAssessmentId`;
- `CareerSnapshotId`;
- target-relevance level.

A failed item reports the exact stage and a bounded failure code:

```text
INTERPRETATION_FAILED
PROJECTION_FAILED
ASSESSMENT_FAILED
TARGET_LINK_FAILED
LIFECYCLE_FAILED
```

The batch report does not expose arbitrary internal exception text as semantic truth.

## Partial-failure semantics

M4B-11 is intentionally sequential and append-preserving.

Example:

```text
item 1 → interpretation → projection → assessment → durable success
item 2 → interpretation → projection FAILED
item 3 → interpretation → projection → assessment → durable success
```

Result:

```text
run.outcome = PARTIAL_SUCCESS
item 1 durable artifacts remain
item 2 failure remains item-scoped
item 3 durable artifacts remain
no compensating rollback
no false CLOSED lifecycle
```

This is important because the underlying market/candidate artifacts are independently authoritative historical records. A later batch failure has no authority to erase a previously valid observation, interpretation, projection or assessment.

## Current-observation guard

M4B-10 selects one current material MarketObservation per logical MarketOpportunity. M4B-11 re-checks lifecycle after the expensive assessment chain and before OpportunitySpace composition.

The exact selected observation must still be the lifecycle's current material observation:

```text
selected MarketObservationId
        ==
current MarketObservationId
```

If market state advanced while analysis was running, the item does not enter the current OpportunitySpace from stale assessment state.

This preserves the M4B-07 rule:

```text
OPEN != CURRENT_ASSESSMENT
```

## OpportunitySpace composition

When at least two items complete successfully and share one CareerSnapshot, M4B-11 reuses M4A to build and durably persist OpportunitySpace.

The batch does not rank directly.

```text
M4B-06 assessment readiness
        +
CareerTarget relevance
        +
M4B-07 lifecycle/current-observation guard
        ↓
M4A OpportunitySpace priority
```

If OpportunitySpace persistence itself fails, the already-durable item assessments remain intact. The batch reports OpportunitySpace status `FAILED`; it does not rollback item histories.

## Batch report contract

`MarketCandidateAnalysisRun` is a content-addressed orchestration report with outcomes:

```text
COMPLETE
PARTIAL_SUCCESS
FAILED
```

Its persistence statement is deliberately explicit:

```text
DURABLE_ITEM_ARTIFACTS_NON_PERSISTED_BATCH_REPORT_M4B_11
```

The durable authorities are the underlying histories and, when available, the persisted OpportunitySpace. M4B-11 does not pretend the current orchestration receipt itself has a durable repository that does not exist.

`generatedAt` is runtime provenance and does not participate in the run's semantic identity.

## Verification contract

The M4B-11 behavior suite proves:

1. one selected current opportunity traverses the exact trusted chain;
2. a real projection failure in one selected item does not rollback an earlier durable assessment;
3. two successful selected opportunities produce one durable OpportunitySpace;
4. run identity remains stable across wall-clock generation time when semantic artifacts/outcomes are unchanged;
5. deep analysis stops at the server-owned cap of 10 even when retrieval returns more;
6. the orchestration service reuses M4B-04/M4B-05/M4B-06/M4A authorities and contains no second matcher/parser;
7. the public API keeps target, selection, budgets, lifecycle, JobSnapshot ids and scores server-owned.

Implementation CI:

```text
head f31e1ec326b1bc6601cbfb637a0a1d50566b56e2
run  32097391068
job  95591282815

Install             PASS
Dependency audit    PASS
Lint                PASS — zero warnings
Typecheck           PASS
Behavior tests      PASS
Production build    PASS
```

PR #41 was promoted only after that exact closure head passed and was squash-merged into `develop` as:

```text
009faa56b723b9939fafec38d2b1eb5974ae43bd
```

The merge commit's parent is the M4B-10 `develop` commit `c2aa2f143ed90458251d55d10b4a99c0fce82120` and GitHub reports a valid verified signature.

## Gate

```text
M4B-11 — BOUNDED_PARTIAL_FAILURE_SAFE_RETRIEVAL_TO_ASSESSMENT_ORCHESTRATION
```

All explicit Market Architecture v0.1 gates are complete.
