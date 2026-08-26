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

## Pending input

The user will provide the Gemini model list available/desired for the project.

That list will produce a separate benchmark-driven routing document, for example:

```text
03-GEMINI-MODEL-MATRIX.md
```

The model matrix will assign primary/fallback Gemini models per capability based on evidence, cost, latency, structured-output quality, context requirements, and quota behavior.

No historical document that names an older model should override the eventual vNext model matrix.

## Governing rule

```text
Provider routing improves availability.
Truth contracts decide acceptance.
```

Gemini, Ollama, or any future provider may propose output. Candidate truth, market truth, provenance, durable state, and trusted ResumeVersion rules remain application-owned.
