# MARKET-03 — CareerTarget / Intent Boundary

## Purpose

Market Architecture requires CV Engine to distinguish two different questions:

```text
CAN I COMPETE?
Career Truth + Job Truth
        -> evidence-backed OpportunityAssessment

DO I WANT THIS DIRECTION?
CareerTarget + Job Truth
        -> Target Relevance
```

The second question must never alter the first.

## CareerTarget

`CareerTarget` is candidate-owned intent, not career evidence.

The v1 domain supports:

- target role
- optional job family
- preferred seniority
- preferred locations
- work model
- employment type
- industries
- relocation preference
- priority

Targets are content-addressed by semantic meaning. A candidate may keep multiple targets; activating a new target never deletes or rewrites earlier directions.

## Target Relevance

Target relevance is a conservative derived analysis over explicit signals in the job posting.

Dimensions:

- role
- seniority
- location
- work model
- employment type

States:

- `ALIGNED`
- `PARTIAL`
- `CONFLICT`
- `UNKNOWN`
- `NOT_CONSTRAINED`

Overall levels:

- `HIGH`
- `MEDIUM`
- `LOW`
- `UNKNOWN`

When a posting does not expose enough information, CV Engine returns `UNKNOWN` rather than inventing employer intent.

## Hard truth boundary

```text
CareerTarget != CareerEvidence
CareerTarget != CandidateSkill
TargetRelevance != JobMatch
Preference conflict != Capability gap
```

Changing CareerTarget may change Target Relevance. It must not change the evidence-backed Job Match score, requirements, assertions, or OpportunityAssessment recommendation produced from Career Truth vs Job Truth.

## Durability

The candidate-scoped target portfolio stores multiple content-addressed targets and one active target.

Each target-aware opportunity decision creates a durable link:

```text
CareerTarget
     |
     v
TargetOpportunityEvaluation
     |
     +---- OpportunityAssessmentId
     |
     +---- TargetRelevance
```

The OpportunityAssessment itself remains the M2 historical comparison of CareerSnapshot vs JobSnapshot. MARKET-03 links candidate intent to that immutable assessment without changing its epistemic class.

## UX rule

For a targeted application, the user must explicitly provide at least a target role before assessment.

Editing any target field invalidates the previously displayed target-aware assessment, just as editing the Job Description invalidates it.

The result surface presents two independent views:

```text
OPPORTUNITY ASSESSMENT
Can I defend this opportunity from my evidence?

TARGET RELEVANCE
Does this opportunity align with the direction I chose?
```

## Gate M3 — INTENT_SEPARATED_FROM_CAPABILITY

M3 is satisfied when:

- CareerTarget is a first-class domain object separate from CareerEvidence
- semantic target identity is stable across timestamps
- multiple target directions are preserved instead of overwritten
- an active target can be switched without changing Career Truth
- target relevance uses conservative explicit signals and prefers UNKNOWN over guessing
- changing target preferences can change Target Relevance but cannot change Job Match
- target-to-assessment relevance links are durable and idempotent
- targeted UX requires a current target-aware assessment before generation
- target edits invalidate the displayed assessment
- dependency audit, lint, typecheck, behavior tests and production build remain green

## Next boundary after M3

Once CV Engine knows both:

```text
CAN
+
WANT
```

it can safely expand from one manually supplied job to **OpportunitySpace**: one person + one active CareerTarget evaluated against many JobSnapshots.

That is the first point where job discovery/ranking becomes strategically meaningful rather than a generic job feed.
