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
DerivedMarketInterpretation != JobRequirement
MarketJobProjection != JobRequirement
MarketMetadata != SyntheticRequirementText
JobSnapshotMarketProvenance != CandidateTruth
OpportunityAssessment != CandidateTruth
MarketObservation != MarketOpportunity
MarketOpportunityLifecycle != MarketFact
OPEN != CURRENT_ASSESSMENT
ConcurrentWriter != SnapshotOverwriteAuthority
SameSemanticPersistenceKey + DifferentContent != Idempotency
PartitionedPersistence != CandidateTruth
DiscoveryLocator != MarketObservation
DiscoveryResult != JobRequirement
AcquisitionFailure != MarketClosure
RefreshDecision != MarketOpportunityLifecycle
RefreshFailure != CLOSED
UNKNOWN != FALSE
SOURCE_SILENT != INFERRED_VALUE
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
MARKET-04B-04 Derived Market Interpretation   COMPLETE
MARKET-04B-05 Job Intelligence Projection     COMPLETE
MARKET-04B-06 Market Assessment Integration   COMPLETE
MARKET-04B-07 Opportunity Identity/Lifecycle  COMPLETE
MARKET-04B-08 Partitioned Market Persistence  COMPLETE
MARKET-04B-09 Multi-job Discovery / Refresh   COMPLETE
MARKET-04B-10 Market Candidate Retrieval      NEXT
```

The specific execution documents are the authoritative details for each later stage:

- `MARKET-03-CAREER-TARGET.md`
- `MARKET-04-OPPORTUNITY-SPACE.md`
- `MARKET-04B-01-MARKET-OBSERVATION-CANON.md`
- `MARKET-04B-02A-STRUCTURED-MARKET-INTAKE.md`
- `MARKET-04B-02B-DURABLE-OBSERVATION-HISTORY.md`
- `MARKET-04B-03-CONTROLLED-SOURCE-ACQUISITION.md`
- `MARKET-04B-04-DERIVED-MARKET-INTERPRETATION.md`
- `MARKET-04B-05-JOB-INTELLIGENCE-PROJECTION.md`
- `MARKET-04B-06-MARKET-ASSESSMENT-INTEGRATION.md`
- `MARKET-04B-07-OPPORTUNITY-IDENTITY-LIFECYCLE.md`
- `MARKET-04B-08-PARTITIONED-MARKET-PERSISTENCE.md`
- `MARKET-04B-09-PROVIDER-DISCOVERY-REFRESH.md`

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

The first persistence adapter stores one versioned history snapshot in Upstash and reload-verifies the exact revision, observation and occurrence before success is claimed. M4B-08 later preserves this aggregate contract while replacing the production whole-snapshot write path with partitioned immutable appends.

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

## MARKET-04B-04 — Derived Market Interpretation Boundary

M4B-04 introduces the first explicit object for what CV Engine derives from market truth:

```text
MarketObservation
      |
      v
DerivedMarketInterpretation
```

The interpretation is bound to the exact `MarketObservationId`, its content hash and an explicit interpretation policy version. Semantic identity is content-addressed while `generatedAt` remains runtime provenance and cannot manufacture a new interpretation.

Every derived dimension is explicitly either `KNOWN` or `UNKNOWN`.

UNKNOWN is not a generic null. It records why the engine refused to manufacture a value:

```text
SOURCE_SILENT
UNRECOGNIZED_SOURCE_VALUE
INVALID_SOURCE_VALUE
```

Every KNOWN value retains the exact source field, source value and source-path/excerpt evidence from the authoritative MarketObservation.

The deterministic v1 policy admits only:

```text
NORMALIZED_EXPLICIT
CONTROLLED_CLASSIFICATION
ISO_DATE_NORMALIZATION
```

Current controlled classifications cover explicit work model, employment type and seniority values. Text normalization covers source-explicit company/title/location/compensation/description. Date normalization is limited to unambiguous date-only values or timezone-aware ISO timestamps.

M4B-04 deliberately forbids cross-field inference. A role title containing `Senior` or `Remote` does not fill missing seniority/work-model fields; free description text cannot fill missing structured dimensions. A text-only MarketObservation can therefore produce many UNKNOWN fields and still be a correct interpretation.

Full validation re-derives the interpretation against the authoritative MarketObservation. This prevents a caller from changing a derived value and merely recomputing a content hash.

A separate durable interpretation-history aggregate preserves what policy vN derived from each observation, distinct from the observation history that preserves what the source actually said. Exact regeneration is idempotent; changed source state or future policy versions preserve prior interpretation history.

The runtime endpoint is:

```text
POST /api/market-interpretation
```

and accepts only a canonical `MarketObservationId`. Public callers cannot provide derived values, policy version, evidence or generation time.

### Gate M4B-04 — EVIDENCE_BOUND_DERIVED_MARKET_INTERPRETATION

M4B-04 is complete: interpretation identity, evidence linkage, explicit UNKNOWN semantics, deterministic re-validation, durable history, server-owned derivation inputs and the no-Job-Intelligence boundary are executable and CI-green.

## MARKET-04B-05 — Interpretation → Job Intelligence Projection Bridge

M4B-05 introduces the explicit authorization artifact between market truth and the existing ATS v2 parser:

```text
MarketObservation
      |
      v
DerivedMarketInterpretation
      |
      v
MarketJobProjection
      |
      v
Job Intelligence
      |
      v
JobDescription + JobRequirements
      |
      v
market-provenanced JobSnapshot
```

`MarketJobProjection` is content-addressed and policy-versioned. It records the exact text that Job Intelligence is allowed to analyze, together with observation and interpretation identities/hashes.

There are exactly two legal source-text paths:

```text
TEXT observation
  -> exact MarketObservation.payload.content

JSON observation
  -> M4B-04 description must be KNOWN
  -> exact description.evidence.sourceValue
```

A JSON observation with no source-explicit description fails closed.

Structured metadata is not parser text. Role title and company may decorate `JobDescription` metadata, but title, company, work model, seniority, employment type, compensation and other dimensions are never concatenated into `sourceText` merely to increase parser signal.

The existing deterministic `JobIntelligenceEngine` remains the only requirement extractor. M4B-05 does not create a parallel parser.

Market-derived `JobSnapshot` adds optional `marketProvenance` linking:

```text
MarketObservationId
DerivedMarketInterpretationId
MarketJobProjectionId
projectionPolicyVersion
```

Legacy/manual JobSnapshots remain structurally valid without market provenance.

Projection history persists `MarketJobProjection + JobSnapshot` and is keyed semantically by projection + analyzer version, allowing future analyzer versions to preserve multiple historical parser results from the same authorized text. Intrinsic history validation accepts historical version strings; creation/full validation remains pinned to current policies.

The runtime requires an already-durable M4B-02B observation and an already-durable current-policy M4B-04 interpretation. It does not silently create a missing interpretation.

The public endpoint is:

```text
POST /api/market-job-projection
```

and accepts only `marketObservationId`. Public callers cannot provide source text, requirements, policy versions, analyzer version or JobSnapshot content.

M4B-05 deliberately preserves the exact authorized description text. It does not silently strip or rewrite provider markup. If provider HTML materially reduces Job Intelligence quality, a future text transform must be separately versioned, source-reversible and benchmarked rather than hidden inside this bridge.

### Gate M4B-05 — PROVENANCE_BOUND_JOB_INTELLIGENCE_PROJECTION

M4B-05 is complete: exact-text authorization, provenance-bound JobSnapshot creation, analyzer-version history, durable prerequisite enforcement, metadata non-injection, reload-verified persistence and the no-candidate/no-match boundary are executable and CI-green.

## MARKET-04B-06 — Market JobSnapshot → Opportunity Assessment Integration

M4B-06 makes the exact durable M4B-05 `JobSnapshot` the job-side authority for Application Intelligence:

```text
market-provenanced JobSnapshot
             +
      CareerAssertions
             |
             v
          Job Match
             |
             v
   OpportunityAssessment
             |
             v
     OpportunityHistory
```

The governing rule is:

```text
CONSUME THE EXACT JOB SNAPSHOT; DO NOT REPARSE OR REBUILD IT.
```

A dedicated `POST /api/assess-market-opportunity` route accepts candidate data, Career Target and an exact content-addressed `jobSnapshotId`. It does not accept `jobDescription`, source text, requirements, analyzer version, projection policy or market observation overrides.

The runtime resolves the exact snapshot from durable M4B-05 projection history and validates the projection/snapshot graph before matching. The assessment service builds only a read-only Job Intelligence view over the stored `jobDescription`, `requirements` and `language`; it never calls the Job Intelligence parser.

Candidate authority remains separate. Existing `CareerAssertion[]` are read-only inputs to Job Match, and job requirements never become candidate assertions or evidence.

OpportunityHistory now has an additive market-snapshot path. Legacy/manual assessments preserve their prior hash semantics, while market-provenanced snapshots are validated using the stricter M4B-05 content address. The market path rejects requirement-set mismatch and persists/reload-verifies the same `JobSnapshotId` rather than manufacturing a replacement snapshot.

Stable market MatchReport identity derives from semantic candidate snapshot state + exact market JobSnapshot content + Job Match engine version, so repeated assessment of unchanged semantic state remains history-idempotent across runtime timestamps.

### Gate M4B-06 — EXACT_MARKET_JOB_SNAPSHOT_ASSESSMENT_INTEGRATION

M4B-06 is complete: an exact durable M4B-05 JobSnapshot can be selected by id, matched against candidate assertions without re-parsing, preserved unchanged in OpportunityHistory, linked to a durable OpportunityAssessment, and target relevance remains separate from capability matching.

## MARKET-04B-07 — Logical Opportunity Identity + Lifecycle / Freshness

M4B-07 separates immutable source states from logical vacancy identity and current-market confidence:

```text
MarketObservation A ─┐
MarketObservation B ─┼──> MarketOpportunityId
MarketObservation C ─┘            │
                                  ├── OPEN
                                  ├── STALE
                                  ├── CLOSED
                                  └── UNKNOWN
```

Provider-native identity is deliberately conservative. Two provider observations are grouped only when `PROVIDER_API + provider + sourceUrl + externalId` reproduces exactly. Title/company/location similarity is never identity evidence. Without the strong provider tuple, v1 uses observation-bound identity rather than risking a false merge.

Each immutable MarketObservation receives one content-addressed `MarketOpportunityLink`. Material source changes therefore create another MarketObservation/link under the same strong provider opportunity while prior states remain preserved. Re-observing unchanged content creates only another ObservationOccurrence and refreshes recency without increasing material-state count.

Lifecycle is a temporal derived view, not source truth. Direct provider/public observations are OPEN for the first 72 hours after the latest durable occurrence and become STALE after that freshness window. Manual/non-direct observations remain UNKNOWN rather than pretending to be current. A valid source-explicit `expiresAt` whose expiry has passed yields CLOSED.

M4B-07 intentionally does not convert provider 404/disappearance into CLOSED. M4B-03 currently treats disappearance as acquisition failure and persists no negative source event. Until a later explicit closure/disappearance-event contract exists, an old direct observation becomes STALE rather than falsely CLOSED.

The public lifecycle boundary is:

```text
POST /api/market-opportunity-lifecycle
```

and accepts only a durable `marketObservationId`. The server resolves logical identity, current material state, occurrences, age and lifecycle status.

OpportunitySpace now treats lifecycle as a ranking guard only:

```text
CLOSED                         -> DEPRIORITIZE
STALE                          -> INSUFFICIENT_SIGNAL
OPEN + superseded assessment  -> INSUFFICIENT_SIGNAL
OPEN + current assessment     -> normal M4A priority rules
UNKNOWN                        -> existing/manual behavior
```

The superseded-assessment rule prevents an old JobSnapshot assessment from inheriting the OPEN status of a newer material MarketObservation for the same logical vacancy.

### Gate M4B-07 — CONSERVATIVE_LOGICAL_OPPORTUNITY_IDENTITY_AND_LIFECYCLE

M4B-07 is complete: provider-native logical identity is deterministic, fuzzy merge is prohibited, material-state history is preserved, unchanged observations refresh recency through occurrences, lifecycle is explicit, durable link history is reload-verified, and OpportunitySpace cannot silently prioritize closed, stale, or materially superseded market assessments.

## MARKET-04B-08 — Partitioned Market Persistence + Concurrency Safety

M4B-08 removes the global-snapshot lost-update boundary from the production market persistence path.

Before M4B-08, Observation, Interpretation, Projection and MarketOpportunity histories each used one Redis key and a read-modify-write aggregate cycle. Two parallel workers could therefore load the same history and replace each other's independent append.

Production persistence now uses immutable semantic/stable records plus deterministic 16-shard indexes:

```text
immutable logical event
      ↓
MULTI / EXEC
      ├── SETNX immutable record key
      └── SADD deterministic shard index
      ↓
MGET exact read-back verification
      ↓
validated aggregate reconstruction
```

MarketObservation + ObservationOccurrence is one atomic two-record persistence event, so the M4B-02B invariant cannot be half-visible. Interpretation storage is keyed by `MarketObservationId + policyVersion`; projection storage by `MarketJobProjectionId + analyzerVersion`; logical-opportunity linkage by `MarketObservationId`. These storage authorities make semantic collisions fail closed at the persistence boundary rather than merely during a later aggregate validation.

Application repositories gained append-safe production paths while preserving legacy `load()/save()` compatibility. Reload verification accepts a reconstructed revision greater than the caller's local expected revision because another legitimate concurrent writer may have advanced history; the caller's own exact immutable content remains mandatory.

The v1 → v2 migration is lazy and append-idempotent. Existing v1 keys are deliberately still dual-read after migration so a draining old deployment cannot write history that new code silently ignores. Divergent v1/v2 immutable meanings for the same semantic key fail closed.

M4B-08 proves concurrent append correctness, not final high-volume catalog query efficiency. Current compatibility reads may reconstruct a full aggregate from all shard indexes; provider/opportunity-scoped discovery read models remain later work.

### Gate M4B-08 — PARTITIONED_APPEND_SAFE_MARKET_PERSISTENCE

M4B-08 is complete: parallel market writers cannot overwrite one another through global snapshot replacement, logical observation events are atomically visible, semantic-key collisions fail closed, legacy history survives rolling migration, exact repeat remains idempotent, and all earlier market/candidate truth boundaries remain intact.

## MARKET-04B-09 — Bounded Provider Discovery + Refresh

M4B-09 turns the trusted one-listing acquisition boundary into a bounded provider-market intake path without creating a crawler or a second market-truth parser.

```text
Provider board/site
      ↓
controlled discovery
      ↓
provider-native M4B-03 locators
      ↓
bounded acquisition workers
      ↓
MarketObservation + ObservationOccurrence
```

Discovery itself is not market truth. Greenhouse board discovery emits job ids, Lever discovery emits paginated posting ids, and Ashby discovery emits public hosted `jobUrl` selectors while excluding `isListed=false` direct-link-only entries. Every discovered locator still passes through the existing M4B-03 single-listing acquisition, canonical intake and durable observation history.

The default v1 discovery budget is server-owned:

```text
maxListings               = 50
maxPages                  = 5
maxConcurrentAcquisitions = 4
```

The public caller cannot override these values or submit arbitrary source URLs. Provider discovery retains fixed HTTPS hosts, GET-only JSON requests, redirect rejection, no-store semantics, the existing 8-second timeout and 2 MiB response ceiling.

Independent listing failures are item-scoped. Successful observations remain durable even if another listing times out, disappears or returns an invalid provider response. The explicit boundary is:

```text
AcquisitionFailure != MarketClosure
```

Refresh is a separate decision over M4B-07 lifecycle:

```text
OPEN    -> NOT_DUE
STALE   -> DUE
CLOSED  -> INELIGIBLE
UNKNOWN -> INELIGIBLE
```

A DUE refresh reconstructs the exact Greenhouse/Lever/Ashby provider locator from durable provenance server-side and reuses M4B-03 acquisition. Unchanged content creates another ObservationOccurrence; material change creates a new MarketObservation under the same strong logical opportunity. A refresh 404/timeout/error returns `REFRESH_FAILED` and preserves the prior lifecycle rather than manufacturing `CLOSED`.

Public boundaries are:

```text
POST /api/market-discovery
POST /api/market-refresh
```

Discovery accepts only a controlled provider board/site selector. Refresh accepts only a canonical durable `marketObservationId`. Neither route accepts candidate evidence, requirements, MatchReport, lifecycle state, provider refresh URL or application recommendation inputs.

M4B-09 does not automatically interpret, project, match or assess every discovered listing. It creates and refreshes a broad source-truth pool; later candidate-specific retrieval decides which opportunities merit deeper intelligence work.

### Gate M4B-09 — BOUNDED_PROVIDER_DISCOVERY_AND_REFRESH

M4B-09 is complete: controlled Greenhouse/Lever/Ashby listing enumeration is bounded and provider-native, discovered locators reuse M4B-03 acquisition, parallel item acquisition preserves partial success, refresh eligibility is explicit, provider locators are reconstructed from durable provenance, unchanged/changed re-observation semantics preserve history, and provider failure remains operational evidence rather than false closure.

## Next architectural step — MARKET-04B-10

CV Engine can now maintain a bounded pool of durable external opportunities without immediately running expensive candidate analysis over every listing.

The next question is:

```text
many observed/current opportunities
        ↓
which ones are relevant enough to this candidate + target
that deeper Job Intelligence / assessment is warranted?
```

The next gate is:

```text
MARKET-04B-10 — Market Candidate Retrieval / Opportunity Filtering
```

It should introduce a conservative market read/retrieval layer that narrows observed current opportunities before full assessment while keeping retrieval signals separate from candidate truth and evidence-backed Job Match.

Hard boundaries for the next gate:

```text
RetrievalSignal != CandidateFact
RetrievalRelevance != JobMatch
MarketPrefilter != HiringProbability
Filtering != FuzzyLogicalIdentity
```

Negative provider disappearance/closure events, scheduled background polling and final high-volume catalog query projections remain explicit later boundaries rather than hidden inside retrieval.
