# CV Engine vNext — Build Readiness Audit

Status: **AUTHORITATIVE GO/NO-GO REVIEW**

Date: 2026-08-26

## 1. Question

Can CV Engine now be rebuilt from an empty application tree and taken to production primarily from the documentation, without recreating major architecture decisions as ad-hoc implementation choices?

## 2. Verdict

```text
READY TO START FOUNDATION DESIGN / B0            YES
READY TO BUILD TRUSTED DOMAIN CORE               ALMOST — close production foundation gates first
READY TO CODE STRAIGHT THROUGH TO PRODUCTION     NO — several production contracts remain unresolved
PRODUCT / TRUTH ARCHITECTURE                      STRONG
AI / PROVIDER / BYOK ARCHITECTURE                 STRONG ENOUGH TO IMPLEMENT ABSTRACTION
TEST / FAILURE / RELEASE DISCIPLINE               STRONG
PRODUCTION IDENTITY / DATA / TOPOLOGY             NOT YET FROZEN
```

This is a **GO for the zero-based rebuild program**, but not a license to start feature coding before the remaining production-foundation decisions are frozen.

The correct next action is a short `PF0 — Production Foundation Closure` documentation pass, then B0 implementation.

## 3. Green — decisions strong enough to build from

### 3.1 Product direction

The beachhead and harbor are clear:

```text
Application Intelligence
        ↓
Opportunity Intelligence
        ↓
Career Opportunity Intelligence
```

The durable product asset is the Career Model / Career Evidence, not one resume document.

### 3.2 Truth architecture

Strong, repeated, and consistent:

```text
Career Evidence = candidate authority
Job Snapshot    = market truth
Career Target   = intent
Assessment      = derived analysis
ResumeVersion   = presentation/projection
AI output       = bounded proposal
```

The rebuild has explicit prohibitions against Job Description leakage, unsupported candidate facts, fabricated metrics/skills/projects/dates/credentials, and provider output becoming truth merely because it is syntactically valid.

### 3.3 Core build order

The B0-B8 order fixes a central weakness of the first implementation: import/AI no longer sits underneath the entire product.

Manual Career Evidence and deterministic trusted flows are built before importer sophistication.

### 3.4 Import boundary

The preferred importer architecture is coherent:

```text
mechanical extraction
→ deterministic structure
→ source-exact recovery
→ bounded AI only for ambiguity
→ source reconciliation
→ reviewable proposal
```

Safe manual fallback is part of the product contract.

### 3.5 First-run trust / AI-access boundary

Disclaimer, acknowledgement, platform Gemini access, BYOK, and no-cloud modes have explicit contracts and test criteria.

### 3.6 BYOK security boundary

Strong enough to implement:

- browser-memory-only secret state;
- HTTPS outside localhost;
- request-scoped server handling;
- no storage/logging/telemetry;
- provider-adapter isolation;
- canary tests;
- no misleading promise that the server never receives the key.

### 3.7 AI Gateway architecture

Strong enough to implement an abstraction:

- capability-specific routing;
- Gemini primary;
- Ollama fallback;
- bounded attempts/deadlines;
- normalized provider errors;
- provider/model provenance;
- cost/rate controls;
- provider availability never changes truth acceptance rules.

### 3.8 Initial Gemini routing

The supplied quota snapshot plus current model documentation is sufficient to freeze an implementation baseline:

```text
high-volume default      gemini-3.5-flash-lite
quality escalation       gemini-3.7-flash
Gemini reserve           gemini-3.6-flash
compat/capacity reserve  gemini-3.1-flash-lite
local fallback           Ollama
```

Exact model qualification still requires B6 benchmarks.

### 3.9 Failure / test / release doctrine

The repository already contains strong historical material for:

- canonical personas;
- truth invariants;
- degradation matrices;
- failure taxonomy;
- runtime identity;
- browser acceptance;
- real-world corpus discipline;
- evidence-backed release gates.

These should be reimplemented as vNext executable gates rather than copied mechanically.

## 4. Yellow — must be frozen before trusted-core feature implementation

### PF0-01 — Identity, account, tenant, and authorization model

Unresolved production questions:

- Is first release anonymous/local-only, account-based SaaS, or both?
- What owns a CareerVault?
- How is one user's Career Evidence isolated from another user's?
- What authentication/session mechanism protects server mutations?
- How are consent versions tied to a user/session?
- What is the account deletion/export contract?

A production CareerVault cannot be implemented safely without an ownership/authorization model.

**Required document:** `05-IDENTITY-AND-SESSION-CONTRACT.md`

### PF0-02 — Durable datastore and data lifecycle

The semantic model is strong, but the new implementation has not frozen:

- primary durable datastore;
- exact entity/schema/versioning strategy;
- transaction boundaries;
- migration policy;
- optimistic concurrency/idempotency where needed;
- backup/restore expectations;
- data retention/deletion/export;
- whether uploaded source files are retained or processed ephemerally;
- whether Redis is required at all in vNext or only optional infrastructure.

The first implementation's Redis topology is historical evidence, not automatically the new datastore decision.

**Required document:** `06-DATA-PERSISTENCE-AND-LIFECYCLE.md`

### PF0-03 — Production runtime topology

The logical provider contract says Gemini → Ollama fallback, but hosted Ollama has real infrastructure implications.

We must freeze separate topology semantics for:

```text
LOCAL / SELF-HOSTED
Gemini → local Ollama → deterministic/manual degradation

HOSTED PRODUCT
Gemini → ? hosted Ollama worker ? → deterministic/manual degradation
```

Questions to resolve:

- Is Ollama a mandatory hosted fallback or only supported where a local worker exists?
- If hosted, where does it run and can it scale to zero?
- What is the acceptable cold-start cost/latency?
- Does keeping Ollama online cost more than the Gemini failures it is intended to cover?
- What happens if Gemini is unavailable and no Ollama worker is provisioned?

Provider fallback cannot be called production-ready until its physical topology is specified and later measured.

**Required document:** `07-RUNTIME-TOPOLOGY-AND-DEPLOYMENT-CONTRACT.md`

### PF0-04 — Production AI quota/cost policy

The user-provided quota snapshot is excellent development evidence but is not a production budget.

Must freeze:

- dedicated CV Engine Gemini project/key policy;
- per-user/session platform-key limits;
- per-capability cloud attempt limits;
- quality-escalation allowance;
- cost ceiling / budget guard behavior;
- what happens at daily quota exhaustion;
- usage accounting dimensions;
- BYOK model-availability discovery behavior;
- paid-tier transition criteria.

The current free-tier snapshot should be treated as dogfood/small-beta capacity only.

**Required document:** `08-AI-QUOTA-COST-AND-ABUSE-POLICY.md`

### PF0-05 — Security / observability / privacy engineering baseline

BYOK handling is strong, but whole-product production security still needs a unified contract for:

- request/body/PII logging policy;
- secret redaction before telemetry;
- CSP/security headers;
- CSRF/session mutation protection where relevant;
- upload MIME/size/content validation;
- rate limiting / abuse boundaries;
- dependency and supply-chain gates;
- error-reporting data classification;
- audit events without career-content leakage;
- security incident / credential exposure handling.

**Required document:** `09-SECURITY-OBSERVABILITY-PRIVACY-BASELINE.md`

## 5. Yellow — required before the corresponding feature, not before B0

### UX state machine

Existing design material is strong, but before frontend implementation we should consolidate one canonical screen/state map from:

```text
first run
→ evidence entry/import
→ evidence review
→ target
→ job/assessment
→ resume version
→ provenance/export
```

This prevents UI state from becoming the hidden product state machine.

### Export contract

Before B4, freeze:

- first-release export formats;
- deterministic template/version identity;
- accessibility/text-selectability expectations;
- ATS-friendly document constraints;
- export provenance behavior.

### Public legal copy

The architecture can proceed without final lawyer-approved wording, but public release must have reviewed privacy/terms/disclaimer copy consistent with actual data flows. The technical disclaimer is not a liability waiver.

## 6. Red — things we must not do

Do not begin the new app by copying old `app/`, `lib/`, Docker, or Redis code.

Do not choose a datastore because the previous implementation already used it.

Do not make Ollama a mandatory hosted dependency without a cost/topology decision.

Do not treat the supplied Gemini free-tier quota as a production SLA.

Do not make model availability determine whether Career Evidence can exist.

Do not implement authentication after trusted multi-user persistence has already been designed around anonymous data.

Do not build frontend screens before the domain/application contracts they represent exist.

## 7. PF0 closure gate

Before the first trusted-core feature branch begins, the following documents must be authoritative:

```text
03-GEMINI-MODEL-MATRIX.md                 DONE (baseline; benchmark later)
05-IDENTITY-AND-SESSION-CONTRACT.md       REQUIRED
06-DATA-PERSISTENCE-AND-LIFECYCLE.md      REQUIRED
07-RUNTIME-TOPOLOGY-AND-DEPLOYMENT.md     REQUIRED
08-AI-QUOTA-COST-ABUSE-POLICY.md          REQUIRED
09-SECURITY-OBSERVABILITY-PRIVACY.md      REQUIRED
```

B0 may create the empty repository/tooling skeleton while PF0 is being completed, but B1 Career Evidence durability should not be committed until PF0-01 and PF0-02 are frozen.

## 8. Recommended execution

```text
NOW
  ↓
PF0 Production Foundation Closure
  ↓
B0 empty app + typed domain contracts + CI
  ↓
B1 manual Career Evidence + durable ownership
  ↓
B2 target/job truth
  ↓
B3 deterministic assessment
  ↓
B4 deterministic ResumeVersion/export
  ↓
B5 import convenience
  ↓
B6 Gemini/Ollama bounded AI benchmarks + implementation
  ↓
B7 market extension
  ↓
B8 identified-runtime production qualification
```

## 9. Final answer

The documentation is **strong enough to justify rebuilding from zero**.

It is **not yet complete enough to promise a straight, architecture-decision-free path all the way to production**.

That gap is small and identifiable: close PF0 first.

After PF0 is frozen, the project should move into implementation and stop adding broad architecture layers unless executable evidence demonstrates a genuinely missing system boundary.
