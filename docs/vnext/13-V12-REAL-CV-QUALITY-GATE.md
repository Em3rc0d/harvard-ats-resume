# CVEngine v1.2 — Real-CV Quality Gate

## Status

Authoritative acceptance contract for I9.

This gate exists because a technically green workflow is insufficient if a realistic CV is not materially improved. A factual output that is a near-copy, loses professional positioning, drifts language, or produces visibly poor pagination is not a release-quality result.

## Release equation

```text
ENGINEERING_GREEN
+
REAL_CV_QUALITY_ACCEPTED
+
REAL_PRODUCTION_UAT_PASS
=
eligible for Production qualification
```

`B9 GREEN + REAL_CV QUALITY FAIL = RELEASE BLOCKED`.

The real Production UAT is not replaced by representative fixtures. A fixture proves repeatability; the candidate CV proves that the product works on the class of document that motivated the feature.

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

## Hard gates — receipt v2

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
locale consistent                              true
material improvement present                   true
summary positioning preserved                  true
no sparse trailing PDF page                    true
```

No weighted average may override a failed hard gate.

### Locale consistency

Generated presentation follows the source locale. For a Spanish CV, CVEngine must not mix English structural headings such as `Professional Summary`, `Experience`, `Projects`, `Education`, `Certifications`, `Skills` or `Languages` into an otherwise Spanish document.

### Material improvement

Passing Fact Guardian is necessary but not sufficient. Narrative units are compared to their source-backed facts. A result dominated by near-copy summaries/bullets cannot be labelled a completed improvement.

Current deterministic contract:

```text
near-copy similarity ceiling             0.86
minimum materially changed narrative     0.30
```

A first safe candidate that misses this bar receives at most one additional bounded editor attempt. The second candidate is independently Fact-Guardian checked. CVEngine keeps the stronger safe result; no retry may bypass factual validation.

### Professional-summary preservation

Concision must not silently erase differentiating candidate-authored positioning. For a substantial source profile, CVEngine preserves enough source-backed semantic scope to retain high-signal themes such as technical breadth, operating domains, systems thinking and product orientation.

If the editor over-compresses the summary, the service may restore the source-backed profile before Fact Guardian rather than publish a weaker positioning statement.

### Pagination quality

The PDF renderer exposes deterministic layout diagnostics. A multi-page output whose final page is mostly empty is not accepted as release-quality. Compact contact/meta presentation is allowed because it changes presentation only, not facts.

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

## Production dogfood acceptance

Before final certification, the same realistic source class must pass in Production and the downloaded artifact must be manually reviewed against its source. The acceptance review checks at minimum:

- Fact Guardian reports no unsupported final claims;
- section language is coherent with the source;
- professional summary retains the candidate's differentiating positioning;
- experience/project narrative is materially improved rather than copied;
- no unsupported seniority, ownership, metrics, technologies or achievements appear;
- PDF/DOCX remain ATS-safe and readable;
- pagination has no mostly-empty trailing page;
- the generated document is not visually/professionally worse than the uploaded source.

The final `CERTIFIED FINAL` signature is withheld until this Production dogfood review passes.

## Negative fixtures

The release suite must preserve these behaviors:

- invented metric → Fact Guardian blocks or repairs;
- invented technology → Fact Guardian blocks or repairs;
- malformed structured output → bounded fallback / partial recovery;
- provider unavailable → truthful failure or source-preserving fallback, never fabricated success;
- conflicting role/date sources → conservative handling;
- unreadable/image-only input → safe refusal;
- factual near-copy → quality gate fails;
- mixed-language structural headings → quality gate fails;
- destructive summary compression → source-backed repair or quality gate fails;
- sparse final PDF page → quality gate fails.

## Product boundary

The quality gate asks whether CVEngine improves the candidate-authored story without changing it.

It does **not** ask whether the candidate can externally prove their biography.

```text
Believe the user's source.
Distrust the AI's additions.
Do not confuse factual safety with product quality.
```
