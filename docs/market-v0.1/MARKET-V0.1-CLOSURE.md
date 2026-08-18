# CV Engine — Market Architecture v0.1 Closure

## Closure decision

Market Architecture v0.1 is considered complete when M4B-11 is merged into `develop` with exact-head CI green.

The version establishes an end-to-end, source-aware and candidate-truth-safe path from external job-market observation to bounded career opportunity prioritization:

```text
External provider / controlled manual source
        ↓
MarketObservation + ObservationOccurrence
        ↓
logical MarketOpportunity + lifecycle
        ↓
bounded provider discovery / refresh
        ↓
CareerTarget-bound MarketCandidateSet
        ↓
bounded selected deep analysis
        ↓
DerivedMarketInterpretation
        ↓
MarketJobProjection
        ↓
exact market-provenanced JobSnapshot
        ↓
Job Match against CareerAssertions
        ↓
OpportunityAssessment
        ↓
CareerTarget relevance + lifecycle guard
        ↓
OpportunitySpace
```

## Completed gates

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

## What v0.1 can now truthfully claim

CV Engine can:

- preserve candidate career truth separately from job/market truth;
- ingest controlled manual or provider-backed market observations with explicit provenance;
- preserve changed source states and temporal occurrences without overwriting history;
- derive normalized market interpretation while keeping UNKNOWN distinct from inference;
- authorize exact source text into one existing Job Intelligence parser;
- produce content-addressed, market-provenanced JobSnapshots;
- assess the exact JobSnapshot against evidence-backed candidate assertions without reparsing;
- separate candidate intent (`CareerTarget`) from candidate capability;
- prioritize multiple assessed opportunities without changing Job Match;
- maintain conservative logical opportunity identity and lifecycle;
- persist market histories with append-safe concurrent writers;
- discover and refresh Greenhouse, Lever and Ashby opportunities under bounded provider-owned locators;
- narrow a broad market pool using source-explicit target relevance without creating a second matcher;
- run expensive analysis only over a server-bounded selected set;
- preserve successful item artifacts when another selected item fails;
- compose a current OpportunitySpace only from exact assessments whose market state remains current.

## What v0.1 does not claim

Market v0.1 does **not** claim:

- hiring probability;
- recruiter acceptance probability;
- interview probability;
- a commercial ATS score;
- universal labor-market coverage;
- cross-provider fuzzy deduplication;
- provider disappearance as proof of closure;
- automatic scheduled market polling;
- autonomous application submission;
- causal interpretation of application outcomes;
- complete career planning / skill-path optimization;
- internal mobility or staffing-market readiness;
- that retrieval selection means qualification;
- that recommendation is career fact.

## Truth constitution preserved

```text
CareerFact != MarketFact
MarketFact != DerivedAnalysis
DerivedAnalysis != Recommendation
CareerTarget != CareerEvidence
JobRequirement != CandidateEvidence
MarketObservation != DerivedMarketInterpretation
MarketObservation != MarketOpportunity
MarketOpportunityLifecycle != MarketFact
ProviderPayload != JobRequirement
MarketMetadata != SyntheticRequirementText
OpportunityAssessment != CandidateTruth
OpportunityPriority != JobMatch
RetrievalSignal != CandidateFact
RetrievalRelevance != JobMatch
SelectedForAnalysis != Qualified
AnalysisFailure != MarketClosure
PartialFailure != BatchRollback
UNKNOWN != FALSE
SOURCE_SILENT != INFERRED_VALUE
```

## Version boundary after closure

The following are legitimate future architecture areas, but they are deliberately **outside Market v0.1** and must receive their own version/gates instead of being retroactively inserted into the completed roadmap:

- durable negative source/disappearance events and stronger closure semantics;
- scheduled/background provider refresh orchestration;
- cross-provider entity resolution with explicit evidence/confidence;
- scalable provider/opportunity-scoped query projections beyond compatibility aggregate reconstruction;
- Application lifecycle, Outcome and career-learning feedback;
- CareerScenario / OpportunityUnlock / path planning;
- taxonomy-backed skill/occupation intelligence (for example ESCO-class sources);
- coach, bootcamp, university, outplacement and API product layers;
- staffing/internal mobility architectures;
- authentication/privacy/tenant boundaries required before broader deployment;
- production governance such as enforced branch protection.

These are not unfinished M4B-11 work. They are later product/architecture versions.

## Closure gate

```text
MARKET_V0_1 = COMPLETE
```

subject to the M4B-11 PR being merged from the exact CI-green closure head into `develop`, with `main` untouched.
