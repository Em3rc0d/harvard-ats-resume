# CV Engine — BYO AI + Browser-Local Compute

Status: **IMPLEMENTATION BASELINE; LOCAL MODEL QUALITY CERTIFICATION PENDING**

Date: 2026-09-30

## Decision

Public CV Engine no longer treats an operator-owned Gemini credential as a customer entitlement.

Public AI execution has exactly two product paths:

1. **Use my AI provider** — the user supplies a request/session-scoped API key for Gemini, OpenAI, or Anthropic.
2. **Run AI on this device** — inference is executed in the browser using the user's compute.

PLATFORM_GEMINI remains a legacy/internal capability only and is rejected by the public resume-improvement endpoint.

## Privacy statement

CV Engine does not sell, rent, or use CV content for advertising, commercial profiling, or training CV Engine-owned models.

This statement does not mean CV Engine stores no information. Account, provenance, improvement history, and other product state may still be persisted when required by the chosen product workflow.

When BYO AI is selected, content required for the bounded operation is sent to the selected provider and is subject to that provider's terms and privacy practices.

Raw BYOK credentials are transient secrets and must not be written to durable storage, logs, analytics, cookies, URLs, localStorage, sessionStorage, or IndexedDB.

## Public cost invariant

For the public resume-improvement route, platformGeminiKey is always null. The presence of GEMINI_API_KEY in the Vercel environment must not give public users access to operator-funded model calls.

## Provider baseline

- Gemini BYOK → existing stable Gemini routing.
- OpenAI BYOK → gpt-5.6-luna baseline.
- Anthropic BYOK → claude-sonnet-5 baseline.
- Local browser → WebGPU preferred, WASM/CPU fallback.

Provider model IDs remain runtime policy and may change after benchmarks without changing the product contract.

## Local-browser release gate

Selecting Local AI is not sufficient to call the feature production-qualified. Before Local AI is promoted from implementation baseline to certified public path, it must pass the same representative CV acceptance contract as cloud providers:

- source semantic understanding;
- material resume improvement;
- unsupported new claims = 0;
- Fact Guardian pass or safe repair;
- locale preservation;
- ATS-safe artifacts;
- readability/pagination gate;
- representative browser/device performance.

Until that benchmark is green, Local AI must never silently fall back to CV Engine's platform key.

## Non-goals

This change does not introduce subscriptions, operator-funded unlimited AI, GPU hosting on Vercel, API-key rotation to evade quotas, or a separate product truth model for each provider.

Candidate Source Authority, Fact Guardian, provenance, and quality gates remain provider-independent.