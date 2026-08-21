# Release Gate v0.1

## Rule

A criterion is PASS only when it has explicit evidence references. Missing, planned, observed-only, implemented-but-unexecuted, or uncharacterized results are blocking.

## Mandatory criteria

| Criterion | Requirement | Current status |
|---|---|---|
| canonical-personas | All REQUIRED personas pass end-to-end | FIXTURES + HARNESS IMPLEMENTED; REAL RECEIPTS PENDING |
| failure-degradation | Required fault scenarios fail/degrade according to contract | P10 HARNESS IMPLEMENTED; REAL RECEIPTS PENDING |
| runtime-envelope | Declared minimum runtime satisfies approved budgets | OBSERVER IMPLEMENTED; MINIMUM NOT DEFINED |
| truth-invariants | Candidate truth / market truth / model proposals / operational provenance remain isolated | CONTRACT + REGRESSIONS IMPLEMENTED; REAL PERSONA RECEIPTS PENDING |
| durable-readback | Trusted state survives commit verification and read-back | REAL READ-BACK HARNESS IMPLEMENTED; RECEIPTS PENDING |
| latency-budgets | Measured workloads satisfy approved budgets | BLOCKED — MEASURE FIRST, BUDGET LATER |
| build-identity | Deployed runtime exposes exact build SHA + architecture version + runtime profile | IMPLEMENTED; CHARACTERIZATION RECEIPTS PENDING |
| docker-cold-start | Supported topology reproducibly becomes ready from cold start | 3-RUN NON-DESTRUCTIVE HARNESS IMPLEMENTED; RECEIPT PENDING |

## Gate algorithm

The executable source of truth is `lib/application/system/SystemCharacterizationContract.ts`.

`evaluateReleaseGate()` requires every mandatory criterion to have:

```text
status = PASS
evidenceRefs.length > 0
```

Anything else returns `ready = false`.

The evidence aggregator is:

```text
scripts/system-release-evaluate.mjs
```

It consumes persona/fault/cold-start receipts. It deliberately leaves `runtime-envelope` and `latency-budgets` as `UNCHARACTERIZED` in v0.1 because no approved budgets or minimum runtime exist yet.

## Evidence quality

Valid release evidence must be tied to:

- exact commit/build SHA;
- exact architecture version;
- exact runtime profile;
- exact fixture/persona/fault/cold-start contract;
- test or receipt version;
- timestamp/run identity where applicable;
- raw evidence references rather than unsupported PASS labels.

Evidence from an unknown/stale runtime cannot qualify another commit.

## Operational provenance

`truth-invariants` includes how the final resume was materialized, not only which candidate facts support it.

For the current deterministic final assembly contract, promoted persona receipts must show:

```text
provider = cv-engine-deterministic
model = source-preserving-resume-composer-v2
contractVersion = ats2-evidence-bound-resume-v2
```

If a ResumeVersion claims Ollama generated the final artifact while the deterministic compositor actually produced it, the gate fails.

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

## Docker cold-start scope

The implemented v0.1 cold-start harness characterizes:

```text
CONTAINERS_COLD_VOLUMES_RETAINED
```

It does not delete volumes and therefore does not claim fresh-install/model-download behavior. Fresh-install cold start remains a separate uncharacterized case.

## Current verdict

```text
ATS-SYS-01 RELEASE GATE: BLOCKED / HARNESS IMPLEMENTED / REAL CHARACTERIZATION PENDING
```

This is expected and healthy. The purpose of v0.1 is to make unknowns visible rather than convert them into optimistic assumptions.
