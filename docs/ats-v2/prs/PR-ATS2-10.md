# PR-ATS2-10 — Job Match Benchmarking & Calibration

## Objective

Measure the deterministic Job Intelligence + Job Match path against a labeled corpus before relying on its score for downstream resume composition/versioning.

This gate is deliberately narrower than real-world statistical validation. It establishes a reproducible controlled benchmark and fixes failures demonstrated by that benchmark. It does **not** claim universal matching accuracy across arbitrary job descriptions, industries, languages, or candidate histories.

## Baseline measurement

The first unmodified-engine run used 32 labeled English cases covering skills, aliases, tenure, responsibility, education, language, location, work authorization, certification, required/preferred weighting, and uncatalogued requirements.

Baseline result:

- cases: 32
- status checks: 30
- exact status accuracy: 70%
- false `MATCH`: 2
- false `GAP`: 0
- mismatches: 17

Key measured failures:

1. Short skill bullets such as `Go`, `AWS`, and `C#` could be discarded during statement extraction.
2. Skill tenure statements such as `5+ years TypeScript` could be emitted twice as `SKILL` and `EXPERIENCE`, distorting scoring.
3. Lexical overlap could falsely treat collaboration as leadership and maintenance as architecture responsibility.
4. A master-degree requirement was not distinguished strongly enough from bachelor evidence.
5. Exact language/proficiency and location evidence could remain only `POTENTIAL_MATCH`.
6. Preferred short skills could disappear, producing incorrect required/preferred scores.

One tenure fixture was also found to be incorrectly labeled by the benchmark itself: `Spring 2022` is parseable because it contains an explicit year. The fixture was corrected to a genuinely unparseable date rather than changing engine behavior to satisfy an invalid label.

## Corrections driven by the benchmark

### Job Intelligence

- accepts valid short requirement statements needed for skills such as Go, AWS, and C#;
- adds `go` as a canonical Go alias;
- prevents skill-tenure statements from being duplicated as separate generic experience requirements;
- removes the ambiguous Spanish education heuristic that treated `ingeniería` alone as proof of an education requirement.

### Job Match

- adds responsibility-intent discrimination for leadership, architecture, ownership, design, mentoring, management, implementation, maintenance, collaboration, and development;
- requires explicit same-authority evidence for high-authority responsibility requirements rather than allowing shared domain nouns to create a match;
- treats topical implementation evidence as only `POTENTIAL_MATCH` for a design requirement when design authority is not explicit;
- distinguishes bachelor and master degree levels conservatively;
- performs structured language + proficiency comparison;
- performs structured candidate-location comparison;
- preserves absent work-authorization evidence as `UNKNOWN`;
- keeps the existing required/preferred weighting model, now with complete requirement extraction for the controlled cases.

## EN/ES expansion

After the English corrections, the corpus was expanded from 32 to 42 cases by adding 10 Spanish cases across skills, tenure, responsibility, language, location, work authorization, education, and preference context.

The Spanish expansion exposed one additional real bug: `Liderar equipos de ingeniería` was classified as `EDUCATION` because the word `ingeniería` was treated as an educational signal by itself. The ambiguous signal was removed; the action verb now correctly controls this case as `RESPONSIBILITY`.

## Final controlled benchmark

Final head before documentation: `68badf380bebca9af311dc6e9fbe712812ed37db`.

GitHub Actions run `31495798689` measured:

- controlled cases: **42/42 correct**
- status checks: **40/40 correct**
- exact status accuracy: **100%**
- false `MATCH`: **0**
- false `GAP`: **0**
- EN: **32/32**
- ES: **10/10**

Category results:

- SKILL: 12/12
- TENURE: 4/4
- RESPONSIBILITY: 7/7
- EDUCATION: 3/3
- LANGUAGE: 4/4
- LOCATION: 3/3
- WORK_AUTHORIZATION: 3/3
- CERTIFICATION: 2/2
- SCORING: 2/2
- EXTRACTION: 2/2

The same run passed:

- `npm ci`
- lint
- typecheck
- all ATS v2 behavior tests
- production build

## Trust wording

A 100% result on this controlled corpus means the deterministic engine exactly reproduces the labels for the explicitly covered cases. It is **not** evidence of 100% real-world Job Match accuracy.

Real-world calibration still requires representative external job descriptions, candidate histories, independently labeled judgments, sample-size discipline, and error analysis under pilot conditions.

## Gate

`G10 CONTROLLED_MATCH_CALIBRATION — PASS (42-CASE EN/ES LABELED CORPUS), REAL-WORLD CALIBRATION NOT YET CLAIMED`

## Next architectural frontier

With candidate truth, source provenance, structured generation, deterministic/semantic grounding, and a controlled Job Match benchmark established, the next implementation frontier is runtime resume composition/versioning.

Real-world Match validation remains a later pilot-validation gate and should not be silently conflated with this controlled engineering benchmark.
