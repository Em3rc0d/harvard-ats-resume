# CV Engine — Canonical Build Graph

Status: **AUTHORITATIVE CONSTRUCTION LEDGER**

Closure policy: `docs/build/CLOSURE-PROTOCOL.md`
Contract sign-off: `docs/build/CONTRACT-SIGNOFF.md`

This file is the single status ledger for the zero-based rebuild. Historical PRs, archived implementation notes and older status documents do not override it.

## Current graph

```text
Documentation / architecture   CLOSED
PF0                            CLOSED
B0                             CLOSED
B0.5                           CANDIDATE
B1                             CANDIDATE
B2                             BLOCKED_BY_B1
B3                             BLOCKED_BY_B2
B4                             BLOCKED_BY_B3
B5                             BLOCKED_BY_B4
B6                             BLOCKED_BY_B5
B7                             BLOCKED_BY_B6
B8                             BLOCKED_BY_B1_B2_B3_B4_B5_B6_B7
CVENGINE_V1_0_0                BLOCKED_BY_B8
```

`CANDIDATE` means the implementation and closure gate exist, but the exact final branch head must be green before the node is promoted to `CLOSED`.

## Signed contracts

The product, truth, identity, persistence, runtime, AI, security and B2–B8 build contracts are signed in `docs/build/CONTRACT-SIGNOFF.md`. Signing a contract does not assert implementation completion.

## PF0

```text
CONTRACT_SIGNED              PASS
DECISIONS_FROZEN             PASS
IMPLEMENTATION_AUTHORIZED    PASS
PRODUCTION_QUALIFIED         NOT_APPLICABLE_AT_PF0
STATUS                       CLOSED
```

Authority: `docs/vnext/04-BUILD-READINESS-AUDIT.md`.

## B0 — Repository and contracts

```text
CLEAN_APP_BASELINE   PASS
LOCKFILE             PASS
TYPECHECK            PASS
LINT                 PASS
UNIT_TEST            PASS
NEXT_BUILD            PASS
CI_EXACT_HEAD        PASS
NO_LEGACY_COPY       PASS
STATUS               CLOSED
```

Receipt: `docs/build/B0-FOUNDATION-STATUS.md`.

## B0.5 — First-run trust + AI access foundation

Implemented:

```text
TRUST_DISCLOSURE                 PASS
EXPLICIT_ACKNOWLEDGEMENT         PASS
AUTHENTICATED_SESSION_BOUNDARY   PASS
CONSENT_RECEIPT                  PASS
AI_MODE_SELECTION                PASS
NO_CLOUD_PATH                    PASS
BYOK_MEMORY_ONLY_STORE           PASS
PLATFORM_KEY_SERVER_ONLY_SCHEMA  PASS
BYOK_REMOTE_HTTP_REFUSAL         PASS
LOOPBACK_HTTP_EXCEPTION          PASS
AI_GATEWAY_FOUNDATION_INTERFACE  PASS
MODEL_ROUTE_FOUNDATION           PASS
EXECUTABLE_CONTRACT_TESTS        PASS
```

Dynamic provider-path secret certification is inherited by B6/B8 because B0.5 contains the provider foundation, not provider network execution.

Status: `CANDIDATE` pending exact-final-head construction CI.

Receipt: `docs/build/B0.5-CLOSURE.md`.

## B1 — Career Evidence core

Implemented:

```text
CAREER_EVIDENCE_DOMAIN           PASS
OWNER_SCOPED_SCHEMA              PASS
REVISIONED_STORAGE_MODEL         PASS
RLS_DEFINED                      PASS
OPTIMISTIC_CONCURRENCY           PASS
MANUAL_CREATE                    PASS
LIST_CURRENT                     PASS
REVISE                           PASS
DELETE                           PASS
AUTHENTICATED_API_WIRING         PASS
CAREER_EVIDENCE_UI               PASS
STATIC_CONTRACT_TESTS            PASS
CLEAN_DB_MIGRATION_GATE          PASS
REAL_RLS_A_VS_B_GATE             PASS
ANONYMOUS_DENIAL_GATE            PASS
REVISION_HISTORY_GATE            PASS
STALE_REVISION_CONFLICT_GATE     PASS
CONCURRENT_REVISION_RACE_GATE    PASS
ATOMIC_ROLLBACK_GATE             PASS
DURABLE_READBACK_GATE            PASS
JOB_DESCRIPTION_REJECTION_GATE   PASS
```

First physical PostgreSQL receipt: workflow run `33353818973`, successful on head `b933fa2d44a25597deb469a613e6e5fd5f4aeedd`.

Status: `CANDIDATE` pending exact-final-head construction + PostgreSQL gates.

Receipt: `docs/build/B1-CLOSURE.md`.

## B2 — Target and Job truth

Signed contract, implementation blocked until B1 closes.

Required vertical slice:

```text
CareerTarget
JobSnapshot / JobIntelligence
JobRequirement
candidate-truth vs market-truth separation
deterministic requirement representation
persistence + ownership
API/application wiring
UI path
tests + runtime evidence
```

## B3 — Assessment

Signed contract, implementation blocked until B2 closes.

Required vertical slice:

```text
RequirementMatch
MATCH / POTENTIAL_MATCH / GAP / UNKNOWN / BLOCKER
MatchReport
explicit missing requirements
explainable rationale
OpportunityAssessment
no hiring-probability theater
```

## B4 — ResumeVersion

Signed contract, implementation blocked until B3 closes.

Required vertical slice:

```text
source-preserving deterministic composition
claim-to-assertion/evidence provenance
atomic immutable ResumeVersion
manifest/version metadata
general + targeted resume
renderer/export
```

## B5 — Trusted import convenience

Signed contract, implementation blocked until B4 closes.

Required vertical slice:

```text
PDF/DOCX mechanical extraction
deterministic structure first
bounded ambiguity assistance only
source reconciliation
reviewable evidence proposal
manual fallback
temporary source lifecycle
```

## B6 — AI assistance runtime

Signed contract, implementation blocked until B5 closes.

Required vertical slice:

```text
Gemini-primary AI Gateway runtime
capability-specific model cascade
Ollama fallback
platform/BYOK/no-cloud credential modes
attempt/deadline/token/cost controls
normalized provider failures
non-secret execution provenance
secret-canary certification
capability/model benchmarks
safe total-outage degradation
```

## B7 — Opportunity Space / market extension

Signed contract, implementation blocked until B6 closes.

Required vertical slice:

```text
multi-opportunity comparison
market observation lifecycle
controlled acquisition/refresh
historical market persistence
candidate retrieval + selected-candidate analysis
truth-safe market/candidate boundary
```

## B8 — Release hardening

Signed contract, implementation blocked until all product nodes are closed.

Required release evidence:

```text
canonical personas
golden datasets
fault injection
browser E2E
runtime identity
security regression
RLS/IDOR certification
provider fallback certification
secret canary
backup/restore drill
export/delete lifecycle
performance/capacity evidence
production deployment receipts
```

## v1.0.0 release equation

```text
CVENGINE_V1_0_0 =
  B0_CLOSED
  && B0_5_CLOSED
  && B1_CLOSED
  && B2_CLOSED
  && B3_CLOSED
  && B4_CLOSED
  && B5_CLOSED
  && B6_CLOSED
  && B7_CLOSED
  && B8_CLOSED
```

Only then may the release ledger state:

```text
RELEASE_READY = YES
PRODUCTION_QUALIFIED = YES
```
