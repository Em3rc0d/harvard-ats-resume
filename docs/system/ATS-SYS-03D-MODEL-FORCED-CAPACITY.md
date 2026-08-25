# ATS-SYS-03D — Model-Forced Resume Import Capacity

## Purpose

ATS-SYS-03A/B/C established that the complete `/api/import-resume` endpoint remained truth-safe through one observed c16 saturation wave on `REFERENCE-CPU-01`.

That result does not isolate Ollama capacity because the v3.3 hybrid importer can resolve source-explicit records without invoking the model.

ATS-SYS-03D answers the narrower question:

> How does the shipping Ollama topology behave when every measured CV import is proven to cross a real model-backed resume extraction call?

## Model-forced fixture

03D intentionally reuses canonical persona `P01`.

P01 is truth-known and its generic `SKILLS` section is regression-locked to **not** qualify for the `TECHNICAL SKILLS` deterministic fast path. The import therefore performs one bounded `resume-import-ai` structured extraction for `skills` using the configured resume-import model.

Current identified runtime model:

```text
provider = ollama-local
model    = qwen3:1.7b
```

This benchmark characterizes **one model-backed section per import**.

It does not prove multi-section AI-heavy CV capacity, arbitrary resume complexity, or arbitrary real-world CV robustness.

## Model-call evidence

03D does not trust endpoint success alone.

Before and after every wave the harness reads the isolated Ollama container logs and counts real:

```text
POST /api/chat
```

For a wave with concurrency `N` the admissibility contract is:

```text
expected Ollama /api/chat calls = N
observed Ollama /api/chat calls = N
```

If the endpoint returns N successful imports but Ollama emits fewer than N `/api/chat` calls, the model-forced capacity claim fails.

No production API debug headers or benchmark-only truth bypasses are introduced.

## Shipping topology under test

The benchmark retains the actual reference Compose topology:

```text
OLLAMA_MAX_LOADED_MODELS = 1
OLLAMA_NUM_PARALLEL      = 1
```

Therefore concurrent model-backed imports queue through the same single inference lane that the qualified reference runtime actually ships.

The benchmark must not increase parallelism merely to improve results.

## Capacity sweep

Default waves:

```text
c1
c2
c4
c8
```

Each request:

1. uploads P01 through the real `/api/import-resume` endpoint;
2. validates the response against P01 required and forbidden candidate truth;
3. preserves the public API rate limiter;
4. participates in an externally observed Ollama `/api/chat` count.

For every wave the receipt records:

- success / safe failure / unsafe accepted truth;
- rate-limit confounds;
- p50 / p95 / min / max request latency;
- wall-clock wave latency;
- Ollama chat calls before/after;
- observed versus expected model-call count.

## Saturation

Default saturation wave:

```text
c16
```

A c16 result is admissible only when:

```text
unsafeAcceptedTruth = 0
rateLimited         = 0
ollamaChatCalls     = 16
expectedChatCalls   = 16
```

Timeouts or safe refusals may be observed under pressure, but they must contain no accepted candidate truth.

## Recovery

After saturation the exact same identified runtime must:

1. remain or return `READY`;
2. import P01 again successfully;
3. preserve the authored truth envelope;
4. emit exactly one additional Ollama `/api/chat` call.

No restart is allowed between saturation and the recovery probe.

## Rate-limit boundary

Default request count:

```text
1 + 2 + 4 + 8 capacity requests
+ 16 saturation requests
+ 1 recovery request
= 32 requests
```

This stays below the current 50-request import window.

The reference runner clears only stale benchmark-owned `@upstash/ratelimit*` keys before measurement. It does not disable the limiter.

## Commands

Raw harness against an already identified runtime:

```bash
npm run system:import-model-capacity
```

Isolated physical reference campaign:

```bash
export CVENGINE_RUNTIME_PROFILE_ID=REFERENCE-CPU-01
npm run system:import-model-capacity:reference
```

Optional bounded overrides:

```bash
npm run system:import-model-capacity:reference -- --levels 1,2,4,8 --saturation-concurrency 16
```

## Evidence

Raw evidence:

```text
evidence/ats-sys-03/model-forced-capacity/<timestamp>/
```

Physical reference evidence:

```text
evidence/ats-sys-03/model-forced-reference-runs/<timestamp>/
```

Terminal receipt version:

```text
ats-sys-03d-model-forced-capacity-v0.1
```

## Claim boundary

03D may establish an observed capacity envelope for **this exact build, this exact runtime fingerprint, this exact Ollama topology, and one model-backed P01 skills extraction per import**.

It is not a production concurrency SLA until the observation is repeated and an explicit capacity policy is approved.

It does not establish:

- multi-section AI-heavy CV capacity;
- arbitrary DOCX/PDF robustness;
- OCR/image-only resume support;
- another Ollama model or host profile;
- long-duration sustained throughput;
- minimum supported hardware.

`OBSERVED != SUPPORTED` remains mandatory.
