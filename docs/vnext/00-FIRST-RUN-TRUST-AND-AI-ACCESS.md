# CV Engine vNext — First-Run Trust & AI Access

Status: **AUTHORITATIVE vNext PRODUCT SPEC**

## 1. Purpose

Every new CV Engine session begins with a trust boundary before career data is entered or any AI provider is used.

The first-run experience has two goals:

1. explain what CV Engine can and cannot guarantee;
2. let the user choose how AI-assisted capabilities are funded/authenticated.

This is a product contract, not decorative legal copy.

## 2. First-run sequence

```text
OPEN CV ENGINE
     ↓
Trust / privacy / AI disclaimer
     ↓
Explicit acknowledgement
     ↓
Choose AI access mode
     ├─ Use CV Engine AI access
     ├─ Use my Gemini API key (BYOK)
     └─ Continue without cloud AI
     ↓
Enter product
```

The third option is required by architecture even though the commercial UI may emphasize the first two. The deterministic trusted core must remain usable when cloud AI is unavailable or intentionally disabled.

## 3. Disclaimer content requirements

The disclaimer must state, in plain language:

- CV Engine helps organize career evidence, assess opportunities, and generate evidence-bound resume versions.
- CV Engine does **not** guarantee employment, interviews, recruiter decisions, ATS acceptance, ranking, or hiring outcomes.
- AI-assisted outputs may be incomplete or wrong and are validated/limited by application-owned rules where possible.
- Users must review imported or generated content before relying on it.
- Job descriptions and market information do not become candidate facts.
- Missing evidence stays missing until the user provides or confirms it.
- Resume files and career data may be processed by the selected AI provider for bounded capabilities when cloud AI is enabled.
- When the user selects the CV Engine-provided Gemini access mode, requests consume CV Engine-owned provider quota/cost.
- When the user selects BYOK, requests consume the user's Gemini project quota/cost under Google's terms.
- BYOK credentials are treated as transient secrets and are not intentionally persisted by CV Engine.
- A disclaimer does not replace technical privacy/security controls or applicable legal obligations.

The copy must avoid claiming that a disclaimer eliminates liability. It is a disclosure/consent boundary, not a substitute for secure engineering or legal review.

## 4. Consent state

The UI may retain a non-secret acknowledgement marker so the disclaimer is not shown on every navigation within the same product session.

Allowed persisted state:

```text
consentVersion
acknowledgedAt (optional)
aiAccessMode (optional preference, never the key)
```

Forbidden persisted state:

```text
Gemini API key
provider Authorization header
raw secret fragments
```

If the disclaimer version changes materially, acknowledgement must be collected again.

## 5. AI access modes

### Mode A — CV Engine AI access

The user selects:

> Use CV Engine AI

Contract:

- Gemini authentication uses a server-side environment secret owned by CV Engine.
- The secret is never returned to the browser.
- Requests are subject to CV Engine rate limits, cost controls, provider quotas, and capability policies.
- Gemini is the primary remote provider.
- Ollama is the local fallback according to the provider-routing contract.

### Mode B — Bring Your Own Gemini Key (BYOK)

The user selects:

> Use my Gemini API key

Contract:

- The key is entered into a password/secret input.
- The key is held only in browser memory for the active page lifetime by default.
- The key is not written to localStorage, sessionStorage, IndexedDB, cookies, URL/query parameters, analytics, logs, error telemetry, or durable application storage.
- Page refresh/navigation that destroys the in-memory application state may require the user to enter the key again.
- For provider calls, the key is transmitted only over HTTPS to the CV Engine server as a request-scoped secret.
- The server keeps the key only for the lifetime of the provider operation and must not persist/cache/log it.
- BYOK is disabled on non-local plain-HTTP origins because transmitting an API key over an unencrypted network is unacceptable.
- `http://localhost` development may be allowed under an explicit local-development exception.
- Gemini usage/cost belongs to the user's Gemini project.
- Ollama remains the fallback if Gemini cannot complete the bounded capability and fallback is allowed.

### Mode C — No cloud AI

The user selects:

> Continue without cloud AI

Contract:

- no Gemini request is made;
- deterministic trusted-core capabilities remain available;
- optional AI capabilities may use local Ollama if configured/available;
- unavailable optional capabilities must degrade clearly rather than block trusted manual workflows.

## 6. First-run UX requirements

The first screen must be understandable without reading legal-style paragraphs.

Recommended structure:

```text
What CV Engine does
What CV Engine does not promise
How AI and your data are used
Choose AI access
[Continue]
```

For BYOK, show a concise security note adjacent to the input:

> Your key is used only for this active session/request flow. CV Engine does not intentionally store it. Reloading the app may require entering it again.

Do not claim "we never see your key" if the server receives it transiently. The accurate claim is "we do not intentionally persist it."

## 7. Trust invariants

The selected AI access mode never changes these rules:

```text
AI output != candidate truth
Job truth != candidate truth
Intent != capability
Unsupported claim != trusted ResumeClaim
Provider success != validation success
Provider failure != permission to invent/fill gaps
```

## 8. Acceptance criteria

This first-run boundary is complete only when executable tests prove:

1. no user reaches AI-assisted features before acknowledgement;
2. platform-key mode never exposes the server key to browser code/responses;
3. BYOK works without durable key storage;
4. reload destroys the in-memory BYOK key;
5. logs/telemetry contain no raw BYOK secret;
6. BYOK is refused on insecure remote HTTP origins;
7. no-cloud mode reaches manual Career Evidence and deterministic core flows;
8. changing AI access mode never mutates Career Evidence;
9. changing the disclaimer contract version forces acknowledgement again.

## 9. Quarry seeds

```text
quarry-ai-access-001  platform secret accidentally bundled client-side
quarry-ai-access-002  BYOK survives reload/storage inspection
quarry-ai-access-003  BYOK appears in server logs
quarry-ai-access-004  insecure HTTP accepts remote BYOK
quarry-ai-access-005  provider choice blocks deterministic core
quarry-ai-access-006  stale disclaimer acknowledgement bypasses new version
```
