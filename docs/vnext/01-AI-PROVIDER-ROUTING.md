# CV Engine vNext — AI Provider Routing

Status: **AUTHORITATIVE vNext ARCHITECTURE SPEC**

## 1. Decision

CV Engine vNext uses a provider-agnostic AI Gateway with this provider order for cloud-enabled sessions:

```text
Capability request
      ↓
Application contract + truth boundary
      ↓
Gemini provider
      ↓
Gemini model routing policy
      ↓
validated result?
   ├─ yes → return bounded proposal/result
   └─ no / provider unavailable → fallback policy
                                 ↓
                               Ollama
                                 ↓
                         same validation contract
```

Gemini is the primary provider. Ollama is the fallback provider.

The user will provide the initial Gemini model list separately. Until that list is frozen, model identifiers are configuration, not architecture.

## 2. Provider routing is not truth routing

Fallback exists to improve availability and cost control. It must never bypass evidence rules.

Every provider output passes through the same application-owned capability contract.

```text
Gemini output ─┐
               ├─→ schema/semantic/source validation → accepted bounded result or safe refusal
Ollama output ─┘
```

No provider is trusted merely because it returned HTTP 200 or valid JSON.

## 3. Gateway responsibilities

The AI Gateway owns:

- capability-specific model selection;
- authentication source selection (platform key vs BYOK);
- timeout budgets;
- bounded retries;
- Gemini model cascade;
- provider fallback to Ollama;
- normalized errors;
- usage/cost metadata without secret leakage;
- provider/model provenance;
- circuit breaking/backoff;
- request idempotency/deduplication where applicable.

The AI Gateway does **not** own Career Evidence truth, Job truth, persistence claims, or final ResumeVersion authority.

## 4. Capability classes

Each AI-capable operation must declare one class.

### OPTIONAL_ENHANCEMENT

Example: wording optimization.

If all providers fail:

- deterministic/original content survives;
- user receives clear degraded-state feedback;
- trusted core continues.

### BOUNDED_ASSIST

Example: ambiguous resume fragment interpretation.

If all providers fail:

- no uncertain fact is accepted;
- deterministic/source-exact evidence may survive;
- manual review/fallback is offered.

### DERIVED_ANALYSIS_ASSIST

Example: bounded interpretation/classification of external market text where deterministic inputs remain authoritative.

If all providers fail:

- derived enhancement may be omitted;
- no candidate or market truth is fabricated.

### FORBIDDEN_TRUSTED_CORE_DEPENDENCY

AI must not be required for:

- manual Career Evidence authority;
- candidate-vs-job truth separation;
- durable-write success claims;
- claim provenance integrity;
- final trusted ResumeVersion acceptance criteria where deterministic composition can satisfy the product contract.

## 5. Gemini model cascade

A Gemini API key may access multiple Gemini models. We will exploit that through a capability-specific routing table rather than one global model.

Placeholder configuration:

```text
Capability             Primary Gemini    Gemini fallback(s)    Local fallback
resume import fragment TBD               TBD                   Ollama import model
inline optimization    TBD               TBD                   Ollama optimize model
market interpretation  TBD               TBD                   Ollama analysis model
other bounded assist   TBD               TBD                   capability-specific Ollama
```

The user's forthcoming model list will be evaluated for:

- capability fit;
- structured-output reliability;
- latency;
- context limits;
- cost;
- rate limits/quota behavior;
- availability/stability;
- multilingual quality;
- fallback compatibility.

We do not hard-code a model until benchmark evidence supports the choice.

## 6. Fallback triggers

A request may proceed from one Gemini model/provider attempt to the next allowed fallback when the failure is classified as recoverable, including examples such as:

- connection/network failure;
- provider timeout within our bounded budget;
- provider 5xx/transient service failure;
- rate limit/quota condition when policy permits fallback;
- model unavailable/not found;
- malformed provider response;
- schema-invalid output when another bounded attempt is allowed.

A fallback is **not** permission to accept an unsafe result.

When validation finds unsupported career facts, the unsafe result is rejected. Another bounded provider/model attempt may be made only if the capability policy allows it; otherwise the operation safely degrades/refuses.

## 7. Attempt budget

No unbounded retry chains.

Each capability defines:

```text
maxGeminiAttempts
maxOllamaAttempts
perAttemptTimeout
wholeOperationDeadline
maxEstimatedCloudCost
```

The total deadline dominates individual timeouts.

Example architecture shape (not yet a release value):

```text
Gemini model A
  ↓ recoverable failure
Gemini model B
  ↓ recoverable failure
Ollama model
  ↓
safe result OR degraded outcome
```

We will benchmark and freeze exact attempt counts later.

## 8. Platform key versus BYOK

The AI Gateway receives an authentication context:

```text
PLATFORM_KEY
BYOK_REQUEST_SCOPED
NO_CLOUD_AI
```

### PLATFORM_KEY

- server reads CV Engine-owned Gemini credential from environment/secrets manager;
- never serialized into client responses;
- usage subject to platform quotas/rate limits/cost budgets.

### BYOK_REQUEST_SCOPED

- request supplies a transient Gemini credential after first-run choice;
- credential is not persisted/cached/logged;
- provider call uses it only for that operation;
- user quota/cost applies.

### NO_CLOUD_AI

- Gemini attempts are skipped;
- Ollama may be used if configured and allowed by capability;
- deterministic core continues.

## 9. Provenance

Every AI-assisted result records non-secret provenance sufficient for debugging and trust:

```text
provider        gemini | ollama
model           exact resolved model id
capability      named capability
contractVersion capability contract version
attempt         ordinal
fallbackUsed    boolean
credentialMode  PLATFORM | BYOK | LOCAL_ONLY
requestId       opaque id
```

Never record:

- raw API key;
- partial API key;
- authorization header;
- raw resume contents in infrastructure logs unless an explicitly separate privacy-reviewed evidence workflow requires it.

## 10. Cost policy

Gemini-primary is allowed only behind application-owned cost controls.

Platform-key mode must support:

- per-session/user request quotas;
- per-capability max attempts;
- maximum token/output settings;
- usage accounting;
- daily/monthly operational budget guards;
- fast fallback/degradation rather than repeated paid retries.

BYOK usage is charged to the user's provider account, but CV Engine still enforces bounded attempts to avoid accidental consumption.

Ollama is not treated as financially free: local CPU/RAM/GPU/runtime cost exists, but it avoids per-request remote-provider billing and remains a resilience/privacy lane.

## 11. Provider health

Provider health is capability-specific.

Do not expose one global `AI READY` boolean.

Example:

```text
resumeImport:
  gemini: READY | DEGRADED | UNAVAILABLE
  ollama: READY | DEGRADED | UNAVAILABLE
  effective: READY | DEGRADED | MANUAL_ONLY
```

The trusted core health is separate from optional AI health.

## 12. Acceptance criteria

The routing layer is complete only when tests prove:

1. Gemini is attempted first in cloud-enabled modes;
2. the configured model cascade respects capability policy;
3. recoverable Gemini failure can reach Ollama;
4. unsupported facts remain rejected regardless of provider;
5. platform key never appears client-side/logged;
6. BYOK never persists;
7. whole-operation deadlines stop retry explosions;
8. provenance identifies the provider/model actually used;
9. duplicate provider attempts are bounded/idempotent where necessary;
10. complete AI outage does not corrupt or falsely complete trusted-core operations.

## 13. Quarry seeds

```text
quarry-ai-router-001 Gemini timeout → Ollama successful fallback
quarry-ai-router-002 Gemini 429 → bounded fallback
quarry-ai-router-003 Gemini malformed JSON → next model/fallback
quarry-ai-router-004 Gemini unsafe facts → rejection, never silent acceptance
quarry-ai-router-005 Ollama unavailable after Gemini failure → safe degradation
quarry-ai-router-006 provider provenance reports wrong resolved model
quarry-ai-router-007 retry chain exceeds whole-operation budget
quarry-ai-router-008 platform quota exhaustion creates paid retry loop
```
