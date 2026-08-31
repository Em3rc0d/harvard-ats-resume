# CV Engine — Canonical Build Graph

Status: **AUTHORITATIVE CONSTRUCTION LEDGER**

Closure policy: `docs/build/CLOSURE-PROTOCOL.md`

This file is the single status ledger for the zero-based rebuild. Historical PRs, archived implementation notes and older status documents do not override it.

## Current graph

```text
Documentation / architecture   CLOSED
PF0                            CLOSED
B0                             CLOSED
B0.5                           BLOCKED_WITH_RECEIPT
B1                             BLOCKED_WITH_RECEIPT
B2                             BLOCKED_BY_B1
B3                             BLOCKED_BY_B2
B4                             BLOCKED_BY_B3
B5                             BLOCKED_BY_B4
B6                             BLOCKED_BY_B5
B7                             BLOCKED_BY_B6
B8                             BLOCKED_BY_B1_B2_B3_B4_B5_B6_B7
CVENGINE_V1_0_0                BLOCKED_BY_B8
```

## Signed contracts

The following architecture/product contracts are frozen unless new executable evidence forces a revision:

- `REBUILD-CONTRACT.md`
- `docs/vnext/00-FIRST-RUN-TRUST-AND-AI-ACCESS.md`
- `docs/vnext/01-AI-PROVIDER-ROUTING.md`
- `docs/vnext/02-BYOK-SECRET-HANDLING.md`
- `docs/vnext/03-GEMINI-MODEL-MATRIX.md`
- `docs/vnext/05-IDENTITY-AND-SESSION-CONTRACT.md`
- `docs/vnext/06-DATA-PERSISTENCE-AND-LIFECYCLE.md`
- `docs/vnext/07-RUNTIME-TOPOLOGY-AND-DEPLOYMENT-CONTRACT.md`
- `docs/vnext/08-AI-QUOTA-COST-AND-ABUSE-POLICY.md`
- `docs/vnext/09-SECURITY-OBSERVABILITY-PRIVACY-BASELINE.md`
- `docs/vnext/10-ULTRAPREMIUM-UI-MOTION-QUALITY-BAR.md`

The contracts are signed as specifications. Signing them does **not** imply their implementation node is closed.

## PF0

```text
CONTRACT_SIGNED      PASS
DECISIONS_FROZEN     PASS
IMPLEMENTATION_AUTHORIZED PASS
PRODUCTION_QUALIFIED NOT_APPLICABLE_AT_PF0
STATUS               CLOSED
```

Authority: `docs/vnext/04-BUILD-READINESS-AUDIT.md`.

## B0 — Repository and contracts

```text
CLEAN_APP_BASELINE   PASS
LOCKFILE             PASS
TYPECHECK             PASS
LINT                  PASS
UNIT_TEST             PASS
NEXT_BUILD            PASS
CI_EXACT_HEAD         PASS
NO_LEGACY_COPY        PASS
STATUS                CLOSED
```

Qualified through the successful construction workflow on rebuild head `89418e21faf7192126df1dfe60822ed1828ad773` and inherited by this closure branch unless later changes break B0 verification.

Receipt: `docs/build/B0-FOUNDATION-STATUS.md`.

## B0.5 — First-run trust + AI access foundation

Implemented today:

```text
TRUST_DISCLOSURE                 PASS
EXPLICIT_ACKNOWLEDGEMENT         PASS
AUTHENTICATED_SESSION_BOUNDARY   PASS
CONSENT_RECEIPT                  PASS
AI_MODE_SELECTION                PASS
NO_CLOUD_PATH                    PASS
BYOK_MEMORY_ONLY_STORE           PASS
PLATFORM_KEY_SERVER_ONLY_SCHEMA  PASS
```

Closure blockers:

```text
BYOK_REMOTE_HTTP_REFUSAL         REQUIRED
BYOK_SECRET_CANARY               REQUIRED
FIRST_RUN_EXECUTABLE_GATE        REQUIRED
AI_GATEWAY_FOUNDATION_INTERFACE  REQUIRED
MODEL_ROUTE_FOUNDATION           REQUIRED
```

Runtime provider invocation, retry/fallback benchmarks and full provider secret-path certification belong to B6/B8 and must not be falsely pulled forward into B0.5.

Status: `BLOCKED_WITH_RECEIPT` until `docs/build/B0.5-CLOSURE.md` reaches PASS.

## B1 — Career Evidence core

Implemented today:

```text
CAREER_EVIDENCE_DOMAIN       PASS
OWNER_SCOPED_SCHEMA          PASS
REVISIONED_STORAGE_MODEL     PASS
RLS_DEFINED                  PASS
OPTIMISTIC_CONCURRENCY       PASS
MANUAL_CREATE                PASS
LIST_CURRENT                 PASS
REVISE                       PASS
DELETE                       PASS
AUTHENTICATED_API_WIRING     PASS
CAREER_EVIDENCE_UI           PASS
STATIC_CONTRACT_TESTS        PASS
```

Required physical closure evidence:

```text
CLEAN_DB_MIGRATION           REQUIRED
REAL_RLS_USER_A_VS_USER_B    REQUIRED
ANONYMOUS_DENIAL             REQUIRED
REVISION_HISTORY             REQUIRED
STALE_REVISION_CONFLICT      REQUIRED
CONCURRENT_REVISION_RACE     REQUIRED
ATOMIC_ROLLBACK              REQUIRED
DURABLE_READBACK             REQUIRED
JOB_DESCRIPTION_REJECTION    REQUIRED
CI_EXECUTES_DATABASE_GATE    REQUIRED
```

Status: `BLOCKED_WITH_RECEIPT` until `docs/build/B1-CLOSURE.md` reaches PASS.

## B2 — Target and Job truth

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

Status: `BLOCKED_BY_B1`.

## B3 — Assessment

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

Status: `BLOCKED_BY_B2`.

## B4 — ResumeVersion

Required vertical slice:

```text
source-preserving deterministic composition
claim-to-assertion/evidence provenance
atomic immutable ResumeVersion
manifest/version metadata
general + targeted resume
renderer/export
```

Status: `BLOCKED_BY_B3`.

## B5 — Trusted import convenience

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

Status: `BLOCKED_BY_B4`.

## B6 — AI assistance runtime

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

Status: `BLOCKED_BY_B5`.

## B7 — Opportunity Space / market extension

Required vertical slice:

```text
multi-opportunity comparison
market observation lifecycle
controlled acquisition/refresh
historical market persistence
candidate retrieval + selected-candidate analysis
truth-safe market/candidate boundary
```

Status: `BLOCKED_BY_B6`.

## B8 — Release hardening

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

Status: `BLOCKED`.

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
