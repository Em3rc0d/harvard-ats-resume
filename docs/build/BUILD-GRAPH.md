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
B4                             CLOSED
B5                             CLOSED
B6                             CLOSED
B7                             READY_TO_BUILD
B8                             BLOCKED_BY_B7
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

Receipt: `docs/build/B3-CLOSURE.md`.

## B4 — ResumeVersion

```text
DETERMINISTIC_COMPOSITION                 PASS
SOURCE_PRESERVING_TRUSTED_CLAIMS          PASS
VERIFIED_EVIDENCE_ONLY                    PASS
JOB_TRUTH_NEVER_BECOMES_CANDIDATE_CLAIM  PASS
GENERAL_TARGETED_BOUNDARY                 PASS
TARGETED_ASSESSMENT_PROVENANCE            PASS
CLAIM_TO_EVIDENCE_ID_REVISION             PASS
HASHED_PROVENANCE                         PASS
MANIFEST_DOCUMENT_CLAIM_CONSISTENCY       PASS
IMMUTABLE_RESUME_VERSION                  PASS
IMMUTABLE_RESUME_CLAIMS                   PASS
SEMANTIC_REPLAY_IDEMPOTENCE               PASS
HISTORICAL_VERSION_PRESERVATION           PASS
ATOMIC_VERSION_PLUS_CLAIMS                PASS
FAULT_INJECTION_ROLLBACK                  PASS
OWNER_SCOPED_RLS                          PASS
CROSS_USER_READ_DENIAL                    PASS
ANONYMOUS_RPC_DENIAL                      PASS
DIRECT_CLIENT_WRITE_DENIAL                PASS
TEXT_EXPORT                               PASS
PROVENANCE_JSON_EXPORT                    PASS
FRESH_CONNECTION_DURABLE_READBACK         PASS
B1_REGRESSION                             PASS
B2_REGRESSION                             PASS
B3_REGRESSION                             PASS
CONSTRUCTION                              PASS
STATUS                                    CLOSED
```

Receipt: `docs/build/B4-CLOSURE.md`.

## B5 — Trusted import convenience

```text
PDF_BOUNDED_MECHANICAL_EXTRACTION       PASS
DOCX_BOUNDED_MECHANICAL_EXTRACTION      PASS
UNSUPPORTED_DOCUMENT_FAIL_CLOSED        PASS
RAW_SOURCE_BYTES_NOT_DURABLE            PASS
SOURCE_AND_TEXT_HASH_RECEIPTS            PASS
DETERMINISTIC_REVIEW_PROPOSALS          PASS
IMPORT_REPLAY_IDEMPOTENCE               PASS
EXPLICIT_USER_REVIEW                    PASS
CLIENT_CANNOT_REPLACE_PROPOSAL_TEXT     PASS
ACCEPTANCE_TRANSACTIONAL                PASS
IMPORTED_RESUME_PROVENANCE              PASS
ACCEPTED_STATUS_NEEDS_REVIEW            PASS
IMPORT_NEVER_AUTO_VERIFIES              PASS
DISMISSED_PROPOSAL_DENIAL               PASS
HASH_MISMATCH_ATOMIC_ROLLBACK           PASS
MANUAL_FALLBACK                         PASS
OWNER_SCOPED_RLS                        PASS
CROSS_USER_IDOR_DENIAL                  PASS
ANONYMOUS_MUTATION_DENIAL               PASS
B1_REGRESSION                           PASS
B2_REGRESSION                           PASS
B3_REGRESSION                           PASS
B4_REGRESSION                           PASS
CONSTRUCTION                            PASS
STATUS                                  CLOSED
```

Receipt: `docs/build/B5-CLOSURE.md`.

## B6 — AI assistance runtime

```text
GEMINI_PRIMARY_RUNTIME                  PASS
CAPABILITY_MODEL_CASCADE               PASS
OLLAMA_FALLBACK_PROTOCOL               PASS
PLATFORM_BYOK_NO_CLOUD_MODES           PASS
BYOK_REQUEST_SCOPED                    PASS
NO_CLOUD_SKIPS_GEMINI                  PASS
ATTEMPT_LIMITS                         PASS
PER_ATTEMPT_TIMEOUT                    PASS
WHOLE_OPERATION_DEADLINE               PASS
INPUT_OUTPUT_TOKEN_BUDGETS             PASS
PAID_COST_CAPS                         PASS
PRICING_CONTRACT_EXPIRY_FAIL_CLOSED    PASS
NORMALIZED_PROVIDER_FAILURES           PASS
NON_SECRET_PROVENANCE                  PASS
GEMINI_SECRET_CANARY                   PASS
OLLAMA_NEVER_RECEIVES_GEMINI_SECRET    PASS
PROVIDER_ERROR_SECRET_REDACTION        PASS
SAFE_TOTAL_OUTAGE_DEGRADATION          PASS
TRUSTED_CORE_AI_OPTIONAL               PASS
ASSESSMENT_AI_EXPLANATION_WIRED        PASS
SERVER_OWNED_SYSTEM_INSTRUCTIONS       PASS
B1_B2_B3_B4_B5_REGRESSION             PASS
CONSTRUCTION                           PASS
B6_AI_RUNTIME_GATE                     PASS
STATUS                                 CLOSED
```

Final implementation head before promotion:

```text
head_sha      78bb000a634c6ebf5946e4b0162ae6591598fe9a
construction  33509286148 success
b1_postgres   33509286145 success
b2_postgres   33509286196 success
b3_postgres   33509286168 success
b4_postgres   33509286113 success
b5_postgres   33509286126 success
b6_ai_runtime 33509286265 success
```

Receipt: `docs/build/B6-CLOSURE.md`.

## B7 — Opportunity Space / market extension

Contract: `SIGNED`.
Implementation: `READY_TO_BUILD`.

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
Implementation: `BLOCKED` until B7 is closed.

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
