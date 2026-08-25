# ATS-SYS-03 — Resume Import Robustness & Capacity

## Purpose

ATS-SYS-03 answers a different question from ATS-SYS-02:

> Can the qualified CV Engine import boundary remain truthful and recoverable as resume diversity and concurrent upload pressure increase?

ATS-SYS-02 qualified exact build `d014b6b097759002fdb6204d6870e42961cda89c` for the canonical system workload on `REFERENCE-CPU-01`. ATS-SYS-03 starts from that exact qualified build and does **not** inherit a claim that arbitrary CVs or arbitrary concurrency are supported.

## Hard rules

```text
UNKNOWN != PASS
OBSERVED != SUPPORTED
SAFE REFUSAL != CORRUPTED TRUTH
RATE LIMIT != OLLAMA CAPACITY
```

A benchmark failure is unacceptable if the API returns candidate data that violates the authored fixture truth envelope. Timeouts/refusals under pressure are allowed only when no candidate truth is accepted and the runtime recovers.

## Phase A — corpus correctness

Current initial corpus:

- P01 — clean junior DOCX;
- P03 — Spanish DOCX;
- P04 — sparse DOCX;
- P09 — adversarial-JD persona resume DOCX.

All four have explicit `requiredStrings`, `forbiddenStrings`, expected summary presence, experience count and education count in `tests/system/fixtures/canonical-personas.v0.1.json`.

This is a **synthetic DOCX seed corpus only**. Passing it does not prove arbitrary real-world resumes, PDF layouts, multi-column documents, image-only scans, French/Portuguese diversity, executive resumes, or malformed documents.

## Phase B — capacity sweep

Default concurrency levels:

```text
1 → 2 → 4 → 8
```

Each wave uses the real `/api/import-resume` boundary and truth-validates every successful response. The benchmark deliberately leaves the existing public API rate limiter enabled.

For every wave it records:

- total requests;
- truth-safe successes;
- safe failures/refusals;
- unsafe accepted truth;
- rate-limit confounds;
- p50/p95/min/max request latency;
- wall-clock wave latency.

`maxZeroFailureConcurrency` is an **observation**, not a supported concurrency promise.

## Phase C — saturation and recovery

Default saturation wave:

```text
concurrency = 16
```

After saturation the harness requires:

1. runtime health returns/remains `READY` on the same identified build;
2. a fresh P01 import succeeds;
3. imported truth still matches the authored fixture envelope.

Any accepted unsupported candidate truth is a hard failure.

## Rate-limit control

The default request count is:

```text
4 serial corpus requests
+ 1 + 2 + 4 + 8 capacity requests
+ 16 saturation requests
+ 1 recovery request
= 36 requests
```

This remains below the current 50-request public API window without disabling or bypassing rate limiting.

## Executable harness

```bash
npm run system:import-capacity
```

Optional overrides:

```bash
npm run system:import-capacity -- --levels 1,2,4,8 --saturation-concurrency 16
```

Evidence is written under:

```text
evidence/ats-sys-03/import-capacity/<timestamp>/
```

The terminal receipt is `receipt.json` with version `ats-sys-03-import-capacity-v0.1`.

## Qualification boundary

ATS-SYS-03 v0.1 is observational. It may establish:

- the current four-fixture corpus passed or failed;
- the highest zero-failure concurrency observed in the tested sweep;
- whether overload produced only safe failures;
- whether the same runtime recovered after saturation.

It may **not** establish arbitrary CV robustness or a production concurrency SLA until a substantially larger, representative, ground-truthed corpus and explicit capacity policy are approved.
