# MARKET-04B-07 — Logical Opportunity Identity + Lifecycle / Freshness

## Why this gate exists

M4B-01 through M4B-06 made one external market state trustworthy enough to reach Application Intelligence. They did **not** answer whether two immutable MarketObservations refer to the same logical vacancy, whether the vacancy is still current, or whether a historical assessment still describes the latest material source state.

M4B-07 closes that gap without fuzzy deduplication.

```text
MarketObservation A ─┐
MarketObservation B ─┼──> MarketOpportunityId
MarketObservation C ─┘            │
                                  ├── OPEN
                                  ├── STALE
                                  ├── CLOSED
                                  └── UNKNOWN
```

The logical opportunity is not a new source fact. It is a controlled identity/lifecycle derivation over durable source history.

## Hard truth boundaries

```text
MarketObservation != MarketOpportunity
MarketOpportunity != JobSnapshot
MarketOpportunityLifecycle != Market Fact
MarketOpportunityLifecycle != OpportunityAssessment
MarketOpportunityLifecycle != CandidateEvidence
same title/company != same logical opportunity
OPEN logical opportunity != current assessment
```

Lifecycle can change current ranking policy. It cannot rewrite historical Job Match, CareerTarget relevance, OpportunityAssessment, or candidate truth.

## Identity policy v1

Policy:

```text
market-opportunity-identity-v1
```

### Strong provider-native identity

M4B-07 groups provider observations only when all of these are present:

```text
source.type = PROVIDER_API
provider
sourceUrl
externalId
```

The logical identity material is therefore:

```text
PROVIDER_API + provider + sourceUrl + externalId
```

For the controlled M4B-03 adapters this preserves provider-native namespace context:

- Greenhouse: source URL includes board token + job id; externalId is the job id.
- Lever: source URL includes site + posting id; externalId is the posting id.
- Ashby: source URL identifies the board API and externalId is the canonical hosted job URL.

Provider name is normalized only by trim + uppercase. `sourceUrl` and `externalId` remain exact controlled provenance values.

### No fuzzy fallback

M4B-07 does **not** use:

```text
company similarity
title similarity
location similarity
description similarity
embedding similarity
Levenshtein distance
```

If strong provider-native identity is unavailable, v1 uses:

```text
OBSERVATION_BOUND
```

That means a changed manual observation without a trusted source-native locator becomes another logical opportunity rather than risking a false merge.

This intentionally favors false splits over false merges.

Cross-source deduplication is not part of M4B-07.

## MarketOpportunityLink

Each immutable observation receives one immutable content-addressed link:

```text
MarketObservationId
      ↓
MarketOpportunityLink
      ↓
MarketOpportunityId
```

A single MarketObservation can never later be relinked to a different MarketOpportunity.

The durable index is append-only at the link level.

### Material changes

If the same provider-native vacancy changes content:

```text
Observation A  content hash A
Observation B  content hash B
```

then:

```text
A != B
```

but both links reproduce the same:

```text
MarketOpportunityId
```

Therefore material history is preserved rather than overwritten.

### Re-observation without material change

If unchanged content is observed later:

```text
same MarketObservationId
new ObservationOccurrence
```

No new MarketOpportunityLink is created.

The later occurrence refreshes recency while `materialStateCount` stays unchanged.

## Durable opportunity index

Schema:

```text
market-opportunity-index-v1
```

Persistence key:

```text
ats2:market-opportunity-index:v1
```

The index stores immutable observation→opportunity links and reload-verifies writes.

The runtime also scans already-durable MarketObservation history for other observations that reproduce the same strong identity and links those historical material states in the same controlled call.

This store inherits the current market persistence limitation: it is a single Redis snapshot key and is **not approved for provider-scale parallel writers**.

## Lifecycle policy v1

Policy:

```text
market-opportunity-lifecycle-v1
```

Lifecycle is a temporal derived view over durable MarketObservation + ObservationOccurrence history.

It is not persisted as if it were source truth.

### OPEN

A listing is `OPEN` only when the current material observation came from a direct source capture:

```text
PROVIDER_ADAPTER
or
PUBLIC_URL_FETCH
```

and the latest durable occurrence is no older than:

```text
72 hours
```

Basis:

```text
RECENT_DIRECT_SOURCE_OBSERVATION
```

This means “recently verified available at the source boundary,” not “guaranteed open at this exact second.”

### STALE

A direct-source observation older than 72 hours becomes:

```text
STALE
```

Basis:

```text
DIRECT_SOURCE_OBSERVATION_AGED_OUT
```

The underlying observation and historical assessment remain valid historical artifacts. Only the current-market confidence has aged out.

### CLOSED

`CLOSED` currently requires a valid source-explicit `expiresAt` whose expiry has passed.

Basis:

```text
SOURCE_EXPLICIT_EXPIRY_PASSED
```

Date-only values are treated conservatively as expiring at the end of that UTC date. Time values must be timezone-aware ISO values.

M4B-07 does **not** convert provider HTTP 404/disappearance into a closure fact. The M4B-03 acquisition path currently treats that as an acquisition failure and does not persist a negative market observation. Until a later explicit disappearance/closure-event contract exists, old direct listings age to `STALE`, not falsely to `CLOSED`.

### UNKNOWN

Manual/non-direct observations are:

```text
UNKNOWN
```

unless a valid source-explicit expiry has already passed.

Basis:

```text
NON_DIRECT_SOURCE_NOT_CURRENTLY_VERIFIED
```

A user pasting a vacancy is evidence that the user supplied that source state; it is not proof that the source is currently serving the listing.

## Public lifecycle boundary

Endpoint:

```text
POST /api/market-opportunity-lifecycle
```

Input:

```json
{
  "marketObservationId": "market-observation:<32 lowercase hex>"
}
```

The caller cannot provide:

```text
marketOpportunityId
provider identity
externalId
lifecycle status
freshness age
current observation
```

Those are resolved from durable source history and server-owned evaluation time.

## OpportunitySpace integration

M4B-07 adds lifecycle as a ranking guard only.

```text
OpportunityAssessment  historical evidence readiness
CareerTargetRelevance   explicit candidate direction
MarketLifecycle         current-market confidence
                │
                ▼
         OpportunitySpace
```

### Ranking guards

```text
CLOSED
  → DEPRIORITIZE

STALE
  → INSUFFICIENT_SIGNAL

OPEN + assessment built from older material observation
  → INSUFFICIENT_SIGNAL

OPEN + assessment built from current observation
  → normal M4A priority rules

UNKNOWN
  → existing/manual priority behavior remains available
```

### Superseded assessment protection

This is essential:

```text
Observation A → JobSnapshot A → Assessment A
Observation B → same logical opportunity, materially changed
```

Even when B is currently `OPEN`, Assessment A is not current.

OpportunitySpace compares the assessment JobSnapshot's provenance observation against:

```text
lifecycle.currentMarketObservationId
```

If they differ, `assessmentObservationIsCurrent = false` and the historical assessment is suppressed to `INSUFFICIENT_SIGNAL` until the current material state is projected and reassessed.

## Regression coverage

M4B-07 tests prove:

1. material provider changes keep one logical opportunity id;
2. identical titles with different provider-native ids never merge;
3. manual changed observations remain observation-bound;
4. recent direct observations are OPEN;
5. direct observations age to STALE after the v1 window;
6. valid source-explicit expiry can produce CLOSED;
7. unchanged re-observation refreshes lastObservedAt without increasing materialStateCount;
8. the runtime auto-links historical material versions of the same strong provider identity;
9. link persistence is idempotent;
10. CLOSED, STALE and superseded assessments cannot be promoted in OpportunitySpace;
11. missing durable index configuration fails closed;
12. public lifecycle input cannot forge identity/lifecycle fields;
13. identity/lifecycle code has no CandidateEvidence, CareerAssertion, Job Match or OpportunityAssessment execution dependency.

## Gate

```text
M4B-07 — CONSERVATIVE_LOGICAL_OPPORTUNITY_IDENTITY_AND_LIFECYCLE
```

The gate closes only when identity is source-native or observation-bound, material history is preserved, lifecycle is derived from durable occurrences, and current OpportunitySpace priority cannot silently use stale/closed/superseded market state.

## Non-goals

Not included:

- fuzzy company/title deduplication;
- cross-provider identity resolution;
- LinkedIn/aggregator reconciliation;
- broad polling;
- provider-scale parallel workers;
- negative disappearance events;
- automatic closure from 404;
- market statistics or trend inference;
- candidate matching changes.

## Next boundary

Before CV Engine broadens acquisition into multi-job discovery or scheduled provider refresh, the single-snapshot market stores must stop being a concurrency bottleneck.

Recommended next gate:

```text
MARKET-04B-08 — Partitioned Market Persistence + Concurrency Safety
```

That gate should partition observation, interpretation, projection and logical-opportunity state by stable keys; define optimistic/transactional write semantics; preserve current content-addressed/idempotent contracts; and prove concurrent provider workers cannot lose history before any polling/discovery worker is authorized.
