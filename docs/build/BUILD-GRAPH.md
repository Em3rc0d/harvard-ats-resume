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
B0.5                           CLOSED
B1                             CLOSED
B2                             CLOSED
B3                             CLOSED
B4                             READY_TO_BUILD
B5                             BLOCKED_BY_B4
B6                             BLOCKED_BY_B5
B7                             BLOCKED_BY_B6
B8                             BLOCKED_BY_B4_B5_B6_B7
CVENGINE_V1_0_0                BLOCKED_BY_B8
```

## Contract status

All current rebuild contracts through B8 are signed in `docs/build/CONTRACT-SIGNOFF.md`.

```text
CONTRACTS_SIGNED = YES
RELEASE_READY    = NO
```

A signed contract is frozen specification; it does not imply the corresponding implementation node is complete.

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
CONSTRUCTION_CI                  PASS
STATUS                           CLOSED
```

Receipt: `docs/build/B0.5-CLOSURE.md`.

## B1 — Career Evidence core

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
CONSTRUCTION_CI                  PASS
STATUS                           CLOSED
```

Receipt: `docs/build/B1-CLOSURE.md`.

## B2 — Target and Job truth

```text
CAREER_TARGET_DOMAIN                    PASS
TARGET_SEMANTIC_IDENTITY                PASS
MULTIPLE_TARGET_DIRECTIONS              PASS
ONE_ACTIVE_TARGET_PER_OWNER             PASS
JOB_SNAPSHOT_DOMAIN                     PASS
JOB_REQUIREMENT_DOMAIN                  PASS
DETERMINISTIC_JOB_INTELLIGENCE          PASS
CANDIDATE_VS_MARKET_TRUTH_SEPARATION    PASS
SOURCE_TEXT_PROVENANCE                  PASS
DB_HASH_AND_SEMANTIC_KEY_VERIFICATION   PASS
CLIENT_TRUST_BOUNDARY                   PASS
OWNER_SCOPED_RLS                        PASS
CROSS_USER_IDOR_DENIAL                  PASS
ANONYMOUS_MUTATION_DENIAL               PASS
IMMUTABLE_JOB_TRUTH                     PASS
ATOMIC_JOB_PERSISTENCE                  PASS
AUTHENTICATED_API_WIRING                PASS
B2_UI_PATH                              PASS
STATIC_CONTRACT_TESTS                   PASS
CLEAN_DB_MIGRATION_GATE                 PASS
PHYSICAL_TARGET_GATE                    PASS
PHYSICAL_JOB_TRUTH_GATE                 PASS
FRESH_CONNECTION_READBACK               PASS
B1_REGRESSION_GATE                      PASS
CONSTRUCTION_CI                         PASS
STATUS                                  CLOSED
```

Receipt: `docs/build/B2-CLOSURE.md`.

## B3 — Evidence-backed Assessment

```text
REQUIREMENT_MATCH_DOMAIN                 PASS
MATCH_POTENTIAL_UNKNOWN_ENGINE           PASS
GAP_BLOCKER_EVIDENCE_GUARD               PASS
UNKNOWN_ONLY_UNSUPPORTED_STATE           PASS
MATCH_REPORT                              PASS
OPPORTUNITY_ASSESSMENT                    PASS
NO_HIRING_PROBABILITY_THEATER             PASS
CAREER_EVIDENCE_PROVENANCE_SNAPSHOT       PASS
SEMANTIC_REPLAY_IDEMPOTENCE               PASS
HISTORICAL_ASSESSMENT_PRESERVATION        PASS
CLIENT_TRUST_BOUNDARY                     PASS
OWNER_SCOPED_RLS                          PASS
CROSS_USER_IDOR_DENIAL                    PASS
ANONYMOUS_RPC_DENIAL                      PASS
DIRECT_CLIENT_WRITE_DENIAL                PASS
CLEAN_DB_MIGRATION_GATE                   PASS
FRESH_CONNECTION_READBACK                 PASS
B1_REGRESSION_GATE                        PASS
B2_REGRESSION_GATE                        PASS
CONSTRUCTION_CI                           PASS
STATUS                                    CLOSED
```

Final implementation head before promotion:

```text
head_sha      aa7d40e0744e47bc794c768dbd88270ad7182d00
construction  33359163193 success
b1_postgres   33359163195 success
b2_postgres   33359163192 success
b3_postgres   33359163184 success
```

Receipt: `docs/build/B3-CLOSURE.md`.

## B4 — ResumeVersion

Contract: `SIGNED`.
Implementation: `READY_TO_BUILD`.

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

Contract: `SIGNED`.
Implementation: `BLOCKED_BY_B4`.

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

Contract: `SIGNED`.
Implementation: `BLOCKED_BY_B5`.

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

Contract: `SIGNED`.
Implementation: `BLOCKED_BY_B6`.

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

Contract: `SIGNED`.
Implementation: `BLOCKED` until B4–B7 are closed.

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

The ledger promotion itself is valid only while its required GitHub checks remain green. New contradictory evidence reopens the affected node under `CLOSURE-PROTOCOL.md`.
