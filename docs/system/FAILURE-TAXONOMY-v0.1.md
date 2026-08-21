# Failure Taxonomy v0.1

## Rule

An incident is not complete when its symptom disappears. It is complete when it is classified, contained, observable, reproducible, and represented by a durable test or explicit characterization gap.

| Class | Detect | Contain | Degrade | Recover | Observe | Test |
|---|---|---|---|---|---|---|
| INPUT | Boundary/schema/source validation | Reject invalid request/source | Supported/manual intake only | Correct/replace input | Structured input failure | Invalid/unsupported fixtures |
| EXTRACTION | Expected source coverage vs extracted coverage | Reject unsupported/incomplete proposal | Preserve supported subset/manual evidence | Bounded retry or manual correction | Coverage + rejected paths | Known-truth resume fixtures |
| MODEL | Health/model/structured response checks | Keep output untrusted | Skip optional AI; fail assisted capability only | Restore model/runtime | provider/model/error kind | Missing model, malformed output |
| PERFORMANCE | Latency/throughput/memory vs adopted budget | Terminate bounded workload | Non-AI/smaller path where contract permits | Change pairing after evidence | workload timing + memory | Slow-runtime profile |
| CONFIGURATION | Resolved runtime config validation | Refuse contradictory unsafe state | Explicit safe defaults only where designed | Correct deployment config | config fingerprint | stale/invalid env |
| PERSISTENCE | Backend readiness/operation errors | Stop false persistence claim | Explicit non-durable state only if modeled | Restore backend | stage + reason | Redis unavailable |
| TRUTH | Reconciliation/evidence validation | Reject unsupported candidate facts | Supported subset only | Add/confirm real evidence | claim/evidence refs | JD leakage/adversarial claims |
| GROUNDING | Grounding reports | Block ResumeVersion | Review-required state | Correct evidence/wording | issue IDs | Overstatement fixture |
| PROVENANCE | Claim/assertion completeness | Block trusted materialization | No trusted ResumeVersion | Repair mapping | untraceable claim IDs | Missing assertion binding |
| DURABILITY | Commit + read-after-write | No durability claim | Operation remains uncommitted | Retry after recovery | revision/verification receipt | write/read-back mismatch |
| VERSION_SKEW | Runtime build identity vs expected revision | Stop ambiguous diagnosis | Explicit stale-runtime state | Rebuild/recreate artifact | build SHA + architecture version | stale artifact scenario |
| UI_STATE | Backend failure contract vs rendered state | Do not mislabel class | Precise user recovery guidance | Retry/refresh only per policy | class + surface | failure renderer scenarios |

## Triage protocol

Every new incident is processed in this order:

```text
1. Identify exact build/runtime revision.
2. Capture capability and workload.
3. Map to existing failure class.
4. If no class fits, extend taxonomy once.
5. Verify containment/degradation behavior.
6. Produce a reproducible test/fixture or mark UNCHARACTERIZED.
7. Only then decide whether architecture/code must change.
```

This reverses the old pattern of patching the first visible symptom.
