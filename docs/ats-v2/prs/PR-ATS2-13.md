# PR-ATS2-13 — Explainability UX & Score Semantics Migration

## Objective

Turn the ATS v2 truth, matching, grounding, provenance, versioning, and Career Vault architecture into a user-facing product that can answer a basic trust question:

> Why is the system telling me this?

Before this gate, the production API already exposed Job Match, ResumeVersion, ResumeManifest, ResumeClaims, and Career Vault metadata, but `app/page.tsx` and `ResumeResults.tsx` still treated the old keyword-based `atsScore`, matched keywords, and missing keywords as the primary result contract.

G13 removes that semantic mismatch from the primary UX.

## Product score semantics

The product now presents three distinct concepts rather than one ambiguous “ATS compatibility” number.

### Job Match

- target-dependent;
- only exists when a Job Description produced explicit requirements;
- computed by the existing deterministic Job Match v2 engine;
- compares JobRequirements only against candidate CareerAssertions;
- exposes requirement-level status, rationale, and supporting candidate assertions;
- does not create candidate truth.

No Job Description means no Job Match score.

### Resume Quality

`ProductEvaluationService` introduces `ats2-product-evaluation-v1` with deterministic content-quality checks over the candidate data and rendered resume.

Current weighted checks cover:

- professional-summary size;
- substantive experience descriptions;
- action-oriented experience wording;
- focused, non-duplicated skills inventory;
- education context;
- unusually dense rendered lines.

An explicit zero-weight truth-boundary check states that numeric achievements are **not required** for a good score. Metrics should be added only when true and supportable. The evaluator never rewards fabrication.

Scope statement:

> Deterministic resume-content quality checks. This is not a recruiter acceptance probability.

### ATS Parseability

`ProductEvaluationService` also introduces a deterministic structural-readability metric based on:

- extractable plain text;
- detectable candidate identity/contact text;
- recognizable standard section headings;
- linear reading flow without table/box-drawing syntax;
- absence of extremely dense rendered lines.

Scope statement:

> Deterministic structural parseability checks over the generated plain-text resume.

The UI also exposes the explicit boundary that this metric does **not** predict a score from Workday, Greenhouse, Lever, or another commercial ATS.

### Job Description independence

Resume Quality and ATS Parseability do not consume Job Description requirements or keywords.

Dedicated regressions prove that changing or keyword-stuffing the target Job Description cannot improve either metric.

## Explainable Job Match UX

The API now resolves each matched assertion ID back to the candidate assertion catalog and exposes an evidence view containing:

- assertion ID;
- assertion statement;
- truth class;
- source IDs;
- evidence IDs.

`ResumeResults` groups requirements by:

- REQUIRED;
- PREFERRED;
- UNKNOWN necessity.

Each requirement preserves the existing matching state:

- MATCH;
- POTENTIAL_MATCH;
- GAP;
- UNKNOWN;
- BLOCKER.

These states are intentionally not collapsed. In particular:

- UNKNOWN is not GAP;
- POTENTIAL_MATCH is not MATCH.

Expandable requirement cards show the engine rationale and the candidate assertions used as support. A requirement with no linked candidate assertion says so instead of inventing evidence.

Job Description content itself is never surfaced as candidate evidence.

## Resume claim traceability

Every material generated ResumeClaim already had complete assertion provenance from G11/G12. G13 exposes that graph to the current request UI.

For each generated claim, the result contract now provides:

- claim ID;
- generated wording;
- supporting assertion IDs;
- the corresponding candidate assertion statements and provenance identifiers.

The UI makes these links expandable so the user can inspect why generated wording was allowed.

This is a presentation of existing approved provenance. G13 does not weaken or replace deterministic grounding, semantic grounding, or ResumeManifest validation.

## Current version integrity

The result screen now exposes a technical-details panel for the current generated version showing:

- durable Career Vault persistence status;
- complete claim provenance status;
- content hash status;
- ResumeVersion ID;
- exact content SHA-256;
- Career Vault revision;
- generation model.

This uses data returned by the current generation request. G13 does **not** add a public Career Vault read/browse endpoint and does not claim authenticated vault ownership.

## Legacy score migration

The old keyword-based fields are retained in the API for compatibility:

- `atsScore`;
- `matchedKeywords`;
- `missingKeywords`;
- legacy suggestions.

They are additionally marked through:

`legacyAnalysis.status = LEGACY_COMPATIBILITY_ONLY`

`ResumeResults` no longer presents the old score as “ATS Compatibility Score” and no longer uses matched/missing keyword lists as the primary analysis surface.

The compatibility fields can be removed in a later contract-cleanup migration after consumers are confirmed migrated.

## Frontend contract migration

`app/page.tsx` no longer stores the result as the ATS v1 shape.

It now consumes `GeneratedResumeResult`, which explicitly models:

- ProductEvaluation;
- optional ExplainableJobMatch;
- ClaimTraceability;
- ResumeVersion metadata;
- durable Career Vault metadata;
- legacy compatibility fields separately.

This closes the prior gap where the backend returned ATS v2 objects that the frontend silently ignored.

## Behavioral verification

G13 adds seven dedicated regressions:

1. Resume Quality and ATS Parseability are deterministic and independent from target Job Description.
2. Target keyword stuffing cannot improve either metric.
3. Resume Quality never requires fabricated numeric achievements.
4. Table-like formatting reduces structural parseability without changing Resume Quality.
5. MATCH, POTENTIAL_MATCH, GAP, and UNKNOWN remain separate product states.
6. REQUIRED and PREFERRED requirements remain separate product groups.
7. Missing Job Description produces no Job Match product summary.

The complete ATS v2 suite on corrected feature head `7115ee15f8452d7fa1e6ffccd82cdba089749386` produced:

- behavior tests: `48/48` PASS;
- failures: `0`;
- G10 controlled benchmark: `42/42` labeled EN/ES cases;
- false MATCH: `0` in that controlled corpus;
- false GAP: `0` in that controlled corpus.

GitHub Actions run `31544373791` passed:

- `npm ci` — PASS;
- lint — PASS;
- typecheck — PASS;
- behavior tests — PASS;
- production build — PASS.

Vercel status for the same corrected feature head — SUCCESS.

## Incident and correction

### First G13 CI run — readonly presenter accumulator

The first authoritative CI run (`31544294997`) passed installation and lint but failed typecheck before behavior tests/build.

`ExplainabilityPresenter` exposed `RequirementStatusCounts` as readonly, then reused that readonly type for the local accumulator and attempted to increment status counters.

TypeScript correctly rejected writes to `MATCH`, `POTENTIAL_MATCH`, `GAP`, `UNKNOWN`, and `BLOCKER`.

Repair:

- the internal accumulator now uses mutable `Record<ExplainableRequirementStatus, number>`;
- the public `RequirementStatusCounts` output remains readonly;
- no status semantics or tests were weakened.

The corrected run passed all checks.

## Trust boundary / non-goals

G13 does **not** claim:

- that Resume Quality predicts recruiter acceptance;
- that ATS Parseability predicts a proprietary commercial ATS score;
- that either new deterministic metric is statistically calibrated against real hiring outcomes;
- that G10's controlled Match benchmark is real-world Match calibration;
- authenticated Career Vault ownership;
- public Career Vault browsing/history UX;
- cross-device vault recovery;
- retention/deletion/privacy-policy completeness;
- universal semantic entailment;
- zero LLM hallucinations outside the evaluated grounding boundaries.

The metric version is explicit (`ats2-product-evaluation-v1`) so its meaning can evolve without silently redefining historical semantics.

## Gate

`G13 EXPLAINABLE_PRODUCT_UX — PASS (DISTINCT SCORE SEMANTICS + REQUIREMENT/CLAIM EVIDENCE TRACEABILITY), LEGACY SCORE RETAINED AS COMPATIBILITY PAYLOAD ONLY`

Supporting statements:

`JOB_MATCH_WITHOUT_TARGET — NOT APPLICABLE / NO SCORE`

`RESUME_QUALITY_V1 — DETERMINISTIC PRODUCT METRIC, REAL-WORLD OUTCOME CALIBRATION NOT CLAIMED`

`ATS_PARSEABILITY_V1 — STRUCTURAL READABILITY METRIC, COMMERCIAL ATS SCORE PREDICTION NOT CLAIMED`

## Next frontier

After G13, the strongest remaining trust/product risks move away from hidden explainability and toward account/privacy hardening, observability, legacy-contract cleanup, real-world calibration, and pilot validation.
