# MARKET-04B-02A — Canonical Structured Market Intake

## Purpose

M4B-01 established the source-aware market truth object:

```text
what the source said
!=
what CV Engine interpreted
```

M4B-02A adds the application boundary that converts controlled heterogeneous caller inputs into that one canonical `MarketObservation` representation.

This stage answers:

> How can market information enter CV Engine without bypassing the MarketObservation truth boundary?

## Architecture

```text
Manual text -----------------+
                            |
Structured payload ----------+--> MarketIntakeService
                                    |
                                    +--> intake adapter
                                    |
                                    v
                              MarketObservation
                              RAW / EXPLICIT
                                    |
                                    | later M4B work
                                    v
                         Derived Market Interpretation
                                    |
                                    v
                              Job Intelligence
```

`MarketIntakeService` is the only M4B-02A application orchestrator. It delegates caller representation to an adapter and always finishes by calling the existing M4B-01 `createMarketObservation()` authority.

There is no second MarketObservation constructor.

## Supported intake kinds

### `MANUAL_TEXT`

The caller supplies exact vacancy/source text.

```text
input text
    |
    v
MarketObservation
source.type = MANUAL_TEXT
payload.format = TEXT
captureMethod = USER_SUPPLIED_TEXT
explicitFields = {}
```

M4B-02A deliberately does **not** infer title, company, location, seniority, work model, compensation, or requirements from manual text.

Those are later derived interpretations.

An optional `sourceUrl` may accompany the text as a user-supplied provenance reference. It is not fetched or independently verified in this stage.

### `STRUCTURED_PAYLOAD`

The caller supplies source-explicit structured job fields such as:

- companyName
- roleTitle
- location
- workModel
- employmentType
- seniority
- compensation
- postedAt
- expiresAt
- description

The adapter produces:

```text
source.type = MANUAL_STRUCTURED
payload.format = JSON
captureMethod = USER_SUPPLIED_STRUCTURED
```

Every supplied structured field becomes an `ObservedMarketField` with an adapter-owned source path:

```text
roleTitle
  value = exact caller value
  sourcePath = $.roleTitle
```

The public caller cannot submit arbitrary `explicitFields`, `SOURCE_EXPLICIT` markers, source paths, adapter IDs, provider IDs, or candidate evidence references through the M4B-02A route.

## Source type correction

M4B-01 had `MANUAL_TEXT` but no truthful source type for manually supplied structured input.

M4B-02A adds:

```text
MANUAL_STRUCTURED
```

This keeps two dimensions separate:

```text
origin channel      -> MarketSource.type
representation      -> MarketObservationPayload.format
```

Therefore a manually supplied JSON object is not mislabeled as `PARTNER_FEED` or `PROVIDER_API` merely because it is structured.

## Determinism

Structured caller object key order is not semantic.

The adapter emits a fixed canonical field order while preserving exact supplied string values. Therefore:

```text
same supplied fields
same supplied values
different JSON object key order
=> same accepted source representation
=> same MarketObservation identity
```

A changed explicit source value produces a new MarketObservation identity.

Observation wall-clock time remains excluded from semantic identity according to M4B-01.

## API

`POST /api/market-intake`

Supported request examples:

```json
{
  "kind": "MANUAL_TEXT",
  "text": "Senior Backend Engineer ...",
  "sourceUrl": "https://jobs.example.com/123"
}
```

```json
{
  "kind": "STRUCTURED_PAYLOAD",
  "job": {
    "companyName": "Acme Corp",
    "roleTitle": "Backend Engineer",
    "location": "Lima, Peru",
    "description": "Build distributed APIs."
  }
}
```

The API is:

- request-size bounded
- rate limited before JSON parsing
- strict-schema validated
- `no-store`
- URL-reference validated for HTTP(S) and embedded-credential rejection

It performs no URL fetch.

## Durability boundary

M4B-02A does not persist observations.

Successful results explicitly state:

```text
persistence = NOT_PERSISTED_M4B_02A
```

and:

```text
INTAKE_CREATES_OBSERVED_MARKET_FACT_ONLY_NO_DERIVED_INTERPRETATION_OR_PERSISTENCE
```

This prevents the API from making a false durability claim before M4B-02B exists.

## Hard invariants

```text
MarketIntakeRequest != MarketObservation
MarketObservation != DerivedMarketInterpretation
MarketObservation != JobSnapshot
MarketObservation != CandidateEvidence
sourceUrl reference != fetched source
structured caller field != inferred field
missing structured field != inferred value
intake success != durability
```

## Gate M4B-02A — CANONICAL_PROVENANCE_PRESERVING_MARKET_INTAKE

M4B-02A is complete when:

- manual text and structured payloads converge through one `MarketIntakeService`
- both use the existing M4B-01 `createMarketObservation()` authority
- manual text creates no inferred structured facts
- structured fields receive adapter-owned source paths
- structured object key order does not alter semantic identity
- changed explicit source content changes MarketObservation identity
- `MANUAL_STRUCTURED` keeps source origin separate from payload encoding
- optional URLs remain provenance references and are never fetched
- unsafe URL reference forms are rejected
- MarketIntake contains no candidate identity/evidence coupling
- API makes no persistence claim
- API invokes no Job Intelligence, matching, ranking, or acquisition
- dependency audit, lint, typecheck, behavior tests and production build remain green

## Explicit non-goals

M4B-02A does not implement:

- MarketObservation persistence/history
- observation occurrence tracking
- Job URL acquisition/fetching
- SSRF-safe network acquisition infrastructure
- provider adapters
- Greenhouse / Lever / Ashby acquisition
- Company Careers crawling
- MarketOpportunity logical deduplication
- freshness / active / stale / closed lifecycle
- Observation -> Job Intelligence migration
- Opportunity Discovery

Those depend on the canonical intake boundary first.

## Next stage

`MARKET-04B-02B — Durable Observation History`

The next problem is to separate semantic market state from observation events:

```text
MarketObservation
      |
      +-- observed occurrence A
      +-- observed occurrence B
      `-- observed occurrence C
```

Repeated observation of unchanged semantic content must not manufacture a new market state, while changed source content must preserve both old and new states.
