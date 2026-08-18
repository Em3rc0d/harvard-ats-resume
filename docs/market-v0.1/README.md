# CV Engine — Market Architecture v0.1

## Status

```text
MARKET_V0_1 = COMPLETE
```

Market Architecture v0.1 is the first closed source-aware opportunity-intelligence architecture for CV Engine.

It preserves the ATS v2 trust kernel while extending the product from one manually supplied job toward a bounded, externally observed market of opportunities.

The pre-closure long-form execution README is preserved unchanged at:

```text
deprecated/README-PRE-M4B-11.md
```

The authoritative closure statement is:

```text
MARKET-V0.1-CLOSURE.md
```

## Product direction

CV Engine is not primarily an AI resume builder or a generic ATS-score tool.

```text
Beachhead
Application Intelligence
"Should I apply to this opportunity?"

Harbor
Career Opportunity Intelligence
"What opportunities exist, what can I defend now,
and where should I focus or grow next?"
```

A resume remains a contextual projection of career truth for one application. It is not the source of truth.

## End-to-end v0.1 architecture

```text
External provider / controlled manual source
        ↓
MarketObservation + ObservationOccurrence
        ↓
logical MarketOpportunity + lifecycle
        ↓
bounded provider discovery / refresh
        ↓
active CareerTarget
        +
source-explicit current market state
        ↓
MarketCandidateSet
        ↓
bounded selected deep analysis
        ↓
DerivedMarketInterpretation
        ↓
MarketJobProjection
        ↓
exact market-provenanced JobSnapshot
        ↓
CareerAssertions
        +
Job Match
        ↓
OpportunityAssessment
        ↓
CareerTarget relevance + lifecycle/current-state guard
        ↓
OpportunitySpace
        ↓
application / growth / planning decisions
```

## Truth constitution

Four information classes remain distinct:

1. **Career Fact** — candidate-supplied or confirmed truth.
2. **Market Fact** — source-explicit market/job truth.
3. **Derived Analysis** — engine interpretation/comparison/classification.
4. **Recommendation** — decision support.

Hard invariants:

```text
CareerFact != MarketFact
MarketFact != DerivedAnalysis
DerivedAnalysis != Recommendation
Recommendation != CareerFact

CareerTarget != CareerEvidence
CareerTargetIntent != CandidateCapability
JobRequirement != CandidateEvidence

MarketObservation != DerivedMarketInterpretation
ObservationOccurrence != MarketObservation
ProviderPayload != MarketObservation
ProviderPayload != JobRequirement
DerivedMarketInterpretation != JobRequirement
MarketJobProjection != JobRequirement
MarketMetadata != SyntheticRequirementText

MarketObservation != MarketOpportunity
MarketOpportunityLifecycle != MarketFact
OPEN != CURRENT_ASSESSMENT

OpportunityAssessment != CandidateTruth
OpportunityPriority != JobMatch

RetrievalSignal != CandidateFact
RetrievalRelevance != JobMatch
MarketPrefilter != HiringProbability
NotSelected != NotQualified

SelectedForAnalysis != Qualified
AnalysisFailure != MarketClosure
RetrievalOrder != JobMatchScore
BatchAssessment != CandidateTruth
PartialFailure != BatchRollback

ConcurrentWriter != SnapshotOverwriteAuthority
SameSemanticPersistenceKey + DifferentContent != Idempotency

UNKNOWN != FALSE
SOURCE_SILENT != INFERRED_VALUE
```

A market requirement may influence analysis. It can never authorize a new candidate assertion.

## Completed execution gates

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
MARKET-04B-10 Market Candidate Retrieval      COMPLETE
MARKET-04B-11 Selected Candidate Analysis     COMPLETE
```

## Gate records

- `MARKET-01-APPLICATION-INTELLIGENCE.md`
- `MARKET-02-OPPORTUNITY-HISTORY.md`
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
- `MARKET-04B-10-MARKET-CANDIDATE-RETRIEVAL.md`
- `MARKET-04B-11-SELECTED-CANDIDATE-ANALYSIS.md`
- `MARKET-V0.1-CLOSURE.md`

## M4B-11 closure

The final v0.1 gate connects retrieval to evidence-backed assessment without giving the batch orchestrator new truth authority.

```text
M4B-10 current candidates
        ↓
server-owned maxDeepAnalysis = 10
        ↓
per item:
M4B-04 → M4B-05 → M4B-06 → target link → lifecycle verification
        ↓
successful exact assessments
        ↓
M4A OpportunitySpace
```

The public boundary is:

```text
POST /api/market-candidate-analysis
```

The caller provides candidate data plus opaque `careerVaultId` only. Active target, current market pool, selected observation ids, analysis budget, lifecycle, JobSnapshot ids, requirements, MatchReport and OpportunitySpace priority remain server-owned.

Partial failure is append-preserving:

```text
item A succeeds → durable artifacts remain
item B fails    → item-scoped failure
item C succeeds → durable artifacts remain

batch = PARTIAL_SUCCESS
no rollback
no false market closure
```

OpportunitySpace is created only from successful exact assessments whose selected MarketObservation is still current when lifecycle is rechecked.

## What v0.1 truthfully supports

CV Engine can now:

- maintain career truth independently from market truth;
- ingest controlled manual and provider observations with provenance;
- preserve market semantic-state changes and observation occurrences;
- derive structured market interpretation without converting source silence into facts;
- authorize exact job text into one existing Job Intelligence parser;
- preserve exact market-provenanced JobSnapshots;
- match those snapshots against evidence-backed CareerAssertions;
- separate CareerTarget intent from capability;
- create reproducible OpportunityAssessments and OpportunitySpaces;
- identify logical opportunities conservatively without fuzzy provider merging;
- track OPEN / STALE / CLOSED / UNKNOWN lifecycle conservatively;
- persist market history under concurrent writers without global snapshot overwrite;
- discover and refresh bounded Greenhouse, Lever and Ashby listings;
- retrieve a bounded target-relevant market candidate set without a second matcher;
- deep-analyze only a server-bounded selected set;
- preserve successful deep-analysis artifacts under partial failure;
- prevent materially superseded assessments from inheriting current-market priority.

## Explicit non-claims

Market v0.1 does **not** claim:

- hiring probability;
- recruiter acceptance/interview probability;
- a commercial ATS score;
- universal job-market coverage;
- cross-provider fuzzy/entity deduplication;
- provider disappearance as proof of vacancy closure;
- scheduled/background market synchronization;
- autonomous job application submission;
- causal interpretation of application outcomes;
- complete career path optimization;
- internal-mobility/staffing readiness;
- that retrieval selection means qualification.

## Post-v0.1 architecture boundary

The following work is intentionally outside this closed version and requires separately named/versioned architecture rather than extension of M4B-11:

```text
negative source/disappearance events
scheduled market refresh orchestration
cross-provider entity resolution
high-volume query projections
Application lifecycle + Outcome
career-learning feedback
CareerScenario / OpportunityUnlock
skill/occupation taxonomy intelligence
auth/privacy/tenant boundaries
B2B2C / API / staffing / internal mobility layers
production repository governance
```

These are future architecture decisions, not incomplete Market v0.1 gates.

## Closure rule

A change after this point must not silently rewrite v0.1 semantics.

If a later capability changes identity, source authority, lifecycle, retrieval, assessment, recommendation, persistence or candidate-truth rules, it requires an explicit new policy/version/gate and backward-compatibility reasoning.
