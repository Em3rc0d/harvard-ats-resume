# CV Engine vNext — Authoritative Additions

This directory contains architecture/product decisions that supersede conflicting historical implementation assumptions for the zero-based rebuild.

## Current authoritative additions

1. `00-FIRST-RUN-TRUST-AND-AI-ACCESS.md`
   - first-run disclaimer/consent boundary;
   - platform Gemini access vs BYOK vs no-cloud mode;
   - session/memory-only BYOK contract;
   - first-run acceptance criteria and quarries.

2. `01-AI-PROVIDER-ROUTING.md`
   - Gemini is the primary remote AI provider;
   - capability-specific Gemini model cascade;
   - Ollama is the fallback provider;
   - provider success never bypasses truth validation;
   - cost/retry/deadline/provenance rules.

3. `02-BYOK-SECRET-HANDLING.md`
   - detailed BYOK credential lifecycle;
   - no intentional persistence;
   - HTTPS requirement outside localhost;
   - logging/telemetry/storage prohibitions;
   - canary/security acceptance tests.

4. `03-GEMINI-MODEL-MATRIX.md`
   - incorporates the user-provided 2026-08-26 free-tier quota snapshot;
   - high-volume default: `gemini-3.5-flash-lite`;
   - quality escalation: `gemini-3.7-flash`;
   - reserve routes: `gemini-3.6-flash` and `gemini-3.1-flash-lite`;
   - capability-specific routing, quota/cost rules, and B6 benchmark requirements;
   - observed provider quota is not treated as a production SLA.

5. `04-BUILD-READINESS-AUDIT.md`
   - formal zero-based rebuild GO/NO-GO review;
   - records that product/truth/AI/test architecture is strong;
   - defines `PF0 — Production Foundation Closure` before B1 durability;
   - identifies the remaining identity, persistence, runtime-topology, quota/cost, and security/observability contracts.

## PF0 required documents

Before B1 durable Career Evidence is committed, the documentation set must add/freeze:

```text
05-IDENTITY-AND-SESSION-CONTRACT.md
06-DATA-PERSISTENCE-AND-LIFECYCLE.md
07-RUNTIME-TOPOLOGY-AND-DEPLOYMENT.md
08-AI-QUOTA-COST-ABUSE-POLICY.md
09-SECURITY-OBSERVABILITY-PRIVACY.md
```

B0 empty repository/tooling scaffolding may begin while PF0 is being closed. Feature code must not silently decide these production contracts.

## Governing rule

```text
Provider routing improves availability.
Truth contracts decide acceptance.
Production foundation decides ownership, durability, security and deployability.
```

Gemini, Ollama, or any future provider may propose output. Candidate truth, market truth, provenance, durable state, and trusted ResumeVersion rules remain application-owned.
