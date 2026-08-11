# PR-ATS2-09 — Semantic Grounding & Entailment Evaluation

## Objective

Close the semantic-drift gap that remains after deterministic grounding: generated wording may preserve all explicit entities and numbers while still escalating responsibility, ownership, design authority, architecture authority, scope, or impact beyond what candidate assertions support.

Examples this gate catches:

- `Participated in the backend migration` → `Led the backend migration`
- `Implemented backend APIs` → `Designed backend APIs`
- `Designed backend services` → `Architected backend services`
- `Built backend services` → `Owned backend services`
- `Built backend APIs` → `Built enterprise-scale backend APIs`
- `Improved API performance` → `Significantly improved API performance`

The same responsibility-escalation guard is characterized in English and Spanish.

## Architecture

The generation trust pipeline is now:

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

## Incidents found during execution

### CI attempt 1

TypeScript rejected direct iteration over `ReadonlySet` under the repository compiler target (`TS2802`). The implementation was rewritten to use target-compatible collection traversal without changing semantics.

### CI attempt 2

The adversarial corpus exposed that `enterprise-scale` was not included in the scale-qualifier catalog. The evaluator was corrected rather than weakening the test.

These failures were contained to the feature branch and never reached `develop`.

## Final validation

Final validated head before this documentation-only record: `e099240604b13f635c356b650884d90feb3a4abf`.

GitHub Actions run `31493712687`:

- `npm ci` — PASS
- lint — PASS
- typecheck — PASS
- behavior tests — PASS (`25/25`)
- build — PASS

Vercel preview/deployment — READY.

## Trust wording

This gate deliberately does **not** claim universal natural-language entailment or zero hallucinations.

`APPROVED` means the conservative high-risk semantic-drift guard found no unsupported escalation in the classes it evaluates, after deterministic factual grounding already passed.

## Gate

`G9 SEMANTIC_GROUNDING_EVALUATED — PASS (HIGH-RISK SEMANTIC DRIFT), UNIVERSAL ENTAILMENT NOT CLAIMED`
