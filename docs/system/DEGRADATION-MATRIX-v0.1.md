# Degradation Matrix v0.1

## Principle

**Optional intelligence may degrade. Core product truth must not.**

| Capability / dependency | Failure | Product behavior | User-visible state | Trusted state allowed? |
|---|---|---|---|---|
| Resume import AI assist | model unavailable / slow / malformed | Automatic import stops or retries within its bounded policy; manual Career Evidence remains available | Import unavailable / manual recovery | Yes, only manually/source-backed evidence actually accepted |
| Inline Optimize | model unavailable / slow | Keep original candidate wording | Optimization unavailable; editing continues | Yes |
| Job Intelligence | deterministic analysis contract fails | Stop job analysis | Analysis unavailable / review input | No derived assessment from failed analysis |
| Job Match | matching contract fails | Do not emit trusted score/conclusion | Match unavailable | No match decision |
| Resume Assembly | deterministic composer fails | Stop materialization | Generation stopped safely | No ResumeVersion |
| Grounding | unsupported fact / JD leakage | Reject candidate draft | Evidence review required | No ResumeVersion |
| Semantic Grounding | wording overstates evidence | Reject candidate draft | Evidence/scope review required | No ResumeVersion |
| Provenance | material claim cannot bind to assertions | Reject composition | Traceability failure | No ResumeVersion |
| Redis preflight | backend unavailable | Stop before durable decision/generation state | Durable storage unavailable | No durability claim |
| Redis commit/read-back | commit cannot be verified | Reject durability completion | Save unavailable | No durability claim |
| Runtime identity | expected revision cannot be established | Diagnosis/release qualification stops | Unknown/stale runtime | No release evidence |
| UI failure renderer | failure class misrepresented | Treat as UI_STATE defect; backend contract remains authority | Precise class must be restored | Backend trusted state only; UI claim is not trusted |

## Retry policy rule

Retry is allowed only when the failure class declares retry as meaningful. Repeating the same request is not a universal recovery strategy.

Examples:

- transient bounded model failure: retry may be valid;
- unsupported source claim: retry cannot create evidence;
- stale runtime artifact: retry cannot repair version skew;
- missing credentials/config: retry cannot repair configuration;
- durable backend outage: retry only after backend recovery.

## Anti-patterns prohibited by this matrix

```text
increase timeout until it works
switch models without workload evidence
retry every error
show provider-unavailable for a non-provider failure
silently fall back to invented data
claim persistence because an in-memory step succeeded
accept a stale container as evidence for a new commit
```
