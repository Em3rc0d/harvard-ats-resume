# MARKET-04B-02B — Durable Observation History

## Purpose

M4B-01 created a content-addressed `MarketObservation` whose semantic identity deliberately excludes observation time. M4B-02A then created one canonical intake boundary for user-supplied market material.

M4B-02B closes the next missing boundary:

```text
semantic market state
!=
observation event
```

The system must be able to preserve both:

```text
MarketObservation
      |
      +-- ObservationOccurrence A
      +-- ObservationOccurrence B
      `-- ObservationOccurrence C
```

without manufacturing a new semantic market state merely because the same source was seen again later.

## Domain contract

### MarketObservation

Remains the immutable raw/source-explicit market fact introduced in M4B-01.

Its identity continues to be derived from:

```text
schema version
source
raw payload
explicit source fields
provenance
scope boundary
```

`observedAt` is validated but excluded from semantic identity.

### ObservationOccurrence

M4B-02B introduces a separate temporal object:

```text
schemaVersion
id
marketObservationId
observedAt
contentSha256
scopeBoundary
```

Its scope boundary is:

```text
OBSERVATION_EVENT_NOT_SEMANTIC_MARKET_STATE
```

An occurrence means only:

> CV Engine observed this already-defined semantic market state at this time.

It is not a new job, a new requirement, a lifecycle classification, a candidate fact, or a derived interpretation.

Occurrence identity is content-addressed from:

```text
MarketObservationId
+
observedAt
+
occurrence schema/scope
```

Therefore:

```text
same MarketObservation + different observedAt
=> different ObservationOccurrence
```

while:

```text
same MarketObservation + same observedAt replay
=> same ObservationOccurrence
=> idempotent history write
```

## Durable history aggregate

The first durable market-history contract is:

```text
MarketObservationHistorySnapshot

schemaVersion
observations[]
occurrences[]
revision
createdAt
updatedAt
```

Every stored `MarketObservation` must have at least one stored `ObservationOccurrence`.

Every occurrence must reference an observation present in the same validated history snapshot.

Duplicate observation or occurrence identifiers are rejected.

All observations and occurrences are revalidated from their content-addressed identities whenever history is loaded.

## Merge behavior

### Same semantic source state observed again

```text
T1
MarketObservation A
ObservationOccurrence A1

T2
same semantic source content

result:
MarketObservation A
ObservationOccurrence A1
ObservationOccurrence A2
```

The canonical semantic object is not duplicated.

### Changed source state

```text
T1
MarketObservation A
ObservationOccurrence A1

T2
source content changed

result:
MarketObservation A
ObservationOccurrence A1
MarketObservation B
ObservationOccurrence B1
```

The previous market state is not overwritten.

### Exact replay

If the same observation occurrence is submitted again internally with the exact same semantic observation identity and observation timestamp:

```text
no new observation
no new occurrence
no revision increment
```

This keeps retry/replay behavior idempotent.

## Persistence boundary

M4B-02B adds `MarketObservationHistoryRepository` and a server-side Upstash implementation.

The initial persistence key is one versioned market-history snapshot:

```text
ats2:market-observation-history:v1
```

The snapshot is written with one Redis `SET` and then immediately reloaded.

A successful durability claim requires:

```text
save
  ↓
reload
  ↓
full history integrity validation
  ↓
expected revision found
  ↓
new MarketObservation found
  ↓
new ObservationOccurrence found
  ↓
SUCCESS
```

If the write cannot be reloaded, success is rejected.

Missing Upstash configuration fails closed.

## Public intake behavior

`POST /api/market-intake` keeps the M4B-02A canonical intake step first:

```text
request
  ↓
size guard
  ↓
rate limit
  ↓
strict input schema
  ↓
MarketIntakeService
  ↓
MarketObservation
  ↓
Durable Observation History
```

HTTP 200 now means the observation and its temporal occurrence were durably written and reload-verified.

The success payload reports:

```text
persistence = DURABLE_OBSERVATION_HISTORY_M4B_02B
```

plus occurrence identity and compact history metadata.

If durable storage is not configured, the route returns a service-unavailable response instead of claiming a non-durable success.

## Truth boundaries preserved

```text
ObservationOccurrence != MarketObservation
ObservationOccurrence != JobSnapshot
ObservationOccurrence != JobRequirement
ObservationOccurrence != CareerEvidence
ObservationOccurrence != CareerAssertion
ObservationOccurrence != lifecycle status
ObservationOccurrence != freshness classification
MarketObservation != DerivedMarketInterpretation
```

Nothing in M4B-02B promotes market information into candidate truth.

Nothing in M4B-02B invokes matching, ranking, OpportunityAssessment, CareerTarget, OpportunitySpace, or Resume generation.

## Behavior coverage

The gate adds executable checks for:

1. unchanged semantic market content observed at another time keeps one `MarketObservation` and appends another occurrence;
2. exact occurrence replay is idempotent;
3. changed source content creates a new semantic observation while preserving the prior one;
4. occurrence identity is content-addressed from observation identity + time;
5. occurrence tampering is rejected;
6. corrupted stored history is rejected before new data can overwrite it;
7. a save that cannot be reloaded cannot produce a durability claim;
8. every stored semantic observation must have at least one occurrence;
9. missing durable storage configuration fails closed;
10. public market intake persists only after canonical intake and still performs no acquisition or downstream intelligence.

## Gate M4B-02B — DURABLE_SEMANTIC_STATE_AND_OCCURRENCE_HISTORY

M4B-02B is complete when:

- `ObservationOccurrenceId` exists as a domain identity;
- `ObservationOccurrence` is a distinct temporal domain object;
- repeated unchanged source state preserves one semantic `MarketObservation` and multiple occurrences;
- changed source state creates a new observation without overwriting the old one;
- exact occurrence replay is idempotent;
- history integrity is validated before merge;
- durability is reload-verified before success;
- missing storage fails closed;
- public `observedAt` remains server-owned;
- no URL fetch/provider acquisition is introduced;
- no Job Intelligence / matching / candidate coupling is introduced;
- dependency audit, lint, typecheck, behavior tests and production build remain green.

## Explicit non-goals

M4B-02B intentionally does **not** implement:

- URL acquisition;
- Greenhouse / Lever / Ashby / Adzuna / Jooble adapters;
- provider polling;
- logical `MarketOpportunity` identity or cross-source deduplication;
- source-specific history partitions;
- optimistic-concurrency/provider-scale write coordination;
- active / stale / closed lifecycle;
- freshness policy;
- derived market interpretation;
- Job Intelligence invocation from MarketObservation;
- JobSnapshot creation from market observations;
- OpportunitySpace population from external market supply.

The initial single-snapshot repository is deliberately a semantic/history gate, not the final provider-scale storage topology. Concurrency/partitioning must be addressed before broad parallel provider ingestion.

## Next architectural boundary

With semantic state and temporal occurrence history separated, the market foundation can begin controlled external acquisition without losing source history.

The next stage should be:

```text
MARKET-04B-03 — Controlled Source Acquisition
```

starting with explicit provider/source adapters that produce the existing canonical intake/observation contract rather than bypassing it.

The required direction remains:

```text
External Source
      ↓
Source Adapter
      ↓
Canonical Market Intake
      ↓
MarketObservation
      ↓
ObservationOccurrence History
      ↓
[later] Derived Market Interpretation
      ↓
Job Intelligence
      ↓
JobSnapshot
```

No provider should be allowed to write `JobRequirement`, candidate evidence, or Opportunity decisions directly.
