# CV Engine vNext — Gemini Model Matrix v0.1

Status: **AUTHORITATIVE ROUTING BASELINE; BENCHMARK REQUIRED BEFORE RELEASE QUALIFICATION**

Date: 2026-08-26

## 1. Evidence basis

This matrix combines:

1. the user-provided Google AI Studio free-tier quota snapshot for the current Gemini project;
2. current Google Gemini model documentation;
3. CV Engine's application-owned truth and provider-routing contracts.

The quota snapshot is **observed configuration**, not a permanent provider guarantee. Actual limits must be discovered/recorded for the exact Gemini project/key and tier used by a runtime.

No API key value belongs in this document or repository.

## 2. Observed text-model quota snapshot

Relevant observed free-tier lanes:

| Model | RPM | TPM | RPD | Initial CV Engine classification |
|---|---:|---:|---:|---|
| Gemini 3.5 Flash-Lite | 15 | 250K | 500 | high-volume default candidate |
| Gemini 3.1 Flash-Lite | 15 | 250K | 500 | compatibility/capacity reserve |
| Gemini 3.6 Flash | 5 | 250K | 20 | quality escalation candidate |
| Gemini 3.7 Flash | 5 | 250K | 20 | highest-quality Flash escalation candidate |
| Gemini 3.5 Flash | 5 | 250K | 20 | legacy reserve; benchmark only |
| Gemini 3 Flash | 5 | 250K | 20 | preview/legacy reserve; not default |
| Gemini 2.5 Flash | 5 | 250K | 20 | legacy compatibility reserve |
| Gemini 2.5 Flash-Lite | 10 | 250K | 20 | legacy compatibility reserve |
| Gemini 3.1 Pro | 0 | 0 | 0 | unavailable in supplied free-tier snapshot |
| Gemini 2.5 Pro | 0 | 0 | 0 | unavailable in supplied free-tier snapshot |

Other supplied model families (image, TTS, Live, robotics, Veo/Lyria, agents) are outside the first-release CV Engine text workflow and are not part of the default AI Gateway route.

The supplied Gemma 4 26B/31B lanes expose high request counts but only a 16K TPM allowance in the snapshot. They remain an experimental benchmark lane for short bounded classification only and are **not** initial production defaults.

Gemini Embedding models are reserved for later Opportunity Space / retrieval experiments. They are not required for B0-B6 trusted-core completion.

## 3. Current provider facts relevant to routing

Current Google documentation describes:

- `gemini-3.5-flash-lite` as a stable, low-latency, cost-efficient model optimized for high-throughput tasks, document parsing, and simple extraction;
- `gemini-3.6-flash` as a stable general Flash model with structured outputs and a 1M-token input context;
- `gemini-3.7-flash` as a stable, production-ready, more capable Flash model for complex multi-step work, also with structured outputs and a 1M-token input context;
- Gemini 3.1 Flash-Lite as stable but superseded by newer Flash-Lite generations and therefore appropriate as a reserve rather than the preferred new-build default.

CV Engine should use stable explicit model IDs rather than a `latest` alias for release-qualified routes.

## 4. Initial capability routing

### 4.1 Resume import — bounded ambiguous fragment / document assistance

```text
mechanical extraction
      ↓
deterministic structure
      ↓
source-exact recovery
      ↓ only if bounded ambiguity remains
Gemini 3.5 Flash-Lite
      ↓ recoverable failure / validation failure with retry policy
Gemini 3.7 Flash (quality escalation; scarce quota)
      ↓ recoverable failure
Ollama import fallback
      ↓
source reconciliation
      ↓
accepted proposal OR manual review
```

Rationale:

- Flash-Lite is explicitly suitable for document parsing/simple extraction;
- the 500 RPD observed lane is far more practical than spending a 20-RPD quality-model request on every import;
- 3.7 Flash is reserved for genuinely ambiguous/hard fragments, not routine extraction;
- all outputs remain untrusted until source reconciliation succeeds.

### 4.2 Job description interpretation

Default:

```text
Deterministic extraction first
        ↓ bounded interpretation needed
Gemini 3.5 Flash-Lite
        ↓ if complexity score exceeds policy / validation incomplete
Gemini 3.7 Flash
        ↓
Ollama analysis fallback
```

Job text is market truth, never candidate truth. AI may normalize/classify requirements but cannot turn them into candidate evidence.

### 4.3 Opportunity assessment assistance

Core match states should remain deterministic/evidence-backed.

AI is optional for explanatory synthesis only:

```text
structured MatchReport
       ↓
Gemini 3.5 Flash-Lite (default explanation)
       ↓ quality escalation only when allowed
Gemini 3.7 Flash
       ↓
Ollama OR deterministic explanation
```

Provider outage must not prevent the deterministic MatchReport from existing.

### 4.4 Inline wording optimization

```text
Gemini 3.5 Flash-Lite
       ↓ recoverable failure
Ollama optimize model
       ↓
original wording survives
```

Do not spend scarce 3.7/3.6 quota on routine wording by default.

### 4.5 Difficult bounded reasoning

`gemini-3.7-flash` is the initial quality-escalation candidate for tasks that pass a policy-defined complexity gate.

`gemini-3.6-flash` is the first reserve if 3.7 is unavailable, incompatible, or later proves materially less cost-effective/less reliable for a specific capability.

Do **not** chain 3.7 → 3.6 → 3.5 → 3.1 → Ollama on every request. That would create latency, quota, and cost explosions.

## 5. Platform-key budget policy

The observed free-tier limits are suitable for development, dogfood, and a very small beta. They are **not production-capacity evidence**.

Initial platform-key rules:

- ordinary high-volume AI requests route to 3.5 Flash-Lite;
- quality-model escalation is opt-in by capability policy, not automatic for every failure;
- one user operation must have a whole-operation attempt budget;
- 429/quota exhaustion must prefer safe degradation or Ollama over repeated cloud retries;
- the application tracks non-secret usage counters by capability/model;
- platform-key mode must have per-session/user abuse limits before public release;
- production capacity must be qualified against the exact paid/free tier actually used at release time.

A separate Gemini project/key should be preferred for CV Engine production/beta so another product cannot silently consume its quota budget.

## 6. BYOK routing

BYOK uses the same capability routing policy but must discover/handle the model access actually available to the user's Gemini project.

Do not assume every BYOK key has the same models or quotas as the platform key.

At session/runtime capability resolution, CV Engine may perform a bounded model availability probe/list operation and build an in-memory allowlisted capability map.

Example:

```text
preferred = gemini-3.5-flash-lite
available? yes → use
available? no  → allowed compatible Gemini reserve OR Ollama
```

The raw BYOK credential never enters the model matrix, provenance, logs, or persistent capability map.

## 7. No-cloud routing

```text
NO_CLOUD_AI
   ↓
skip all Gemini attempts
   ↓
Ollama if local/runtime capability available
   ↓
deterministic/manual degradation otherwise
```

## 8. Ollama contract

Ollama is the provider fallback, but its production topology is **not yet qualified** by this document.

The implementation must distinguish:

- local/self-hosted runtime where Ollama is directly available;
- hosted CV Engine runtime where an Ollama worker may have separate cost/cold-start/capacity characteristics.

Provider fallback is a logical contract. Production support for a specific Ollama topology requires separate runtime evidence.

## 9. Model exclusions for first release

Not default routes in B0-B6:

- Pro models with zero supplied quota;
- preview-only Gemini 3 Flash when stable replacements exist;
- image-generation models;
- audio/TTS/live models;
- Computer Use;
- Deep Research / Antigravity agents;
- robotics models;
- Lyria/Veo;
- embeddings for trusted-core decisions;
- Gemma lanes until benchmarked for the exact bounded task.

## 10. Benchmark gates

Before B6 is closed, run a provider benchmark over synthetic/public fixtures for each routed capability.

At minimum capture:

```text
provider
exact model id
credential mode
capability
fixture id
structured-output validity
truth/source validation outcome
latency
input/output token usage where exposed
attempt count
fallback used
normalized error
```

Required comparisons:

1. 3.5 Flash-Lite vs 3.7 Flash on ambiguous resume fragments;
2. 3.5 Flash-Lite vs 3.7 Flash on Job requirement extraction/interpretation;
3. 3.5 Flash-Lite vs Ollama on wording preservation;
4. Gemini failure → Ollama fallback;
5. total provider outage → safe deterministic/manual degradation;
6. quota 429 → bounded fallback without retry storm.

## 11. Initial decision

For the zero-based build, the routing baseline is:

```text
HIGH-VOLUME DEFAULT      gemini-3.5-flash-lite
QUALITY ESCALATION       gemini-3.7-flash
GEMINI RESERVE           gemini-3.6-flash
CAPACITY/COMPAT RESERVE  gemini-3.1-flash-lite
LOCAL FALLBACK           capability-specific Ollama model
FINAL TRUST AUTHORITY     CV Engine validation/deterministic core
```

This is sufficient to implement the provider abstraction without pretending the model benchmark is already complete.
