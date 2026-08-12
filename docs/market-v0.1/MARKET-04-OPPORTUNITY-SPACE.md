# MARKET-04 — Controlled OpportunitySpace

## Purpose

MARKET-04 moves CV Engine from one-person / one-job Application Intelligence to the first controlled one-person / many-jobs decision surface.

The core question changes from:

```text
Should I apply to this job?
```

to:

```text
Given several opportunities, where should I invest my attention and why?
```

The system does not answer this with a new opaque percentage. It composes two already-established, independent derived dimensions:

```text
OpportunityAssessment  -> CAN I DEFEND THIS APPLICATION?
CareerTargetRelevance  -> DOES THIS FIT MY CHOSEN DIRECTION?
                         |
                         v
OpportunityPriority    -> WHERE SHOULD I FOCUS RELATIVE TO THE OTHER OPTIONS?
```

## Truth boundary

OpportunityPriority and OpportunitySpace are Derived Analysis / Recommendation artifacts.

They are not:

- Career Fact
- Market Fact
- Candidate Evidence
- Job Requirement
- hiring probability
- recruiter acceptance probability
- a score emitted by a commercial ATS

Hard invariants:

```text
CareerTarget != CareerEvidence
TargetRelevance != JobMatch
OpportunityPriority != JobMatch
OpportunitySpace != CareerFact
OpportunitySpace != MarketFact
```

A preference conflict may lower priority. It must never lower or raise the evidence-backed Job Match itself.

## Controlled architecture

```text
ONE CareerSnapshot
        +
ONE active CareerTarget
        +
MANY durable OpportunityAssessments
        |
        | each already bound to one JobSnapshot
        | each already linked to target relevance
        v
OpportunitySpace
```

MARKET-04A intentionally consumes assessments that already passed MARKET-01 through MARKET-03 durability gates. It does not introduce a second matching engine.

## OpportunityPriority v1

The policy emits explainable priority bands instead of a composite percentage:

- `PRIORITIZE_NOW`
- `APPLY_SELECTIVELY`
- `BUILD_TOWARD`
- `EXPLORE`
- `DEPRIORITIZE`
- `INSUFFICIENT_SIGNAL`

Examples:

| Evidence readiness | Target relevance | Priority |
|---|---|---|
| `READY_NOW` | `HIGH` | `PRIORITIZE_NOW` |
| `STRONG_STRETCH` | `HIGH` | `APPLY_SELECTIVELY` |
| `BUILDABLE` | `HIGH` | `BUILD_TOWARD` |
| `READY_NOW` | `LOW` | `DEPRIORITIZE` |
| `ASPIRATIONAL` | `MEDIUM` | `EXPLORE` |
| any blocked eligibility | any | `DEPRIORITIZE` |

The ordering policy is deterministic and versioned as `opportunity-space-v1`.

## OpportunitySpace snapshot

An OpportunitySpace is content-addressed from semantic state:

```text
candidateProfileId
careerSnapshotId
careerTargetId
policyVersion
ordered entries[]
  - jobSnapshotId
  - opportunityAssessmentId
  - priority
  - recommendation
  - target relevance level
  - eligibility
  - critical gap count
  - explanation
scope boundary
```

`generatedAt` does not participate in logical identity. Rebuilding the same semantic space at another time yields the same OpportunitySpace ID.

Changing Career Truth, Career Target, selected JobSnapshots, assessment meaning or priority policy yields a new immutable space instead of rewriting the old one.

## Durability

OpportunitySpace history uses a candidate-scoped repository under the same opaque Career Vault capability boundary:

```text
ats2:opportunity-spaces:v1:<CandidateProfileId>
```

Persistence rules:

- same semantic space -> idempotent, no revision bump
- changed semantic space -> append new immutable snapshot
- prior spaces remain intact
- save is reloaded and validated before durability is claimed
- missing durable storage fails closed

## Controlled API

`POST /api/opportunity-space`

Input:

```json
{
  "careerVaultId": "opaque UUID capability",
  "opportunityAssessmentIds": ["...", "..."]
}
```

Constraints:

- 2 to 10 unique assessments
- all assessments must exist in durable M2 history
- all must have a persisted relevance link to the active CareerTarget
- all must belong to the same CareerSnapshot
- the endpoint does not call `matchJobToCandidate`
- the endpoint does not create or modify candidate evidence

Successful output contains the immutable OpportunitySpace and a `DURABLE_OPPORTUNITY_SPACE` persistence claim.

## Gate M4A — EXPLAINABLE_MULTI_OPPORTUNITY_PRIORITIZATION

MARKET-04A is complete only when:

- one CareerSnapshot can be compared across multiple JobSnapshots
- one active CareerTarget is used for the whole space
- every entry references a durable OpportunityAssessment
- priority remains separate from Job Match
- changing target intent can change priority without rewriting assessment evidence
- input order and wall-clock time do not change semantic OpportunitySpace identity
- mixed CareerSnapshots are rejected
- historical OpportunitySpaces are immutable and idempotently persisted
- the API accepts only durable M1-M3 artifacts
- dependency audit, lint, typecheck, behavior tests and production build remain green

## Explicit non-goals

MARKET-04A does not yet add broad market acquisition.

It intentionally does not include:

- LinkedIn scraping
- Greenhouse / Lever / Ashby ingestion
- labor-market feeds
- ESCO/O*NET normalization
- salary estimation
- hiring probability
- alternative-role discovery
- OpportunityUnlock / learning plans
- outcome learning

Those should be added only after controlled many-job prioritization is trustworthy.
