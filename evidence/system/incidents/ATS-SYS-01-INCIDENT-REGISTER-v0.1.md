# ATS-SYS-01 Incident Register v0.1

These incidents seed the system model. They are retained as evidence of failure classes rather than treated as disposable bugs.

## ATS-SYS-INC-001 — Whole-resume import runtime mismatch

**Status:** VERIFIED  
**Class:** PERFORMANCE

Observed behavior:

- whole-resume local model extraction used `qwen3:8b`;
- the bounded request exhausted its useful latency envelope on the observed CPU runtime;
- increasing timeout would have extended user wait without changing the workload/runtime mismatch.

System lesson:

> Workload/model/runtime pairings must be characterized before entering the product path.

Permanent test/characterization requirement:

- record prompt/input size, output size, throughput, latency, model, runtime profile, and bounded failure behavior for automatic import.

---

## ATS-SYS-INC-002 — Whole-resume generation runtime mismatch

**Status:** VERIFIED  
**Class:** PERFORMANCE

Observed behavior from Docker dogfood:

- model: `qwen3:8b`;
- prompt: 2,151 tokens;
- 1,024 prompt tokens processed after ~140.68 s (~7.28 tokens/s);
- request budget: 240,000 ms;
- request failed before useful whole-resume completion;
- observed 16K context allocated ~2.3 GiB KV cache.

System lesson:

> The root problem was not “resume importer” or “resume generator” independently. CV Engine had not characterized all AI workloads against its target runtime before placing them on critical paths.

Permanent test/characterization requirement:

- final materialization must be tested as a product capability independent of provider/model availability;
- performance tests must operate at workload level, not only model health level.

---

## ATS-SYS-INC-003 — Runtime/repository behavior mismatch

**Status:** SUSPECTED  
**Class:** VERSION_SKEW

Observed behavior:

- a user-facing failure and Docker logs showed the old whole-resume `qwen3:8b` generation path;
- a later repository revision defined deterministic final resume assembly with no final model call.

What is not yet proven:

- the exact build SHA of the container that emitted the observed failure was not exposed by the runtime itself.

Therefore this incident stays `SUSPECTED`, not `VERIFIED`.

System lesson:

> Build/runtime identity is part of system correctness and must be observable before diagnosis.

Permanent test/characterization requirement:

- release/runtime receipts must expose exact build SHA and architecture version;
- stale-artifact fault injection must prove that version skew is detected rather than misdiagnosed as a provider failure.

---

## ATS-SYS-INC-004 — ResumeVersion generation provenance mismatch

**Status:** VERIFIED  
**Class:** PROVENANCE

Observed behavior from repository inspection:

- final resume assembly had already become deterministic through `generateResumeDraft` / the compatibility alias `generateResumeWithAI`;
- `app/api/generate-resume/route.ts` still populated `ResumeVersion.generation` from the retired `OllamaResumeProvider` constants;
- therefore a trusted artifact could accurately preserve candidate facts while inaccurately describing the mechanism that produced the artifact.

Containment/correction:

- the generation route now requires the actual assembly result to provide generation provenance;
- `composeApprovedResumeVersion` receives `localAIResult.generation` rather than hard-coded Ollama metadata;
- missing generation provenance fails closed before a trusted ResumeVersion is emitted;
- the release evaluator requires the deterministic provider/model/contract tuple for promoted personas.

System lesson:

> Provenance includes operational provenance, not only candidate-fact provenance. A trusted artifact must truthfully describe both what supports its claims and how the artifact was materialized.

Permanent test/characterization requirement:

- behavior regression forbids `OLLAMA_RESUME_*` metadata at the final-generation route boundary;
- persona receipts preserve ResumeVersion generation metadata;
- `truth-invariants` fails when final-generation provenance does not match the active compositor.

---

## Incident closure rule

A future incident closes only when:

```text
classified
+ contained
+ observable
+ reproducible
+ recovery policy defined
+ permanent test/fixture OR explicit characterization gap
```

A symptom disappearing is not sufficient closure.
