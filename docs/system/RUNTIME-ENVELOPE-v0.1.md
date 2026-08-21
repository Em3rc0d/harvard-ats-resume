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

## Measurements required before minimum-support declaration

| Dimension | Required measurement | Status |
|---|---|---|
| Docker cold start | services → ready | UNCHARACTERIZED |
| Docker warm restart | restart → ready | UNCHARACTERIZED |
| Peak app + AI memory | per canonical flow | UNCHARACTERIZED |
| Resume import latency | per persona, cold/warm | UNCHARACTERIZED |
| Inline optimize latency | bounded field workloads | UNCHARACTERIZED |
| Job intelligence latency | canonical jobs | UNCHARACTERIZED |
| Match latency | canonical jobs/personas | UNCHARACTERIZED |
| Resume assembly latency | deterministic path | UNCHARACTERIZED |
| Persistence write/read-back | Redis topology | UNCHARACTERIZED |
| Model switch cost | import ↔ optimize | UNCHARACTERIZED |
| Failure recovery latency | Ollama/Redis restart | UNCHARACTERIZED |

## Runtime support decision

A future profile may be labeled `SUPPORTED_MINIMUM` only when:

1. all required canonical personas pass;
2. all adopted latency budgets pass;
3. all required failure/degradation scenarios pass;
4. peak memory stays inside the declared safe operating envelope;
5. cold-start reproducibility passes;
6. build/runtime identity is exposed in the acceptance receipt.

Until those conditions are met, the minimum supported runtime remains **UNCHARACTERIZED**.
