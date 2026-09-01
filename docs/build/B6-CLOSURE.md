# CV Engine — B6 Closure Receipt

Status: **CLOSED CANDIDATE — promotion exact-head certification required**

Node: **B6 — AI assistance runtime**

B6 implements AI as an optional, bounded proposal layer. Deterministic Career Evidence, Assessment and ResumeVersion remain authoritative when every AI provider is unavailable.

## Contract realized

```text
signed capability
  ↓
server-owned instruction
  ↓
credential mode from durable consent
  ↓
preflight token + paid-cost policy
  ↓
Gemini model cascade
  ↓ failure / timeout / rate limit
qualified Ollama fallback
  ↓
validated proposal + non-secret provenance
```

## Security and truth invariants

```text
AI_NEVER_AUTHORS_CANDIDATE_TRUTH          PASS
JOB_TRUTH_NEVER_BECOMES_CANDIDATE_TRUTH  PASS
ASSESSMENT_REMAINS_AUTHORITATIVE          PASS
NO_HIRING_PROBABILITY                     PASS
BYOK_REQUEST_SCOPED_ONLY                  PASS
NO_CLOUD_SKIPS_GEMINI                     PASS
GEMINI_KEY_GEMINI_ONLY                    PASS
OLLAMA_NEVER_RECEIVES_GEMINI_KEY          PASS
ERROR_BODY_NOT_PROPAGATED                 PASS
LOGS_AND_PROVENANCE_SECRET_FREE           PASS
```

## Runtime controls

- capability-specific model routes and attempt caps;
- conservative preflight input budget;
- max output token budget;
- per-attempt abort timeout;
- whole-operation deadline;
- normalized auth/rate-limit/timeout/unavailable/model/response failures;
- deterministic result SHA-256;
- provider/model/attempt/fallback/request provenance;
- explicit provider availability surface;
- total provider outage degrades safely while trusted core remains functional.

## Economics

Pricing policy is versioned as `google-gemini-paid-standard-2026-09-01` and expires after `2026-12-31`, forcing recertification rather than silently using stale prices. Each capability has a maximum paid-cost ceiling checked before provider execution.

## Physical secret/fallback certification

`src/domain/b6-runtime.test.ts` uses real loopback HTTP servers rather than a mocked fetch. Canary credentials prove:

1. Gemini secret is delivered only through Gemini's expected auth header.
2. Ollama fallback receives no Gemini secret in headers or body.
3. Provider error bodies containing canary secrets are normalized and never echoed.
4. `NO_CLOUD_AI` produces zero Gemini requests.
5. Timed-out Gemini attempts are aborted and degrade to fallback.
6. Oversized inputs are rejected before either provider receives career content.

## Product wiring

Assessment exposes optional `OPPORTUNITY_EXPLANATION`. The prompt is derived from deterministic B3 output and supporting evidence. BYOK comes from the in-memory session store. The result is labeled proposal-only and includes provider/model/request provenance.

## Exact-head evidence

Final implementation head before promotion:

```text
78bb000a634c6ebf5946e4b0162ae6591598fe9a
```

```text
CV Engine vNext Construction    33509286148  SUCCESS
CV Engine B1 PostgreSQL Gate    33509286145  SUCCESS
CV Engine B2 PostgreSQL Gate    33509286196  SUCCESS
CV Engine B3 PostgreSQL Gate    33509286168  SUCCESS
CV Engine B4 PostgreSQL Gate    33509286113  SUCCESS
CV Engine B5 PostgreSQL Gate    33509286126  SUCCESS
CV Engine B6 AI Runtime Gate    33509286265  SUCCESS
```

## Qualification boundary

B6 closes the provider protocol/runtime contract and physically proves its security properties. A real production provider credential is deployment configuration, not candidate-truth authority. B8 must still prove that the deployed runtime advertises only actually configured capabilities and that the trusted no-AI path remains functional.

After promotion certification:

```text
B6 = CLOSED
B7 = READY_TO_BUILD
```
