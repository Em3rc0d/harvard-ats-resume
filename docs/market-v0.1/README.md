# CV Engine — Market Architecture v0.1 / Execution Record

## Product decision

CV Engine is not evolved primarily as an AI Resume Builder or as a generic "ATS score" tool.

The market architecture defines:

- **Beachhead:** Application Intelligence for individuals.
- **Initial question:** **Should I apply to this opportunity?**
- **Harbor:** Career Opportunity Intelligence.
- **Resume role:** a contextual projection of career truth for one application, not the product source of truth.

The ATS v2 trust kernel remains the foundation:

```text
Career Evidence
    -> Career Assertions
    -> Job Requirements
    -> Requirement Matches
    -> Explainability
    -> Resume Version
```

Market v0.1 adds durable decision intelligence above that kernel rather than replacing it.

## Truth boundary

Four information classes remain distinct:

1. **Career Fact** — supplied/confirmed candidate truth.
2. **Market Fact** — facts explicitly observed from a job/opportunity or later labor-market source.
3. **Derived Analysis** — interpretations, comparisons and classifications computed from source truth.
4. **Recommendation** — suggested action such as apply, build first, explore or deprioritize.

Hard invariants:

```text
JobRequirement != CandidateSkill
Recommendation != CareerFact
DerivedAnalysis != CareerFact
CareerTarget != CareerEvidence
TargetRelevance != JobMatch
OpportunityPriority != JobMatch
MarketObservation != DerivedMarketInterpretation
MarketIntakeRequest != MarketObservation
ObservationOccurrence != MarketObservation
ObservationOccurrence != DerivedMarketInterpretation
ProviderPayload != MarketObservation
ProviderPayload != JobRequirement
```

A market requirement can influence analysis. It can never authorize a new candidate assertion.

## Current execution state

```text
PLATFORM BASELINE                              COMPLETE
MARKET-01 Application Intelligence            COMPLETE
MARKET-02 Opportunity History                 COMPLETE
MARKET-03 CareerTarget / Relevance            COMPLETE
MARKET-04A OpportunitySpace                   COMPLETE
MARKET-04B-01 Market Observation Canon        COMPLETE
MARKET-04B-02A Canonical Structured Intake    COMPLETE
MARKET-04B-02B Durable Observation History    COMPLETE
MARKET-04B-03 Controlled Source Acquisition   COMPLETE
MARKET-04B-04 Derived Market Interpretation   NEXT
```

The specific execution documents are the authoritative details for each later stage:

- `MARKET-03-CAREER-TARGET.md`
- `MARKET-04-OPPORTUNITY-SPACE.md`
- `MARKET-04B-01-MARKET-OBSERVATION-CANON.md`
- `MARKET-04B-02A-STRUCTURED-MARKET-INTAKE.md`
- `MARKET-04B-02B-DURABLE-OBSERVATION-HISTORY.md`
- `MARKET-04B-03-CONTROLLED-SOURCE-ACQUISITION.md`

## MARKET-01 — Application Intelligence

The first commercial decision layer answers one opportunity before resume generation:

```text
Career Truth + Job Truth
          |
          v
   OpportunityAssessment
          |
          +-- READY_NOW
          +-- STRONG_STRETCH
          +-- BUILDABLE
          +-- ASPIRATIONAL
          `-- LOW_ALIGNMENT
```

It exposes the recommendation, next action, eligibility, evidence strength, required/preferred coverage, supporting evidence, gaps and uncertainties.

It does **not** represent:

- hiring probability
- recruiter acceptance probability
- interview probability
- a score emitted by a commercial ATS
- evidence that a missing requirement belongs to the candidate

### Gate M1 — OPPORTUNITY_DECISION_BEFORE_APPLICATION

A targeted application is assessed before targeted resume generation, job edits invalidate the old assessment, insufficient Job Intelligence cannot manufacture a recommendation, and all recommendation classes remain deterministically test-covered.

## MARKET-02 — Snapshot-bound Opportunity History

M2 turns an assessment into a reproducible historical object:

```text
CareerSnapshot ----+
                   |
                   v
          OpportunityAssessment
                   ^
                   |
JobSnapshot -------+
```

`CareerSnapshot`, `JobSnapshot` and persisted assessment identities are content-addressed from semantic state rather than wall-clock time. Old assessments are preserved when career or job state changes. Historical graphs are integrity-validated before durability is claimed.

### Gate M2 — SNAPSHOT_BOUND_OPPORTUNITY_HISTORY

Every durable assessment is bound to the exact CareerSnapshot, JobSnapshot, MatchReport, match-engine version and assessment-policy version used to produce it. Storage failure fails closed.

## MARKET-03 — CareerTarget / Target Relevance

M3 introduces explicit candidate intent without changing candidate capability truth:

```text
Career Truth  -> CAN
CareerTarget  -> WANT
Job + Target  -> TargetRelevance
```

Target preferences may change strategic relevance, but must never satisfy a job requirement or alter evidence-backed Job Match.

A candidate can preserve multiple target directions while one target is active. Target-to-assessment relevance links are durable and idempotent.

### Gate M3 — INTENT_SEPARATE_FROM_CAPABILITY

Changing CareerTarget may change TargetRelevance while the same CareerSnapshot + JobSnapshot keeps the same Job Match and assessment evidence semantics.

## MARKET-04A — Controlled OpportunitySpace

M4A expands one-person / one-job reasoning into one-person / many-jobs prioritization:

```text
OpportunityAssessment  -> Can I defend this application?
CareerTargetRelevance  -> Does it fit my chosen direction?
                         |
                         v
OpportunityPriority    -> Where should I focus?
                         |
                         v
OpportunitySpace
```

Priority bands are explainable and deterministic:

- `PRIORITIZE_NOW`
- `APPLY_SELECTIVELY`
- `BUILD_TOWARD`
- `EXPLORE`
- `DEPRIORITIZE`
- `INSUFFICIENT_SIGNAL`

OpportunitySpace consumes durable M1-M3 artifacts; it does not run a second matcher. The controlled product surface compares 2-10 manually supplied jobs against one CareerSnapshot and one active CareerTarget.

### Gate M4A — EXPLAINABLE_MULTI_OPPORTUNITY_PRIORITIZATION

Priority remains separate from Job Match, mixed CareerSnapshots are rejected, semantic spaces are content-addressed and historical spaces are preserved.

## MARKET-04B-01 — Market Observation Canon

M4B begins the source-aware market boundary required before URLs and external providers.

The critical distinction is:

```text
what the source said
!=
what CV Engine interpreted
```

`MarketObservation` records the raw/explicit side only:

```text
External or user-supplied source
             |
             v
      MarketObservation
      RAW + EXPLICIT FACTS
             |
             | later M4B work
             v
Derived Market Interpretation
             |
             v
       Job Intelligence
             |
             v
         JobSnapshot
```

Source-explicit fields carry source evidence. TEXT observations require an exact supporting excerpt present in the raw payload. Provider-adapter observations require provider and adapter provenance. Observation time is valid runtime provenance but does not manufacture a new semantic market state.

### Gate M4B-01 — SOURCE_AWARE_MARKET_TRUTH_BOUNDARY

`MarketObservation` remains separate from Candidate Evidence, Career Assertions, Job Requirements and derived market interpretation. Fabricated provenance and content-addressed tampering are rejected.

## MARKET-04B-02A — Canonical Structured Market Intake

M4B-02A establishes one controlled entry boundary for user-supplied market information:

```text
Manual text -----------+
                       |
Structured payload ----+--> MarketIntakeService
                              |
                              v
                        MarketObservation
```

Both representations use the same M4B-01 `createMarketObservation()` authority.

Manual text remains raw text and creates no inferred structured market fields. A structured payload maps only caller-supplied fields to source-explicit values with adapter-owned JSON paths.

`MANUAL_STRUCTURED` was added as a source origin so manually supplied structured data is not mislabeled as a provider API or partner feed. Payload representation remains independently represented as `TEXT` or `JSON`.

An optional URL is only a user-supplied source reference in M4B-02A. The intake route performs no network fetch. Public callers also cannot supply `observedAt`; CV Engine assigns the runtime observation timestamp so provenance time is not caller-forgeable.

The pure M4B-02A application service deliberately still returns:

```text
persistence = NOT_PERSISTED_M4B_02A
```

because canonicalization and durability remain separate application responsibilities. After M4B-02B, the public HTTP route composes canonical intake with durable observation history before returning success.

### Gate M4B-02A — CANONICAL_PROVENANCE_PRESERVING_MARKET_INTAKE

Manual text and structured payloads converge through one service, provenance remains controlled, caller key ordering is non-semantic for structured input, candidate truth remains disconnected, and no Job Intelligence, matching, ranking or market acquisition is performed.

## MARKET-04B-02B — Durable Observation History

M4B-02B separates immutable semantic market state from temporal observation events:

```text
MarketObservation
      |
      +-- ObservationOccurrence A
      +-- ObservationOccurrence B
      `-- ObservationOccurrence C
```

Required behavior is now explicit and executable:

```text
same semantic source content observed again
=> same MarketObservation identity
=> new ObservationOccurrence

changed source content
=> new MarketObservation identity
=> prior MarketObservation remains preserved

same semantic observation + exact same observedAt replay
=> same ObservationOccurrence
=> no duplicate / no revision increment
```

`ObservationOccurrence` is content-addressed from the semantic observation identity plus the server-owned observation timestamp. It carries the boundary:

```text
OBSERVATION_EVENT_NOT_SEMANTIC_MARKET_STATE
```

The durable aggregate stores validated `MarketObservation[]` and `ObservationOccurrence[]`. Every occurrence must reference a stored observation, every observation must have at least one occurrence, duplicate identifiers are rejected, and loaded history is revalidated before any merge.

The first persistence adapter stores one versioned history snapshot in Upstash and reload-verifies the exact revision, observation and occurrence before success is claimed.

The public `/api/market-intake` flow is now:

```text
bounded request
      ↓
rate limit
      ↓
strict intake schema
      ↓
MarketIntakeService
      ↓
MarketObservation
      ↓
Durable Observation History
      ↓
reload + integrity verification
      ↓
HTTP 200
```

A successful public response reports:

```text
persistence = DURABLE_OBSERVATION_HISTORY_M4B_02B
```

Missing durable storage configuration fails closed instead of falling back to a false durability claim.

### Gate M4B-02B — DURABLE_SEMANTIC_STATE_AND_OCCURRENCE_HISTORY

Semantic market state and observation events are now independently addressable, historical states are append-preserving, exact replay is idempotent, persistence is reload-verified, and no candidate/Job Intelligence/Opportunity decision boundary is crossed.

## MARKET-04B-03 — Controlled Source Acquisition

M4B-03 opens the first real external market boundary through three documented public provider interfaces:

```text
Greenhouse ----+
Lever ----------+--> Controlled Provider Adapter
Ashby ----------+            |
                             v
                    Canonical Market Intake
                             |
                             v
                      MarketObservation
                             |
                             v
                   ObservationOccurrence History
```

The first runtime contract is intentionally one-listing-at-a-time and manually triggered. It is not a crawler, provider poller or synchronization worker.

Supported provider-native locators:

```text
GREENHOUSE: boardToken + jobId
LEVER:      site + postingId + GLOBAL/EU
ASHBY:      jobBoardName + hosted jobUrl selector
```

The caller cannot provide an arbitrary network destination. Provider adapters construct only fixed HTTPS endpoints on the documented provider API hosts, reject redirects, use JSON-only responses, enforce an 8-second timeout and stop responses beyond 2 MiB.

Provider adapters remain infrastructure. The application service receives a `ControlledProviderSourceAcquirer` port and therefore does not import provider HTTP mechanics.

Adapters also cannot create `MarketObservation` directly. They return source-explicit provider intake to the canonical Market Intake application boundary, which creates a `PROVIDER_API` MarketObservation with `PROVIDER_ADAPTER` provenance and adapter versioning. M4B-02B then persists and reload-verifies the observation plus occurrence before HTTP success.

Provider mappings are deliberately conservative. Provider fields whose semantics do not exactly match the market domain are left in the preserved payload rather than silently relabeled. For example, Greenhouse `updated_at` and Ashby `publishedAt` do not become `postedAt` in this gate.

### Gate M4B-03 — CONTROLLED_PROVIDER_ACQUISITION

A supported public provider listing can now enter CV Engine through a bounded, source-aware, provenance-preserving acquisition path while arbitrary URL fetch, candidate coupling, Job Intelligence, matching, OpportunityAssessment and OpportunitySpace remain outside the acquisition boundary.

## Next architectural step — MARKET-04B-04

M4B-03 answers:

```text
Where can trustworthy market source material enter?
```

The next missing question is:

```text
How may CV Engine interpret that observed material without confusing interpretation with source fact?
```

The next boundary is therefore:

```text
MARKET-04B-04 — Derived Market Interpretation Boundary
```

Required direction:

```text
MarketObservation
      |
      v
Derived Market Interpretation
      |
      v
Job Intelligence
      |
      v
JobSnapshot
```

The next gate must define typed derived concepts, evidence links back to exact MarketObservation fields/payload, interpretation policy/versioning, explicit unknown/absence semantics, and the controlled bridge into existing Job Intelligence.

It must still preserve:

```text
observed source fact != derived interpretation
missing source fact != invented value
derived job truth != candidate truth
```

Broad provider polling, cross-source deduplication, lifecycle status and high-volume synchronization remain later work; the M4B-02B single-snapshot history store is not approved for those workloads yet.
