# CV Engine vNext — AI Quota, Cost & Abuse Policy

Status: **AUTHORITATIVE PF0 PRODUCTION CONTRACT**

## 1. Purpose

Gemini-primary must not become an uncontrolled cost center, and BYOK must not become an unlimited proxy.

This policy governs:

- model routing;
- provider attempts;
- user/platform quotas;
- daily budget exhaustion;
- burst abuse;
- cost provenance;
- BYOK behavior;
- Ollama fallback economics.

Truth acceptance remains governed by domain validation, not quota policy.

## 2. Observed development quota baseline

The supplied Gemini free-tier project snapshot on 2026-08-26 provides the initial engineering baseline:

```text
Gemini 3.5 Flash Lite   15 RPM / 250K TPM / 500 RPD
Gemini 3.1 Flash Lite   15 RPM / 250K TPM / 500 RPD
Gemini 3.6 Flash         5 RPM / 250K TPM / 20 RPD
Gemini 3.7 Flash         5 RPM / 250K TPM / 20 RPD
Gemini 3 Flash           5 RPM / 250K TPM / 20 RPD
Gemini 2.5 Flash         5 RPM / 250K TPM / 20 RPD
```

These values are **observed project limits**, not permanent product SLAs. Provider quotas can vary by project/tier/model/time.

The application must treat model/rate configuration as environment/runtime policy rather than compile-time truth.

## 3. Initial routing baseline

```text
ROUTINE / HIGH-VOLUME
Gemini 3.5 Flash Lite

QUALITY ESCALATION
Gemini 3.7 Flash

RESERVE
Gemini 3.6 Flash

CAPACITY / COMPATIBILITY RESERVE
Gemini 3.1 Flash Lite

PROVIDER FALLBACK
Ollama

FINAL AUTHORITY
CV Engine validators/domain
```

B6 benchmarks may change model order without changing this policy architecture.

## 4. Capability budgets

Every AI capability declares a budget object:

```text
AIExecutionBudget
- capability
- maxGeminiAttempts
- maxOllamaAttempts
- maxInputTokens
- maxOutputTokens
- perAttemptTimeoutMs
- wholeOperationDeadlineMs
- allowQualityEscalation
- maxQualityEscalations
- platformCostClass
```

No code path may call a provider outside a declared capability budget.

## 5. Retry/cascade rule

Retries are not the default response to model disappointment.

The maximum conceptual chain is:

```text
Gemini primary
  ↓ recoverable failure / bounded invalid output
Gemini quality/reserve model (only if capability permits)
  ↓ recoverable failure
Ollama (if configured + permitted)
  ↓
safe result OR degradation
```

One model is never retried endlessly with identical input.

Initial hard ceiling before benchmarks:

```text
max Gemini attempts per AI operation = 2
max Ollama attempts per AI operation = 1
total provider attempts               = 3
```

Most routine capabilities should use fewer.

## 6. Quality escalation is scarce

Gemini 3.7/3.6 lanes are intentionally scarce in the supplied free-tier snapshot.

Therefore they are not global defaults.

Escalation may occur only when:

- capability policy allows it;
- the result matters enough to justify it;
- primary output failed schema/semantic validation or a known quality threshold;
- daily reserve remains;
- whole-operation deadline permits it.

Do not escalate simply because a user presses retry.

## 7. Development/small-beta platform-key guardrails

Until paid production quotas are characterized, platform-owned free-tier usage is a dogfood/small-beta lane.

Initial conservative service guards:

```text
3.5 Flash Lite service budget: <= 400 requests/day
3.1 Flash Lite reserve:       <= 100 requests/day
3.7 Flash quality reserve:    <= 12 requests/day
3.6 Flash emergency reserve:  <= 6 requests/day
```

These internal caps intentionally stay below the observed provider ceilings and leave operational headroom.

They are engineering safety limits, not customer entitlements.

## 8. Per-user platform-key policy

Initial beta policy:

- authenticated account required for CV Engine-owned Gemini access;
- burst limiter per user/IP/device risk signal;
- daily AI-operation allowance configurable by environment;
- expensive quality escalations have a lower user allowance;
- repeated rejected/invalid requests still count toward provider consumption where a provider call occurred;
- deterministic trusted-core actions never consume AI quota.

The exact commercial plan/entitlement system is deferred. The gateway accepts a generic quota decision rather than embedding pricing tiers into domain code.

## 9. Durable usage ledger

PostgreSQL stores non-secret AI usage/accounting metadata sufficient to enforce daily/platform budgets:

```text
AIExecution
- userId
- requestId
- capability
- credentialMode
- provider
- model
- attempt
- status
- fallbackUsed
- inputTokenCount?  // when provider returns it
- outputTokenCount?
- startedAt
- completedAt
- estimated/actualCost? // when available
```

Never store raw BYOK secrets or raw resume payloads in this ledger.

Redis may accelerate burst limits, but PostgreSQL/usage accounting remains the durable source for platform budget decisions.

## 10. Redis outage behavior

Redis is not allowed to silently remove cost protection.

If Redis burst limiting is unavailable:

- durable per-user/platform budget checks still execute using PostgreSQL;
- the system may apply a stricter conservative request policy;
- it must never switch to unlimited platform-key Gemini usage.

## 11. Platform quota exhaustion

When CV Engine-owned Gemini budget/quota is exhausted:

```text
PLATFORM_KEY request
   ↓
Gemini unavailable by policy/quota
   ↓
Ollama configured + allowed?
   ├─ yes → bounded Ollama fallback
   └─ no  → AI capability degraded
```

UX offers, as applicable:

- continue deterministic/manual workflow;
- switch to BYOK;
- retry later.

Never charge unexpectedly by disabling a budget guard automatically.

## 12. BYOK policy

BYOK moves Gemini provider quota/cost to the user's Google project, but does **not** remove CV Engine controls.

Still enforce:

- model allowlist;
- capability scope;
- max attempts;
- token/output limits;
- deadlines;
- request/body limits;
- abuse/rate limits;
- truth validation.

CV Engine is not a generic Gemini proxy.

If a user's key cannot access a configured model, normalize the provider error and either:

- try another allowlisted model when policy permits;
- fall back to Ollama;
- degrade safely.

Do not enumerate arbitrary provider resources using the user's key unless a future capability explicitly requires and discloses it.

## 13. Ollama economics

Ollama local execution has infrastructure cost even without per-request API billing.

Remote Ollama/Ollama Cloud may have plan/usage limits.

Therefore the gateway tracks Ollama attempts and latency like any other provider.

The existence of Ollama fallback does not justify keeping expensive always-on model hardware without observed need.

## 14. Abuse boundaries

Mandatory protections:

```text
per-IP burst limit
per-user burst limit
per-user daily AI limit
platform daily provider budget
request/body size limit
operation concurrency limit
provider attempt limit
whole-operation deadline
idempotency/deduplication
suspicious repetition detection hooks
```

Repeated submission of the same idempotent operation should reuse/return the prior operation result where safe rather than repaying provider cost.

## 15. Cost observability

Before commercial release we must be able to answer:

```text
AI requests/day
AI requests/user
AI requests/capability
Gemini model distribution
quality escalation rate
Ollama fallback rate
provider failure rate
tokens when supplied
estimated/actual cost per capability
cost per successful ResumeVersion/import/assessment
quota rejections
```

No PII is required to answer those questions.

## 16. Paid production transition

The free-tier snapshot is not the production capacity plan.

Before public commercial production:

1. identify the actual Gemini project/tier;
2. capture current quotas for each routed model;
3. benchmark representative workload tokens/latency;
4. calculate cost envelope at expected active users;
5. set hard daily/monthly budget alerts/guards;
6. run quota-exhaustion fault tests;
7. update the runtime policy artifact without changing truth contracts.

## 17. Failure semantics

Normalized causes include:

```text
QUOTA_USER
QUOTA_PLATFORM
RATE_LIMIT_LOCAL
RATE_LIMIT_PROVIDER
BUDGET_EXHAUSTED
PROVIDER_TIMEOUT
PROVIDER_UNAVAILABLE
MODEL_UNAVAILABLE
INVALID_OUTPUT
UNSAFE_OUTPUT
```

Do not display all of these raw labels to users, but preserve them in non-sensitive execution provenance.

## 18. Acceptance criteria

PF0-04 is closed when implementation proves:

1. every provider call belongs to a declared capability budget;
2. total provider attempts cannot exceed policy;
3. quality models are not routine defaults;
4. platform daily cap blocks further paid/provider calls;
5. Redis outage does not create unlimited usage;
6. BYOK cannot call arbitrary models/APIs through CV Engine;
7. duplicate/idempotent requests do not multiply provider calls unnecessarily;
8. quota exhaustion degrades to Ollama/manual/deterministic behavior as configured;
9. usage ledger contains provider/model/capability but no secrets/raw career payloads;
10. release qualification captures the actual provider tier/quota policy.

## 19. Quarry seeds

```text
quarry-cost-001 retry loop burns 20 Gemini calls
quarry-cost-002 user refresh duplicates paid generation
quarry-cost-003 Redis outage disables rate limit entirely
quarry-cost-004 3.7 quality model consumed for every routine request
quarry-cost-005 daily platform budget exceeded without block
quarry-cost-006 BYOK used as arbitrary Gemini proxy
quarry-cost-007 provider 429 creates recursive fallback loop
quarry-cost-008 quota error incorrectly mutates Career Evidence
```
