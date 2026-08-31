# B2 — Target and Job Truth Closure

Status: **CLOSED — implementation and physical contract proven**

Contract authority:

- `REBUILD-CONTRACT.md`
- `docs/build/CONTRACT-SIGNOFF.md`
- `docs/market-v0.1/MARKET-03-CAREER-TARGET.md`
- `docs/market-v0.1/MARKET-04B-05-JOB-INTELLIGENCE-PROJECTION.md`

## Closed vertical slice

```text
CareerTarget
JobSnapshot
JobRequirement
deterministic Job Intelligence
candidate-truth vs market-truth separation
semantic identity
persistence + ownership
API/application wiring
UI path
executable contracts
physical PostgreSQL evidence
```

## Truth boundary

B2 preserves three different authorities:

```text
CareerEvidence = candidate fact
CareerTarget   = candidate intent
JobSnapshot    = market fact
```

The following are release invariants:

1. A Career Target never proves that the candidate has a skill, credential, seniority, location capability or experience.
2. A Job Description never becomes Career Evidence.
3. Job metadata such as role title or company never becomes a JobRequirement unless the requirement is independently present in the authorized Job Description text.
4. A persisted JobRequirement must preserve its exact source text and source-text SHA-256.
5. Client input cannot provide `ownerUserId`, semantic hashes or preinterpreted requirements.
6. B2 performs no candidate matching and makes no hiring-probability or Opportunity Assessment claim.

## CareerTarget evidence

The B2 target contract provides:

```text
MULTIPLE_SEMANTIC_DIRECTIONS_PRESERVED   PASS
SEMANTIC_REPLAY_IDEMPOTENT               PASS
ONE_ACTIVE_TARGET_PER_OWNER              PASS
EXPLICIT_ACTIVATION                      PASS
SEMANTIC_FIELDS_IMMUTABLE                PASS
OWNER_DERIVED_FROM_AUTH_SESSION          PASS
DIRECT_CLIENT_MUTATION_DENIED            PASS
CROSS_USER_ACTIVATION_DENIED             PASS
ANONYMOUS_MUTATION_DENIED                PASS
```

Target semantic identity is deterministic and excludes activation state, so selecting an existing direction does not rewrite its meaning or duplicate it.

## Job truth evidence

The B2 Job Snapshot contract provides:

```text
MANUAL_JOB_DESCRIPTION_AUTHORITY         PASS
DETERMINISTIC_REQUIREMENT_EXTRACTION     PASS
ROLE_COMPANY_METADATA_NOT_REQUIREMENTS   PASS
SOURCE_TEXT_PRESERVED                    PASS
SOURCE_TEXT_SHA256_VERIFIED              PASS
REQUIREMENT_SEMANTIC_KEY_VERIFIED        PASS
SNAPSHOT_SEMANTIC_KEY_VERIFIED           PASS
UNSUPPORTED_REQUIREMENT_REJECTED         PASS
IMMUTABLE_JOB_SNAPSHOT                   PASS
IMMUTABLE_JOB_REQUIREMENTS               PASS
SEMANTIC_REPLAY_IDEMPOTENT               PASS
ATOMIC_SNAPSHOT_REQUIREMENT_WRITE        PASS
JOB_TRUTH_NEVER_MUTATES_CAREER_EVIDENCE  PASS
```

The database independently recomputes trusted hashes and semantic keys. It does not trust hashes or requirements supplied by a browser.

## Persistence and ownership evidence

Workflow:

```text
.github/workflows/b2-db-ci.yml
```

The gate starts PostgreSQL 16, bootstraps the minimum Supabase Auth semantics used by migrations, applies every versioned migration to a clean database and executes the B2 contracts against real PostgreSQL.

Physical surfaces:

```text
tests/b2/targets.sql
tests/b2/jobs.sql
tests/b2/isolation.sql
tests/b2/readback.sql
```

Proven behavior:

```text
CLEAN_DB_MIGRATIONS                PASS
CAREER_TARGET_PHYSICAL_CONTRACT    PASS
JOB_TRUTH_PHYSICAL_CONTRACT        PASS
REAL_RLS_USER_A_VS_USER_B          PASS
REAL_FOREIGN_ID_ACTIVATION_ATTACK  PASS
ANONYMOUS_RPC_DENIAL               PASS
DATABASE_IMMUTABILITY              PASS
FRESH_CONNECTION_READBACK          PASS
B1_POSTGRES_REGRESSION             PASS
```

## Exact implementation-head receipts

The final implementation head before ledger promotion was:

```text
head_sha      a472428da84ce85f083d37d8316dd1a4d24aca28
construction  33355740956 success
b1_postgres   33355740927 success
b2_postgres   33355740935 success
```

`CV Engine B2 PostgreSQL Gate` completed all physical steps, including clean migrations, CareerTarget behavior, Job truth behavior, ownership/immutability attacks and durable readback from a fresh connection.

## UI/application boundary

The authenticated product shell exposes three separate truth surfaces:

```text
Career Evidence
Career Target
Job Truth
```

B2 intentionally does not expose RequirementMatch, MatchReport or OpportunityAssessment. Those belong to B3.

## Scope boundary

B2 does **not** claim:

```text
RequirementMatch
MATCH / POTENTIAL_MATCH / GAP / UNKNOWN / BLOCKER
MatchReport
OpportunityAssessment
hiring probability
ResumeVersion
trusted import
provider runtime
market discovery
production qualification
```

Those remain downstream nodes.

## Closure rule

This ledger promotion is valid only if the exact promotion head also passes:

```text
CV Engine vNext Construction
CV Engine B1 PostgreSQL Gate
CV Engine B2 PostgreSQL Gate
```

If contradictory evidence appears later, B2 reopens under `docs/build/CLOSURE-PROTOCOL.md`.

```text
B2 = CLOSED
B3 = READY_TO_BUILD
```
