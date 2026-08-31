# CV Engine — Node Closure Protocol v1.0

Status: **AUTHORITATIVE CONSTRUCTION POLICY**

## Purpose

A CV Engine node is not closed because code exists, a document says `DONE`, or CI is green. Closure is a release-graph property backed by evidence.

## Canonical states

```text
SIGNED              contract is frozen and internally coherent
IMPLEMENTED         required code/migrations/wiring exist
PROVEN              executable evidence demonstrates the required behavior
CLOSED              SIGNED + IMPLEMENTED + PROVEN + no unresolved blocker
BLOCKED_WITH_RECEIPT closure is explicitly prevented by named missing evidence
NOT_STARTED         implementation has not begun
```

`PARTIAL` may be used only as a human-readable summary. The ledger must name the exact missing closure predicates.

## Closure equation

```text
NODE_CLOSED =
  CONTRACT_SIGNED
  && IMPLEMENTED
  && WIRED
  && EXECUTABLY_TESTED
  && PHYSICALLY_PROVEN_WHERE_REQUIRED
  && NO_OPEN_CONTRADICTIONS
```

The following implications are forbidden:

```text
FILE_EXISTS        != CLOSED
ENDPOINT_EXISTS    != CLOSED
UNIT_TEST_GREEN    != CLOSED
CI_GREEN           != PRODUCT_READY
DOCUMENTED         != VERIFIED
OBSERVED           != SUPPORTED
UNKNOWN            != PASS
```

## Required closure receipt

Every closed build node must identify:

1. authoritative contract(s);
2. implementation branch/SHA;
3. executable test surface;
4. physical/runtime evidence when the contract depends on infrastructure, browser, network, persistence, provider or deployment behavior;
5. known limitations explicitly outside the node's scope;
6. downstream nodes unblocked by the closure.

A receipt must never substitute a planned test for a completed test.

## Evidence classes

### Static contract evidence

Examples: type system constraints, schema validation, forbidden enum values, source-level secret boundaries.

Useful, but insufficient for claims whose failure mode exists only at runtime.

### Executable behavior evidence

Tests that invoke the application/domain behavior under realistic control flow.

### Physical infrastructure evidence

Required for claims such as:

- PostgreSQL migrations apply;
- RLS prevents cross-user access;
- transactional rollback preserves durability semantics;
- concurrent writes conflict safely;
- backup/restore works;
- a browser cannot retain a BYOK secret across reload/storage surfaces;
- a deployed runtime exposes the claimed topology.

### Release evidence

Identified-runtime receipts, browser E2E, fault injection, security regression and production qualification.

## Reopening rule

A `CLOSED` node stays closed unless new evidence invalidates one of its closure predicates. New downstream requirements do not silently rewrite a closed node; they create a new node or an explicit contract revision.

## Sign-off rule

The canonical build graph in `docs/build/BUILD-GRAPH.md` is the only construction-status ledger. Historical documents may describe earlier states but cannot override the graph.

A node may be marked `CLOSED` only when its receipt is linked from the graph and every required predicate is evidenced.
