# MARKET-04B-04 — Derived Market Interpretation Boundary

## Purpose

M4B-01 created the immutable raw/source-explicit `MarketObservation` boundary.
M4B-02A created canonical intake.
M4B-02B made semantic observation state and temporal observation occurrences durable.
M4B-03 connected controlled Greenhouse, Lever and Ashby acquisition to that same boundary.

M4B-04 answers the next question:

> What may CV Engine safely *derive* from an observed market fact without pretending the derivation was itself stated by the source?

The required separation is now:

```text
MarketObservation
  RAW + SOURCE-EXPLICIT FACT
        |
        v
DerivedMarketInterpretation
  NORMALIZED / CLASSIFIED ANALYSIS
        |
        v
[later] Job Intelligence
        |
        v
[later] JobSnapshot
```

The key rule is:

```text
observed fact
!=
derived interpretation
```

and therefore:

```text
DerivedMarketInterpretation
!=
MarketObservation
!=
JobRequirement
!=
CandidateEvidence
```

## Why this gate exists before Job Intelligence

Without an explicit interpretation object, every downstream consumer could normalize source data differently:

```text
Greenhouse "Remote"
        |
        +--> route A says REMOTE
        +--> route B parses title instead
        +--> route C treats missing field as HYBRID
```

That would make provenance and historical reproducibility impossible.

M4B-04 creates one deterministic policy-owned interpretation artifact before any requirement extraction or matching is allowed.

## Domain object

M4B-04 introduces:

```text
DerivedMarketInterpretation
```

with:

```text
schemaVersion
id
marketObservationId
observationContentSha256
policyVersion
fields
contentSha256
generatedAt
scopeBoundary
```

Current schema:

```text
derived-market-interpretation-v1
```

Current policy:

```text
market-interpretation-v1
```

Scope boundary:

```text
DERIVED_MARKET_INTERPRETATION_NOT_SOURCE_FACT_OR_JOB_REQUIREMENT
```

## Semantic identity

Interpretation identity is content-addressed from:

```text
schema version
+
MarketObservation identity
+
MarketObservation content hash
+
interpretation policy version
+
derived fields
+
scope boundary
```

`generatedAt` is runtime provenance and is deliberately excluded from semantic identity.

Therefore:

```text
same MarketObservation + same policy + same derivation
=> same DerivedMarketInterpretation id
```

while:

```text
changed MarketObservation
=> changed interpretation id
```

and future policy changes may produce:

```text
same MarketObservation + policy v2
=> a new interpretation id
=> policy v1 interpretation remains historical
```

## Evidence contract

Every `KNOWN` derived field carries:

```text
marketObservationId
sourceField
sourceValue
sourcePath?
sourceExcerpt?
```

The source evidence is copied from the authoritative `MarketObservation` field.

Full validation re-derives the interpretation from the original observation and verifies that:

- the interpretation references the same MarketObservation;
- the observation content hash matches;
- every evidence link references a source-explicit field that actually exists;
- the source value is unchanged;
- source path/excerpt provenance is unchanged;
- the current deterministic policy produces exactly the stored fields.

This means changing a derived value and merely recomputing a content hash is not enough to make it valid.

## Allowed derivation classes

M4B-04 supports only three derivation kinds:

```text
NORMALIZED_EXPLICIT
CONTROLLED_CLASSIFICATION
ISO_DATE_NORMALIZATION
```

### 1. NORMALIZED_EXPLICIT

Used for source-explicit text dimensions such as:

- company name
- role title
- location
- compensation text
- description

The policy performs Unicode/whitespace normalization only.

It does not rewrite semantic meaning.

Example:

```text
source roleTitle = "  Senior   Platform Engineer  "

DerivedMarketInterpretation.roleTitle
= "Senior Platform Engineer"
```

Evidence still preserves the exact original source value.

### 2. CONTROLLED_CLASSIFICATION

Used only when the corresponding field itself is source-explicit.

Current canonical work models:

```text
REMOTE
HYBRID
ONSITE
```

Current canonical employment types:

```text
FULL_TIME
PART_TIME
CONTRACT
TEMPORARY
INTERNSHIP
```

Current canonical seniority values:

```text
INTERN
ENTRY
MID
SENIOR
LEAD
MANAGER
DIRECTOR
EXECUTIVE
```

The mappings are deliberately conservative allowlists.

For example:

```text
workModel = "Híbrido"
=> HYBRID
```

but:

```text
workModel = "Flexible anywhere-ish"
=> UNKNOWN / UNRECOGNIZED_SOURCE_VALUE
```

No fuzzy semantic guess is made.

### 3. ISO_DATE_NORMALIZATION

For `postedAt` / `expiresAt`, the policy accepts:

- exact `YYYY-MM-DD` values without inventing a timezone;
- timezone-aware ISO timestamps, normalized to UTC ISO form.

Ambiguous natural-language dates are not guessed.

```text
"sometime next week"
=> UNKNOWN / INVALID_SOURCE_VALUE
```

## UNKNOWN is first-class

Every derived field is either:

```text
KNOWN
```

or:

```text
UNKNOWN
```

UNKNOWN has one explicit reason:

```text
SOURCE_SILENT
UNRECOGNIZED_SOURCE_VALUE
INVALID_SOURCE_VALUE
```

### SOURCE_SILENT

The authoritative observation did not contain that source-explicit field.

No evidence is attached because there is no field to cite.

### UNRECOGNIZED_SOURCE_VALUE

The source supplied a value, but the current deterministic allowlist does not know how to classify it safely.

The original value/evidence is preserved.

### INVALID_SOURCE_VALUE

The source supplied a value whose declared dimension cannot be safely normalized under the current policy.

The original value/evidence is preserved.

## No cross-field inference

This is one of the most important M4B-04 rules.

```text
roleTitle = "Senior Remote Engineer"
```

does **not** authorize:

```text
seniority = SENIOR
workModel = REMOTE
```

unless `seniority` and `workModel` were independently source-explicit fields in the MarketObservation.

Likewise:

```text
description = "This is a full-time remote role"
```

does not fill missing:

```text
employmentType
workModel
```

Raw text may later be analyzed by a specifically governed Job Intelligence bridge, but M4B-04 does not silently use one field as evidence for another.

This preserves the distinction:

```text
source silence
!=
negative fact
!=
permission to infer
```

## Manual text behavior

A manual TEXT MarketObservation with no source-explicit structured fields remains valid market truth.

However, M4B-04 does not mine that free text to manufacture structured dimensions.

Therefore a text-only observation can legitimately produce:

```text
roleTitle       UNKNOWN
location        UNKNOWN
workModel       UNKNOWN
employmentType UNKNOWN
seniority       UNKNOWN
...
```

That is correct uncertainty, not a failed interpretation.

## Durable interpretation history

M4B-04 introduces a separate history aggregate:

```text
DerivedMarketInterpretationHistorySnapshot

schemaVersion
interpretations[]
revision
createdAt
updatedAt
```

Schema:

```text
derived-market-interpretation-history-v1
```

Persistence key:

```text
ats2:derived-market-interpretation-history:v1
```

Interpretation history is deliberately separate from MarketObservation history:

```text
MarketObservation History
= what CV Engine observed

Derived Interpretation History
= what interpretation policy vN derived from an observation
```

One `(MarketObservationId, policyVersion)` pair may have only one deterministic interpretation identity.

Exact regeneration is idempotent:

```text
same observation + same policy
=> no duplicate interpretation
=> no revision increment
```

Changed observations or future policy versions preserve prior interpretations.

Persistence uses the same fail-closed save/reload verification philosophy as previous Market v0.1 history gates.

## Runtime API

M4B-04 adds:

```text
POST /api/market-interpretation
```

Request:

```json
{
  "marketObservationId": "market-observation:<content-addressed-id>"
}
```

The public caller may provide **only** the canonical observation identity.

It may not provide:

- role title normalization;
- work model;
- employment type;
- seniority;
- evidence;
- policy version;
- generatedAt;
- Job Requirements;
- candidate facts.

Flow:

```text
8 KiB request guard
      |
      v
public API rate limit
      |
      v
strict MarketObservationId schema
      |
      v
load durable MarketObservation history
      |
      v
validate observation history
      |
      v
resolve exact MarketObservation
      |
      v
derive market interpretation
      |
      v
full source-linked validation
      |
      v
persist interpretation history
      |
      v
reload + integrity verification
      |
      v
HTTP 200
```

Successful persistence reports:

```text
DURABLE_DERIVED_MARKET_INTERPRETATION_M4B_04
```

## No AI / LLM interpretation in this gate

M4B-04 is intentionally deterministic.

No LLM is allowed to decide:

- work model;
- seniority;
- employment type;
- dates;
- requirements;
- skills;
- candidate fit.

This does not mean probabilistic interpretation can never exist. It means a future probabilistic interpreter would require its own policy/version/provenance/confidence contract rather than being smuggled into the deterministic baseline.

## Truth boundaries preserved

```text
MarketObservation != DerivedMarketInterpretation
DerivedMarketInterpretation != Market Fact
DerivedMarketInterpretation != JobRequirement
DerivedMarketInterpretation != JobSnapshot
DerivedMarketInterpretation != CareerEvidence
DerivedMarketInterpretation != CareerAssertion
DerivedMarketInterpretation != MatchReport
DerivedMarketInterpretation != OpportunityAssessment
UNKNOWN != FALSE
SOURCE_SILENT != INFERRED_VALUE
```

M4B-04 invokes none of:

```text
JobIntelligenceEngine
analyzeJobDescription
createJobRequirement
Job Match
OpportunityAssessment
OpportunitySpace
Resume generation
```

## Behavior coverage

The gate adds executable checks proving:

1. source-explicit text normalization preserves evidence;
2. controlled work-model classification handles approved aliases;
3. controlled employment classification handles approved aliases;
4. controlled seniority classification reads only explicit `seniority`;
5. timezone-aware source dates normalize deterministically;
6. source silence remains `UNKNOWN / SOURCE_SILENT`;
7. title/description signals cannot fill unrelated missing dimensions;
8. unrecognized classifications remain UNKNOWN with the original evidence;
9. invalid date values remain UNKNOWN with evidence;
10. same observation + policy has stable semantic identity across generation times;
11. changed source state produces a different interpretation identity;
12. tampered derived values fail validation;
13. durable interpretation history is idempotent;
14. duplicate deterministic semantic slots are rejected;
15. runtime interpretation requires an already-durable MarketObservation;
16. missing durable interpretation storage fails closed;
17. the public route keeps all derivation inputs server-owned;
18. M4B-04 contains no Job Intelligence, matching, Opportunity or Resume invocation.

## Gate M4B-04 — EVIDENCE_BOUND_DERIVED_MARKET_INTERPRETATION

M4B-04 is complete when:

- `DerivedMarketInterpretationId` exists;
- `DerivedMarketInterpretation` is distinct from MarketObservation;
- interpretation is bound to exact MarketObservation identity + content hash;
- interpretation policy is explicit/versioned;
- semantic interpretation identity is content-addressed;
- `generatedAt` cannot manufacture a new semantic interpretation;
- every KNOWN value points to the exact source-explicit field/evidence;
- source silence remains UNKNOWN;
- unsupported source values remain UNKNOWN rather than guessed;
- cross-field inference is forbidden in the deterministic baseline;
- full validation re-derives fields against authoritative source truth;
- interpretation history is durable and reload-verified;
- exact regeneration is idempotent;
- public callers cannot supply derived values or policy versions;
- no Job Requirement / JobSnapshot / candidate / matching boundary is crossed;
- dependency audit, lint, typecheck, behavior tests and production build remain green.

## Explicit non-goals

M4B-04 intentionally does **not** implement:

- requirement extraction;
- skill extraction;
- occupation taxonomy mapping;
- fuzzy title-to-seniority inference;
- free-text work-model inference;
- free-text employment-type inference;
- compensation parsing into currencies/ranges;
- HTML-to-semantic requirement extraction;
- LLM-based market interpretation;
- Job Intelligence invocation;
- JobDescription creation;
- JobRequirement creation;
- JobSnapshot creation;
- candidate matching;
- OpportunityAssessment;
- OpportunitySpace population;
- lifecycle active/stale/closed classification;
- cross-source MarketOpportunity identity;
- provider-scale polling or synchronization.

The single-snapshot interpretation-history repository follows the existing Market v0.1 durability style and is still not a provider-scale concurrent storage topology.

## Next architectural boundary

M4B-04 creates a trustworthy derived market object.

The next gate should explicitly control how that object becomes input to job analysis:

```text
MARKET-04B-05 — Interpretation → Job Intelligence Projection Bridge
```

Required direction:

```text
MarketObservation
      |
      v
DerivedMarketInterpretation
      |
      v
Controlled Job Projection
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

That bridge must decide which source/derived fields may enter Job Intelligence, retain the originating MarketObservation and interpretation identities, prevent requirements from feeding backward into candidate truth, and make projection policy/versioning explicit.
