# CV Engine — Documentation Map for the Zero-Based Rebuild

This file maps the accumulated documentation into the disciplined project structure we use for the rebuild.

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
- `docs/vnext/05-TRUTH-PRESERVING-PRESENTATION.md`

Purpose:

- why CV Engine exists;
- beachhead vs harbor;
- Career Model as the asset;
- Application Intelligence entry point;
- Career Opportunity Intelligence destination;
- strongest truthful professional presentation;
- defensible differentiation instead of keyword theater.

North-star product equation:

```text
TRUTH → POSITIONING → PRESENTATION → PROOF
```

## 01 — Product design

Primary material:

- `docs/ats-v2/baseline/CURRENT_PRODUCT_CONTRACT.md`
- `docs/ats-v2/UX-TRUST-POLISH.md`
- `docs/market-v0.1/MARKET-03-CAREER-TARGET.md`
- `docs/market-v0.1/MARKET-04-OPPORTUNITY-SPACE.md`
- `docs/release/RELEASE_SURFACE_AUDIT_v1.md`
- `docs/vnext/00-FIRST-RUN-TRUST-AND-AI-ACCESS.md`
- `docs/vnext/05-TRUTH-PRESERVING-PRESENTATION.md`

Purpose:

- user-facing boundaries;
- first-run disclaimer/consent;
- AI access choice;
- Career Evidence review;
- Career Target;
- specific-job vs general-resume flows;
- explainable gaps;
- source/proposal/diff presentation review;
- explicit presentation approval;
- professional ATS-safe document output;
- trusted failure/degradation surfaces;
- release-visible product behavior.

## 02 — Architecture

Primary authority:

- `REBUILD-CONTRACT.md`
- `docs/vnext/README.md`
- `docs/vnext/01-AI-PROVIDER-ROUTING.md`
- `docs/vnext/02-BYOK-SECRET-HANDLING.md`
- `docs/vnext/05-TRUTH-PRESERVING-PRESENTATION.md`
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
PresentationRevision != Career Evidence
PresentationPlan != candidate truth
Provider success != validation success
ResumeVersion != Career Evidence
API key != durable product state
```

P1 presentation architecture:

```text
Verified Career Evidence
   ↓
PresentationPlan
   ↓
Presentation proposal
   ↓
application-owned validation
   ↓
user approval
   ↓
APPROVED PresentationRevision
   ↓
deterministic ResumeVersion
   ↓
DOCX / PDF / TXT / provenance JSON
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

AI routing is an availability/cost/proposal layer, not a truth layer.

## 03 — Historical implementation plan / design decisions

Primary material:

- `docs/ats-v2/prs/PR-ATS2-00.md` through `PR-ATS2-14H.md`
- `docs/ats-v2/prs/PR-ATS2-REAL-CV-RECOVERY.md`
- sequential `MARKET-04B-*` documents
- `docs/ats-v2/CHANGELOG.md`

These documents explain why many boundaries exist. They are valuable design history, but the rebuild must not reproduce their old code structure blindly.

## 04 — Zero-based build plan

Primary authority:

- `REBUILD-CONTRACT.md`
- `docs/build/BUILD-GRAPH.md`

Current sequence/status:

```text
B0   Repository + typed contracts                         CLOSED
B0.5 First-run trust + AI access foundation              CLOSED
B1   Career Evidence core + durability                    CLOSED
B2   Career Target + Job truth                            CLOSED
B3   Evidence-backed Assessment                           CLOSED
B4   Deterministic ResumeVersion baseline                 CLOSED
B5   Resume import convenience + reconciliation           CLOSED
B6   Gemini-primary / Ollama-fallback AI runtime         CLOSED
B7   Opportunity Space / market extension                 CLOSED
P1   Truth-Preserving Professional Presentation           ACTIVE
B8   Release hardening / final certification              BLOCKED_BY_P1
```

Critical corrections from the first implementation:

> Resume import is not allowed to block the core product. Manual Career Evidence and deterministic trusted generation must work before importer sophistication is added.

> AI provider routing is an availability/cost layer, not a truth layer. Gemini or Ollama success cannot bypass application-owned validation.

> BYOK is transient secret material, never Career Vault/application state.

> Exact source-text preservation is a safe fallback, not the final product experience. P1 must enable stronger wording and document presentation without weakening evidence lineage.

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
- `docs/vnext/05-TRUTH-PRESERVING-PRESENTATION.md`

Required layers in the rebuild:

```text
domain tests
truth-invariant tests
presentation novelty/strengthening tests
presentation provenance / approval tests
cross-format export consistency tests
application/API tests
persistence + fault tests
source-reconciliation fixtures
provider-routing/fallback fixtures
BYOK secret-canary tests
canonical personas
browser E2E
identified-runtime receipts
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

For the rebuild, this becomes explicit:

```text
mining-site/
  quarry-001-...
  quarry-002-...
  quarry-ai-access-...
  quarry-ai-router-...
  quarry-byok-...
  quarry-presentation-novelty-...
  quarry-presentation-strengthening-...
  quarry-export-parity-...

golden-dataset/
  personas/
  resume-import/
  job-match/
  provenance/
  presentation/
  export-parity/
  provider-routing/
  secret-handling/
  fault-cases/
```

Private real CVs and PII must remain outside the public repository. Public golden fixtures must be synthetic or safely anonymized.

## 07 — Runtime / system evidence

Historical evidence and constraints:

- `docs/system/ATS-SYS-01-SYSTEM-CHARACTERIZATION.md`
- `docs/system/RUNTIME-ENVELOPE-v0.1.md`
- `docs/system/ATS-SYS-02-RUNTIME-POLICY-v0.1.json`
- `docs/system/RUNTIME-IDENTITY-v0.1.md`

Use these to design the new characterization system. Do not automatically inherit old runtime qualification into the new implementation.

The runtime characterization must separately identify:

- deterministic core health;
- Gemini capability health;
- resolved Gemini model per capability;
- credential mode (platform/BYOK/local-only) without recording secrets;
- Ollama capability health;
- whether fallback was actually exercised;
- P1 export renderer identity;
- claim parity across supported export formats.

## 08 — Release gates

Primary material:

- `docs/system/RELEASE-GATE-v0.1.md`
- `docs/release/BROWSER_ACCEPTANCE_MATRIX_v1.md`
- `docs/release/RELEASE_SURFACE_AUDIT_v1.md`
- `docs/ats-v2/baseline/EXECUTION_EVIDENCE.md`
- `docs/vnext/05-TRUTH-PRESERVING-PRESENTATION.md`

Release rule:

```text
CI green
    !=
product ready
```

The rebuild reaches release only when the full user story and its failure/degradation paths have executable receipts on an identified runtime.

Release evidence must include:

- platform-key secret isolation;
- BYOK non-persistence;
- BYOK HTTPS enforcement;
- Gemini-primary routing receipts;
- Gemini→Ollama fallback receipt;
- complete-AI-outage degradation receipt;
- cost/retry budget enforcement;
- P1 truth-preserving presentation regressions;
- DOCX/PDF/TXT/provenance JSON parity;
- real browser presentation review/approval flow;
- identified-runtime export receipt.

## Historical implementation archive

`archive/current-implementation/` contains the README and Quick Start from the previous implementation.

These files may contain stale runtime/model assumptions. They are kept to understand what was tried, not to dictate the new stack.

## Working rule

Before production implementation of a new node, that node must have:

1. a purpose;
2. an input/output contract;
3. a truth boundary;
4. acceptance criteria;
5. at least one executable fixture or planned quarry;
6. a clear definition of done.

P1 now satisfies the contract-definition prerequisite in `docs/vnext/05-TRUTH-PRESERVING-PRESENTATION.md` and is authorized for implementation.

Then we build in dependency order instead of repeatedly rebuilding architecture around symptoms.
