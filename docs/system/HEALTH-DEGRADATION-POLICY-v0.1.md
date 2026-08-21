# Health & Degradation Policy v0.1

## Purpose

Service health and capability availability are not the same question.

ATS-SYS-01 classifies local AI as bounded/optional intelligence for automatic import and inline optimization. Final resume assembly is deterministic. Therefore an Ollama outage must not mark the whole trusted core unavailable when durable state remains healthy.

## Policy

```text
Durable Redis READY + Local AI READY
→ READY / HTTP 200

Durable Redis READY + Local AI UNAVAILABLE
→ DEGRADED / HTTP 200
→ trusted core available
→ resume-import-ai and inline-optimize degraded

Durable Redis UNAVAILABLE
→ UNAVAILABLE / HTTP 503
→ trusted core unavailable for durable ResumeVersion state
```

## Why this matters

Treating every dependency as fatal creates false diagnoses and makes graceful degradation impossible. Treating every dependency as optional creates false trust claims.

The health decision must follow capability contracts:

- optional/bounded intelligence can degrade;
- truth, provenance, and durability boundaries cannot silently degrade into trusted success.

## Docker consequence

The application container healthcheck may remain healthy during an Ollama outage when the trusted core can still serve manual evidence and deterministic operations. Capability-level UI must communicate which AI-assisted actions are unavailable rather than claiming the whole product is down.
