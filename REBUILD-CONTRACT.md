# CV Engine — Rebuild Contract v1

## 1. Purpose

Rebuild CV Engine from zero using the accumulated product, market, trust, system, and release documentation as the specification.

The rebuild must optimize for **coherence and completion**, not maximal reuse of the prior codebase.

## 2. Product boundary

Beachhead:

> Application Intelligence — help a person determine whether and how to compete for a specific opportunity using defensible career evidence.

Harbor:

> Career Opportunity Intelligence — maintain a historical, evidence-backed representation of a person's career, understand opportunities and their requirements, explain fit and gaps, support career decisions, generate context-specific applications, and learn from the person's evolution without corrupting career truth.

## 3. Core domain model

Minimum conceptual entities:

- CareerEvidence / CareerSnapshot
- CareerAssertion / Claim
- CareerTarget
- JobSnapshot / JobIntelligence
- Opportunity / OpportunityAssessment
- MatchReport
- ResumeVersion / ResumeClaim
- Provenance / SourceReceipt
- CareerVault / durable history

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
Resume wording and formatting. Presentation may change wording but may not create new facts.

## 5. AI contract

AI is optional/bounded by capability.

AI may:

- assist with ambiguous resume fragments after deterministic boundaries are established;
- improve presentation while preserving facts;
- classify or interpret bounded external text when the result remains derived/untrusted until application validation.

AI may not:

- author candidate truth;
- invent metrics, projects, employers, skills, dates, titles, certifications, scope, ownership, or seniority;
- turn a Job Description into candidate evidence;
- be the final authority for ResumeVersion provenance;
- make a trusted-core durability claim.

Final resume assembly should remain deterministic unless a future architecture decision explicitly replaces this contract with equally strong evidence/provenance guarantees.

## 6. Import architecture

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

## 7. Persistence contract

Trusted durable state must fail closed. A storage outage must never be represented as successful persistence.

Persistence is part of the product contract, not an implementation detail hidden behind UI optimism.

## 8. Product flow for first release

The first coherent release should support this complete path before expanding the harbor:

```text
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
       Deterministic ResumeVersion
              ↓
       provenance / review / export
```

Opportunity Space and broader market intelligence should be added only after the core single-opportunity path is complete and stable.

## 9. Build order

### B0 — Repository and contracts
- empty application baseline;
- lint/typecheck/test/build from first commit;
- architecture decision records;
- typed domain contracts;
- no UI-first mock implementation.

### B1 — Career Evidence core
- canonical domain model;
- manual evidence CRUD/edit/review;
- provenance/source model;
- truth-class invariants;
- durable persistence.

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

### B5 — Import convenience
- PDF/DOCX extraction;
- deterministic parsing first;
- bounded ambiguous-fragment assistance;
- source reconciliation;
- manual fallback.

Import is intentionally later than manual Career Evidence so importer failures cannot block the core product.

### B6 — Optional AI assistance
- inline presentation optimization;
- bounded adapters;
- explicit failure/degradation contracts;
- no AI dependency in trusted deterministic core where avoidable.

### B7 — Opportunity Space / market extension
- multi-opportunity comparison;
- market observation lifecycle;
- controlled acquisition and refresh;
- historical opportunity intelligence.

### B8 — Release hardening
- canonical personas;
- golden datasets;
- fault injection;
- browser E2E;
- runtime identity;
- release receipts.

## 10. Quarry / test discipline

Every feature must have an executable acceptance boundary before implementation is considered closed.

Test layers:

- domain unit tests;
- truth-invariant tests;
- API/application behavior tests;
- persistence/fault tests;
- import source-reconciliation fixtures;
- canonical personas;
- golden datasets;
- real browser E2E;
- identified runtime receipts.

Meaningful failures become named quarry fixtures/regressions. Do not accumulate one-off symptom patches.

## 11. Release language

Do not claim:

- arbitrary CV support;
- hiring probability;
- universal ATS compatibility;
- supported hardware without measured receipts;
- runtime/model latency guarantees without identified-runtime evidence;
- production readiness from CI alone.

A release claim must identify the evidence that supports it.

## 12. Definition of done

CV Engine vNext is done when a new user can complete the core path from Career Evidence to an exported, provenance-backed ResumeVersion on a clean runtime, including safe failure/degradation paths, without relying on hidden manual developer intervention.

The rebuild is not complete because individual endpoints work. It is complete when the **product story works end to end** and the evidence receipts prove the claims we make about it.
