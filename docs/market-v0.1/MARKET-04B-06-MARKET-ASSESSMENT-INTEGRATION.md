# MARKET-04B-06 — Market JobSnapshot → Opportunity Assessment Integration

## Purpose

M4B-05 established a durable, market-provenanced `JobSnapshot`. M4B-06 makes that exact snapshot the job-side authority for Application Intelligence.

The boundary is:

```text
MarketObservation
      ↓
DerivedMarketInterpretation
      ↓
MarketJobProjection
      ↓
Job Intelligence
      ↓
market-provenanced JobSnapshot
      ↓
      │ M4B-06
      ▼
Job Match
      ↓
OpportunityAssessment
      ↓
Durable OpportunityHistory
```

The central invariant is:

```text
THE JOB SNAPSHOT IS CONSUMED, NOT REBUILT.
```

## Why this gate exists

Before M4B-06, `/api/assess-opportunity` accepted free job-description text, ran Job Intelligence, matched the result, and `OpportunityHistory` then reconstructed its own `JobSnapshot` from the parser output.

That legacy/manual route is still valid for manual Application Intelligence, but it cannot be used as the market-source bridge because reconstructing a second snapshot would sever:

```text
MarketObservationId
→ DerivedMarketInterpretationId
→ MarketJobProjectionId
→ JobSnapshotId
```

M4B-06 introduces a separate market assessment path rather than making the legacy route ambiguous.

## Public contract

```text
POST /api/assess-market-opportunity
```

The request contains:

```text
candidate data
careerVaultId
careerTarget
jobSnapshotId
```

It explicitly does not accept:

```text
jobDescription
sourceText
requirements
marketObservationId
projection policy
analyzer version
match result
assessment result
```

The exact `JobSnapshotId` is required so future analyzer versions cannot silently change the job state being assessed.

## Job-side authority

M4B-06 resolves the requested `JobSnapshotId` from durable M4B-05 projection history.

The resolved history record must already pass:

```text
MarketJobProjection integrity
JobSnapshot content-address integrity
projection ↔ snapshot provenance consistency
sourceText authorization consistency
```

The assessment service then creates only a read-only `JobIntelligenceResult` view:

```text
jobDescription = JobSnapshot.jobDescription
requirements   = JobSnapshot.requirements
language       = JobSnapshot.language
```

No parser is called.

No new requirements are created.

No market metadata is appended to parser text.

## Candidate-side authority

Candidate truth continues to come only from the existing candidate truth projection:

```text
Candidate input
      ↓
CareerSource
      ↓
CareerEvidence
      ↓
CareerAssertion
```

M4B-06 reads `CareerAssertion[]` for matching and verifies that the collection is not mutated during assessment.

Hard invariant:

```text
JobRequirement != CareerAssertion
JobRequirement != CareerEvidence
MarketJobProjection != CandidateTruth
OpportunityAssessment != CandidateTruth
```

## Matching identity

The market match projection key is deterministic from:

```text
candidateSnapshotSha256
+
JobSnapshot.contentSha256
+
Job Match engine version
```

Therefore repeated assessment of the same semantic candidate state against the same exact market snapshot keeps the same MatchReport identity even when runtime timestamps differ.

## OpportunityHistory integration

`OpportunityHistory` now has a second additive build/persist path:

```text
buildOpportunityHistoryArtifactsFromJobSnapshot()
persistOpportunityAssessmentHistoryFromJobSnapshot()
```

The legacy path remains available for manual job-description assessments.

The M4B-06 path:

1. validates the exact prebuilt `JobSnapshot`;
2. requires M4B-05 `marketProvenance`;
3. verifies Job Match requirements are semantically identical to the snapshot requirement set;
4. creates the candidate `CareerSnapshot`;
5. creates an assessment record referencing the existing `JobSnapshotId`;
6. stores the exact snapshot in OpportunityHistory;
7. reload-verifies the snapshot and assessment link.

The market snapshot is never re-ID'd or reconstructed.

## JobSnapshot validation compatibility

OpportunityHistory continues to validate legacy/manual snapshots with its original hash shape.

When `marketProvenance` exists, OpportunityHistory delegates intrinsic validation to the M4B-05 market JobSnapshot validator, whose semantic hash includes:

```text
jobDescription
requirements
language
analyzerVersion
marketProvenance
```

This preserves both old history and the new provenance chain.

## Career Target

The market route retains the existing Career Target contract.

Target relevance remains separate from capability matching. For target relevance only, the route evaluates the stored job source text with the stored role-title metadata prepended when available.

This does not alter:

```text
Job Match
JobRequirements
CareerAssertions
OpportunityAssessment evidence
```

## Failure behavior

M4B-06 fails closed when:

- the requested `JobSnapshotId` does not exist in durable M4B-05 history;
- projection history fails integrity validation;
- the stored snapshot has no extracted requirements;
- candidate assertions are absent;
- the Job Match belongs to another job or candidate;
- Job Match requirements differ from the stored snapshot;
- OpportunityHistory cannot persist and reload-verify the exact snapshot;
- target linkage cannot be durably recorded.

## Behavior evidence

The M4B-06 test suite covers:

- exact M4B-05 JobSnapshot consumption;
- no requirement regeneration;
- no candidate-truth mutation;
- exact JobSnapshot identity through OpportunityHistory;
- history idempotency across runtime timestamps;
- rejection of requirement mismatch;
- rejection of unknown snapshot ids;
- rejection of tampered projection history before assessment persistence;
- absence of `analyzeJobDescription()` from M4B-06 service/runtime;
- public route omission of `jobDescription` and other job-side overrides.

## Explicit non-goals

M4B-06 does not add:

- automatic acquisition → interpretation → projection chaining in one request;
- provider polling;
- cross-source opportunity deduplication;
- job lifecycle state such as OPEN/CLOSED/STALE;
- HTML cleanup/rewrite;
- new Job Intelligence extraction rules;
- new Job Match semantics;
- new OpportunityAssessment policy;
- resume generation;
- outcome learning.

## Gate

```text
M4B-06 — EXACT_MARKET_JOB_SNAPSHOT_ASSESSMENT_INTEGRATION
```

The gate closes only when an exact durable M4B-05 `JobSnapshot` can be selected by ID, matched against candidate truth without re-parsing, preserved unchanged in OpportunityHistory, and linked to a durable OpportunityAssessment under green CI.

## Next boundary

After M4B-06, CV Engine has an evidence-preserving path from external opportunity source to application decision.

The next architectural concern should no longer be another parser bridge. It should address **market opportunity identity and lifecycle**: the system currently stores immutable observations/snapshots but does not yet know whether multiple source records represent the same logical opportunity, whether a role is still open, or how freshness should affect OpportunitySpace.
