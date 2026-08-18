# MARKET-04B-09 — Bounded Provider Discovery + Refresh

## Why this gate exists

M4B-03 proved that CV Engine can acquire one exact provider-native listing safely when its locator is already known. M4B-07 established logical opportunity identity and lifecycle, and M4B-08 removed the global Redis snapshot lost-update boundary that made parallel market writers unsafe.

The remaining gap was operational:

```text
one known provider listing
!=
a controlled market feed
```

CV Engine still required a caller to know every listing locator in advance and had no explicit policy for deciding when an already-observed provider opportunity should be observed again.

M4B-09 closes that gap without turning CV Engine into a generic crawler and without coupling discovery to Job Intelligence, matching or resume generation.

```text
Provider board/site
       ↓
Bounded discovery
       ↓
provider-native locators only
       ↓
existing M4B-03 acquisition
       ↓
MarketObservation + ObservationOccurrence
```

For already-known opportunities:

```text
MarketOpportunity lifecycle
       ↓
RefreshDecision
       ↓
DUE?
  ├─ NO  → no provider request
  └─ YES → reconstruct provider locator from durable provenance
              ↓
          existing M4B-03 acquisition
              ↓
     unchanged source → same MarketObservation + new occurrence
     changed source   → new MarketObservation + same logical opportunity
```

## Gate

```text
M4B-09 — BOUNDED_PROVIDER_DISCOVERY_AND_REFRESH
```

Gate statement:

> CV Engine can discover bounded sets of provider-native opportunities, acquire each discovered listing through the existing source-truth boundary, preserve successful acquisitions independently from item failures, and deterministically re-observe stale direct-provider opportunities without interpreting discovery/acquisition failure as market closure or permitting arbitrary crawling.

## Hard truth boundaries

```text
DiscoveryLocator != MarketObservation
DiscoveryResult != MarketObservation
DiscoveryResult != JobRequirement
AcquisitionFailure != MarketClosure
RefreshDecision != MarketOpportunityLifecycle
RefreshFailure != CLOSED
RefreshFailure != MarketFact
DiscoveredListing != CandidateEvidence
Discovery != JobIntelligence
Refresh != OpportunityAssessment
```

M4B-09 creates no candidate truth and no Job Requirements.

Discovery answers:

> Which provider-native listing locators did this controlled provider source expose within the authorized budget?

Acquisition still answers:

> What did that exact listing source say when CV Engine observed it?

Lifecycle still answers:

> What is the current derived state of this logical opportunity based on durable source history?

RefreshDecision answers:

> Is another direct source observation warranted under the current refresh policy?

These remain separate objects and responsibilities.

## Provider contracts

M4B-09 uses only controlled public provider listing interfaces corresponding to the M4B-03 providers.

### Greenhouse

Discovery endpoint:

```text
GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs
```

The board response exposes published job-post identifiers. Discovery converts each valid numeric id into the already-supported M4B-03 locator:

```text
GREENHOUSE
boardToken + jobId
```

The discovery adapter does not treat the board-list payload as a MarketObservation and does not parse requirements from it.

### Lever

Discovery endpoint:

```text
GET https://api.lever.co/v0/postings/{site}?mode=json&skip={skip}&limit={limit}
```

EU sites use:

```text
https://api.eu.lever.co
```

M4B-09 pages only within the explicit discovery budget and converts each returned posting id into the existing M4B-03 locator:

```text
LEVER
site + postingId + region
```

### Ashby

Discovery endpoint:

```text
GET https://api.ashbyhq.com/posting-api/job-board/{JOB_BOARD_NAME}?includeCompensation=false
```

Discovery uses the provider-hosted `jobUrl` as the selector already understood by M4B-03:

```text
ASHBY
jobBoardName + jobUrl
```

Entries with:

```text
isListed = false
```

are deliberately not emitted by public board discovery because they represent direct-link-only jobs rather than listings intended for the public board list.

## Discovery is locator production, not market truth

The first-class discovery result contains:

```text
provider
providerRequestCount
truncated
locators[]
```

Each locator contains:

```text
provider
existing ControlledSourceAcquisitionRequest
discoverySourceUrl
discoveryOrdinal
```

Scope boundary:

```text
DISCOVERY_LOCATORS_ONLY_NOT_MARKET_FACT_OR_JOB_REQUIREMENT
```

This is deliberate. A provider board list can tell CV Engine that a listing locator was exposed by the provider endpoint. It is not used as a shortcut around M4B-03's single-listing source validation and canonical intake.

Every discovered locator that CV Engine chooses to observe must still execute:

```text
Controlled provider locator
      ↓
M4B-03 provider adapter
      ↓
Canonical Market Intake
      ↓
MarketObservation
      ↓
ObservationOccurrence
      ↓
M4B-08 partitioned durable history
```

## Server-owned discovery budget

Policy:

```text
controlled-provider-discovery-v1
```

Default v1 budget:

```text
maxListings               = 50
maxPages                  = 5
maxConcurrentAcquisitions = 4
```

Hard validation ceilings:

```text
maxListings               <= 200
maxPages                  <= 20
maxConcurrentAcquisitions <= 10
```

Lever's v1 internal page size is:

```text
20
```

The public discovery API does not accept these budget values from the caller. They are server-owned execution policy.

This prevents an API caller from converting one request into an unbounded provider scan or arbitrary fan-out workload.

## Network safety

Provider discovery retains the M4B-03 external-source safety model:

```text
HTTPS only
fixed provider hosts
GET only
Accept: application/json
redirect: error
cache: no-store
8 second timeout
2 MiB response maximum
invalid provider identifiers fail before network use
```

Discovery does not accept an arbitrary destination URL from the public API.

Provider-specific URLs are constructed server-side from validated provider-native board/site identifiers.

## Bounded batch acquisition

Application service:

```text
discoverAndAcquireControlledMarketSources()
```

The application layer receives two injected ports:

```text
ControlledProviderDiscoverer
ControlledProviderSourceAcquirer
```

It therefore contains no provider HTTP implementation dependency.

The orchestration is:

```text
Discovery request
      ↓
validate server budget
      ↓
discover locators
      ↓
validate provider + budget contract
      ↓
deduplicate exact acquisition locators
      ↓
bounded workers
      ↓
acquireControlledMarketSource(locator)
      ↓
item success OR item failure
```

The existing M4B-03 application service remains the sole source-observation authority.

### Partial failure contract

A discovery batch is not atomic across independent listings.

Example:

```text
4 discovered
├─ listing A → success
├─ listing B → success
├─ listing C → SOURCE_NOT_FOUND
└─ listing D → success
```

Result:

```text
discovered = 4
attempted  = 4
succeeded  = 3
failed     = 1
```

The three valid durable observations remain committed.

The one failed item is returned with its provider locator and safe failure code/message.

Failure scope:

```text
ACQUISITION_FAILURE_NOT_MARKET_CLOSURE
```

This prevents batch semantics from erasing successful source observations merely because another independent listing failed.

## Refresh policy

Policy:

```text
controlled-provider-refresh-v1
```

Refresh eligibility is derived from M4B-07 lifecycle; it does not replace it.

```text
OPEN
→ NOT_DUE
→ DIRECT_SOURCE_STILL_FRESH

STALE
→ DUE
→ DIRECT_SOURCE_STALE

CLOSED
→ INELIGIBLE
→ SOURCE_EXPLICITLY_CLOSED

UNKNOWN
→ INELIGIBLE
→ SOURCE_NOT_PROVIDER_REFRESHABLE
```

The OPEN next-eligible timestamp is the current M4B-07 direct-source freshness boundary:

```text
lastObservedAt + 72 hours
```

M4B-09 intentionally does not introduce another hidden refresh interval before that existing lifecycle boundary.

Scope:

```text
REFRESH_DECISION_NOT_LIFECYCLE_OR_MARKET_FACT
```

## Server-owned refresh locator reconstruction

Public refresh input is only:

```json
{
  "marketObservationId": "market-observation:<32 lowercase hex>"
}
```

The caller does not provide:

```text
provider
sourceUrl
externalId
boardToken
site
postingId
jobBoardName
jobUrl
lifecycle state
refresh status
```

For a DUE refresh, the server loads the current material observation and reconstructs the M4B-03 acquisition locator from durable provider provenance.

Supported reconstruction is strict:

### Greenhouse

Requires the stored source URL to reproduce:

```text
https://boards-api.greenhouse.io/v1/boards/{board}/jobs/{jobId}
```

and the URL job id must equal durable `externalId`.

### Lever

Requires the fixed global/EU API host and:

```text
/v0/postings/{site}/{postingId}?mode=json
```

with `postingId == externalId`.

### Ashby

Requires the fixed public board API source URL and a durable `externalId` that is a safe hosted:

```text
https://jobs.ashbyhq.com/...
```

URL.

Any provenance mismatch fails closed as an invalid controlled locator instead of allowing a caller or corrupted history to redirect network access.

## Re-observation semantics

Refresh does not have a second market parser.

For a DUE opportunity it calls:

```text
acquireControlledMarketSource()
```

again.

Therefore all prior semantic identity rules remain intact.

### Unchanged source state

```text
same provider listing
same semantic payload
later observation time
```

produces:

```text
same MarketObservationId
new ObservationOccurrence
same MarketOpportunityId
materialStateCount unchanged
lifecycle becomes OPEN after successful recent re-observation
```

### Changed source state

```text
same provider-native listing identity
changed semantic payload
```

produces:

```text
new MarketObservationId
prior MarketObservation preserved
same logical MarketOpportunityId
materialStateCount increases
lifecycle current observation advances
```

No historical market state is rewritten.

## Refresh failure is not closure

If a DUE refresh encounters:

```text
404
429
timeout
provider outage
invalid provider response
oversized provider response
```

M4B-09 returns:

```text
outcome = REFRESH_FAILED
```

with scope:

```text
REFRESH_FAILURE_NOT_MARKET_CLOSURE
```

The pre-refresh lifecycle remains the current lifecycle view.

In particular:

```text
STALE + provider 404
!= CLOSED
```

M4B-07's earlier boundary remains intact: provider disappearance is not a durable negative source event yet. A later gate must create an evidence-bearing negative observation/closure contract before disappearance can become authoritative closure evidence.

## Public API boundaries

### POST /api/market-discovery

Accepted body is exactly one controlled provider board/site selector:

```text
GREENHOUSE → boardToken
LEVER      → site + optional GLOBAL/EU region
ASHBY      → jobBoardName
```

Controls:

```text
32 KiB request-size guard
rate-limit scope: market-discovery
strict provider schema
server-owned discovery budget
no arbitrary URL input
no caller observedAt
no caller concurrency/page/listing budget
no-store response
```

A successful response may contain both successes and item failures. That is an intentional partial-batch contract.

### POST /api/market-refresh

Accepted body:

```text
marketObservationId only
```

Controls:

```text
8 KiB request-size guard
rate-limit scope: market-refresh
strict canonical MarketObservation id
server-resolved lifecycle
server-resolved provider locator
no-store response
```

If lifecycle is not DUE, no provider request is executed.

## What M4B-09 deliberately does not do

M4B-09 does not implement:

```text
arbitrary website crawling
search-engine scraping
cross-provider fuzzy deduplication
automatic interpretation of every discovered listing
automatic Job Intelligence for every discovered listing
automatic candidate matching of every discovered listing
automatic OpportunityAssessment for every discovered listing
scheduled/background polling workers
provider disappearance as CLOSED
unbounded catalog query architecture
```

This separation matters economically as well as architecturally.

Discovery/observation can maintain a broad source-truth pool without immediately paying the full candidate-analysis cost for every observed job.

## Test contract

`tests/ats2/provider-discovery-refresh.test.ts` covers:

- Greenhouse board discovery to existing single-job locators;
- Greenhouse listing-budget truncation;
- Lever EU pagination within listing/page budgets;
- Ashby public board discovery and exclusion of `isListed=false` direct-link-only jobs;
- bounded concurrent acquisition workers;
- partial acquisition failure preserving successful durable observations;
- failure explicitly remaining non-closure;
- refresh decision separation from lifecycle;
- provider locator reconstruction from durable provenance;
- unchanged stale refresh creating only another ObservationOccurrence;
- changed stale refresh preserving the previous MarketObservation and advancing the same logical opportunity;
- refresh 404 preserving STALE instead of manufacturing CLOSED;
- public discovery/refresh boundaries keeping budgets, provider locators and lifecycle state server-owned;
- no Job Intelligence, matching, OpportunityAssessment or resume generation dependency in the discovery/refresh surfaces.

## Validation history

The first draft CI run exposed one type-boundary problem before behavior tests were allowed to run.

The public refresh route had validated the canonical MarketObservation string shape but then passed a template-literal string instead of the existing branded `MarketObservationId`. The refresh policy test also used plain string literals for branded MarketOpportunity/MarketObservation ids.

The correction was deliberately type-safe:

```text
validated API string → MarketObservationId boundary
fixture domain ids    → domainId(...)
```

No `any`, type suppression, weakened domain brand or disabled test was introduced.

Implementation head:

```text
0c9f08206148d8e35c5d70bf28a414566a7365e7
```

Implementation CI:

```text
run  32094773663
job  95583854768

install            PASS
dependency audit   PASS — 0 vulnerabilities
lint               PASS — zero warnings
typecheck          PASS
behavior tests     PASS — 227 / 227
production build   PASS
```

The provider network behavior in CI is tested with deterministic provider-shaped fixtures. This gate does **not** claim that CI performed live production calls to Greenhouse, Lever or Ashby.

## Capacity boundary after M4B-09

M4B-08 made market appends concurrency-safe. M4B-09 now safely creates bounded multi-listing writes above that foundation.

However, this is still not the final high-volume market catalog query/read model.

Likewise, M4B-09 defines refresh eligibility and controlled re-observation, but it does not yet create a scheduler/queue that continuously refreshes every opportunity.

The architecture is now ready for the next product-intelligence boundary:

```text
many durable observed opportunities
        ↓
Which opportunities are relevant enough to this candidate/target
that we should spend deeper interpretation/assessment work on them?
```

## Next architectural step — MARKET-04B-10

```text
MARKET-04B-10 — Market Candidate Retrieval / Opportunity Filtering
```

The next gate should build a conservative retrieval layer over observed/current market opportunities so CV Engine can reduce a broad market pool into a bounded candidate-specific set before expensive Job Intelligence and OpportunityAssessment.

It must keep:

```text
retrieval signal != candidate fact
retrieval relevance != Job Match
market prefilter != hiring probability
filtering != fuzzy logical identity
```

M4B-09 closes provider discovery and controlled refresh. M4B-10 may now address which observed opportunities deserve deeper candidate-specific intelligence.
