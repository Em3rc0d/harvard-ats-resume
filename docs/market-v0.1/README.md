# CV Engine — Market Architecture v0.1 / Execution Record

## Product decision

CV Engine is no longer evolved primarily as an AI Resume Builder or as a generic "ATS score" tool.

The market architecture defines:

- **Beachhead:** Application Intelligence for individuals.
- **Initial question:** **Should I apply to this opportunity?**
- **Harbor:** Career Opportunity Intelligence.
- **Resume role:** a contextual projection of career truth for one application, not the product's source of truth.

The existing ATS v2 foundation is retained because it already provides the trust primitives needed for this direction:

```text
Career evidence
    -> Career assertions
    -> Job requirements
    -> Requirement matches
    -> Explainability
    -> Resume version
```

Market v0.1 adds the missing decision layer above that kernel rather than restarting the repository.

## Smallest coherent commercial experience

```text
IMPORT CAREER
    |
    v
REVIEW CAREER TRUTH
    |
    v
PASTE ONE JOB
    |
    v
OPPORTUNITY ASSESSMENT
    |-- Should I apply?
    |-- Why?
    |-- What supports me?
    |-- What is missing?
    `-- Is the gap material?
    |
    v
BUILD APPLICATION
    |
    v
TARGETED RESUME
```

The first market implementation must therefore evaluate the opportunity **before** generative resume work.

## Truth boundary

Four information classes remain distinct:

1. **Career Fact** — supplied/confirmed candidate truth.
2. **Market Fact** — facts from the job/opportunity or later labor-market sources.
3. **Derived Analysis** — comparisons and classifications computed from the first two.
4. **Recommendation** — a suggested action such as apply, build first, or plan a future path.

Hard invariants:

```text
JobRequirement != CandidateSkill
Recommendation != CareerFact
DerivedAnalysis != CareerFact
```

A job requirement can influence a match or recommendation. It can never authorize a new candidate assertion.

## OpportunityAssessment v1

`OpportunityAssessment` is a deterministic derived-analysis artifact over the existing evidence-backed Job Match.

It exposes:

- recommendation
- answer to "Should I apply?"
- next action
- eligibility signal
- evidence strength
- required/preferred coverage
- strong supporting evidence
- transferable evidence
- critical gaps
- optional gaps
- unresolved items
- explicit scope boundary

### Recommendation classes

| Class | Meaning in v1 | Action |
|---|---|---|
| `READY_NOW` | Every explicit REQUIRED requirement is fully supported and overall evidence alignment is at least 70/100 under the v1 policy. | Apply |
| `STRONG_STRETCH` | Strong alignment with a limited material gap, or full REQUIRED coverage without enough overall evidence to claim READY_NOW. | Apply with caution |
| `BUILDABLE` | Meaningful overlap exists, but important evidence gaps or weak overall support should be strengthened first. | Build first |
| `ASPIRATIONAL` | Some transferable evidence exists, but immediate application efficiency is low. | Plan path |
| `LOW_ALIGNMENT` | Evidence is materially insufficient or an explicit required blocker exists. | Deprioritize |

`READY_NOW` is intentionally conservative. If Job Intelligence extracts no explicit REQUIRED requirements, Market v0.1 will not claim READY_NOW. Full REQUIRED coverage alone is also insufficient when the overall evidence alignment is weak; the recommendation is downgraded instead of overstating readiness.

## What the recommendation does NOT mean

It is not:

- hiring probability
- recruiter acceptance probability
- interview probability
- a score emitted by Workday, Greenhouse, Lever, or another commercial ATS
- evidence that a missing job requirement belongs to the candidate

The UI must keep this boundary visible.

## MARKET-01 — Application Intelligence Decision Layer

This iteration introduces:

1. `lib/application/opportunity/OpportunityAssessment.ts`
2. `POST /api/assess-opportunity`
3. a pre-generation Opportunity Assessment step on the targeted-job surface
4. evidence/gap visibility before the user chooses to build a targeted resume
5. deterministic policy tests for all five recommendation classes and READY_NOW calibration

The endpoint does **not** call the resume LLM and does not persist a ResumeVersion. It exists to answer the application decision first.

### Gate M1 — OPPORTUNITY_DECISION_BEFORE_APPLICATION

M1 is satisfied when:

- a targeted resume cannot be generated from the Target Job surface before the current job text has been assessed
- editing the job invalidates the previous assessment
- the assessment is derived only from existing Job Match + candidate assertions
- all five recommendation classes are test-covered
- `READY_NOW` requires full support of explicit REQUIRED requirements plus the minimum overall evidence alignment
- insufficient Job Intelligence produces no fabricated recommendation
- the assessment visibly states that it is not a hiring probability
- CI/typecheck/lint/tests/build remain green

## Explicit non-goals for MARKET-01

This PR does not yet implement:

- broad labor-market ingestion
- ESCO/O*NET normalization
- CareerTarget
- OpportunitySpace
- alternative-role discovery
- career scenarios
- gap-to-action learning plans
- application outcome tracking
- coach/B2B workspace
- persistence/history of OpportunityAssessment
- migration of every legacy/manual resume-builder surface to the new funnel

Those belong to subsequent market iterations. The first objective is to make the initial commercial wedge real without weakening the truth architecture.

## Next architectural step

After M1, the next market unit should make the comparison artifact durable and explicit:

```text
CareerSnapshot
      vs
JobSnapshot
      |
      v
OpportunityAssessment
```

That creates the stable boundary required before expanding into CareerTarget, OpportunitySpace, scenarios, labor-market intelligence, and learning from application outcomes.
