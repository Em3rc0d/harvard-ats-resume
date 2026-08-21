# ATS-SYS-01 — System Characterization & Failure Model v0.1

## Status

**ACTIVE — harness implemented; real characterization pending.**

This program temporarily changes the product question from **“how do we fix this incident?”** to **“what does CV Engine require, tolerate, degrade, and prove as a complete system?”**

No release claim may be derived from this document alone. Unknowns stay explicitly uncharacterized until measured.

## Why this exists

Real dogfood and subsequent system inspection exposed four incidents across three reusable classes:

1. a whole-resume import workload on a local 8B model exceeded the useful latency envelope;
2. a separate whole-resume generation workload on the same class of runtime also exceeded the useful latency envelope;
3. later observed runtime behavior appeared inconsistent with the repository architecture, exposing a likely build/runtime identity problem;
4. deterministic final assembly was still labeled with retired Ollama generation metadata, exposing an operational-provenance mismatch.

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
8. **Operational provenance is part of trust.** A ResumeVersion must truthfully identify how the artifact was materialized, not only which evidence supports its claims.

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
Claim + Operational Provenance
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

Current state:

```text
REFERENCE-CPU-01                  OBSERVED, NOT MINIMUM
runtime observation harness       IMPLEMENTED
container-cold harness             IMPLEMENTED
real repeated measurements         PENDING
approved budgets                   UNCHARACTERIZED
minimum supported runtime          UNCHARACTERIZED
```

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

Current state: **CLOSED v0.1**.

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

Every class defines:

```text
DETECT
CONTAIN
DEGRADE
RECOVER
OBSERVE
TEST
```

Current state: **CLOSED v0.1**, extensible only when a genuinely new class is discovered.

### SYS-01D — Canonical Personas

Purpose: stop using one CV as the entire market model.

The full planned registry covers:

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

First promoted v0.1 slice:

```text
P01 clean junior DOCX             REQUIRED / VERSIONED
P03 Spanish DOCX                  REQUIRED / VERSIONED
P04 sparse DOCX                   REQUIRED / VERSIONED
P09 adversarial Job Description   REQUIRED / VERSIONED
P10 infrastructure faults         REQUIRED / CONTRACT
```

Still planned:

```text
P02 long senior
P05 academic
P06 irregular DOCX
P07 text PDF
P08 incomplete Career Evidence
```

Each extraction persona has authored expected truth outside the model. The model cannot grade itself.

Current state: **FIRST SLICE IMPLEMENTED; REAL RECEIPTS PENDING**.

### SYS-01E — End-to-End System Harness

The real harness now exists as:

```text
npm run system:characterize
```

It executes the running product through HTTP/Docker and preserves stage evidence for:

```text
health/build identity
resume import
known-truth comparison
Career Target
job snapshot/intelligence/match
opportunity assessment
resume materialization
JD-leakage / forbidden-truth check
zero final-generation Ollama calls
claim provenance
durable commit
direct Redis read-back
```

It emits a machine-readable `SystemAcceptanceReceipt` per persona. A failing persona emits `accepted:false` and stops the run; failures are not averaged away.

Current state: **IMPLEMENTED; REAL DOCKER EXECUTION PENDING**.

### SYS-01F — Fault Injection

The planned taxonomy includes:

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

The first P10 fault slice is implemented:

```text
local-ai-down
→ MODEL
→ DEGRADED / HTTP 200
→ trusted core remains available

durable-redis-down
→ DURABILITY
→ UNAVAILABLE / HTTP 503
→ trusted core unavailable
```

Runner:

```text
npm run system:faults
```

Current state: **FIRST SLICE IMPLEMENTED; REAL FAULT RECEIPTS PENDING**.

### SYS-01G — Runtime Identity & Observability

Runtime identity is implemented through:

```text
buildSha
architectureVersion
runtimeProfileId
identified
releaseQualifiableIdentity
```

`/api/health` exposes the identity. `docker:identified` injects exact Git HEAD into Docker. An unidentified build may be used for development, but cannot qualify release evidence.

Additional observation infrastructure now exists:

```text
npm run system:characterize:runtime
```

It samples the running `app`, `ollama`, `redis`, and `redis-http` containers while canonical personas execute.

Current state: **IMPLEMENTED; REAL OBSERVATION RECEIPTS PENDING**.

### SYS-01H — Release Gate

The release contract and evidence evaluator exist:

```text
lib/application/system/SystemCharacterizationContract.ts
scripts/system-release-evaluate.mjs
```

The evaluator can move evidence-backed criteria to PASS, but deliberately keeps these blocked in v0.1:

```text
runtime-envelope   UNCHARACTERIZED
latency-budgets    UNCHARACTERIZED
```

until repeated measurements exist and budgets are explicitly adopted.

Current state: **CONTRACT + EVALUATOR IMPLEMENTED; RELEASE BLOCKED CORRECTLY**.

### SYS-01I — Docker Start Characterization

The non-destructive container-cold harness is implemented:

```text
npm run system:cold-start
```

Semantics:

```text
CONTAINERS_COLD_VOLUMES_RETAINED
```

Default: three identified `down → up → READY` repetitions with the same build SHA/runtime profile. Volumes are retained. This does not claim fresh-install/model-download behavior.

Current state: **IMPLEMENTED; REAL RECEIPT PENDING**.

## Incident register

ATS-SYS-01 begins from observed or directly inspected incidents, not hypothetical architecture.

- `ATS-SYS-INC-001` — VERIFIED / PERFORMANCE: whole-resume import / 8B / CPU pairing exceeded bounded latency.
- `ATS-SYS-INC-002` — VERIFIED / PERFORMANCE: whole-resume generation / 8B / CPU pairing exhausted the 240s request budget.
- `ATS-SYS-INC-003` — SUSPECTED / VERSION_SKEW: observed runtime behavior did not match the later repository architecture. It remains suspected because the old runtime did not expose its SHA.
- `ATS-SYS-INC-004` — VERIFIED / PROVENANCE: deterministic final assembly was labeled with retired Ollama generation metadata.

See `evidence/system/incidents/ATS-SYS-01-INCIDENT-REGISTER-v0.1.md`.

## Current characterization commands

```text
npm run docker:identified -- up --build -d
npm run system:characterize
npm run system:characterize:runtime
npm run system:faults
npm run system:cold-start
npm run system:release-evaluate -- ...
```

See `CHARACTERIZATION-HARNESS-v0.1.md` for exact evidence semantics.

## Execution order — current position

```text
01 Freeze feature expansion for characterization                 DONE
02 Inventory capabilities and trust boundaries                  DONE
03 Register observed incidents                                  DONE / ACTIVE REGISTER
04 Define failure/degradation contracts                          DONE v0.1
05 Add runtime identity                                          DONE / RECEIPTS PENDING
06 Define first canonical personas + expected truth              DONE v0.1 SLICE
07 Build real E2E receipt harness                                DONE / UNEXECUTED
08 Add first fault-injection slice                               DONE / UNEXECUTED
09 Add runtime observation + container-cold harness              DONE / UNEXECUTED
10 Characterize remaining bounded workloads/model switching      NEXT
11 Execute repeated real runtime characterization                PENDING
12 Adopt latency/memory budgets from product needs + evidence     WAIT FOR DATA
13 Test candidate minimum-runtime profiles against budgets        WAIT FOR BUDGETS
14 Close release gate                                             BLOCKED CORRECTLY
```

A new feature may proceed during this period only if it is required to complete characterization or is explicitly separated from ATS-SYS-01.

## What v0.1 intentionally does not claim

- It does not declare 8 GB RAM as a supported minimum.
- It does not declare a final latency SLO.
- It does not claim P02/P05/P06/P07/P08 fixtures are promoted.
- It does not claim all planned fault classes have injected tests yet.
- It does not claim the implemented harness has passed on the real Docker host.
- It does not claim fresh-install/model-download startup is characterized.
- It does not claim the current build is release-ready.

Those are characterization outputs, not assumptions.

## Definition of done

ATS-SYS-01 closes only when we can answer **yes, with evidence** to all of the following:

```text
Do we know the minimum supported runtime?
Do all REQUIRED canonical personas complete the real product path?
Do mandatory failure classes behave according to policy?
Are candidate truth and market truth isolated under adversarial tests?
Is materialization provenance operationally truthful?
Can trusted state be committed and read back durably?
Are latency budgets measured, adopted, and satisfied?
Can we identify the exact runtime/build executing?
Can Docker cold-start into the supported state reproducibly?
```

Until then, CV Engine remains in characterization rather than release qualification.
