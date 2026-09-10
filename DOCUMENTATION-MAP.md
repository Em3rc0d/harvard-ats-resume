# CV Engine — Documentation Map for the Zero-Based Rebuild

This file maps the accumulated documentation into the disciplined project structure we will use for the rebuild.

```text
brainstorming
   ↓
design
   ↓
architecture
   ↓
plan
   ↓
build contract
   ↓
test / quarries / golden dataset
   ↓
release evidence
```

The categories describe how the documents should be *used*. They do not imply that every historical file is equally authoritative.

## 00 — Brainstorming / product thesis

Primary material:

- `docs/market-v0.1/README.md`
- `docs/market-v0.1/MARKET-03-CAREER-TARGET.md`
- `docs/market-v0.1/MARKET-04-OPPORTUNITY-SPACE.md`
- `docs/market-v0.1/MARKET-V0.1-CLOSURE.md`

Purpose:

- why CV Engine exists;
- beachhead vs harbor;
- Career Model as the asset;
- Application Intelligence entry point;
- Career Opportunity Intelligence destination;
- defensible differentiation instead of keyword theater.

## 01 — Product design

Primary material:

- `docs/ats-v2/baseline/CURRENT_PRODUCT_CONTRACT.md`
- `docs/ats-v2/UX-TRUST-POLISH.md`
- `docs/market-v0.1/MARKET-03-CAREER-TARGET.md`
- `docs/market-v0.1/MARKET-04-OPPORTUNITY-SPACE.md`
- `docs/release/RELEASE_SURFACE_AUDIT_v1.md`
- `docs/vnext/00-FIRST-RUN-TRUST-AND-AI-ACCESS.md`
- `docs/vnext/11-CANDIDATE-SOURCE-AUTHORITY-AND-AI-TRANSFORMATION.md`
- `docs/vnext/12-CV-IMPROVEMENT-IMPLEMENTATION-CONTRACT.md`

Purpose:

- user-facing boundaries;
- first-run disclaimer/consent;
- AI access choice;
- Career Evidence review;
- Career Target;
- specific-job vs general-resume flows;
- explainable gaps;
- trusted failure/degradation surfaces;
- release-visible product behavior;
- candidate-authored source as authoritative candidate assertion;
- AI transformation as the object that requires provenance/fact validation;
- Truth Graph as a safety/provenance ledger rather than a prerequisite background-check gate;
- upload → improve → validate → deliver as the primary product outcome;
- primary workflow that hides internal ontology and delivers the improved CV first.

## 02 — Architecture

Primary authority:

- `REBUILD-CONTRACT.md`
- `docs/vnext/README.md`
- `docs/vnext/01-AI-PROVIDER-ROUTING.md`
- `docs/vnext/02-BYOK-SECRET-HANDLING.md`
- `docs/vnext/11-CANDIDATE-SOURCE-AUTHORITY-AND-AI-TRANSFORMATION.md`
- `docs/vnext/12-CV-IMPROVEMENT-IMPLEMENTATION-CONTRACT.md`
- `docs/ats-v2/baseline/CURRENT_PRODUCT_CONTRACT.md`

Supporting architecture:

- `docs/system/CAPABILITY-CONTRACT-MATRIX-v0.1.md`
- `docs/system/FAILURE-TAXONOMY-v0.1.md`
- `docs/system/DEGRADATION-MATRIX-v0.1.md`
- `docs/system/HEALTH-DEGRADATION-POLICY-v0.1.md`
- `docs/system/RUNTIME-IDENTITY-v0.1.md`
- `docs/market-v0.1/MARKET-04B-01-MARKET-OBSERVATION-CANON.md`
- `docs/market-v0.1/MARKET-04B-02A-STRUCTURED-MARKET-INTAKE.md`
- `docs/market-v0.1/MARKET-04B-02B-DURABLE-OBSERVATION-HISTORY.md`
- `docs/market-v0.1/MARKET-04B-03-CONTROLLED-SOURCE-ACQUISITION.md`
- `docs/market-v0.1/MARKET-04B-04-DERIVED-MARKET-INTERPRETATION.md`
- `docs/market-v0.1/MARKET-04B-05-JOB-INTELLIGENCE-PROJECTION.md`
- `docs/market-v0.1/MARKET-04B-06-MARKET-ASSESSMENT-INTEGRATION.md`
- `docs/market-v0.1/MARKET-04B-07-OPPORTUNITY-IDENTITY-LIFECYCLE.md`
- `docs/market-v0.1/MARKET-04B-08-PARTITIONED-MARKET-PERSISTENCE.md`
- `docs/market-v0.1/MARKET-04B-09-PROVIDER-DISCOVERY-REFRESH.md`
- `docs/market-v0.1/MARKET-04B-10-MARKET-CANDIDATE-RETRIEVAL.md`
- `docs/market-v0.1/MARKET-04B-11-SELECTED-CANDIDATE-ANALYSIS.md`

Hard architecture boundaries:

```text
Candidate truth != Job truth
Candidate truth != Career intent
Derived assessment != truth
AI proposal != truth
Provider success != validation success
ResumeVersion != Career Evidence
API key != durable product state

Candidate-provided assertion != externally verified assertion
Not externally verified != false
Candidate-provided assertion = sufficient source authority for CV transformation
AI-generated addition = untrusted until source/provenance validation
```

New vNext AI architecture:

```text
First-run consent
   ↓
AI access mode
   ├─ CV Engine Gemini key
   ├─ BYOK Gemini key
   └─ no-cloud mode
   ↓
AI Gateway
   ↓
Gemini model cascade (primary provider)
   ↓ recoverable failure
Ollama (fallback provider)
   ↓
application-owned validation
```

Candidate-source transformation architecture:

```text
Candidate source assertion
   ↓
CandidateResumeDocument semantic understanding
   ↓
Holistic Resume Editor
   ↓
Fact Guardian
   ↓
repair / conservative recovery
   ↓
Resume Improvement Run
   ↓
Resume Artifact
```

Exact quality-sensitive Gemini model routing must be benchmarked against representative real CVs before a route is frozen. Provider structured outputs must be used for machine-critical structures where supported.

## 03 — Historical implementation plan / design decisions

Primary material:

- `docs/ats-v2/prs/PR-ATS2-00.md` through `PR-ATS2-14H.md`
- `docs/ats-v2/prs/PR-ATS2-REAL-CV-RECOVERY.md`
- sequential `MARKET-04B-*` documents
- `docs/ats-v2/CHANGELOG.md`

These documents explain why many boundaries exist. They are valuable design history, but the rebuild must not reproduce their old code structure blindly.

Contract 11 explicitly supersedes any historical interpretation that treats candidate-provided but externally unverified information as false, unusable, or ineligible for normal resume improvement.

Contract 12 supersedes any assumption that the implementation graph is still open: Nodes 1–10 are closed and the I1→I10 build sequence is authorized after Contract 12 is merged.

## 04 — Zero-based build plan

Primary authority:

- `REBUILD-CONTRACT.md`;
- `docs/vnext/11-CANDIDATE-SOURCE-AUTHORITY-AND-AI-TRANSFORMATION.md` for candidate-source authority;
- `docs/vnext/12-CV-IMPROVEMENT-IMPLEMENTATION-CONTRACT.md` for product-coherence implementation.

Historical build sequence:

```text
B0   Repository + typed contracts
B0.5 First-run trust + AI access foundation
B1   Career Evidence core + durability
B2   Career Target + Job truth
B3   Evidence-backed Assessment
B4   Deterministic ResumeVersion + provenance + export
B5   Resume import convenience + reconciliation + fallback
B6   Gemini-primary / Ollama-fallback AI assistance runtime
B7   Opportunity Space / market extension
B8   Release hardening
B9   Presentation / artifact / production browser closure
```

Critical corrections from the first implementation and subsequent real-user dogfood:

> Resume import is not allowed to block the core product. Manual Career Evidence and deterministic trusted generation must work before importer sophistication is added.

> AI provider routing is an availability/cost layer, not a truth layer. Gemini or Ollama success cannot bypass application-owned validation.

> BYOK is transient secret material, never Career Vault/application state.

> Candidate-authored source is authoritative candidate assertion. External verification is additive, not a prerequisite for improving that source.

> The Truth Graph guards transformations and provenance. It must not force claim-by-claim biography verification before the user can receive an improved CV.

> Mechanical source lines remain provenance leaves; they must not define the user-facing semantic model.

> The next implementation reuses existing trusted infrastructure and adds only the missing semantic/editor/guardian/product path.

Product-coherence implementation sequence:

```text
I1  Source-authority policy helpers + regression contracts
I2  CandidateResumeDocument semantic domain
I3  Structured semantic-understanding capability
I4  Resume Improvement Run persistence + RLS/lifecycle
I5  Holistic Resume Editor capability
I6  Fact Guardian + repair/recovery
I7  Resume artifact adapter for improvement result
I8  Primary Improve CV UX
I9  Real-CV golden harness + quality rubric
I10 Production E2E + release re-certification
```

No Market Intelligence, scraping, job discovery, global navigation rewrite or external verification feature is required to close I1→I10.

## 05 — Test architecture

Primary material:

- `docs/ats-v2/testing/CHARACTERIZATION_FIXTURES.md`
- `docs/system/CANONICAL-PERSONAS-v0.1.md`
- `docs/system/E2E-ACCEPTANCE-MATRIX-v0.1.md`
- `docs/system/CHARACTERIZATION-HARNESS-v0.1.md`
- `docs/system/ATS-SYS-03-IMPORT-ROBUSTNESS-CAPACITY.md`
- `docs/system/ATS-SYS-03D-MODEL-FORCED-CAPACITY.md`
- `docs/system/ATS-SYS-03E-REAL-WORLD-CORPUS.md`
- `docs/release/BROWSER_ACCEPTANCE_MATRIX_v1.md`
- `docs/vnext/00-FIRST-RUN-TRUST-AND-AI-ACCESS.md`
- `docs/vnext/01-AI-PROVIDER-ROUTING.md`
- `docs/vnext/02-BYOK-SECRET-HANDLING.md`
- `docs/vnext/11-CANDIDATE-SOURCE-AUTHORITY-AND-AI-TRANSFORMATION.md`
- `docs/vnext/12-CV-IMPROVEMENT-IMPLEMENTATION-CONTRACT.md`

Required layers:

```text
domain tests
truth-invariant tests
application/API tests
persistence + fault tests
source-reconciliation fixtures
provider-routing/fallback fixtures
structured-output regression
BYOK secret-canary tests
canonical personas
browser E2E
identified-runtime receipts
real-CV product-quality acceptance
source-vs-generated fact-guardian regression
DOCX/PDF validity
```

The real-CV gate must distinguish:

```text
SAFE BUT USELESS != PASS
PROVIDER UNAVAILABLE != INVALID PROVIDER OUTPUT
CANDIDATE ASSERTION != UNSUPPORTED AI ADDITION
ENGINEERING CERTIFIED != REAL-CV PRODUCT QUALITY ACCEPTED
```

## 06 — Mining site / quarries / golden dataset

The first implementation did not consistently organize these under explicit quarry directories, but much of the evidence already exists conceptually in:

- characterization fixtures;
- canonical personas;
- import incident regressions;
- ATS-SYS-03E real-world corpus documentation;
- failure taxonomy;
- degradation matrix;
- release/browser acceptance matrices.

For the rebuild, this becomes explicit from the start:

```text
mining-site/
  quarry-001-...
  quarry-002-...
  quarry-ai-access-...
  quarry-ai-router-...
  quarry-byok-...
  quarry-candidate-source-authority-...
  quarry-resume-editor-guardian-...

golden-dataset/
  personas/
  resume-import/
  resume-improvement/
  job-match/
  provenance/
  provider-routing/
  secret-handling/
  fault-cases/
```

Private real CVs and PII must remain outside the public repository. Public golden fixtures must be synthetic or safely anonymized.

Real-user CV quality evidence may be referenced through opaque IDs/hashes/receipts but raw PII-bearing source material must not be committed.

## 07 — Runtime / system evidence

Historical evidence and constraints:

- `docs/system/ATS-SYS-01-SYSTEM-CHARACTERIZATION.md`
- `docs/system/RUNTIME-ENVELOPE-v0.1.md`
- `docs/system/ATS-SYS-02-RUNTIME-POLICY-v0.1.json`
- `docs/system/RUNTIME-IDENTITY-v0.1.md`

Use these to design the new characterization system. Do not automatically inherit old runtime qualification into a materially changed implementation.

Runtime characterization must separately identify:

- deterministic core health;
- Gemini capability health;
- resolved Gemini model per capability;
- credential mode (platform/BYOK/local-only) without recording secrets;
- Ollama capability health;
- whether fallback was actually exercised;
- whether provider response was rejected by output validation;
- whether fact-guardian validation accepted/repaired/rejected generated claims;
- whether partial recovery preserved safe improved sections.

## 08 — Release gates

Primary material:

- `docs/system/RELEASE-GATE-v0.1.md`
- `docs/release/BROWSER_ACCEPTANCE_MATRIX_v1.md`
- `docs/release/RELEASE_SURFACE_AUDIT_v1.md`
- `docs/ats-v2/baseline/EXECUTION_EVIDENCE.md`
- `docs/vnext/11-CANDIDATE-SOURCE-AUTHORITY-AND-AI-TRANSFORMATION.md`
- `docs/vnext/12-CV-IMPROVEMENT-IMPLEMENTATION-CONTRACT.md`

Release rule:

```text
CI green
    !=
product ready
```

A release reaches product qualification only when the full user story and its failure/degradation paths have executable receipts on an identified runtime.

AI/runtime release evidence must include:

- platform-key secret isolation;
- BYOK non-persistence;
- BYOK HTTPS enforcement;
- Gemini-primary routing receipts;
- Gemini→Ollama fallback receipt where applicable;
- complete-AI-outage degradation receipt;
- cost/retry budget enforcement;
- candidate-source authority preserved;
- unsupported AI additions rejected or repaired;
- representative real/private CV produces a materially improved downloadable resume;
- candidate-provided assertions do not require external proof before normal CV optimization;
- output-validation failure is not mislabeled as provider unavailability;
- valid DOCX/PDF outputs;
- source→generated provenance;
- exact-SHA production browser evidence.

Product qualification requires both:

```text
ENGINEERING_CERTIFIED = true
REAL_CV_PRODUCT_QUALITY_ACCEPTED = true
```

## Historical implementation archive

`archive/current-implementation/` contains the README and Quick Start from the previous implementation.

These files may contain stale runtime/model assumptions. They are kept to understand what was tried, not to dictate the current product semantics.

## Working rule for the next phase

Contract 12 closes all ten pre-code implementation nodes required by Contract 11.

Therefore:

```text
SOURCE-AUTHORITY CORRECTION  CLOSED
IMPLEMENTATION GRAPH         CLOSED
BUILD I1→I10                 AUTHORIZED
RANDOM SYMPTOM PATCHES       PROHIBITED
UNNECESSARY BACKEND REWRITE  PROHIBITED
PROVENANCE WEAKENING         PROHIBITED
```

Implementation may now proceed in dependency order, preserving current infrastructure unless executable evidence proves a specific incompatibility.

The governing product rule remains:

> **Believe the user's source. Distrust the AI's additions.**
