# ATS-SYS-01 — System Characterization & Failure Model v0.1

## Status

**ACTIVE — characterization phase.**

This program temporarily changes the product question from **“how do we fix this incident?”** to **“what does CV Engine require, tolerate, degrade, and prove as a complete system?”**

No release claim may be derived from this document alone. Unknowns stay explicitly uncharacterized until measured.

## Why this exists

Three real dogfood incidents showed a repeated diagnosis pattern:

1. a whole-resume import workload on a local 8B model exceeded the useful latency envelope;
2. a separate whole-resume generation workload on the same class of runtime also exceeded the useful latency envelope;
3. later observed runtime behavior appeared inconsistent with the repository architecture, exposing a likely build/runtime identity problem.

The system lesson is broader than any one fix: **CV Engine had construction tests, but it did not yet have a complete product/runtime/failure characterization contract.**

ATS-SYS-01 closes that gap.

## Binding principles

1. **Evidence before architecture.** Benchmark and characterize before choosing a workload/model/runtime pairing.
2. **Failure classes before patches.** Every significant incident must map to a reusable failure class or extend the taxonomy once.
3. **Critical truth must not depend on optional intelligence.** Local AI may assist bounded work, but it is never truth authority.
4. **Optional intelligence may degrade; trusted product truth may not.**
5. **Unknown is not pass.** An unmeasured runtime, latency budget, persona, or fault case is `UNCHARACTERIZED`, never implicitly supported.
6. **Release means end-to-end proof.** Unit tests, build success, and browser availability are necessary but insufficient.
7. **Runtime identity is part of correctness.** A diagnosis without exact build identity is incomplete.

## System boundary under characterization

The acceptance path is the actual product path:

```text
Source Resume / Manual Evidence
        ↓
Resume Import / Career Evidence
        ↓
Career Target
        ↓
Job Snapshot
        ↓
Job Intelligence
        ↓
Job Match
        ↓
Opportunity Assessment
        ↓
Resume Materialization
        ↓
Grounding
        ↓
Semantic Grounding
        ↓
Claim Provenance
        ↓
Durable ResumeVersion
        ↓
Read-back / Reopen
```

Every step must declare:

- truth authority;
- whether AI is required, bounded-assist, optional, or absent;
- latency/runtime budget status;
- failure class;
- containment behavior;
- degradation behavior;
- recovery path;
- observable evidence;
- acceptance test.

## Workstreams

### SYS-01A — Runtime Envelope

Purpose: define what hardware/runtime CV Engine actually supports.

Deliverables:

- observed reference runtime(s);
- cold/warm startup measurements;
- model load/switch measurements where relevant;
- CPU/RAM/swap/container overhead;
- workload latency and throughput;
- declared minimum supported profile only after evidence exists.

Current state: `REFERENCE-CPU-01` is observed from dogfood, but is **not yet declared the minimum supported host**.

### SYS-01B — Capability Contract Matrix

Purpose: remove vague “AI-powered” assumptions and define each product capability precisely.

For each capability:

```text
CAPABILITY
PURPOSE
TRUTH AUTHORITY
AI DEPENDENCY
CRITICAL PATH?
FAILURE POLICY
```

Binding invariant: no capability may declare a model as truth authority.

### SYS-01C — Failure Taxonomy + Degradation Matrix

Canonical classes:

```text
INPUT
EXTRACTION
MODEL
PERFORMANCE
CONFIGURATION
PERSISTENCE
TRUTH
GROUNDING
PROVENANCE
DURABILITY
VERSION_SKEW
UI_STATE
```

Every class must define:

```text
DETECT
CONTAIN
DEGRADE
RECOVER
OBSERVE
TEST
```

### SYS-01D — Canonical Personas

Purpose: stop using one CV as the entire market model.

The persona suite will cover at least:

- clean junior DOCX;
- long senior DOCX;
- Spanish CV;
- sparse CV;
- academic CV;
- irregularly formatted DOCX;
- text PDF;
- incomplete evidence;
- adversarial job description;
- infrastructure/provider failure scenario.

Each persona must have known expected truth. We do not use the model as the oracle for expected extraction.

### SYS-01E — End-to-End System Harness

A release-oriented harness must execute the real system path and emit a machine-readable receipt.

Target receipt shape:

```text
personaId
buildSha
architectureVersion
runtimeProfile
import.status / latency
truth.status
match.status
assembly.status
semanticGrounding.status
provenance.status
persistence.status
readBack.status
aiCalls.total
aiCalls.criticalPath
peakMemory
result
```

No numeric threshold is approved in v0.1 unless measured and explicitly adopted.

### SYS-01F — Fault Injection

Required scenarios include:

- Ollama unavailable;
- required model missing;
- slow inference;
- malformed structured AI output;
- Redis unavailable;
- write/read-back mismatch;
- invalid/unsupported source input;
- unsupported candidate claim / JD leakage;
- stale or wrong runtime artifact;
- UI/backend failure-class mismatch;
- process restart at a durable boundary.

The goal is not “everything succeeds.” The goal is **everything fails according to contract**.

### SYS-01G — Runtime Identity & Observability

Required identity fields:

```text
buildSha
architectureVersion
runtimeProfileId
resolved capability model configuration
failureClass
capability
latency
truthGate status
persistenceGate status
```

The exact implementation may evolve, but a deployed runtime must become self-identifying before ATS-SYS-01 closes.

### SYS-01H — Release Gate

Release readiness requires evidence for all mandatory criteria. A missing result is blocking.

See `RELEASE-GATE-v0.1.md` and `SystemCharacterizationContract.ts`.

## Incident register

ATS-SYS-01 begins from real incidents, not hypothetical architecture.

- `ATS-SYS-INC-001` — verified PERFORMANCE: whole-resume import / 8B / CPU pairing exceeded bounded latency.
- `ATS-SYS-INC-002` — verified PERFORMANCE: whole-resume generation / 8B / CPU pairing exhausted the 240s request budget.
- `ATS-SYS-INC-003` — suspected VERSION_SKEW: observed runtime behavior did not match the later repository architecture. It remains suspected until runtime identity proves the exact artifact that executed.

See `evidence/system/incidents/ATS-SYS-01-INCIDENT-REGISTER-v0.1.md`.

## Execution order

```text
01 Freeze feature expansion for characterization
02 Inventory capabilities and trust boundaries
03 Register observed incidents
04 Characterize reference runtime
05 Define failure/degradation contracts
06 Define canonical personas + expected truth
07 Build E2E receipt harness
08 Add fault injection
09 Add runtime identity
10 Measure and adopt budgets
11 Run minimum-runtime acceptance
12 Close release gate
```

A new feature may proceed during this period only if it is required to complete characterization or is explicitly separated from ATS-SYS-01.

## What v0.1 intentionally does not claim

- It does not declare 8 GB RAM as a supported minimum.
- It does not declare a final latency SLO.
- It does not claim all canonical persona fixtures exist yet.
- It does not claim fault injection is complete.
- It does not claim the current build is release-ready.

Those are characterization outputs, not assumptions.

## Definition of done

ATS-SYS-01 closes only when we can answer **yes, with evidence** to all of the following:

```text
Do we know the minimum supported runtime?
Do all canonical personas complete the real product path?
Do mandatory failure classes behave according to policy?
Are candidate truth and market truth isolated under adversarial tests?
Can trusted state be committed and read back durably?
Are latency budgets measured and satisfied?
Can we identify the exact runtime/build executing?
Can Docker cold-start into the supported state reproducibly?
```

Until then, CV Engine remains in characterization rather than release qualification.
