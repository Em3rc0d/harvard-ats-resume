# PR-ATS2-02 — Domain Foundation

## BEFORE

ATS v2 had trust-containment and platform-health gates, but no explicit domain language for separating candidate truth, job truth, matching inference, and resume wording.

## DURING

- Added a dependency-free TypeScript domain model under `lib/domain`.
- Separated candidate truth (`CareerSource`, `CareerEvidence`, `CareerAssertion`) from job truth (`JobDescription`, `JobRequirement`).
- Added `RequirementMatch` and `MatchReport` as inference artifacts only.
- Separated `CareerAssertion` from `ResumeClaim` so resume wording links back to evidence-backed assertions.
- Added `ResumeVersion` and `ResumeManifest` provenance structures.
- Added deterministic validators and a roundtrip fixture.
- Hardened `INV-006` after review so `ResumeManifest` must preserve the complete assertion provenance of each referenced `ResumeClaim`, not merely a valid subset.
- Added a negative regression fixture proving that a two-assertion claim cannot be represented by a one-assertion manifest entry.

## AFTER

The codebase now has a modular-monolith domain foundation for ATS v2. Product behavior is not intentionally changed, and the new model is not wired into the UI, Gemini flow, n8n flows, PDF generation, scoring, or persistence.

## INVARIANTS

- `INV-001`: `CareerAssertion` with `VERIFIED_FACT` must reference evidence or an explicit candidate-provided source.
- `INV-002`: `SUGGESTION` cannot be emitted as a `ResumeClaim`.
- `INV-003`: `ResumeClaim` must reference at least one `CareerAssertion`.
- `INV-004`: `JobRequirement` derives from `JobDescription`, never `CandidateProfile`.
- `INV-005`: `RequirementMatch` connects existing `JobRequirement` and `CareerAssertion` identifiers but cannot create candidate facts.
- `INV-006`: `ResumeManifest` preserves the complete provenance from each `ResumeClaim` to all of its `CareerAssertion` identifiers.

## VERIFICATION

The roundtrip fixture demonstrates:

```text
CareerSource
→ CareerEvidence
→ CareerAssertion

JobDescription
→ JobRequirement

CareerAssertion + JobRequirement
→ RequirementMatch

CareerAssertion
→ ResumeClaim
→ ResumeVersion
→ ResumeManifest
```

It validates that the assertion statement survives the provenance roundtrip and that:

```text
MATCH INFERENCE != CANDIDATE FACT
```

It also contains an explicit negative regression case:

```text
ResumeClaim provenance:    [A, B]
ResumeManifest provenance: [A]
Expected:                  INV-006 failure
```

This prevents partial provenance from being silently accepted.

## DEBT

- No persistence adapters exist yet.
- No scoring calibration exists yet.
- No renderer integration exists yet.
- No UI integration exists yet.

## GATE

`G3 DOMAIN_FOUNDATION`

PASS requires:

- domain model compiles
- candidate/job truth are independent
- assertion provenance represented
- requirement match represented
- resume claim linked to assertion
- manifest provenance represented completely
- domain invariants validated
- positive roundtrip fixture validated
- partial-provenance regression rejected
- lint PASS
- typecheck PASS
- build PASS
- no existing product behavior intentionally changed

## NEXT

Future PRs may integrate this domain foundation into ATS v2 flows incrementally. They must keep these non-goals intact for PR-ATS2-02:

- no new ATS composite score
- no persistence
- no RAG or vector database
- no LangGraph, Temporal, Kafka, or microservices
- no silent conversion of match inference into candidate fact
