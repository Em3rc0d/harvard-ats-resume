# Canonical Personas v0.1

## Purpose

CV Engine cannot qualify itself using one real CV as the entire test population. Canonical personas provide repeatable known-truth inputs across document shape, language, career depth, and adverse conditions.

## Persona registry

| ID | Scenario | Primary risk | Fixture status | Expected-truth status |
|---|---|---|---|---|
| P01 | Clean junior DOCX | baseline extraction/composition | PLANNED | PLANNED |
| P02 | Long senior DOCX | scale / repeated experience / latency | PLANNED | PLANNED |
| P03 | Spanish CV | multilingual section recognition and preservation | PLANNED | PLANNED |
| P04 | Sparse CV | missing optional sections without invention | PLANNED | PLANNED |
| P05 | Academic CV | education/honors/projects emphasis | PLANNED | PLANNED |
| P06 | Irregular DOCX | headings/layout/list ambiguity | PLANNED | PLANNED |
| P07 | Text PDF | PDF extraction/layout preservation | PLANNED | PLANNED |
| P08 | Incomplete Career Evidence | readiness and fail-closed materialization | PLANNED | PLANNED |
| P09 | Adversarial Job Description | JD leakage / unsupported candidate claims | PLANNED | PLANNED |
| P10 | Infrastructure fault persona | graceful degradation and recovery policy | PLANNED | N/A |

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

A persona moves from `PLANNED` to `REQUIRED` only when both its fixture and expected-truth contract are versioned in the repository. Release Gate cannot pass until every `REQUIRED` persona passes its full acceptance matrix.
