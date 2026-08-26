# CV Engine vNext — Runtime Topology & Deployment Contract

Status: **AUTHORITATIVE PF0 PRODUCTION CONTRACT**

## 1. Decision

CV Engine vNext uses a split topology that keeps the web product inexpensive and does not force local-model infrastructure underneath trusted core functionality.

```text
Browser
   ↓ HTTPS
Next.js 16 on Vercel
   ├── Supabase Auth
   ├── Supabase PostgreSQL
   ├── Supabase private temporary Storage (import transport only)
   ├── Gemini API (primary AI)
   ├── Ollama adapter (fallback when configured/available)
   └── Upstash Redis (optional operational controls)
```

Vercel hosts the web/application layer. PostgreSQL is the durable authority. Gemini is the first AI provider. Ollama is a fallback provider, not a trusted-core dependency.

## 2. Deployment profiles

CV Engine has explicit runtime profiles rather than pretending one topology fits every environment.

### LOCAL-DEV

```text
Next.js local
Postgres/Supabase local or dev project
Gemini optional
local Ollama available
Redis optional
```

Purpose: development, deterministic tests, local AI fallback characterization.

### PREVIEW / STAGING

```text
Vercel Preview
Supabase non-production project/branch
Gemini test/project key or BYOK
Ollama fallback optional
Upstash optional
```

Never use production PII/credentials by default.

### PRODUCTION-CLOUD

```text
Vercel Pro commercial deployment
Supabase production Postgres/Auth
Gemini platform project/key
Ollama fallback configured as a remote Ollama endpoint only when qualified
Upstash Redis optional operational dependency
```

### SELF-HOSTED / PRIVACY PROFILE (future-supported lane)

```text
Next.js/node runtime
PostgreSQL
local/private Ollama
Gemini optional/disabled
```

This profile is not automatically qualified merely because the code can run there.

## 3. Commercial hosting decision

The public commercial product uses Vercel **Pro or an explicitly equivalent commercial plan**, not Hobby.

Reason: Vercel's Hobby plan is restricted to personal/non-commercial use. Preview/dogfood can use non-commercial lanes; commercial production cannot rely on a plan whose terms prohibit the workload.

## 4. Region principle

Application compute should run close to the durable database.

Production configuration must intentionally select compatible Vercel/Supabase regions where available rather than accepting arbitrary defaults.

Release receipts record:

- application region;
- database region;
- provider endpoint region when known;
- build SHA;
- architecture version;
- runtime profile.

No cross-region latency/support claim without measurement.

## 5. Hosted Ollama decision

Ollama support has two physical implementations:

```text
LOCAL OLLAMA
http://localhost/private-network:11434

REMOTE OLLAMA
qualified HTTPS Ollama-compatible endpoint
```

The AI Gateway sees one provider contract. Infrastructure determines which adapter endpoint is available.

### Critical rule

`Gemini → Ollama` is the **logical fallback order when Ollama is provisioned and healthy**.

It does not mean CV Engine will maintain an expensive always-on GPU worker from day one merely to satisfy a diagram.

For initial low-cost public production, acceptable fallback options are, in policy order:

1. qualified Ollama Cloud/API endpoint using a server-side Ollama credential;
2. separately provisioned/self-hosted Ollama worker if cost/performance evidence justifies it;
3. if no Ollama runtime is qualified/available: deterministic/manual safe degradation.

Therefore:

```text
Gemini fails
   ↓
Ollama configured + healthy?
   ├─ yes → attempt bounded fallback
   └─ no  → safe degradation
```

Never route from Vercel to a developer laptop or home-network tunnel as a production dependency.

## 6. Ollama endpoint security

A remote Ollama endpoint must:

- use HTTPS;
- require server-side authentication where provider supports it;
- not be reachable through browser-exposed credentials;
- enforce an allowlist of models/capabilities;
- have request/deadline limits;
- not receive Gemini BYOK credentials;
- return normalized provider errors through the AI Gateway;
- be independently health-characterized.

A private self-hosted worker requires network/firewall controls and is not public unauthenticated port `11434`.

## 7. Gemini topology

Gemini requests always originate server-side for CV Engine platform-key mode.

BYOK requests:

```text
Browser memory secret
  ↓ HTTPS first-party request
Vercel server request scope
  ↓
Gemini adapter
  ↓
Google Gemini API
```

No Gemini key is compiled into browser bundles.

## 8. Resume upload transport

Vercel Functions have request/response body limits smaller than the 10 MB CV product limit in standard configurations. CV Engine therefore does not pipe the raw 10 MB upload through a normal application JSON/multipart route.

Preferred production transport:

```text
1. authenticated client requests temporary upload authorization
2. server creates user-scoped signed upload target
3. browser uploads directly to private object storage
4. import operation receives opaque object id
5. server/worker reads and validates object
6. extraction completes or fails safely
7. object is deleted
8. cleanup job removes abandoned temporary objects
```

This is transport infrastructure, not durable Career Evidence storage.

## 9. Long-running operations

AI/document operations have application-owned whole-operation deadlines shorter than hosting maximums.

We do not use large platform timeouts as our product timeout policy.

Example classes:

```text
interactive assessment/optimization  short bounded request
resume import                         bounded long operation
export                                short deterministic operation
market refresh                        async/background in later phases
```

B5/B6 benchmarks freeze actual release budgets.

## 10. Background work

No business-critical request may rely on an untracked fire-and-forget promise.

If a capability becomes asynchronous, it requires a durable job/operation record with explicit state:

```text
QUEUED
RUNNING
SUCCEEDED
FAILED_SAFE
CANCELLED
```

BYOK raw secrets may never be placed in durable background queues. Therefore BYOK capabilities must complete within the request/session secret lifetime or use a future explicitly reviewed secure credential mechanism.

## 11. Runtime health model

Expose separate health dimensions:

```text
trustedCore:
  postgres
  auth

gemini:
  capability-specific readiness

ollama:
  configured?
  reachable?
  models?

operational:
  redis
  temporary storage
```

Do not return one misleading `READY` when trusted core is unavailable.

Example effective state:

```text
trustedCore = READY
Gemini = UNAVAILABLE
Ollama = UNAVAILABLE
AI-assisted import = MANUAL_ONLY
manual Career Evidence = READY
ResumeVersion deterministic = READY
```

## 12. Deployment pipeline

Production deploy path:

```text
implementation branch
  ↓
PR CI
  ↓
Preview deployment
  ↓
E2E + security + migration checks
  ↓
merge release candidate
  ↓
production deployment
  ↓
identified-runtime smoke/receipts
  ↓
release qualification
```

No automatic "deploy succeeded = release qualified" claim.

## 13. Infrastructure secrets

Server-only environment/secrets:

- Supabase server/service credentials where required;
- CV Engine Gemini credential;
- Ollama remote credential if used;
- Upstash credential;
- telemetry DSN/token if later introduced.

Public/client configuration contains only values explicitly safe for browser use (for example Supabase publishable URL/key according to provider model), and authorization is still enforced by RLS/server checks.

## 14. Cost posture

Initial production should avoid always-on model compute.

```text
Vercel + Supabase = predictable web/data baseline
Gemini = request-based primary AI
Ollama = local/remote fallback only when qualified and economically justified
Redis = low-cost optional operational service
```

The fallback architecture is designed so an unavailable Ollama endpoint produces safe degradation, not an outage of Career Evidence.

## 15. Release topology claims

Each B8 release receipt identifies the exact profile.

Do not claim:

- local Ollama behavior proves remote Ollama behavior;
- Vercel Preview proves Production region performance;
- a provider being configured proves its fallback worked;
- a hosting maximum is an application SLA;
- free-tier capacity is production support.

## 16. Acceptance criteria

PF0-03 is closed when implementation/release tests prove:

1. trusted core runs without Ollama;
2. production platform key is server-only;
3. Gemini failure reaches Ollama only when Ollama is configured/healthy;
4. missing Ollama degrades safely;
5. remote Ollama credentials/endpoints are not exposed client-side;
6. 10 MB uploads bypass function body-size bottlenecks via private signed transport;
7. temporary uploads are deleted;
8. production runtime reports build/profile/region/provider identities;
9. preview/staging does not use production data by default;
10. commercial production does not rely on Vercel Hobby.

## 17. Quarry seeds

```text
quarry-runtime-001 Gemini down + Ollama healthy
quarry-runtime-002 Gemini down + Ollama unconfigured
quarry-runtime-003 Ollama endpoint accidentally public unauthenticated
quarry-runtime-004 10MB upload sent through limited function body
quarry-runtime-005 abandoned temporary object never deleted
quarry-runtime-006 preview connects to production database
quarry-runtime-007 wrong region produces unsupported latency claim
quarry-runtime-008 remote Ollama credential emitted to browser
```
