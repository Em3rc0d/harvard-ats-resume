# Current Product Contract — ATS v1 Baseline

## Product description

The current system is best described as:

`AI Resume Builder + Job Description Keyword Matcher + Resume Quality Heuristic + Import/OCR helpers`.

It is not yet treated by ATS v2 documentation as a validated simulation of any specific commercial ATS.

## Primary flow

```text
Manual Form / CV Upload / Certificate OCR
                |
                v
          ResumeRequest
                |
        +-------+-------+
        |               |
        v               v
     Gemini       ATS heuristic
        |               |
        +-------+-------+
                v
            Results
                |
                v
              PDF
```

## Inputs

Candidate identity, summary, experience, education, skills, projects, certifications, languages, optional job description, imported CV/certificate data.

## Outputs

Formatted resume text, matched/missing keyword information, suggestions, score presentation and PDF output.

## Important baseline contradictions

These are recorded only; they are intentionally not fixed in PR-ATS2-00:

- documentation promises no fabrication while the current AI prompt contains contradictory behavior
- current ATS score semantics differ between README and implementation
- CV import can infer missing dates
- certificate flow can infer education duration
- multilingual UI coverage is broader than the matching engine
- request-limit documentation and implementation are inconsistent
- current README claims production readiness while automated QA/CI is not established

## Baseline preservation rule

Later PRs must be able to explain which baseline behavior they intentionally preserve, replace or remove.
