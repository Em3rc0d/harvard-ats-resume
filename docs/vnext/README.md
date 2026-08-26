# CV Engine vNext — Authoritative Rebuild Contracts

This directory contains the authoritative product, AI, security and production-foundation contracts for the zero-based rebuild.

## Status

```text
PRODUCT / TRUTH ARCHITECTURE     CLOSED
AI / BYOK ARCHITECTURE           CLOSED
PF0 PRODUCTION FOUNDATION        CLOSED
ZERO-BASED IMPLEMENTATION        AUTHORIZED
PRODUCTION READY CLAIM           BLOCKED UNTIL IMPLEMENTATION + B8 EVIDENCE
```

The documentation phase has reached its stop condition. From this point onward, broad conceptual redesign is prohibited unless executable evidence demonstrates a genuinely missing boundary.

## Authority set

1. `00-FIRST-RUN-TRUST-AND-AI-ACCESS.md`
   - disclaimer/consent boundary;
   - platform Gemini vs BYOK vs no-cloud;
   - AI never gates the trusted deterministic core.

2. `01-AI-PROVIDER-ROUTING.md`
   - provider-agnostic gateway;
   - Gemini primary;
   - Ollama fallback when available/qualified;
   - same validation contract across providers.

3. `02-BYOK-SECRET-HANDLING.md`
   - transient request/session secret;
   - no intentional persistence;
   - HTTPS outside localhost;
   - canary leakage tests.

4. `03-GEMINI-MODEL-MATRIX.md`
   - initial model routing baseline;
   - high-volume default: Gemini 3.5 Flash Lite;
   - quality escalation: Gemini 3.7 Flash;
   - reserves: Gemini 3.6 Flash / Gemini 3.1 Flash Lite;
   - free-tier snapshot is not a production SLA.

5. `04-BUILD-READINESS-AUDIT.md`
   - **PF0 CLOSED — IMPLEMENTATION AUTHORIZED**;
   - final GO/NO-GO boundary for construction.

6. `05-IDENTITY-AND-SESSION-CONTRACT.md`
   - Supabase Auth;
   - authenticated durable Career Vaults;
   - single-user B2C ownership;
   - application authorization + PostgreSQL RLS;
   - account export/deletion.

7. `06-DATA-PERSISTENCE-AND-LIFECYCLE.md`
   - Supabase PostgreSQL as durable authority;
   - revisioned Career Evidence;
   - immutable historical snapshots/ResumeVersions;
   - ephemeral private source-file processing;
   - Redis is operational, not truth authority.

8. `07-RUNTIME-TOPOLOGY-AND-DEPLOYMENT-CONTRACT.md`
   - Next.js 16 / Vercel commercial runtime;
   - Supabase Auth/Postgres/temp Storage;
   - Gemini primary;
   - Ollama local/remote fallback when qualified;
   - deterministic/manual degradation when unavailable.

9. `08-AI-QUOTA-COST-AND-ABUSE-POLICY.md`
   - capability-owned attempt budgets;
   - daily/platform cost guards;
   - quality escalation scarcity;
   - PostgreSQL usage accounting;
   - BYOK remains bounded.

10. `09-SECURITY-OBSERVABILITY-PRIVACY-BASELINE.md`
    - data classification;
    - metadata-first observability;
    - CSP/security headers;
    - secret redaction/canary;
    - private upload boundary;
    - processor inventory/incident baseline.

11. `10-ULTRAPREMIUM-UI-MOTION-QUALITY-BAR.md`
    - $45K visual/product quality bar;
    - $22K motion/fluidity bar;
    - applies after functionality/UX/accessibility/responsiveness are correct.

## Governing architecture

```text
Career Evidence = candidate authority
Job Snapshot    = market truth
Career Target   = intent
Assessment      = derived analysis
ResumeVersion   = deterministic projection
AI              = bounded assistant
```

```text
PostgreSQL = durable authority
Gemini     = primary remote AI
Ollama     = resilience fallback when available
Redis      = optional operational accelerator
```

## Build order

```text
B0    empty implementation / typed contracts / CI
B0.5  first-run trust + identity + AI access
B1    Career Evidence + durable ownership
B2    Career Target + Job truth
B3    Assessment
B4    deterministic ResumeVersion + export
B5    import convenience
B6    AI gateway implementation + qualification
B7    Opportunity Space / market extension
B8    production evidence / release qualification
```

## New working rule

```text
DESIGN → CLOSED
BUILD  → NOW
```

Allowed documentation from here is implementation evidence: ADRs, migrations, quarries, benchmark receipts, security evidence and release records.

Provider routing improves availability. Truth contracts decide acceptance. Production foundation decides ownership, durability, security and deployability.
