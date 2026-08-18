# MARKET-04B-10 — Market Candidate Retrieval / Opportunity Filtering

## Gate

`M4B-10 — TARGET_BOUND_MARKET_CANDIDATE_RETRIEVAL`

## Why this gate exists

M4B-09 made it possible to discover and re-observe multiple provider listings safely. That creates the next scaling problem: CV Engine can now possess many trustworthy market observations, but it must not run the expensive interpretation → Job Intelligence → Job Match → OpportunityAssessment chain against every observed listing indiscriminately.

M4B-10 introduces a cheaper, conservative retrieval boundary that answers a narrower question:

> Which current observed opportunities have enough source-explicit alignment with the candidate's active CareerTarget to deserve deeper analysis?

It does **not** answer whether the candidate is qualified, whether they should apply, or whether a recruiter will respond.

## Core architecture

```text
Durable MarketObservation history
              +
       M4B-07 lifecycle
              +
       active CareerTarget
              ↓
 source-explicit retrieval signals
              ↓
       MarketCandidateSet
       ├── candidates[]
       └── refreshFirst[]
              ↓
     later deep-analysis gate
```

The deliberate truth boundary is:

```text
CareerTarget intent != Candidate capability
RetrievalSignal != CandidateFact
RetrievalRelevance != JobMatch
MarketPrefilter != HiringProbability
NotSelected != NotQualified
REFRESH_FIRST != Rejection
```

## Why candidate skills are deliberately absent

M4B-10 v1 does not inspect `CareerEvidence`, `CareerAssertion`, or `CareerSnapshot.assertions`.

Before Job Intelligence has produced an exact `JobRequirement[]`, comparing candidate skills to arbitrary description text would create a second, weaker matcher. It would duplicate the ATS v2 trust kernel and invite false capability claims from unstructured market language.

Candidate-specificity therefore enters M4B-10 only through the already-durable active `CareerTarget`. Capability remains reserved for the exact downstream Job Match boundary.

```text
M4B-10 asks:  "Does this market item resemble what I want enough to inspect?"
Job Match asks: "Can my evidence defend the requirements of this exact job?"
```

These questions remain separate.

## First-class retrieval artifact

`MarketCandidateSet` is a current, content-addressed retrieval view with:

- `candidateProfileId`
- exact active `careerTargetId`
- active target content hash
- market history revision
- `marketUniverseSha256`
- bounded `candidates[]`
- bounded `refreshFirst[]`
- retrieval summary
- policy/schema versions
- content hash and deterministic ID
- runtime `generatedAt`

Its boundary is:

`TARGET_BOUND_MARKET_PREFILTER_NOT_JOB_MATCH_HIRING_PROBABILITY_OR_CANDIDATE_TRUTH`

M4B-10 intentionally does not persist the current retrieval view. It reports:

`NOT_PERSISTED_CURRENT_RETRIEVAL_VIEW_M4B_10`

The authoritative durable inputs remain CareerTarget and market history. A future gate may persist retrieval runs if product/audit requirements justify it; M4B-10 does not manufacture a durability claim.

## Retrieval signals

Only source-explicit structured market fields are allowed:

```text
ROLE
SENIORITY
LOCATION
WORK_MODEL
EMPLOYMENT_TYPE
```

Each signal is one of:

```text
ALIGNED
PARTIAL
CONFLICT
UNKNOWN
NOT_CONSTRAINED
```

Each signal preserves:

- candidate-owned target values (intent only),
- exact source-explicit market value when available,
- source path when available,
- scope boundary `RETRIEVAL_SIGNAL_NOT_JOB_MATCH_OR_CANDIDATE_FACT`.

### No free-text backfilling

If the raw description says “Backend Engineer” but the source-explicit `roleTitle` field is absent, role retrieval remains `UNKNOWN`.

Likewise, missing seniority/work-model/employment fields are not mined from unrelated source fields or description text.

This mirrors the existing source-silence discipline:

```text
SOURCE_SILENT != INFERRED_VALUE
```

## Conservative dimension policy

### Role

The active target role is compared only with source-explicit `roleTitle` using normalized exact/subphrase/token overlap.

- strong explicit overlap → `ALIGNED`
- meaningful partial token overlap → `PARTIAL`
- insufficient explicit role evidence → `UNKNOWN`

M4B-10 does not create a role `CONFLICT` merely from non-overlap because a cheap lexical boundary is not strong enough to prove career incompatibility.

### Seniority

If the target is `ANY`, status is `NOT_CONSTRAINED`. Otherwise only source-explicit seniority is classified through a controlled vocabulary. An explicitly different recognized seniority can be `CONFLICT`.

### Work model

If target includes `FLEXIBLE`, status is `NOT_CONSTRAINED`. Otherwise only source-explicit work-model language is classified. A recognized explicit incompatible work model can be `CONFLICT`.

### Employment type

If target includes `ANY`, status is `NOT_CONSTRAINED`. Otherwise only source-explicit employment type is classified. A recognized explicit incompatible type can be `CONFLICT`.

### Location

A source-explicit location matching a preferred location is `ALIGNED`. A non-match remains `UNKNOWN`, not `CONFLICT`, because city/region/remote/relocation semantics are too ambiguous for a low-cost retrieval gate to prove incompatibility.

## Logical opportunity deduplication

M4B-10 does not rank every historical MarketObservation independently.

It groups observations by the existing M4B-07 `MarketOpportunityId`, derives lifecycle over the full durable occurrence history, and evaluates only:

`lifecycle.currentMarketObservationId`

Therefore:

```text
same provider-native vacancy
  observation A (old payload)
  observation B (new payload)
        ↓
one logical retrieval candidate
        ↓
current observation B only
```

Historical market states remain durable but do not duplicate the current candidate pool.

## Lifecycle-aware retrieval

M4B-10 consumes M4B-07 lifecycle without redefining it.

```text
CLOSED
  → EXCLUDED_CLOSED

STALE + role ALIGNED/PARTIAL
  → REFRESH_FIRST

STALE + insufficient role signal
  → INSUFFICIENT_SIGNAL

UNKNOWN lifecycle
  → INSUFFICIENT_SIGNAL

OPEN + role ALIGNED + no explicit conflicts
  → CANDIDATE

OPEN + role ALIGNED/PARTIAL + explicit conflict(s)
  → REVIEW

OPEN + insufficient role signal
  → INSUFFICIENT_SIGNAL
```

`REVIEW` does not mean “unqualified.” It means the cheap target prefilter sees a potentially relevant role plus an explicit preference conflict that warrants human/deeper analysis.

`REFRESH_FIRST` does not mean rejection. It means current source freshness is insufficient; M4B-09 should re-observe before costly downstream analysis.

## Bounded workload

Server policy owns the workload budget:

```text
selected candidate default: 20
internal hard maximum:      50
v1 bounded scan guard:   5,000 durable observations
```

Public callers cannot supply the selected limit, market observation list, retrieval score, role target, or lifecycle status.

M4B-10 v1 still reconstructs a bounded full aggregate from durable observation history. The 5,000-observation guard prevents the current implementation from pretending to be an unbounded catalog/search engine. Provider/opportunity-scoped indexes or dedicated retrieval projections can be introduced later if market scale requires them.

## Deterministic ordering

Current candidates are ordered by:

1. disposition (`CANDIDATE` before `REVIEW`, then refresh/insufficient/closed internally),
2. more aligned explicit signals,
3. fewer explicit conflicts,
4. more recent lifecycle observation,
5. stable MarketOpportunityId tie-break.

No opaque numeric “fit score” is emitted.

The semantic `MarketCandidateSet` identity includes a digest of the complete logical market universe considered by the bounded scan, so the same selected 20 cannot silently keep the same identity if non-selected market state changes materially.

Runtime `generatedAt` is not semantic identity. If lifecycle status and the underlying market/target state remain unchanged, reevaluating later yields the same retrieval identity.

## Public API

`POST /api/market-candidate-retrieval`

Strict public request:

```json
{
  "careerVaultId": "opaque-uuid-capability"
}
```

The server owns:

- CandidateProfileId derivation,
- active CareerTarget resolution,
- market history selection,
- current logical-opportunity state,
- lifecycle,
- retrieval policy,
- selected limit,
- ordering.

Request body ceiling: 8 KiB.

The endpoint is rate-limited before durable reads and returns `Cache-Control: no-store`.

It executes no:

- Job Intelligence parsing,
- Job Match,
- OpportunityAssessment,
- OpportunitySpace ranking,
- resume generation.

## Test contract

M4B-10 behavior coverage proves:

1. OPEN explicit role + compatible target constraints becomes `CANDIDATE`.
2. Description text cannot backfill missing explicit role metadata.
3. Explicit work-model conflict downgrades to `REVIEW`, never “unqualified.”
4. Relevant STALE opportunity routes to `refreshFirst`.
5. CLOSED opportunity is excluded from current retrieval.
6. Material versions of one provider-native opportunity collapse to one current logical candidate.
7. Retrieval identity is stable across history order and runtime evaluation time while lifecycle state is unchanged.
8. Selected candidates are bounded at the server-owned limit.
9. Retrieval payload contains target intent + source market values but no candidate evidence/match artifact.
10. Application service/public route do not consume candidate capability or invoke downstream matching/generation.

## Validation history

### Draft run 1

Head: `a3cb0450a040e38cad80570d3fd1226b9aabb86f`

GitHub Actions:
- run `32095829394`
- job `95586875709`

Result:
- install PASS
- dependency audit PASS
- lint FAIL
- later steps skipped

Failure was test hygiene only: one unused type import and one unused helper under zero-warning lint. Production behavior was unchanged.

### Draft run 2

Head: `84ab643ad9bbf9c3a1bc3e38fb92beef777a82c6`

GitHub Actions:
- run `32095914088`
- job `95587111853`

Result:
- install PASS
- dependency audit PASS
- lint PASS
- typecheck PASS
- behavior tests: 235 PASS / 2 FAIL of 237
- build skipped

All eight substantive retrieval behavior tests passed. The two failures were over-broad structural assertions:

- one banned every `.evidence` property and therefore incorrectly rejected legitimate `SOURCE_EXPLICIT` market evidence;
- one searched for the word `OpportunityAssessment` and therefore matched a boundary comment despite no downstream import/call.

The tests were corrected to distinguish market provenance from candidate evidence and to detect actual imports/calls. Production code was not weakened or changed for these failures.

### Implementation-green run

Head: `72543bb3d896722605b601c8bc80272b2b5d283f`

GitHub Actions:
- run `32096065274`
- job `95587543621`

Result:
- install PASS
- dependency audit PASS
- lint PASS
- typecheck PASS
- complete behavior suite PASS
- production build PASS

This green head freezes M4B-10 implementation semantics before documentation closure.

## Gate conclusion

M4B-10 closes the market-volume selection gap without creating a parallel ATS matcher.

CV Engine can now take a bounded durable market universe and produce a target-specific, lifecycle-aware shortlist using only candidate intent and source-explicit market facts. The shortlist is explicitly weaker than qualification analysis, exposes no hiring probability, preserves source uncertainty, excludes stale/closed state correctly, and keeps candidate capability untouched until the trusted Job Match path.

## Next gate

`MARKET-04B-11 — Selected Market Candidate Analysis / Retrieval-to-Assessment Orchestration`

The next safe step is to take only the bounded, current M4B-10 selected candidates and orchestrate the already-trusted deep chain:

```text
M4B-10 selected current MarketObservation
      ↓
M4B-04 DerivedMarketInterpretation
      ↓
M4B-05 MarketJobProjection + exact JobSnapshot
      ↓
M4B-06 exact market OpportunityAssessment
      ↓
M4A OpportunitySpace
```

M4B-11 must preserve selection identity and per-item provenance, bound downstream workload, remain partial-failure safe, and must not automatically deep-analyze every discovered listing merely because M4B-09 can find it.
