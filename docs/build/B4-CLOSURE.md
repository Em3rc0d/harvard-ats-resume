# CV Engine — B4 Closure Receipt

Status: **CLOSED**

Node: **B4 — ResumeVersion**

B4 is closed as the deterministic, provenance-backed ResumeVersion vertical slice. This receipt does not claim B5 import, B6 AI runtime, B7 Opportunity Space or B8 production qualification.

## Signed contract realized

```text
Career Evidence (candidate authority)
        ↓ VERIFIED only
provenance-by-construction selection
        ↓
ResumeClaim
        ↓
ResumeVersion manifest + deterministic document
        ↓
plain-text / provenance JSON export
```

Trusted ResumeVersion creation remains application-owned and AI-independent.

### GENERAL

Uses all current `VERIFIED` Career Evidence in deterministic order.

### TARGETED

Binds to an owned JobSnapshot and the corresponding B3 OpportunityAssessment, then selects only current `VERIFIED` Career Evidence that supports `MATCH` / `POTENTIAL_MATCH` states.

Job requirements never become candidate claims.

## Closed invariants

```text
DETERMINISTIC_COMPOSITION                 PASS
SOURCE_PRESERVING_TRUSTED_CLAIMS          PASS
VERIFIED_EVIDENCE_ONLY                    PASS
JOB_TRUTH_NEVER_BECOMES_CANDIDATE_CLAIM  PASS
GENERAL_TARGETED_BOUNDARY                 PASS
TARGETED_ASSESSMENT_PROVENANCE            PASS
CLAIM_TO_EVIDENCE_ID_REVISION             PASS
EVIDENCE_TEXT_SHA256                      PASS
CLAIM_SHA256                              PASS
MANIFEST_PROVENANCE_RECEIPTS               PASS
MANIFEST_CLAIM_CARDINALITY                PASS
DOCUMENT_CLAIM_CONSISTENCY                PASS
IMMUTABLE_RESUME_VERSION                  PASS
IMMUTABLE_RESUME_CLAIMS                   PASS
SEMANTIC_REPLAY_IDEMPOTENCE               PASS
EVIDENCE_CHANGE_CREATES_NEW_VERSION       PASS
HISTORICAL_VERSION_PRESERVED              PASS
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
```

## Client trust boundary

The trusted creation RPC accepts only:

```text
GENERAL  → mode
TARGETED → mode + jobSnapshotId
```

The client cannot supply owner identity, claims, rendered text, evidence hashes, assessment identity, manifest or semantic key.

## Failure semantics

- no authenticated identity → deny;
- no eligible current VERIFIED Career Evidence → fail closed;
- foreign/missing JobSnapshot → fail closed;
- stale evidence revision → reject claim persistence;
- any mismatch in kind/status/text/hash/provenance → reject;
- partial ResumeVersion creation is not allowed: injected claim failure rolls back the complete transaction.

## Physical evidence

Final implementation head before promotion:

```text
45d83e30649b3936fdbcbdb75663dea9ada9216d
```

Exact-head qualification:

```text
CV Engine vNext Construction   run 33461600465  SUCCESS
CV Engine B1 PostgreSQL Gate   run 33461600415  SUCCESS
CV Engine B2 PostgreSQL Gate   run 33461600422  SUCCESS
CV Engine B3 PostgreSQL Gate   run 33461600380  SUCCESS
CV Engine B4 PostgreSQL Gate   run 33461600358  SUCCESS
```

B4 PostgreSQL physically executed:

```text
clean versioned migrations
GENERAL/TARGETED deterministic composition
replay idempotence
verified-only claim selection
Job Truth exclusion
source preservation
historical version preservation
new version on evidence revision
transaction fault injection + rollback
immutability attack
cross-user isolation attack
anonymous RPC attack
direct-write attack
fresh-connection renderer/manifest/provenance readback
```

## Promotion rule

This node is authoritatively CLOSED only when the promotion commit containing this receipt and the canonical build-ledger update passes all five gates above on the same promotion SHA.

After that exact-head certification:

```text
B4 = CLOSED
B5 = READY_TO_BUILD
```

Reopen B4 only under `docs/build/CLOSURE-PROTOCOL.md` when new contradictory executable evidence appears.
