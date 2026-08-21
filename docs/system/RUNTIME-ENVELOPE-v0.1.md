# Runtime Envelope v0.1

## Rule

A runtime is supported only after measured evidence proves it satisfies the approved product budgets. Observed hardware is not automatically a supported minimum.

## REFERENCE-CPU-01 — observed dogfood runtime

```text
CPU: Intel Core i5-9300H @ 2.40 GHz
Usable inference threads observed: 4
System memory observed by Ollama: ~7.7 GiB
GPU requirement: none assumed
Container runtime: Docker
Local AI: Ollama
Status: OBSERVED / NOT YET DECLARED MINIMUM
```

## Evidence already available

Observed on this profile:

- section-scoped `qwen3:1.7b` import produced useful structured output within bounded calls;
- a whole-resume `qwen3:8b` import workload exceeded the useful request envelope;
- a whole-resume `qwen3:8b` final-generation workload exhausted a 240-second request budget;
- the 8B runtime used a 16K context and approximately 2.3 GiB KV cache in the observed incident.

These observations characterize specific workload/model/runtime pairings. They do **not** imply that every 1.7B/4B workload is acceptable or that every 8B workload is forbidden on stronger hardware.

## Measurement infrastructure now implemented

ATS-SYS-01 provides:

```text
system:characterize
→ per-persona stage latency
→ known-truth result
→ AI call counts from Docker logs
→ durability/read-back evidence

system:characterize:runtime
→ wraps the persona run
→ samples app + ollama + redis + redis-http
→ records max observed memory by service
→ records max observed aggregate Docker memory
→ records max observed CPU percentage by service
→ records host CPU/memory identity

system:cold-start
→ three identified container-cold runs by default
→ volumes retained
→ readiness latency recorded
→ exact build/runtime identity required

system:faults
→ degradation/recovery observations
```

The infrastructure is implemented. **Measurements are still pending until these commands run on the declared runtime profile.**

## Measurement semantics

`system:characterize:runtime` samples Docker stats approximately once per second. Therefore its maximum memory/CPU values are sampled maxima, not mathematically exact peaks.

This is sufficient for initial profile comparison, but any future hard safety margin must account for sampling limitations and host/Docker overhead outside the sampled containers.

The standard v0.1 cold-start receipt means:

```text
CONTAINERS_COLD_VOLUMES_RETAINED
```

It does not mean fresh installation. Model-download / empty-volume startup remains a separate `FRESH_INSTALL_COLD_START` scenario and stays uncharacterized until explicitly implemented and executed.

## Measurements required before minimum-support declaration

| Dimension | Harness status | Evidence status |
|---|---|---|
| Docker container cold start | IMPLEMENTED | PENDING REAL RECEIPT |
| Docker warm restart | NOT YET SEPARATELY CHARACTERIZED | UNCHARACTERIZED |
| Peak observed stack memory | IMPLEMENTED | PENDING REAL RECEIPT |
| Resume import latency | IMPLEMENTED per persona | PENDING REAL RECEIPT |
| Inline optimize latency | NOT YET IN PERSONA HARNESS | UNCHARACTERIZED |
| Job intelligence / match / assessment latency | IMPLEMENTED at endpoint level | PENDING REAL RECEIPT |
| Resume assembly latency | IMPLEMENTED | PENDING REAL RECEIPT |
| Persistence write/read-back | IMPLEMENTED | PENDING REAL RECEIPT |
| Model switch cost | OBSERVABLE IN LOGS, NO DEDICATED RECEIPT | UNCHARACTERIZED |
| Failure detection/recovery latency | P10 IMPLEMENTED | PENDING REAL RECEIPT |
| Fresh-install/model-download cold start | NOT IMPLEMENTED | UNCHARACTERIZED |

## From observations to budgets

The order is binding:

```text
1. run canonical personas repeatedly on declared runtime profiles
2. preserve raw latency/memory/failure receipts
3. compare distributions and user-visible waiting behavior
4. adopt product budgets deliberately
5. test candidate runtimes against those budgets
6. only then promote one profile to SUPPORTED_MINIMUM
```

A timeout is a containment boundary, not automatically a latency budget.

A single successful run is evidence that a run succeeded, not evidence that a runtime is reliably supported.

## Runtime support decision

A future profile may be labeled `SUPPORTED_MINIMUM` only when:

1. all required canonical personas pass;
2. all adopted latency budgets pass;
3. all required failure/degradation scenarios pass;
4. measured memory stays inside an explicitly approved safe operating envelope;
5. cold-start reproducibility passes;
6. build/runtime identity is exposed in the acceptance receipt;
7. the evidence set contains enough repeated runs to support the decision rather than a one-off observation.

Until those conditions are met, the minimum supported runtime remains **UNCHARACTERIZED**.
