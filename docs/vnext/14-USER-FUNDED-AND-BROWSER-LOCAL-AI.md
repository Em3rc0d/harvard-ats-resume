# CV Engine — User-Funded and Browser-Local AI Contract

Status: **IMPLEMENTED RELEASE CANDIDATE; LOCAL QUALITY CERTIFICATION PENDING**

Date: 2026-09-30

## Decision

Public CV Engine must not depend on a CV Engine-owned AI quota or unbounded provider bill.

The public product therefore exposes exactly two AI paths:

1. **Use my AI provider** — the user supplies a request-scoped Gemini, OpenAI, or Anthropic credential.
2. **Run AI on this device** — a quantized model executes in a browser Web Worker using WebGPU when available and WASM/CPU otherwise.

PLATFORM_GEMINI remains an internal compatibility/runtime capability. It is not a public entitlement and production rejects it unless CVENGINE_ALLOW_PLATFORM_AI=1.

## Cost boundary

### BYOK

Provider quota and token cost belong to the user's provider account.

CV Engine still applies capability allowlists, bounded attempts, input/output limits, deadlines, structured-output validation, source authority, and Fact Guardian rules.

BYOK provider usage has **zero CV Engine platform-AI cost** in the economics guard.

### Browser Local AI

The browser downloads the local model and performs model inference on the user's hardware.

This path consumes:

- **zero Gemini/OpenAI/Anthropic tokens owned by CV Engine**;
- **zero Vercel AI inference**;
- **zero server-side LLM inference**.

CV Engine still uses small authenticated deterministic server operations for source extraction and DOCX/PDF/TXT rendering. Those operations are ordinary product infrastructure, not AI inference.

Model/library assets are fetched by the browser from their configured external origins, so model-transfer bandwidth is not served through a Vercel Function.

## Current browser-local candidate

Library: @huggingface/transformers@4.3.0

Candidate model: onnx-community/Qwen2.5-0.5B-Instruct

Execution:

~~~text
WebGPU available
  -> q4f16
  -> GPU on the user's device

WebGPU unavailable
  -> int8
  -> WASM / CPU on the user's device
~~~

The local route is deliberately labelled **beta** until the CV Engine quality benchmark proves that it can satisfy the product's factual and writing-quality thresholds on representative CVs.

## Local safety boundary

The local path currently performs two bounded checks:

1. deterministic rejection when the generated resume introduces numeric claims absent from the source;
2. a separate local Fact Guardian pass comparing generated text only against the source CV.

A local result that fails either check is rejected.

This is **not yet equivalent to the release-certified cloud Fact Guardian**. Until benchmark certification closes, local output is presented as "ready for review", not as a fully qualified durable Resume Improvement Run.

## Data boundary

CV Engine does not sell, rent, or use CV content for advertising, commercial profiling, or training its own models.

That statement does **not** mean no data is ever processed or stored.

### BYOK path

- the raw provider key lives in browser memory for the session;
- the key is sent to the authenticated CV Engine request handler only so that request can be made to the selected provider;
- the raw key must not be persisted in account data, logs, analytics, cookies, URLs, local storage, provenance, or database rows;
- resume content sent to the selected provider is subject to that provider's privacy, retention, and billing terms.

### Browser-local path

- LLM inference occurs in the browser;
- no resume text is sent to Gemini, OpenAI, Anthropic, or a CV Engine-hosted LLM;
- the current implementation still sends the uploaded file to CV Engine's deterministic extraction endpoint and sends improved text to the deterministic artifact renderer;
- therefore this release must say **"AI inference runs on your device"**, not **"your CV never leaves your device"**.

A future fully device-private mode may move parsing and artifact rendering into the browser, but that is not required to remove hosted AI cost.

## Provider defaults and overrides

Current release defaults:

~~~text
Gemini     gemini-3.5-flash-lite
OpenAI     gpt-6-luna
Anthropic  claude-sonnet-5-5
~~~

BYOK deployments can override the selected model without changing source code using CVENGINE_GEMINI_BYOK_MODEL, CVENGINE_OPENAI_BYOK_MODEL, or CVENGINE_ANTHROPIC_BYOK_MODEL.

Provider credentials never come from those variables.

## Browser and CSP requirement

Local AI depends on browser support and third-party model/library origins.

Before production CSP is enforced, the policy must explicitly allow only the required pinned script/model origins. Do not weaken CSP globally merely to make local AI work.

If browser-local initialization fails, the product must fail clearly and offer BYOK. It must never silently fall back to CV Engine's platform key.

## Certification gate

Browser Local AI becomes release-qualified only after all of the following are green on the same lineage:

1. typecheck, lint, unit/contract tests, and build;
2. Chrome/Chromium WebGPU execution;
3. WASM/CPU fallback execution;
4. first-load and warm-cache measurements;
5. representative English and Spanish CV fixtures;
6. unsupported-new-claim count = 0 for accepted outputs;
7. no invented employers, roles, dates, skills, technologies, metrics, education, or credentials;
8. usable improvement quality versus the cloud baseline;
9. browser memory and failure behavior remain acceptable on ordinary laptops;
10. no network request to a cloud AI provider during Local AI inference.

If the model fails the quality gate, CV Engine keeps Local AI as experimental or removes it from the public release and retains BYOK as the safe public path.
