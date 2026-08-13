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
MARKET-04B-02B Durable Observation History    NEXT
```

The specific execution documents are the authoritative details for each later stage:

- `MARKET-03-CAREER-TARGET.md`
- `MARKET-04-OPPORTUNITY-SPACE.md`
- `MARKET-04B-01-MARKET-OBSERVATION-CANON.md`
- `MARKET-04B-02A-STRUCTURED-MARKET-INTAKE.md`

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

The route explicitly makes no durability claim:

```text
persistence = NOT_PERSISTED_M4B_02A
```

### Gate M4B-02A — CANONICAL_PROVENANCE_PRESERVING_MARKET_INTAKE

Manual text and structured payloads converge through one service, provenance remains controlled, caller key ordering is non-semantic for structured input, candidate truth remains disconnected, and no Job Intelligence, matching, ranking, persistence or market acquisition is performed.

## Next architectural step — MARKET-04B-02B

The next boundary is **Durable Observation History**.

M4B-01 established semantic market state and M4B-02A established how controlled input becomes that state. M4B-02B must now distinguish the immutable semantic state from the fact that CV Engine observed it at one or more moments:

```text
MarketObservation
      |
      +-- ObservationOccurrence A
      +-- ObservationOccurrence B
      `-- ObservationOccurrence C
```

Required behavior:

```text
same semantic source content observed again
=> same MarketObservation identity
=> new observation occurrence

changed source content
=> new MarketObservation identity
=> prior state remains preserved
```

This history boundary should be completed before URL acquisition/provider adapters so freshness, updates and later lifecycle status do not depend on overwritten or ambiguous source state.
