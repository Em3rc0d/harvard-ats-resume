# Release Gate v0.1

## Rule

A criterion is PASS only when it has explicit evidence references. Missing, planned, observed-only, implemented-but-unexecuted, failed, or uncharacterized results are blocking.

ATS-SYS-02 now uses a deliberate three-stage qualification chain:

```text
RAW RUNTIME EVIDENCE
        ↓
PRE-INTERPRETATION RELEASE EVALUATION
        ↓
APPROVED POLICY INTERPRETATION
        ↓
FINAL RELEASE QUALIFICATION
```

The interpretation layer may resolve only the two policy blockers that were intentionally left uncharacterized during raw evidence capture: `runtime-envelope` and `latency-budgets`. It may never upgrade a failed or missing product/truth/durability/fault criterion.

## Mandatory criteria

| Criterion | Requirement | ATS-SYS-02 qualification rule |
|---|---|---|
| canonical-personas | All REQUIRED personas pass end-to-end | Every promoted P01/P03/P04/P09 receipt must be accepted and evidence-backed |
| failure-degradation | Required fault scenarios fail/degrade according to contract | P10 Ollama-down and Redis-down behavioral probes must PASS and fully recover |
| runtime-identity-evidence | Every receipt resolves to one identified runtime | Repeated evidence must resolve to one stable runtime fingerprint |
| runtime-envelope | Supported runtime scope is explicit and evidence-backed | v0.1 supports only the exact observed `REFERENCE-CPU-01` runtime fingerprint |
| truth-invariants | Candidate truth / market truth / model proposals / operational provenance remain isolated | Required truth stages and deterministic ResumeVersion provenance must PASS |
| durable-readback | Trusted state survives commit verification and read-back | Every promoted persona must persist and reload successfully |
| latency-budgets | Measured workloads satisfy approved budgets | Approved policy is evaluated only after repeated characterization |
| build-identity | Deployed runtime exposes exact build SHA + architecture version + runtime profile | All receipts must bind to the same release-qualifiable build/profile |
| docker-cold-start | Supported topology reproducibly becomes ready from cold start | At least 3 container-cold / retained-volume attempts must PASS on the same runtime |

## Approved first-release runtime policy

The executable policy artifact is:

```text
docs/system/ATS-SYS-02-RUNTIME-POLICY-v0.1.json
```

The first-release envelope is intentionally conservative:

```text
supportScope = EXACT_OBSERVED_RUNTIME_FINGERPRINT_ONLY
runtimeProfile = REFERENCE-CPU-01

container cold-start READY <= 45,000 ms
canonical persona E2E      <= 90,000 ms
Inline Optimize response   <= 20,000 ms
```

Inline Optimize remains `OPTIONAL_ENHANCEMENT`. A truth-safe deterministic fallback satisfies the product capability contract; successful AI completion is not required for first-release qualification on `REFERENCE-CPU-01`.

The policy explicitly does **not** claim:

- support for weaker hardware;
- equivalence of another host that merely looks similar;
- fresh-install/model-download cold-start performance;
- successful Inline Optimize AI completion on this CPU profile.

Those remain uncharacterized until separately measured.

## Gate algorithm

The core release contract remains `lib/application/system/SystemCharacterizationContract.ts`.

The evidence aggregator is:

```text
scripts/system-release-evaluate.mjs
```

It evaluates persona, fault, identity, truth, durability, generation provenance and cold-start evidence. Before interpretation, it deliberately returns:

```text
runtime-envelope = UNCHARACTERIZED
latency-budgets  = UNCHARACTERIZED
```

and therefore remains blocked only by those two criteria when all executed evidence gates pass.

Repeated runtime evidence is then interpreted by:

```text
scripts/system-interpret-reference.mjs
```

The interpreter reads the actual reference-run bundle, verifies repeated build/profile/host/runtime fingerprint consistency, summarizes observed cold-start, persona, Inline Optimize and sampled resource measurements, and applies the explicit approved policy. It cannot infer lower-spec hardware support.

Final qualification is performed by:

```text
scripts/system-release-qualify.mjs
```

It accepts only a pre-interpretation evaluation blocked by exactly:

```text
latency-budgets
runtime-envelope
```

and an interpretation receipt bound to the same runtime fingerprint. It replaces only those two criteria with interpretation-backed PASS/FAIL results, then re-runs the mandatory evidence-ref rule across every release criterion.

The full orchestrator is:

```text
npm run system:reference-run
```

A successful final qualification ends with:

```text
executionStatus       = EVIDENCE_CAPTURED
releaseStatus         = QUALIFIED
runtimeEnvelopeStatus = PASS
latencyBudgetStatus   = PASS
```

A policy violation after otherwise valid evidence capture ends with:

```text
executionStatus = EVIDENCE_CAPTURED
releaseStatus   = BLOCKED_POLICY_VIOLATION
```

This distinction prevents a latency/support-policy failure from erasing valid runtime evidence.

## Evidence quality

Valid release evidence must be tied to:

- exact commit/build SHA;
- exact architecture version;
- exact runtime profile;
- exact runtime fingerprint where support is claimed;
- exact fixture/persona/fault/cold-start contract;
- test or receipt version;
- timestamp/run identity where applicable;
- raw evidence references rather than unsupported PASS labels.

Evidence from an unknown/stale runtime cannot qualify another commit.

## Operational provenance

`truth-invariants` includes how the final resume was materialized, not only which candidate facts support it.

For the current deterministic final assembly contract, promoted persona receipts must show:

```text
provider = cv-engine-deterministic
model = source-preserving-resume-composer-v2
contractVersion = ats2-evidence-bound-resume-v2
```

If a ResumeVersion claims Ollama generated the final artifact while the deterministic compositor actually produced it, the gate fails.

## Construction CI vs release qualification

Construction CI remains necessary:

```text
install
dependency audit
local-only enforcement
lint
typecheck
behavior tests
build
PDF.js verification
Docker topology
Docker image build
browser acceptance
```

But CI alone never sets ATS-SYS-02 release readiness. Final qualification additionally requires real product behavior, runtime identity, repeated runtime fitness, failure behavior, truth safety, durability, read-back and interpreted policy evidence.

## Docker cold-start scope

The implemented cold-start harness characterizes:

```text
CONTAINERS_COLD_VOLUMES_RETAINED
```

It does not delete volumes and therefore does not claim fresh-install/model-download behavior. Fresh-install cold start remains a separate uncharacterized case.

## Current engineering position

The successful `e578912f86f419defa18e7b858df308b93c60613` campaign produced the first complete repeated real-runtime evidence bundle and reached `EVIDENCE_CAPTURED / BLOCKED_PENDING_INTERPRETATION` as designed. The next exact build must replay the same campaign with the approved policy and qualification layer enabled before ATS-SYS-02 can be closed.
