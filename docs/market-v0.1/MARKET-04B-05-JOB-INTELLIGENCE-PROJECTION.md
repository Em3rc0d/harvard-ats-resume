# MARKET-04B-05 — Interpretation → Job Intelligence Projection Bridge

## Purpose

M4B-03 established where external market truth may enter.
M4B-04 established what CV Engine may deterministically derive from that truth without confusing interpretation with source fact.

M4B-05 establishes the first controlled bridge from that market graph into the existing ATS v2 Job Intelligence kernel:

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
JobSnapshot
```

The gate exists because calling `analyzeJobDescription()` directly from provider or market input would destroy provenance at the exact point where observed source material becomes executable job analysis.

## Core distinction

```text
MarketObservation                 = what the source said
DerivedMarketInterpretation       = what deterministic policy normalized/classified
MarketJobProjection               = exact text authorized to enter Job Intelligence
JobRequirement                    = parser output from that authorized text
JobSnapshot                       = immutable parser result + analyzer/projection provenance
```

Therefore:

```text
MarketObservation != DerivedMarketInterpretation
DerivedMarketInterpretation != MarketJobProjection
MarketJobProjection != JobRequirement
JobRequirement != CandidateEvidence
```

## MarketJobProjection

M4B-05 introduces:

```text
MarketJobProjection
```

with schema/policy:

```text
market-job-projection-v1
```

A projection is content-addressed from:

- `MarketObservationId`
- `DerivedMarketInterpretationId`
- exact observation content hash
- exact interpretation content hash
- projection policy version
- exact authorized `sourceText`
- source text origin
- source text SHA-256
- optional interpreted role title
- optional interpreted company name
- scope boundary

`projectedAt` is runtime provenance and is excluded from semantic identity.

Thus:

```text
same observation
+ same interpretation
+ same policy
+ same authorized text
=> same MarketJobProjection identity
```

A later runtime invocation does not manufacture a new semantic projection merely because time passed.

## Two legal Job Intelligence text paths

M4B-05 permits exactly two text origins.

### 1. Raw TEXT market observation

For a canonical observation whose payload format is `TEXT`:

```text
MarketObservation.payload.content
        |
        v
MarketJobProjection.sourceText
```

The exact text is preserved.

This is important for manually pasted job descriptions. M4B-04 intentionally leaves structured dimensions UNKNOWN when the text did not explicitly provide structured fields through intake, but M4B-05 may still authorize the original job text for Job Intelligence requirement extraction.

### 2. Source-explicit description from JSON

For a JSON/provider observation:

```text
DerivedMarketInterpretation.fields.description
        |
        | must be KNOWN
        v
exact evidence.sourceValue
        |
        v
MarketJobProjection.sourceText
```

The bridge uses the exact source value carried by M4B-04 evidence, not the whole provider JSON payload and not an arbitrary caller override.

If a JSON observation has no source-explicit description, the bridge fails closed.

```text
JSON payload + description UNKNOWN
=> NO JOB INTELLIGENCE PROJECTION
```

## Metadata is not requirement text

This is the primary M4B-05 safety invariant.

The following may be known market dimensions:

- role title
- company name
- location
- work model
- employment type
- seniority
- compensation
- dates

They are not automatically requirement statements.

M4B-05 therefore forbids:

```text
title + company + seniority + workModel + description
        -> synthetic parser text     X
```

Only the authorized job-description text enters requirement extraction.

Optional interpreted `roleTitle` and `companyName` may decorate the resulting `JobDescription` metadata, but they are not concatenated into `sourceText`.

This prevents a structured value such as:

```text
seniority = SENIOR
```

from accidentally becoming a parsed requirement merely because the bridge injected the word `Senior` into the analyzer input.

## Existing Job Intelligence remains authority

M4B-05 does not create a second requirement parser.

It calls the existing deterministic ATS v2 engine:

```text
analyzeJobDescription(sourceText)
```

using a deterministic projection key derived from `MarketJobProjection.id`.

The existing engine remains responsible for:

- language detection
- requirement statement splitting
- required/preferred classification
- skill recognition
- non-skill requirement kinds
- minimum-years extraction
- JobRequirement identity

M4B-05 only controls **what text is legally allowed to enter that engine** and what provenance must accompany the output.

## Market-provenanced JobSnapshot

`JobSnapshot` now has an additive optional field:

```text
marketProvenance
```

Legacy/manual JobSnapshots remain structurally valid without it.

A market-derived snapshot records:

```text
marketObservationId
derivedMarketInterpretationId
marketJobProjectionId
projectionPolicyVersion
scopeBoundary = JOB_SNAPSHOT_MARKET_PROVENANCE_NOT_CANDIDATE_TRUTH
```

This preserves the chain:

```text
source state
  -> interpretation policy
  -> authorized parser input
  -> analyzer version
  -> immutable JobSnapshot
```

The market-derived JobSnapshot is content-addressed from:

- JobDescription semantic state
- JobRequirements
- detected language
- analyzer version
- market provenance

Temporal capture fields are excluded from semantic identity.

Therefore the same projection analyzed by the same analyzer version produces the same semantic JobSnapshot even when executed later.

## Durable projection history

M4B-05 stores:

```text
MarketJobProjection + JobSnapshot
```

as one validated history record.

The semantic history key is:

```text
MarketJobProjection.id + JobSnapshot.analyzerVersion
```

This is deliberate.

A future analyzer version may produce a different JobSnapshot from the same authorized projection, and history must preserve both rather than overwrite either:

```text
Projection P + Analyzer v1 -> Snapshot A
Projection P + Analyzer v2 -> Snapshot B
```

Exact replay under the same projection + analyzer version is idempotent.

The first persistence adapter uses the same controlled single-snapshot Upstash pattern as earlier Market v0.1 gates and reload-verifies before success.

It is not approved for broad parallel provider workers.

## Runtime prerequisites

M4B-05 does not silently recreate missing upstream artifacts.

The runtime requires:

1. a durable M4B-02B `MarketObservation`;
2. a durable current-policy M4B-04 `DerivedMarketInterpretation`;
3. configured durable M4B-05 projection history.

Flow:

```text
MarketObservationId
      |
      v
load + validate observation history
      |
      v
resolve exact MarketObservation
      |
      v
load + validate interpretation history
      |
      v
resolve current-policy interpretation
      |
      v
full interpretation validation against observation
      |
      v
create MarketJobProjection
      |
      v
Job Intelligence
      |
      v
content-addressed JobSnapshot
      |
      v
persist + reload-verify projection history
      |
      v
success
```

If the M4B-04 interpretation does not exist, M4B-05 reports a missing prerequisite rather than deriving it implicitly.

## Public API boundary

M4B-05 adds:

```text
POST /api/market-job-projection
```

Request:

```json
{
  "marketObservationId": "market-observation:<32 hex>"
}
```

That is the only public input.

Public callers cannot supply:

- source text
- description override
- DerivedMarketInterpretation id
- interpretation policy
- projection policy
- projectedAt
- analyzer version
- JobRequirements
- JobSnapshot

The route is request-size bounded, endpoint-scoped rate limited, strict-schema validated, and `no-store`.

Failure semantics:

```text
invalid request                    -> 400
MarketObservation missing          -> 404
M4B-04 interpretation missing      -> 409
no authorized job text             -> 422
durable storage unavailable        -> 503
integrity/internal failure         -> 500
```

HTTP 200 means the projection and JobSnapshot passed the durable reload-verification boundary.

## Candidate truth remains disconnected

The projection bridge imports no:

- CandidateProfile
- CareerEvidence
- CareerAssertion
- JobMatchEngine
- OpportunityAssessment
- OpportunitySpace
- ResumeVersion

The direction is one-way:

```text
Market truth
    -> Job Intelligence
    -> JobRequirement
```

Never:

```text
JobRequirement
    -> CandidateEvidence
```

A requirement can later be compared against candidate truth. It can never create candidate truth.

## Behavior coverage

M4B-05 tests prove:

1. raw TEXT observations enter Job Intelligence unchanged;
2. JSON observations use only the exact source-explicit description evidence;
3. title/company/work-model/seniority metadata are not concatenated into parser text;
4. JSON observations without explicit description fail closed;
5. same observation + interpretation keeps the same projection identity across runtime times;
6. the same projection + analyzer version keeps the same JobSnapshot identity;
7. tampered projection text fails authorization validation;
8. projection history replay is idempotent;
9. runtime refuses to skip the durable M4B-04 prerequisite;
10. runtime resolves durable observation + interpretation and reload-verifies projection history;
11. unknown observation ids fail cleanly;
12. missing durable storage fails closed;
13. bridge code contains no candidate, matching, opportunity, or resume execution path;
14. the public API accepts only MarketObservation identity.

## Gate M4B-05 — PROVENANCE_BOUND_JOB_INTELLIGENCE_PROJECTION

M4B-05 is complete when:

- `MarketJobProjection` is content-addressed and policy-versioned;
- only the two legal source-text paths can enter Job Intelligence;
- JSON observations without explicit description fail closed;
- structured metadata cannot become requirement text by bridge concatenation;
- the existing Job Intelligence engine remains the only requirement parser;
- market-derived JobSnapshots carry observation + interpretation + projection provenance;
- JobSnapshot semantic identity includes analyzer version and market provenance;
- projection history preserves future analyzer-version forks;
- exact replay is idempotent;
- durable observation and interpretation are mandatory prerequisites;
- public callers cannot supply parser text or derived requirements;
- persistence is reload-verified before success;
- no candidate truth, matching, opportunity prioritization, or resume generation path is invoked;
- dependency audit, lint, typecheck, behavior tests, and production build are green.

## Explicit non-goals

M4B-05 does not yet:

- feed the market-provenanced JobSnapshot into OpportunityAssessment;
- modify current OpportunityHistory to consume a prebuilt market JobSnapshot;
- compare the projected job against CareerEvidence;
- compute MatchReport;
- populate OpportunitySpace from acquired providers;
- create a logical cross-source MarketOpportunity identity;
- deduplicate Greenhouse/Lever/Ashby listings;
- classify listing lifecycle as active/stale/closed;
- poll providers;
- introduce provider-scale parallel persistence;
- change the existing Job Intelligence extraction policy.

These exclusions are intentional. This gate proves the trust-preserving bridge first.

## Next architectural boundary

After M4B-05, the market side and ATS trust kernel finally meet at a durable JobSnapshot.

The next stage should be:

```text
MARKET-04B-06 — Market JobSnapshot → Opportunity Assessment Integration
```

Required direction:

```text
Market-provenanced JobSnapshot
        +
CareerSnapshot
        |
        v
existing Job Match
        |
        v
OpportunityAssessment
        |
        v
Application Intelligence
```

M4B-06 must consume the prebuilt market JobSnapshot rather than reconstructing a second snapshot, preserve the market provenance chain through assessment history, and keep all candidate evidence authority on the CareerSnapshot side.
