# CV Engine vNext — Build Readiness Audit

Status: **PF0 CLOSED — IMPLEMENTATION AUTHORIZED**

Date: 2026-08-26

## 1. Question

Can CV Engine now be rebuilt from an empty application tree and taken toward production primarily from the documentation, without recreating major product, truth, identity, persistence, AI, security or topology decisions ad hoc inside feature code?

## 2. Final verdict

```text
READY TO START ZERO-BASED IMPLEMENTATION      YES
READY TO BUILD TRUSTED DOMAIN CORE            YES
READY TO IMPLEMENT PRODUCTION TOPOLOGY        YES — qualification still requires runtime evidence
READY TO CLAIM PRODUCTION READY TODAY         NO — implementation + B8 evidence still required
PF0 PRODUCTION FOUNDATION                     CLOSED
```

The documentation phase has reached its stop condition.

> **Stop adding broad conceptual layers. Create the empty implementation branch and build.**

Future documentation is limited to implementation ADRs, contract corrections forced by executable evidence, quarry receipts, test evidence and release records.

## 3. Product/truth foundation — CLOSED

```text
Career Evidence = candidate authority
Job Snapshot    = market truth
Career Target   = intent
Assessment      = derived analysis
ResumeVersion   = deterministic projection
AI output       = bounded proposal
```

The Job Description cannot become Career Evidence. Unsupported facts remain unsupported regardless of provider.

## 4. First-run / AI access — CLOSED

Authoritative contracts:

- `00-FIRST-RUN-TRUST-AND-AI-ACCESS.md`
- `01-AI-PROVIDER-ROUTING.md`
- `02-BYOK-SECRET-HANDLING.md`
- `03-GEMINI-MODEL-MATRIX.md`

Initial routing baseline:

```text
routine/high-volume       Gemini 3.5 Flash Lite
quality escalation        Gemini 3.7 Flash
Gemini reserve            Gemini 3.6 Flash
capacity reserve          Gemini 3.1 Flash Lite
provider fallback         Ollama
truth authority           CV Engine validators/domain
```

Provider availability never changes truth rules.

## 5. PF0 production foundation — CLOSED

### PF0-01 Identity / ownership

Authoritative: `05-IDENTITY-AND-SESSION-CONTRACT.md`

Decision:

```text
Supabase Auth
single-user B2C ownership
CareerVault.ownerUserId
application authorization + PostgreSQL RLS
no anonymous durable production CareerVault
```

### PF0-02 Persistence / lifecycle

Authoritative: `06-DATA-PERSISTENCE-AND-LIFECYCLE.md`

Decision:

```text
PostgreSQL / Supabase = durable authority
Redis                  = optional operational accelerator
Career Evidence        = revisioned
Career/Job snapshots   = immutable when used historically
ResumeVersion          = immutable
source uploads          = ephemeral/private by default
```

### PF0-03 Runtime / deployment

Authoritative: `07-RUNTIME-TOPOLOGY-AND-DEPLOYMENT-CONTRACT.md`

Decision:

```text
Next.js 16 → Vercel commercial production
Supabase → Auth/Postgres/private temp Storage
Gemini   → primary AI
Ollama   → fallback when a qualified local/remote endpoint exists
Upstash  → optional operational controls
```

Missing Ollama must degrade AI capability safely rather than kill trusted core functionality.

### PF0-04 AI quota / cost / abuse

Authoritative: `08-AI-QUOTA-COST-AND-ABUSE-POLICY.md`

Decision:

- capability-owned attempt budgets;
- max 2 Gemini + 1 Ollama attempt hard ceiling before benchmarks;
- scarce quality escalation;
- durable PostgreSQL usage ledger;
- Redis may accelerate burst controls but cannot remove cost protection if unavailable;
- BYOK remains bounded and is not a generic Gemini proxy;
- supplied free-tier limits are dogfood/small-beta evidence, not production SLA.

### PF0-05 Security / observability / privacy

Authoritative: `09-SECURITY-OBSERVABILITY-PRIVACY-BASELINE.md`

Decision:

- explicit data classification;
- metadata-first logs;
- no raw career content/secrets in production logs by default;
- secret canary tests;
- CSP/security-header baseline;
- HTTPS-only remote BYOK;
- private/validated uploads;
- provider/processor inventory;
- incident runbooks;
- RLS/IDOR security gates.

## 6. Infrastructure cost posture

The production architecture deliberately separates development cost from public commercial guarantees.

Development/dogfood may use free tiers where terms/capabilities permit.

Public commercial production must use infrastructure tiers consistent with commercial use and the durability/backup guarantees we claim.

The architecture does not require an always-on GPU merely to keep the product alive.

## 7. Build order — AUTHORIZED

```text
B0    empty implementation + tooling + typed contracts + CI
B0.5  first-run trust / identity / AI access skeleton
B1    Career Evidence + PostgreSQL ownership/durability
B2    Career Target + Job truth
B3    explainable deterministic Assessment
B4    deterministic ResumeVersion + provenance + export
B5    trusted resume import convenience
B6    Gemini/Ollama AI gateway implementation + benchmarks
B7    Opportunity Space / market extension
B8    production hardening + identified-runtime qualification
```

Import and AI are intentionally downstream of the trusted manual/deterministic core.

## 8. What documentation may happen from now on

Allowed:

- ADR documenting a concrete implementation choice;
- contract correction forced by a failing executable fixture;
- quarry/failure record;
- benchmark/model qualification receipt;
- migration plan;
- security/release evidence;
- user-facing Terms/Privacy/Disclaimer copy before public release.

Not allowed without new evidence:

- another broad architecture redesign;
- reopening Career Evidence truth authority;
- moving AI back underneath the trusted core;
- making import mandatory for the product to function;
- selecting infrastructure because the old prototype happened to use it.

## 9. Implementation gate

The next artifact is **not another design document**.

The next artifact is the zero-based implementation branch.

B0 Definition of Done:

```text
clean application skeleton
supported Next.js/TypeScript runtime
package manager lockfile
typecheck
lint
unit test
build
CI
folder/module boundaries
first domain contract tests
no copied legacy implementation code
```

Only after B0 is green does B0.5/B1 feature implementation begin.

## 10. Final declaration

```text
PF0 = CLOSED
DESIGN STOP CONDITION = REACHED
IMPLEMENTATION = AUTHORIZED
PRODUCTION READINESS CLAIM = STILL BLOCKED UNTIL B8 RECEIPTS
```

CV Engine now leaves architecture planning and enters construction.
