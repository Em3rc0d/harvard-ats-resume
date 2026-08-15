# MARKET-04B-03 — Controlled Source Acquisition

## Purpose

M4B-01 established the raw/source-explicit `MarketObservation` truth boundary.
M4B-02A established canonical market intake.
M4B-02B separated immutable semantic market state from repeated temporal observation events and made that history durable.

M4B-03 opens the first controlled connection to the external labor market:

```text
Public Provider Source
        |
        v
  Source Adapter
        |
        v
Canonical Market Intake
        |
        v
 MarketObservation
        |
        v
ObservationOccurrence History
```

The gate is intentionally narrow. It proves that CV Engine can acquire one real public listing through a documented provider interface without allowing network/provider infrastructure to bypass the market-truth boundary.

## Why this gate comes now

Before M4B-02B, external acquisition would have created ambiguous overwrite semantics:

```text
same listing seen tomorrow
?
new job or same job?
```

M4B-02B answered that question first:

```text
same semantic MarketObservation + later observation time
=> same MarketObservation
=> new ObservationOccurrence
```

Only after that distinction became durable is it safe to connect external sources.

## Supported provider adapters

The first controlled adapters use provider-documented public job-posting interfaces.

### Greenhouse

Official interface:

```text
GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs/{job_id}
```

The Greenhouse Job Board API documents public GET access without authentication.

M4B-03 requires:

```text
boardToken
jobId
```

and constructs the provider URL server-side.

Source-explicit fields currently admitted:

- role title from `$.title`
- location from `$.location.name`
- description from `$.content`

`updated_at` is preserved in the provider payload but is **not** relabeled as `postedAt`.

### Lever

Official interface:

```text
GET https://api.lever.co/v0/postings/{site}/{postingId}?mode=json
```

or for the documented EU instance:

```text
GET https://api.eu.lever.co/v0/postings/{site}/{postingId}?mode=json
```

Lever documents the Postings API for published public job postings.

M4B-03 requires:

```text
site
postingId
region? = GLOBAL | EU
```

Source-explicit fields currently admitted:

- role title from `$.text`
- location from `$.categories.location`
- work model from `$.workplaceType`
- employment type from `$.categories.commitment`
- compensation text from `$.salaryDescriptionPlain` when supplied
- description from `$.descriptionPlain`

No provider value is allowed to become a candidate fact or job requirement at this stage.

### Ashby

Official public interface:

```text
GET https://api.ashbyhq.com/posting-api/job-board/{JOB_BOARD_NAME}?includeCompensation=true
```

Ashby documents this endpoint as returning currently published job postings for an organization.

The public Ashby endpoint is board-scoped rather than single-listing-scoped, so M4B-03 accepts:

```text
jobBoardName
jobUrl
```

`jobUrl` is a **selector only**. CV Engine never fetches the caller-supplied `jobUrl` directly.

The server fetches only the fixed `api.ashbyhq.com` board endpoint, validates the response, then selects the matching `jobs.ashbyhq.com/{board}/...` listing.

Source-explicit fields currently admitted:

- role title from `$.title`
- location from `$.location`
- work model from `$.workplaceType`
- employment type from `$.employmentType`
- compensation text from `$.compensation.compensationTierSummary` when supplied
- description from `$.descriptionPlain`

Ashby `publishedAt` is preserved in the provider payload but is **not** relabeled as `postedAt`, because the provider defines it as the time the posting was last published and the market domain must not silently reinterpret that field.

## Provider adapters are infrastructure

Concrete provider names remain infrastructure concerns.

The domain continues to see:

```text
MarketSource.type = PROVIDER_API
MarketSource.provider = GREENHOUSE | LEVER | ASHBY
```

rather than introducing Greenhouse/Lever/Ashby domain object types.

The application service also does not import provider infrastructure.

Instead:

```text
ControlledSourceAcquisitionService
        |
        | dependency port
        v
ControlledProviderSourceAcquirer
        |
        v
provider infrastructure
```

The API route is the composition root that wires the provider adapter implementation into the application service.

## Canonical intake remains authority

A source adapter may:

- construct one fixed provider endpoint from validated provider-native identifiers;
- issue the bounded GET request;
- validate the provider response shape;
- preserve a deterministic JSON representation of the provider listing;
- identify source-explicit fields and their source paths;
- record provider-native external identity and adapter version.

A source adapter may **not** create `MarketObservation` directly.

It returns an internal `AcquiredProviderMarketIntake` object to:

```text
intakeAcquiredProviderObservation()
```

inside the existing Market Intake application boundary.

That boundary creates the canonical `MarketObservation` with:

```text
source.type = PROVIDER_API
captureMethod = PROVIDER_ADAPTER
sourceUrl = provider API endpoint
externalId = provider-native listing identity
adapterId
adapterVersion
```

Only after canonical intake may M4B-02B persist the semantic observation and temporal occurrence.

## Network safety policy

M4B-03 does not expose generic URL fetching.

Hard controls:

```text
caller arbitrary fetch URL              FORBIDDEN
HTTP                                    FORBIDDEN
embedded credentials                    FORBIDDEN
custom ports                            FORBIDDEN
redirect following                      FORBIDDEN
unbounded response                      FORBIDDEN
non-JSON provider response              FORBIDDEN
unsupported provider                    FORBIDDEN
```

The supported adapters construct only these hosts:

```text
boards-api.greenhouse.io
api.lever.co
api.eu.lever.co
api.ashbyhq.com
```

Provider path components are restricted to provider-native identifier characters before URL construction.

Acquisition requests use:

```text
GET
Accept: application/json
redirect: error
cache: no-store
8 second timeout
2 MiB maximum response body
```

A declared oversized response is rejected before body consumption. A streamed response is also stopped once the byte ceiling is crossed.

## Public API boundary

M4B-03 adds:

```text
POST /api/market-acquisition
```

Supported request shapes:

```json
{
  "provider": "GREENHOUSE",
  "boardToken": "acme",
  "jobId": "12345"
}
```

```json
{
  "provider": "LEVER",
  "site": "acme",
  "postingId": "abc-123",
  "region": "GLOBAL"
}
```

```json
{
  "provider": "ASHBY",
  "jobBoardName": "Acme",
  "jobUrl": "https://jobs.ashbyhq.com/Acme/job-two"
}
```

The route is:

```text
32 KiB request-size guard
        |
        v
public API rate limit
        |
        v
strict provider locator schema
        |
        v
ControlledSourceAcquisitionService
        |
        v
provider acquirer port
        |
        v
canonical provider intake
        |
        v
MarketObservation
        |
        v
M4B-02B durable history
        |
        v
HTTP 200
```

Public callers cannot supply `observedAt`.

HTTP 200 therefore means both:

```text
provider acquisition succeeded
AND
MarketObservation + ObservationOccurrence durability reload verification succeeded
```

## Failure semantics

Provider failures remain distinguishable from invalid caller input.

```text
invalid provider locator      -> 400
listing not found             -> 404
provider rate limited         -> 503
provider unavailable          -> 502
invalid provider response     -> 502
oversized provider response   -> 502
history unavailable           -> 503
```

No failed acquisition can produce a successful market-history claim.

## Truth boundaries preserved

```text
ProviderPayload != JobRequirement
ProviderPayload != CandidateEvidence
ProviderPayload != CareerAssertion
Source Adapter != Job Intelligence
Source Adapter != Matcher
Source Adapter != Recommendation Engine
AcquiredProviderMarketIntake != MarketObservation
MarketObservation != DerivedMarketInterpretation
ObservationOccurrence != MarketObservation
```

The adapter preserves explicit source material. It does not infer:

- seniority from role title;
- remote status from free text;
- requirements from description;
- skill concepts;
- normalized occupations;
- candidate fit;
- opportunity priority;
- hiring probability.

Those belong to later derived-analysis boundaries.

## Behavior coverage

M4B-03 adds deterministic offline tests proving:

1. Greenhouse constructs only its official single-job API endpoint;
2. Lever supports the documented global/EU posting hosts;
3. Ashby `jobUrl` is only a selector while the fixed board API is the actual fetch target;
4. invalid locators fail before network access;
5. provider responses must be JSON and must match the requested provider identity;
6. provider timestamps whose meaning differs from `postedAt` are not silently relabeled;
7. provider acquisition must pass through canonical intake and durable history;
8. unchanged acquired content later keeps one MarketObservation and adds an ObservationOccurrence;
9. changed provider content creates a new MarketObservation while preserving prior state;
10. the application acquisition service has no infrastructure import;
11. the public route is request-bounded, rate-limited and does not expose generic source URLs;
12. acquisition invokes no Job Intelligence, candidate matching, OpportunityAssessment or OpportunitySpace path.

CI uses provider-shaped fixtures rather than live network calls. External provider uptime is not allowed to make repository tests nondeterministic.

## Gate M4B-03 — CONTROLLED_PROVIDER_ACQUISITION

M4B-03 is complete when:

- Greenhouse, Lever and Ashby public-source adapters exist behind one acquisition port;
- arbitrary URL fetching is impossible through the public acquisition contract;
- provider-native locator validation happens before network access;
- redirects, non-HTTPS destinations, credentials and custom ports are rejected by policy;
- outbound requests are time- and size-bounded;
- provider responses are validated before intake;
- adapters expose only source-explicit fields;
- provider data passes through canonical Market Intake before MarketObservation creation;
- acquired observations pass through M4B-02B history before success;
- public `observedAt` remains server-owned;
- repeated unchanged acquisition preserves semantic identity and appends occurrence history;
- changed source payload preserves prior MarketObservation state;
- no provider path writes JobRequirement, CandidateEvidence, CareerAssertion, MatchReport, OpportunityAssessment or OpportunitySpace directly;
- dependency audit, lint, typecheck, behavior tests and production build remain green.

## Explicit non-goals

M4B-03 does **not** implement:

- provider/company discovery;
- crawling arbitrary company career pages;
- scheduled polling;
- batch ingestion;
- broad provider synchronization;
- Adzuna or Jooble acquisition;
- logical `MarketOpportunity` identity;
- cross-source job deduplication;
- active/stale/closed lifecycle classification;
- freshness policies;
- high-volume persistence partitioning;
- optimistic concurrency for parallel provider workers;
- derived market interpretation;
- requirement extraction from provider descriptions;
- MarketObservation -> Job Intelligence -> JobSnapshot bridging;
- external-market OpportunitySpace population;
- automated application submission.

The M4B-02B single-snapshot history repository remains acceptable for this manually triggered, one-listing acquisition gate. It is **not** approved for broad parallel polling or provider synchronization.

## Official provider references used for this gate

- Greenhouse Job Board API: `https://developers.greenhouse.io/job-board.html`
- Lever Postings API: `https://github.com/lever/postings-api`
- Ashby Job Postings API: `https://developers.ashbyhq.com/docs/public-job-posting-api`

These interfaces were reviewed on 2026-08-15. Provider contracts can change; future adapter revisions must revalidate the official source documentation and bump adapter versions when source semantics change.

## Next architectural boundary

M4B-03 proves **where market truth can enter**.

It does not yet decide what that truth means to CV Engine.

The next stage should be:

```text
MARKET-04B-04 — Derived Market Interpretation Boundary
```

The required direction is:

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

That next gate must define exactly which normalized concepts may be derived from observed provider facts, how every derived value points back to source evidence, and how absence remains uncertainty rather than invented fact.
