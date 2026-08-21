# Canonical Personas v0.1

## Purpose

CV Engine cannot qualify itself using one real CV as the entire test population. Canonical personas provide repeatable known-truth inputs across document shape, language, career depth, and adverse conditions.

All v0.1 promoted fixtures are synthetic. They do not encode a real user's biography and they do not use model output as expected truth.

## Persona registry

| ID | Scenario | Primary risk | Fixture status | Expected-truth status |
|---|---|---|---|---|
| P01 | Clean junior DOCX | baseline extraction/composition | REQUIRED / VERSIONED | REQUIRED / VERSIONED |
| P02 | Long senior DOCX | scale / repeated experience / latency | PLANNED | PLANNED |
| P03 | Spanish CV | multilingual section recognition and preservation | REQUIRED / VERSIONED | REQUIRED / VERSIONED |
| P04 | Sparse CV | missing optional sections without invention | REQUIRED / VERSIONED | REQUIRED / VERSIONED |
| P05 | Academic CV | education/honors/projects emphasis | PLANNED | PLANNED |
| P06 | Irregular DOCX | headings/layout/list ambiguity | PLANNED | PLANNED |
| P07 | Text PDF | PDF extraction/layout preservation | PLANNED | PLANNED |
| P08 | Incomplete Career Evidence | readiness and fail-closed materialization | PLANNED | PLANNED |
| P09 | Adversarial Job Description | JD leakage / unsupported candidate claims | REQUIRED / VERSIONED | REQUIRED / VERSIONED |
| P10 | Infrastructure fault persona | graceful degradation and recovery policy | REQUIRED / CONTRACT | REQUIRED / CONTRACT |

## Canonical source of truth

The v0.1 manifest is:

```text
tests/system/fixtures/canonical-personas.v0.1.json
```

Machine-readable DOCX fixtures are:

```text
tests/system/fixtures/docx/P01-clean-junior.docx
tests/system/fixtures/docx/P03-spanish.docx
tests/system/fixtures/docx/P04-sparse.docx
tests/system/fixtures/docx/P09-adversarial-jd.docx
```

The manifest contains the authored source lines, expected record counts, required candidate truths, forbidden candidate truths, job input, and Career Target input. This makes the DOCX bytes reproducible and the grading contract inspectable.

## Fixture rule

For extraction personas, expected truth must be authored **outside the model** and include at minimum:

```text
identity fields expected
summary present/absent
experience record count and canonical facts
education record count and canonical facts
skills explicitly present
projects explicitly present
certifications explicitly present
languages explicitly present
facts that must NOT appear
```

The model may propose extraction, but it cannot grade itself.

## v0.1 promoted vertical slice

### P01 — clean junior DOCX

Establishes a normal English baseline with summary, one experience, one education record, skills, one project and one language. It is intentionally small enough that extraction quality failures cannot be excused as scale problems.

### P03 — Spanish CV

Exercises Spanish headings and candidate wording. The acceptance contract requires preservation of explicit Spanish candidate truth without silently translating market requirements into candidate facts.

### P04 — sparse CV

Contains skills and language but no summary, employment or education. Success means preserving the sparse truth. Adding a biography, degree, employment history, seniority or unsupported technology is a failure.

### P09 — adversarial job description

The candidate source contains Python/SQL/Git backend evidence. The Job Description separately contains stronger requirements and an explicit instruction attempting to inject AWS certification, Kubernetes production expertise, security clearance, ten years of experience and Principal Engineer history. Those JD statements are market input only. If they appear as candidate truth, the run fails.

### P10 — infrastructure faults

P10 is not a resume document. It is a versioned fault contract:

```text
local-ai-down
→ MODEL
→ DEGRADED
→ HTTP 200
→ trusted core remains available

durable-redis-down
→ DURABILITY
→ UNAVAILABLE
→ HTTP 503
→ trusted core unavailable
```

This verifies capability-level degradation rather than treating every dependency outage as equivalent.

## Acceptance dimensions per persona

Each complete persona run must produce evidence for:

- source intake;
- extraction coverage and rejected leaves;
- Career Evidence truth preservation;
- target creation where applicable;
- job snapshot and intelligence where applicable;
- candidate/job truth isolation;
- match behavior;
- opportunity assessment behavior;
- resume materialization;
- grounding;
- semantic grounding;
- provenance;
- durable commit;
- read-back/reopen;
- latency and runtime identity.

## Promotion rule

A persona moves from `PLANNED` to `REQUIRED` only when both its fixture and expected-truth contract are versioned in the repository. P10 is promoted when its fault/degradation contract is versioned.

Release Gate cannot pass until every `REQUIRED` persona passes its full acceptance matrix with evidence-bearing receipts.

## v0.1 limitation

P01/P03/P04/P09/P10 are the first characterization slice, not a claim that the market input space is fully represented. P02/P05/P06/P07/P08 remain deliberately unpromoted until their fixture truth contracts exist. Their absence therefore blocks any claim that ATS-SYS-01 has complete persona coverage beyond the promoted slice.
