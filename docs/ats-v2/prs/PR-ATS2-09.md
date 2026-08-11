# PR-ATS2-09 — Semantic Grounding & Entailment Evaluation

## Objective

Close the semantic-drift gap that remains after deterministic grounding: generated wording may preserve all explicit entities and numbers while still escalating responsibility, ownership, design authority, architecture authority, scope, or impact beyond what candidate assertions support.

Examples this gate must catch:

- `Participated in the backend migration` → `Led the backend migration`
- `Implemented backend APIs` → `Designed backend APIs`
- `Designed backend services` → `Architected backend services`
- `Built backend services` → `Owned backend services`
- `Built backend APIs` → `Built enterprise-scale backend APIs`
- `Improved API performance` → `Significantly improved API performance`

The same responsibility-escalation guard is characterized in English and Spanish.

## Architecture

The generation trust pipeline becomes:

```text
AI proposal
  ↓
Deterministic GroundingValidator
  ↓ hard blockers remain authoritative
SemanticEntailmentEvaluator
  ↓
APPROVED / NEEDS_USER_CONFIRMATION
  ↓
scoring + output
```

The semantic layer can never override a deterministic grounding rejection.

## Implementation

- adds `SemanticEntailmentEvaluator` behind the application grounding boundary;
- evaluates generated narrative claims only against existing `CareerAssertion` candidate truth;
- never uses Job Description requirements as candidate evidence;
- retrieves related assertions by normalized/canonical token overlap;
- detects unsupported leadership, ownership, design, architecture, scope/scale, and impact-strength escalation;
- returns evidence-linked issue records and coverage metadata;
- blocks generation with HTTP 422 when stronger semantic claims require candidate confirmation;
- leaves equivalent delivery rewrites such as `built` ↔ `developed` alone;
- adds a dedicated adversarial behavior suite in EN/ES;
- updates `npm test` to execute all ATS v2 behavior suites.

## Trust wording

This gate deliberately does **not** claim universal natural-language entailment or zero hallucinations.

`APPROVED` means the conservative high-risk semantic-drift guard found no unsupported escalation in the classes it evaluates, after deterministic factual grounding already passed.

## Gate

Target gate wording after remote validation:

`G9 SEMANTIC_GROUNDING_EVALUATED — PASS (HIGH-RISK SEMANTIC DRIFT), UNIVERSAL ENTAILMENT NOT CLAIMED`

## Required validation

- `npm ci`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- Vercel preview/deployment

The gate must not be marked PASS until all required remote checks succeed.
