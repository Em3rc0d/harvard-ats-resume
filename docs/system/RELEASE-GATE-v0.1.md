# Release Gate v0.1

## Rule

A criterion is PASS only when it has explicit evidence references. Missing, planned, observed-only, or uncharacterized results are blocking.

## Mandatory criteria

| Criterion | Requirement | Current status |
|---|---|---|
| canonical-personas | All REQUIRED personas pass end-to-end | UNCHARACTERIZED |
| failure-degradation | Required fault scenarios fail/degrade according to contract | UNCHARACTERIZED |
| runtime-envelope | Declared minimum runtime satisfies approved budgets | UNCHARACTERIZED |
| truth-invariants | Candidate truth / market truth / model proposals remain isolated | PARTIALLY TESTED, NOT RELEASE-PASS |
| durable-readback | Trusted state survives commit verification and read-back | PARTIALLY TESTED, NOT RELEASE-PASS |
| latency-budgets | Measured workloads satisfy approved budgets | UNCHARACTERIZED |
| build-identity | Deployed runtime exposes exact build SHA + architecture version | MISSING |
| docker-cold-start | Supported topology reproducibly becomes ready from cold start | UNCHARACTERIZED |

## Gate algorithm

The executable source of truth is `lib/application/system/SystemCharacterizationContract.ts`.

`evaluateReleaseGate()` requires every mandatory criterion to have:

```text
status = PASS
evidenceRefs.length > 0
```

Anything else returns `ready = false`.

## Evidence quality

Valid release evidence must be tied to:

- exact commit/build SHA;
- exact runtime profile;
- exact fixture/persona/fault case;
- test or receipt version;
- timestamp/run identity where applicable.

Evidence from an unknown/stale runtime cannot qualify another commit.

## Construction CI vs release qualification

Existing CI remains necessary:

```text
install
dependency audit
local-only enforcement
lint
typecheck
behavior tests
build
PDF.js verification
Docker topology
Docker image build
browser acceptance
```

But those gates alone do **not** set `ready = true` for ATS-SYS-01.

Release qualification additionally requires product behavior, runtime fitness, failure behavior, truth safety, durability, and read-back evidence.

## Current verdict

```text
ATS-SYS-01 RELEASE GATE: BLOCKED / CHARACTERIZATION IN PROGRESS
```

This is expected and healthy. The purpose of v0.1 is to make unknowns visible rather than convert them into optimistic assumptions.
