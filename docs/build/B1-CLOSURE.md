# B1 — Career Evidence Core Closure

Status: **CLOSED**

Contract authority:

- `REBUILD-CONTRACT.md`
- `docs/vnext/05-IDENTITY-AND-SESSION-CONTRACT.md`
- `docs/vnext/06-DATA-PERSISTENCE-AND-LIFECYCLE.md`

## Implemented vertical slice

```text
CareerVault ownership
CareerEvidence stable identity
CareerEvidenceRevision history
manual create
list current
revise with expectedRevision
controlled delete
authenticated API boundary
owner-scoped PostgreSQL RLS
manual Career Evidence UI
```

## Static/application evidence

The rebuild contains:

- explicit Career Evidence source enum with no `JOB_DESCRIPTION` value;
- owner-scoped API calls derived from the authenticated Supabase session;
- revision input requiring `expectedRevision`;
- PostgreSQL stable-field immutability;
- `FOR UPDATE` row locking;
- revision pointer advancement by exactly one;
- application readback after create/revise;
- no anonymous table grants.

## Physical PostgreSQL gate

Workflow:

```text
.github/workflows/b1-db-ci.yml
```

The gate starts PostgreSQL 16, bootstraps only the minimum Supabase Auth semantics required by the migrations, applies every versioned migration to a clean database, then executes real database behavior tests.

Physical test surfaces:

```text
tests/b1/postgres-auth-shim.sql
tests/b1/physical-contract.sql
tests/b1/concurrency-gate.sh
```

Proven behavior:

```text
CLEAN_DB_MIGRATION             PASS
REAL_RLS_USER_A_VS_USER_B      PASS
CROSS_USER_READ_DENIED         PASS
CROSS_USER_UPDATE_DENIED       PASS
CROSS_USER_DELETE_DENIED       PASS
CROSS_USER_RPC_REVISION_DENIED PASS
ANONYMOUS_MUTATION_DENIED      PASS
REVISION_HISTORY               PASS
STALE_REVISION_CONFLICT        PASS
ATOMIC_CREATE_ROLLBACK         PASS
JOB_DESCRIPTION_REJECTION      PASS
CONCURRENT_REVISION_RACE       PASS
FRESH_CONNECTION_READBACK      PASS
```

First successful physical receipt:

```text
workflow   CV Engine B1 PostgreSQL Gate
run        33353818973
head_sha   b933fa2d44a25597deb469a613e6e5fd5f4aeedd
conclusion success
```

Exact implementation-head closure receipt:

```text
head_sha    7c8e771897a5981e49484c23ea4c8ec0924f8432
construction workflow/run  CV Engine vNext Construction / 33354071620
postgres workflow/run      CV Engine B1 PostgreSQL Gate / 33354071468
construction conclusion    success
postgres conclusion        success
```

The closure-ledger promotion commit changes status documentation only. Its own required GitHub checks are part of the external closure receipt: if either is red, this `CLOSED` declaration is invalid and the node reverts to `CANDIDATE` by policy.

## Scope boundary

B1 closes Career Evidence ownership/durability for the implemented manual evidence slice. It does not claim completion of later lifecycle surfaces such as account-wide export/delete, source-upload cleanup, ResumeVersion immutability or backup/restore; those are inherited by their build nodes and B8 release qualification.

## Closure declaration

```text
CONTRACT_SIGNED             PASS
IMPLEMENTED                 PASS
WIRED                       PASS
STATIC_TESTS                PASS
CLEAN_DB_MIGRATION          PASS
RLS_PHYSICAL_GATE           PASS
REVISION_HISTORY            PASS
CONCURRENCY_GATE            PASS
ATOMIC_ROLLBACK             PASS
DURABLE_READBACK            PASS
CONSTRUCTION_CI             PASS
OPEN_B1_BLOCKERS            NONE
B1                          CLOSED
```

B2 is unblocked. Reopen B1 only if new evidence invalidates one of these predicates.
