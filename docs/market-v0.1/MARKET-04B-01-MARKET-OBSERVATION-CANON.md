# MARKET-04B-01 — Market Observation Canon

## Purpose

MARKET-04A proved that CV Engine can prioritize several durable opportunities for one CareerSnapshot and one active CareerTarget.

MARKET-04B begins the next boundary: making the market side source-aware before adding URLs, provider adapters, or broad acquisition.

The first rule is:

```text
what the source said
!=
what CV Engine interpreted
```

`MarketObservation` records the first side only.

## Why this boundary exists

The current Job Intelligence path begins with free-form source text and produces a `JobDescription`, extracted `JobRequirement[]`, and language interpretation. That is reproducible, but it does not yet preserve an independent canonical object representing the raw/explicit market observation before interpretation.

M4B-01 introduces that object without changing the existing M1-M4 production path.

```text
External / user supplied source
             |
             v
      MarketObservation
      RAW + EXPLICIT FACTS
             |
             | future M4B work
             v
Derived Market Interpretation
             |
             v
       Job Intelligence
             |
             v
         JobSnapshot
```

## Domain objects

### MarketSource

A `MarketSource` identifies the origin channel, not a concrete provider-specific domain type.

Current source classes in the v1 market boundary are:

- `MANUAL_TEXT`
- `MANUAL_STRUCTURED` — added by M4B-02A to represent user-supplied structured origin without pretending it is a provider/feed
- `JOB_URL`
- `PROVIDER_API`
- `COMPANY_CAREERS`
- `PARTNER_FEED`

Concrete provider names remain data (`provider`) so Greenhouse, Lever, Ashby, or future sources do not become central domain enums.

`MarketSource` identity is deterministic and content-addressed from source type, provider and label. A `PROVIDER_API` source must identify its provider; the generic class alone is not sufficient provenance.

### MarketObservation

A `MarketObservation` contains:

```text
schemaVersion
id
MarketSource
raw payload
source-explicit fields
capture provenance
contentSha256
observedAt
scope boundary
```

Its explicit job fields may include raw source values for:

- company name
- role title
- location
- work model
- employment type
- seniority
- compensation
- posted date
- expiration date
- description

These values are intentionally strings in M4B-01. The observation stores what the source declared, not CV Engine's normalized interpretation.

For example:

```text
Source explicitly says:
"Senior Backend Engineer"

MarketObservation:
roleTitle = "Senior Backend Engineer"
seniority = absent
```

unless the source separately declares a seniority field.

The later interpretation layer may derive `SENIOR`, but that derived value must not be written back as an observed fact.

## Provenance

Every explicit field carries:

```text
origin = SOURCE_EXPLICIT
sourcePath?    // structured provider path when available
sourceExcerpt? // exact supporting fragment when available
```

The provenance claim itself is validated:

- every explicit field must identify where its source value came from
- a TEXT observation requires an exact `sourceExcerpt`
- that excerpt must exist in the raw payload
- the raw field value must exist inside that excerpt
- a JSON-labeled payload must contain valid JSON
- structured JSON fields may use a source path; path resolution belongs to the later structured-intake adapter contract

Observation-level provenance records:

- capture method
- source URL when present
- provider-native external ID when present
- adapter ID/version for provider adapters

A `PROVIDER_ADAPTER` observation is invalid without adapter provenance and provider identity. A `PUBLIC_URL_FETCH` observation is invalid without source URL provenance.

`observedAt` must be a valid timestamp even though it is not part of semantic identity.

## Semantic identity

The observation is content-addressed from:

```text
schema version
source
raw payload
explicit fields
provenance
scope boundary
```

`observedAt` is deliberately excluded from semantic identity.

Therefore:

```text
same source + same content + same explicit facts + same provenance
observed at another time
=> same MarketObservation identity
```

but:

```text
changed source content or changed explicit source facts
=> new MarketObservation identity
```

This distinction lets later history work represent observation occurrences without manufacturing a new market state merely because the clock changed.

## Truth boundary

Hard invariants:

```text
MarketObservation != CandidateEvidence
MarketObservation != CareerAssertion
MarketObservation != JobRequirement
ObservedMarketFact != DerivedMarketInterpretation
absence of an explicit field != inferred value
claimed provenance without source support != observed fact
```

The scope boundary is encoded as:

```text
OBSERVED_MARKET_FACT_NOT_CANDIDATE_EVIDENCE_OR_DERIVED_INTERPRETATION
```

## Gate M4B-01 — SOURCE_AWARE_MARKET_TRUTH_BOUNDARY

M4B-01 is complete when:

- `MarketSourceId` and `MarketObservationId` exist as domain identities
- a raw/explicit MarketObservation can be created and validated deterministically
- wall-clock observation time does not change semantic identity
- changed market content creates a new semantic observation
- source-explicit fields cannot silently create inferred seniority/work model/etc.
- source-explicit TEXT facts must be traceable to exact raw source excerpts
- fabricated source excerpts are rejected
- provider adapter capture requires adapter provenance and provider identity
- public URL capture requires source URL provenance
- invalid JSON payload labeling and invalid observation timestamps are rejected
- MarketObservation contains no candidate identity/evidence references
- tampering breaks content-addressed validation
- no existing Job Match or Career Truth path is modified
- dependency audit, lint, typecheck, behavior tests and production build remain green

## Explicit non-goals

M4B-01 does not yet implement:

- URL fetching
- provider adapters
- market observation persistence/history
- observation occurrence tracking
- MarketOpportunity logical deduplication
- provider-level deduplication
- freshness / active / stale / closed lifecycle
- structured intake API
- JSON source-path resolution
- migration of JobIntelligenceEngine to consume MarketObservation
- broad market acquisition
- Opportunity Discovery

Those require this canon first.
