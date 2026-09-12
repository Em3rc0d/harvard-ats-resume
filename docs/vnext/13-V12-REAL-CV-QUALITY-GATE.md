# CVEngine v1.2 — Real-CV Quality Gate

## Status

Authoritative acceptance contract for I9.

This gate exists because a technically green workflow is insufficient if a realistic CV is not materially improved.

## Release equation

```text
ENGINEERING_GREEN
+
REAL_CV_QUALITY_ACCEPTED
=
eligible for Production qualification
```

`B9 GREEN + REAL_CV QUALITY FAIL = RELEASE BLOCKED`.

## Privacy boundary

Real candidate CV bytes and text remain outside Git.

The repository may contain sanitized representative fixtures, but a private dogfood receipt must contain only:

- source SHA-256;
- improvement run UUID;
- generated-document SHA-256;
- Fact Guardian report SHA-256;
- artifact manifest SHA-256;
- hard-gate counters/booleans;
- rubric scores;
- evaluator type;
- timestamp;
- short non-PII notes.

The receipt schema must reject raw source text, email, phone, names, links or other candidate PII fields.

## Hard gates

All must pass:

```text
source parses successfully                     true
semantic entities materially correct           true
candidate assertions remain usable             true
unsupported new claims                         0
invented metrics                               0
invented employers / roles / dates             0
DOCX valid                                     true
PDF valid                                      true
source → output provenance present              true
```

No weighted average may override a failed hard gate.

## Quality rubric

Scores use an integer 1–5 scale.

| Dimension | Minimum |
| --- | ---: |
| FACTUAL_FIDELITY | 5 |
| ATS_STRUCTURE | 4 |
| CLARITY | 4 |
| CONCISION | 4 |
| PROFESSIONAL_POSITIONING | 4 |
| REDUNDANCY_REDUCTION | 4 |
| READABILITY | 4 |
| DOWNLOAD_VALIDITY | 5 |

A factual but mediocre rewrite is not release quality.

## Required representative complexity

At least one acceptance source must be equivalent in complexity to the dogfood CV that triggered Contract 11:

- Spanish content;
- professional profile;
- professional employment;
- multiple engineering projects;
- dense technology lists;
- education;
- certifications;
- languages;
- candidate assertions that are not externally verified.

## Negative fixtures

The release suite must preserve these behaviors:

- invented metric → Fact Guardian blocks or repairs;
- invented technology → Fact Guardian blocks or repairs;
- malformed structured output → bounded fallback / partial recovery;
- provider unavailable → truthful failure or source-preserving fallback, never fabricated success;
- conflicting role/date sources → conservative handling;
- unreadable/image-only input → safe refusal.

## Product boundary

The quality gate asks whether CVEngine improves the candidate-authored story without changing it.

It does **not** ask whether the candidate can externally prove their biography.

```text
Believe the user's source.
Distrust the AI's additions.
```
