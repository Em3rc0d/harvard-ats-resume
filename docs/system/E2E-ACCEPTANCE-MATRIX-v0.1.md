# End-to-End Acceptance Matrix v0.1

## Goal

Replace “build is green” as the dominant proof with **real product-path evidence**.

## Canonical path

```text
fixture
  ↓
source intake / manual evidence
  ↓
Career Evidence
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
Resume Assembly
  ↓
Grounding
  ↓
Semantic Grounding
  ↓
Claim Provenance
  ↓
Durable Commit
  ↓
Read-back / Reopen
```

## Required receipt fields

The future harness must emit a machine-readable receipt containing at least:

```text
receiptVersion
personaId
buildSha
architectureVersion
runtimeProfileId
startedAt
completedAt

stages.sourceIntake
stages.careerEvidence
stages.careerTarget
stages.jobSnapshot
stages.jobIntelligence
stages.jobMatch
stages.opportunityAssessment
stages.resumeAssembly
stages.grounding
stages.semanticGrounding
stages.provenance
stages.persistence
stages.readBack

aiCalls.total
aiCalls.criticalPath
aiCalls.byCapability

measurements.totalLatencyMs
measurements.stageLatencyMs
measurements.peakMemoryMiB

failureClass
result
```

## Stage acceptance

| Stage | Pass condition | Blocking? |
|---|---|---|
| Source intake | source/fixture recognized without silent mutation | Yes |
| Career Evidence | expected truth preserved; forbidden facts absent | Yes |
| Career Target | target state valid and attributable | When scenario uses target |
| Job Snapshot | market truth captured separately | When scenario uses job |
| Job Intelligence | requirements derived without candidate contamination | When scenario uses job |
| Job Match | rationale references evidence/requirements only | When scenario uses job |
| Opportunity Assessment | decision context derives from trusted upstream state | When scenario uses job |
| Resume Assembly | candidate-owned facts materialize deterministically | Yes |
| Grounding | APPROVED | Yes |
| Semantic Grounding | APPROVED | Yes |
| Provenance | every material claim traceable | Yes |
| Persistence | durable commit verified | Yes for trusted ResumeVersion |
| Read-back | stored version can be reloaded consistently | Yes for trusted ResumeVersion |

## Measurement policy

v0.1 intentionally does not set arbitrary latency thresholds. The characterization harness must first collect repeatable distributions on declared runtime profiles. Budgets are adopted only after evidence review.

Every measured result must distinguish:

- cold vs warm runtime;
- model load vs inference time;
- prompt/input size;
- output size;
- per-stage latency;
- total latency;
- retry count;
- degraded path used or not used.

## Failure behavior acceptance

A negative scenario passes when the system fails according to its declared contract. Example:

```text
Redis unavailable
→ no ResumeVersion durability claim
→ precise PERSISTENCE/DURABILITY failure class
→ no fabricated success
→ recovery guidance matches policy
```

A fault-injection test that produces a safe expected failure is therefore a **PASS**, not a broken test.

## Current status

The full harness is not yet implemented. Existing CI proves construction/build/browser gates, but does not yet prove this complete matrix. Therefore ATS-SYS-01 release qualification remains `UNCHARACTERIZED`.
