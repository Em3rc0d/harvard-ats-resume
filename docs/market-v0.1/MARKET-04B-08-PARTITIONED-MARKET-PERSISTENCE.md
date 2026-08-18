# MARKET-04B-08 — Partitioned Market Persistence + Concurrency Safety

## Why this gate exists

M4B-02B through M4B-07 made market truth durable, interpretable, projectable, assessable, and lifecycle-aware. The persistence implementation underneath those gates still had one infrastructure limitation:

```text
LOAD one global Redis snapshot
        ↓
modify the aggregate in memory
        ↓
SET one global Redis snapshot
```

That model is sufficient for controlled sequential execution. It is not safe for parallel provider workers because two writers can load the same revision, independently append different records, and then replace one another's full snapshot.

M4B-08 removes that lost-update authority before CV Engine authorizes multi-job discovery, scheduled provider refresh, or parallel acquisition.

## Gate statement

```text
M4B-08 — PARTITIONED_APPEND_SAFE_MARKET_PERSISTENCE
```

A market-history writer persists immutable records at semantic/stable keys with deterministic shard indexes. One logical event is atomically visible, concurrent writers cannot overwrite another writer's immutable history, semantic-key conflicts fail closed, legacy v1 history remains visible during cutover, and reload verification requires the caller's exact record even when another concurrent writer advances the reconstructed aggregate.

## Hard boundaries

```text
concurrent writer != overwrite authority
partition key != mutable aggregate ownership
same semantic key + different content != valid idempotency
Observation event != half-visible Observation/Occurrence pair
persistence partitioning != market interpretation
persistence partitioning != candidate truth
migration != legacy deletion
concurrency-safe append != optimized full-catalog querying
```

M4B-08 changes persistence authority. It does not change MarketObservation semantics, interpretation policy, projection policy, logical opportunity identity, lifecycle, Job Match, OpportunityAssessment, CareerTarget relevance, or candidate evidence.

## Previous persistence model

Four production repositories used one fixed Redis key each:

```text
ats2:market-observation-history:v1
ats2:derived-market-interpretation-history:v1
ats2:market-job-projection-history:v1
ats2:market-opportunity-index:v1
```

Each repository exposed the same effective behavior:

```text
GET history
      ↓
validate
      ↓
append locally
      ↓
SET history
      ↓
reload
```

A single `SET` is atomic as one Redis command, but the complete read-modify-write sequence is not an atomic append contract.

### Lost-update example

```text
Worker A GET revision 10
Worker B GET revision 10

Worker A adds Observation A
Worker B adds Observation B

Worker A SET revision 11[A]
Worker B SET revision 11[B]
```

The second whole-snapshot write can erase A even though both workers individually completed a valid persistence path.

M4B-08 removes whole-history replacement from the production append path.

## Partitioned persistence primitive

Shared infrastructure:

```text
lib/infrastructure/persistence/PartitionedMarketPersistence.ts
```

The primitive separates immutable records from discovery indexes:

```text
semantic/stable id
       ↓
SHA-256 shard selection
       ↓
record key + shard index
```

The first policy uses:

```text
16 deterministic shards
00 ... 0f
```

Shard choice is derived from the first SHA-256 byte of the record's storage identity modulo 16.

The shard count is infrastructure policy. It does not participate in market-domain identity.

## Immutable record write

One logical persistence operation uses:

```text
MULTI / EXEC
    ├── SETNX immutable-record-key record
    └── SADD  deterministic-shard-index record-id
```

After the transaction, CV Engine performs exact read-back verification with `MGET`.

### Why SETNX

The record key is immutable authority. An exact repeat is valid idempotency:

```text
same key
same content
→ accepted
```

A competing meaning is not:

```text
same key
different content
→ FAIL CLOSED
```

`SETNX` prevents replacement. Read-back stable-content verification tells the losing writer whether the existing immutable record means exactly the same thing or something different.

The persistence layer therefore does not silently acknowledge an immutable-key collision.

## Atomic logical-event boundaries

M4B-08 does not assume every history record is independently safe to expose.

### Market Observation History

Natural event:

```text
MarketObservation
      +
ObservationOccurrence
```

These two records are committed in the **same** `MULTI/EXEC` transaction.

This prevents a reader from observing:

```text
MarketObservation without any ObservationOccurrence
```

which would violate the M4B-02B history contract.

### Derived Market Interpretation History

Natural append:

```text
one DerivedMarketInterpretation
```

### Market Job Projection History

Natural append:

```text
MarketJobProjection + JobSnapshot
```

They remain one validated history record because the JobSnapshot is authorized by that exact projection + analyzer version.

### Market Opportunity Index

Natural append:

```text
one MarketOpportunityLink
```

## Semantic storage keys

The Redis storage key follows the strongest existing semantic uniqueness contract rather than blindly using whichever content-addressed id is convenient.

### Observation

Observation record:

```text
MarketObservationId
```

Occurrence record:

```text
ObservationOccurrenceId
```

### Interpretation

Uniqueness authority:

```text
MarketObservationId + policyVersion
```

Reason: M4B-04 already guarantees one deterministic interpretation for one observation under one policy. Two competing derived IDs for the same observation + policy must collide at storage authority rather than coexist until later aggregate validation.

### Projection

Uniqueness authority:

```text
MarketJobProjectionId + analyzerVersion
```

This preserves the M4B-05 rule that future analyzer versions may legitimately create distinct JobSnapshots from the same authorized projection.

### Logical opportunity link

Uniqueness authority:

```text
MarketObservationId
```

Reason: M4B-07 guarantees one MarketObservation can never later be linked to another logical MarketOpportunity. A competing link for the same observation therefore collides on the same immutable storage key and fails closed.

## Repository contract evolution

Existing application repository interfaces retain:

```text
load()
save(snapshot)
```

for deterministic in-memory tests and migration compatibility.

M4B-08 adds an optional production append authority:

```text
ObservationHistory.append({ observation, occurrence })
InterpretationHistory.append(interpretation)
ProjectionHistory.append({ projection, jobSnapshot })
OpportunityIndex.append(link)
```

Application persistence services prefer `append()` when available and fall back to historical `save(snapshot)` behavior otherwise.

This keeps the domain/application contract backward-compatible while changing the production Upstash write path from snapshot replacement to immutable append.

## Concurrency-aware reload verification

Before M4B-08, a persistence function could require:

```text
reloaded.revision === locally expected revision
```

That is incorrect under valid parallel writes.

Example:

```text
caller A sees revision 10
caller B sees revision 10
A appends A
B appends B
A reloads after both commits
```

A can legitimately see reconstructed revision 12 even though its local next revision was 11.

M4B-08 therefore requires:

```text
reloaded.revision >= locally expected revision
AND
caller's exact immutable record is present
AND
caller's exact content hash/semantic link still matches
```

Another writer may advance history. It cannot substitute or erase this writer's record.

## Reconstructed aggregate compatibility

The application layer still consumes the existing v1 snapshot interfaces.

Partitioned repositories reconstruct those read views from immutable records:

```text
16 shard indexes
      ↓
SMEMBERS
      ↓
stable record ids
      ↓
MGET immutable records
      ↓
merge + deterministic ordering
      ↓
existing v1 integrity validator
      ↓
Market...HistorySnapshot
```

This means M4B-08 changes storage topology without requiring every upstream runtime to be rewritten in the same gate.

Reconstructed revisions are deterministic record/event counts:

- Observation History: number of ObservationOccurrences.
- Interpretation History: number of semantic interpretation records.
- Projection History: number of projection + analyzer records.
- Opportunity Index: number of observation→opportunity links.

There is no shared mutable revision counter required for append safety.

## v1 → v2 migration strategy

M4B-08 does not delete old history.

Each partitioned production repository has:

```text
legacy v1 key
v2 partition namespace
v2 migration marker
```

On the first v2 append:

```text
validate legacy v1 snapshot
       ↓
write every legacy immutable event/record into v2
       ↓
read/identity protections remain active
       ↓
only after successful migration writes
set migration-complete marker
       ↓
append new v2 record
```

A crash before the marker does not make partially migrated history authoritative by itself. A later call can retry idempotently because immutable records use `SETNX` and exact-content verification.

## Rolling-deployment safety

Even after the migration marker exists, v2 reads deliberately continue reading the legacy v1 key and merge it with partitioned v2 records.

Why:

```text
new process starts v2
old process is still draining
old process performs one final v1 snapshot write
```

If new code stopped reading v1 immediately after the marker, that final old-process write could become invisible.

M4B-08 instead uses:

```text
legacy v1 records
       +
partitioned v2 records
       ↓
semantic merge
```

If the same semantic key exists on both sides with different immutable content, the merge fails closed.

Legacy-key retirement is a later explicit operational cleanup after old writers are known to be drained. It is not silently performed by this gate.

## Concurrency proof

Regression suite:

```text
tests/ats2/partitioned-market-persistence.test.ts
```

A deterministic in-memory atomic backend exercises the same repository append contracts without depending on external Redis availability.

It proves:

1. Two parallel MarketObservation writers preserve both observations and both occurrences.
2. Observation + Occurrence is committed as one two-record logical event.
3. Two parallel DerivedMarketInterpretation writers preserve both semantic interpretations.
4. Two parallel MarketJobProjection writers preserve both projection + JobSnapshot records.
5. Two parallel MarketOpportunity link writers preserve both links.
6. Existing v1 observation history migrates lazily.
7. A simulated late v1 writer remains visible after v2 migration through dual-read.
8. A competing MarketOpportunity meaning for the same MarketObservation semantic key is rejected instead of coexisting.
9. The concrete Upstash backend uses transaction + immutable key + shard membership + read-verification primitives rather than one global snapshot field.

The complete ATS v2 suite also remains authoritative so the storage change cannot silently weaken earlier gates.

## No market-domain semantic change

The following remain untouched in meaning:

```text
MarketObservation identity
ObservationOccurrence identity
DerivedMarketInterpretation identity/policy
MarketJobProjection identity/policy
JobSnapshot market provenance
MarketOpportunity identity
MarketOpportunity lifecycle
OpportunityAssessment
OpportunitySpace priority
CareerEvidence / CareerAssertion
```

Partitioning is an infrastructure transformation, not a truth transformation.

## Capacity boundary after M4B-08

M4B-08 authorizes parallel append safety. It does **not** claim that full-history reconstruction is the final high-volume query architecture.

Current read behavior can still scan:

```text
all 16 shard indexes
+
all indexed records needed to reconstruct a history aggregate
```

That is acceptable for the current gate because its purpose is correctness under concurrent writes and migration compatibility.

A future discovery/catalog read model should introduce provider/opportunity-scoped indexes or projections rather than requiring giant full-history reads for every market query.

Therefore:

```text
M4B-08 = concurrency-safe persistence foundation
M4B-08 != infinite-scale market catalog query system
```

## Known operational limitations

- v1 keys remain dual-read until an explicit post-cutover cleanup process retires old writers and validates migration completeness.
- 16 shards are a v1 infrastructure policy, not an independently benchmarked optimal shard count.
- This gate does not create distributed queues, schedulers, provider polling, pagination, backoff, or rate-control orchestration.
- This gate does not add negative source events for provider disappearance.
- Cross-provider fuzzy deduplication remains prohibited.
- Full aggregate reconstruction is correct but should not become the long-term high-volume product read surface.

## CI evidence

Implementation head before documentation:

```text
562449e40aef84c73e07b0f5d0b9b8a70117fc97
```

GitHub Actions:

```text
run  32092357161
job  95576931721
```

Results:

```text
install            PASS
dependency audit   PASS
lint               PASS — zero warnings
typecheck          PASS
behavior tests     PASS — 217 tests
production build   PASS
```

Earlier CI runs intentionally caught and corrected:

- Upstash collection generic result-type mismatches during typecheck.
- one stale source-inspection regex after the type correction.

Neither failure was suppressed. The final implementation head passed the complete gate.

## Gate closure

M4B-08 closes when:

```text
parallel appends cannot overwrite another history record
AND logical observation event visibility is atomic
AND semantic-key collisions fail closed
AND exact repeat remains idempotent
AND v1 history survives migration/cutover
AND existing market/candidate truth semantics remain unchanged
AND complete CI is green
```

With the implementation head green, those conditions are executable.

## Next architectural step — MARKET-04B-09

M4B-08 removes the persistence blocker that prevented broad acquisition.

The next gate is:

```text
MARKET-04B-09 — Multi-job Discovery + Refresh
```

It should introduce controlled provider listing discovery and re-observation above the existing single-listing adapters, including:

- bounded provider pagination/listing enumeration;
- multi-listing acquisition without arbitrary crawling;
- explicit refresh/re-observation policy;
- retry/backoff and provider rate-budget controls;
- partial-failure semantics;
- deduplication through the existing provider-native logical opportunity identity only;
- no cross-provider fuzzy merge;
- lifecycle refresh from durable ObservationOccurrences;
- provenance-preserving handoff into the existing Interpretation → Projection → Assessment chain.

Scheduled execution may be introduced only if its queue/worker semantics are explicit and testable. M4B-09 must not turn controlled provider APIs into a general-purpose crawler.
