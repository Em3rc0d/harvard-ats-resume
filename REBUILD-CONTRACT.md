# CV Engine — Rebuild Contract v1.3

## 1. Purpose

Rebuild CV Engine from zero using the accumulated product, market, trust, system, and release documentation as the specification.

The rebuild must optimize for **coherence and completion**, not maximal reuse of the prior codebase.

## 2. Product boundary

Beachhead:

> Application Intelligence — help a person determine whether and how to compete for a specific opportunity using defensible career evidence.

Harbor:

> Career Opportunity Intelligence — maintain a historical, evidence-backed representation of a person's career, understand opportunities and their requirements, explain fit and gaps, support career decisions, generate context-specific applications, and learn from the person's evolution without corrupting career truth.

Presentation principle:

> CV Engine must convert defensible career truth into the strongest professional presentation possible for a context, while preserving the ability to demonstrate why every resulting claim remains defensible.

The career remains the durable asset. A resume is a contextual projection. Better presentation must never become weaker truth.

## 3. Core domain model

Minimum conceptual entities:

- CareerEvidence / CareerSnapshot
- CareerAssertion / Claim
- CareerTarget
- JobSnapshot / JobIntelligence
- Opportunity / OpportunityAssessment
- MatchReport
- PresentationPlan / PresentationRevision
- ResumeVersion / ResumeClaim
- Provenance / SourceReceipt
- CareerVault / durable history
- AI access context / provider provenance

The exact implementation model may evolve, but these semantic boundaries may not collapse into one generic ResumeData blob.

## 4. Truth classes

### Candidate truth
Facts the candidate can support from explicit manual input or source-backed evidence.

### Market truth
External information about jobs, companies, requirements, compensation, locations, or opportunity observations.

### Intent
Career Target preferences and direction. Intent is not evidence of capability.

### Derived analysis
Fit, gaps, recommendations, opportunity ranking, and decision support. Derived analysis is not candidate truth or market truth.

### Presentation
Selection, prioritization, wording, grouping, ordering and document formatting of supported candidate truth for a context.

Presentation may change how verified truth is expressed but may not create new candidate facts, strengthen a claim beyond its evidence, or use market truth to backfill candidate truth.

An optimized presentation must retain traceable lineage to the exact Career Evidence revisions that authorize it. Authoritative detail:

- `docs/vnext/05-TRUTH-PRESERVING-PRESENTATION.md`

## 5. First-run trust and AI access boundary

Every new product session begins with:

```text
Trust / privacy / AI disclaimer
        ↓
Explicit acknowledgement
        ↓
Choose AI access mode
        ├─ CV Engine Gemini access
        ├─ Bring Your Own Gemini Key (BYOK)
        └─ Continue without cloud AI
        ↓
Product entry
```

The first-run boundary must explain:

- what CV Engine does and does not guarantee;
- that AI output may be incomplete/wrong;
- that users must review career/application content;
- that Job Descriptions do not become candidate facts;
- how selected cloud AI may process bounded resume/career content;
- which account bears Gemini quota/cost;
- that BYOK credentials are transient secrets and are not intentionally persisted.

The disclaimer is a disclosure/consent mechanism. It does not replace secure engineering, privacy controls, or legal review.

Authoritative detail:

- `docs/vnext/00-FIRST-RUN-TRUST-AND-AI-ACCESS.md`
- `docs/vnext/02-BYOK-SECRET-HANDLING.md`

## 6. AI contract and provider strategy

AI is optional/bounded by capability.

Default cloud-enabled routing:

```text
Capability request
     ↓
AI Gateway
     ↓
Gemini (primary provider)
     ↓
capability-specific Gemini model cascade
     ↓ recoverable failure / invalid bounded proposal
Ollama (fallback provider)
     ↓
same validation contract
```

Initial routing baseline:

```text
high-volume default      gemini-3.5-flash-lite
quality escalation       gemini-3.7-flash
Gemini reserve           gemini-3.6-flash
compat/capacity reserve  gemini-3.1-flash-lite
local fallback           capability-specific Ollama model
```

These model IDs are an implementation baseline, not release qualification. B6 must benchmark the exact capabilities/models/runtime before support claims are made.

AI may:

- assist with ambiguous resume fragments after deterministic boundaries are established;
- propose stronger presentation while preserving facts;
- classify or interpret bounded external text when the result remains derived/untrusted until application validation.

AI may not:

- author candidate truth;
- invent metrics, projects, employers, skills, dates, titles, certifications, scope, ownership, or seniority;
- turn a Job Description into candidate evidence;
- approve a PresentationRevision;
- be the final authority for ResumeVersion provenance;
- make a trusted-core durability claim.

Provider fallback must never weaken truth validation.

```text
Gemini output ─┐
               ├─→ application validation → accept bounded proposal for review OR reject/degrade
Ollama output ─┘
```

Final presentation approval and resume assembly remain application/user owned. Final ResumeVersion assembly should remain deterministic unless a future architecture decision explicitly replaces this contract with equally strong evidence/provenance guarantees.

Authoritative detail:

- `docs/vnext/01-AI-PROVIDER-ROUTING.md`
- `docs/vnext/03-GEMINI-MODEL-MATRIX.md`
- `docs/vnext/05-TRUTH-PRESERVING-PRESENTATION.md`

## 7. Gemini credential modes

### CV Engine-owned key

- server-side environment/secret only;
- never exposed to browser code/responses;
- subject to platform quotas, rate limits, and cost budgets.

### User-owned Gemini key (BYOK)

- entered by the user;
- memory-only in browser application state by default;
- not stored in localStorage, sessionStorage, IndexedDB, cookies, URLs, Redis, databases, logs, analytics, or telemetry;
- transmitted only over HTTPS outside localhost;
- server receives it only as a request-scoped secret and does not intentionally persist/cache/log it;
- Ollama never receives the Gemini credential;
- reload may require re-entry.

### No-cloud mode

- skips Gemini;
- Ollama may serve optional bounded capabilities if available;
- deterministic trusted-core workflows remain available.

## 8. Import architecture

Import is convenience, not the authority.

Preferred pipeline:

```text
resume file
   ↓
mechanical extraction
   ↓
deterministic structural boundaries
   ↓
source-exact record recovery where possible
   ↓
bounded AI only for small ambiguous fragments
   ↓
source reconciliation
   ↓
reviewable Career Evidence proposal
```

If automatic import cannot safely recover the document, the product must degrade to manual Career Evidence entry rather than block the entire product or accept uncertain facts.

AI provider order does not change this contract. Gemini and Ollama proposals are both untrusted until source reconciliation succeeds.

## 9. Persistence contract

Trusted durable state must fail closed. A storage outage must never be represented as successful persistence.

Persistence is part of the product contract, not an implementation detail hidden behind UI optimism.

BYOK credentials are explicitly outside durable persistence.

The new implementation must not inherit the previous Redis topology by default. The primary datastore, schema, transaction model, ownership model, retention and deletion/export lifecycle must be frozen in PF0 before B1 durable Career Evidence is committed.

Approved PresentationRevisions and immutable ResumeVersions are durable historical artifacts and must preserve their evidence/provenance identities. PresentationRevision may never become an alternate mutable Career Evidence authority.

## 10. Product flow for first release

The first coherent release should support this complete path before expanding the harbor:

```text
OPEN
  ↓
Disclaimer / acknowledgement
  ↓
AI access choice
  ↓
START
  ├─ Manual Career Evidence
  └─ Optional Resume Import → Review
              ↓
        Career Evidence
              ↓
         Career Target
              ↓
       Specific Job OR General Resume
              ↓
       Opportunity Assessment (specific job)
              ↓
       Presentation Plan
              ↓
       Truth-preserving presentation proposals
              ↓
       validation / diff / explicit user approval
              ↓
       Deterministic ResumeVersion
              ↓
       DOCX / PDF / TXT / provenance JSON
```

Opportunity Space and broader market intelligence extend this core without changing candidate truth authority.

## 11. PF0 — Production Foundation Closure

Before trusted-core feature implementation proceeds into B1 durability, the rebuild must freeze these production contracts:

```text
Identity / session / tenant ownership
Durable datastore + data lifecycle
Runtime/deployment topology including hosted Ollama semantics
AI quota / cost / abuse policy
Security / observability / privacy baseline
```

Authoritative readiness review:

- `docs/vnext/04-BUILD-READINESS-AUDIT.md`

B0 repository/tooling scaffolding may begin while PF0 is completed, but B1 durable Career Evidence must not be built on unresolved identity or persistence assumptions.

## 12. Build order

### B0 — Repository and contracts
- empty application baseline;
- lint/typecheck/test/build from first commit;
- architecture decision records;
- typed domain contracts;
- no UI-first mock implementation.

### B0.5 — First-run trust + AI access foundation
- versioned disclaimer/consent contract;
- AI access mode selection;
- server-only platform Gemini secret boundary;
- memory-only BYOK contract;
- insecure-origin BYOK prohibition;
- provider-agnostic AI Gateway interfaces;
- capability-specific provider provenance;
- model routing driven by the vNext model matrix.

B0.5 must not make AI a prerequisite for B1–B4 trusted-core capabilities.

### B1 — Career Evidence core
- canonical domain model;
- manual evidence CRUD/edit/review;
- provenance/source model;
- truth-class invariants;
- durable persistence;
- identity/ownership rules from PF0.

### B2 — Target and Job truth
- Career Target;
- Job Snapshot / Job Intelligence;
- strict candidate-vs-market boundary;
- deterministic requirement representation.

### B3 — Assessment
- evidence-backed match states;
- explicit missing requirements;
- explainable rationale;
- no hiring-probability theater.

### B4 — ResumeVersion
- deterministic source-preserving composition;
- claim-to-assertion provenance;
- export;
- general and targeted versions.

B4 remains a valid safe baseline. P1 extends presentation semantics without silently rewriting B4 closure evidence.

### B5 — Import convenience
- PDF/DOCX extraction;
- deterministic parsing first;
- bounded ambiguous-fragment assistance;
- source reconciliation;
- manual fallback.

Import is intentionally later than manual Career Evidence so importer failures cannot block the core product.

### B6 — AI assistance runtime
- Gemini-primary capability routing;
- capability-specific Gemini model cascade;
- Ollama fallback;
- BYOK/platform/no-cloud credential modes;
- inline presentation optimization capability;
- bounded adapters;
- retry/deadline/cost controls;
- explicit failure/degradation contracts;
- capability/model benchmarks;
- no AI dependency in trusted deterministic core where avoidable.

### B7 — Opportunity Space / market extension
- multi-opportunity comparison;
- market observation lifecycle;
- controlled acquisition and refresh;
- historical opportunity intelligence.

### P1 — Truth-Preserving Professional Presentation
- PresentationPlan domain;
- PresentationRevision domain;
- evidence-to-presentation lineage;
- deterministic novelty/strengthening guards;
- bounded AI proposal wiring;
- source/proposal/diff review;
- explicit user approval;
- deterministic ResumeClaim compilation from approved presentation;
- summary synthesis with multi-evidence provenance;
- ATS-safe deterministic document renderer;
- DOCX/PDF/TXT/provenance JSON parity;
- browser/runtime evidence.

Authority: `docs/vnext/05-TRUTH-PRESERVING-PRESENTATION.md`.

P1 is release-blocking for CVENGINE_V1_0_0.

### B8 — Release hardening
- canonical personas;
- golden datasets;
- fault injection;
- browser E2E;
- runtime identity;
- release receipts;
- provider fallback and secret-canary certification;
- P1 presentation/export regression and runtime receipts before final certification.

## 13. Quarry / test discipline

Every feature must have an executable acceptance boundary before implementation is considered closed.

Test layers:

- domain unit tests;
- truth-invariant tests;
- presentation novelty/strengthening tests;
- presentation provenance and approval tests;
- cross-format export consistency tests;
- API/application behavior tests;
- persistence/fault tests;
- import source-reconciliation fixtures;
- AI-provider routing/fallback fixtures;
- BYOK secret-canary tests;
- canonical personas;
- golden datasets;
- real browser E2E;
- identified runtime receipts.

Meaningful failures become named quarry fixtures/regressions. Do not accumulate one-off symptom patches.

## 14. Cost and availability rules

Cloud AI spending must be bounded by application policy.

Platform-key mode must support:

- per-capability attempt ceilings;
- token/output ceilings;
- whole-operation deadlines;
- platform quota/rate limits;
- usage accounting;
- operational budget guards;
- fallback/degradation instead of repeated paid retries.

The user-provided free-tier quota snapshot is suitable as development/dogfood evidence only. It is not production capacity evidence.

BYOK does not remove attempt limits: CV Engine must not accidentally consume a user's quota through uncontrolled retries.

Ollama is the fallback/resilience/privacy lane, not the truth authority. A hosted Ollama topology is not considered supported until its physical runtime/cost/cold-start behavior is characterized.

P1 must degrade to deterministic/manual source-preserving presentation when AI is unavailable rather than block ResumeVersion creation.

## 15. Release language

Do not claim:

- arbitrary CV support;
- hiring probability;
- universal ATS compatibility;
- formal semantic equivalence proof for arbitrary natural-language rewrites;
- supported hardware without measured receipts;
- runtime/model latency guarantees without identified-runtime evidence;
- production readiness from CI alone;
- that a disclaimer eliminates legal/privacy obligations;
- that CV Engine "never sees" a BYOK key when the server proxies the provider call;
- that an observed Gemini free-tier quota is a permanent production limit or SLA.

A release claim must identify the evidence that supports it.

CV Engine may claim traceable evidence lineage for an approved presentation only when the corresponding provenance/validation/approval receipts exist.

## 16. Definition of done

CV Engine vNext is done when a new user can complete the core path from first-run acknowledgement and AI access selection through Career Evidence to the strongest supported professional presentation for a chosen context, explicitly review/approve meaningful presentation changes, and export a provenance-backed ResumeVersion as DOCX/PDF/TXT plus provenance JSON on a clean runtime, including safe failure/degradation paths, without relying on hidden manual developer intervention.

The rebuild is not complete because individual endpoints work. It is complete when the **product story works end to end** and the evidence receipts prove the claims we make about it.
