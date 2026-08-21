# Capability Contract Matrix v0.1

## Purpose

Separate product capabilities from vague provider assumptions. AI is a mechanism, not a truth authority.

| Capability | Truth authority | AI dependency | Critical path | Failure policy |
|---|---|---|---|---|
| Resume import | Source document | BOUNDED_ASSIST | No — automatic intake may degrade | Reject unsupported/incomplete extraction; manual Career Evidence remains the recovery path |
| Career Evidence | Career Evidence | NONE | Yes | Missing evidence never authorizes invention |
| Job Intelligence | Job Snapshot | NONE | Yes | Market truth never becomes candidate truth |
| Job Match | Application rules over evidence + job requirements | NONE | Yes | No trusted match conclusion when inference contract fails |
| Inline Optimize | Career Evidence | OPTIONAL_ENHANCEMENT | No | Preserve original wording and continue |
| Resume Assembly | Career Evidence | NONE | Yes | Deterministic materialization; model availability cannot block it |
| Grounding | Career Evidence | NONE | Yes | Fail closed before ResumeVersion |
| Semantic Grounding | Career Evidence assertions | NONE | Yes | Reject wording stronger than supported responsibility/scope |
| Claim Provenance | Application rules + assertions | NONE | Yes | Untraceable material claim blocks trusted ResumeVersion |
| Durability | Durable state | NONE | Yes | Never claim persistence if commit/read-back cannot be verified |

## Binding invariants

```text
MODEL != TRUTH AUTHORITY
JOB REQUIREMENT != CANDIDATE FACT
MISSING EVIDENCE != PERMISSION TO INFER
OPTIONAL AI FAILURE != PRODUCT FAILURE
FINAL ASSEMBLY != WHOLE-RESUME MODEL CALL
DURABILITY CLAIM REQUIRES VERIFIED DURABLE STATE
```

## Characterization questions still open

For each bounded AI-assisted capability we still need measured answers for:

- accepted model(s) by runtime profile;
- maximum input/workload size;
- latency budget;
- memory envelope;
- retry policy;
- malformed-output policy;
- warm/cold behavior.

Those values are not approved until ATS-SYS-01 produces evidence.
