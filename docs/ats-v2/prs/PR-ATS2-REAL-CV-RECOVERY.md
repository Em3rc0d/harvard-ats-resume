# PR-ATS2 — Real-CV Runtime Recovery

## Status

Release-hardening change set for the real resume ingestion and trusted ResumeVersion materialization path.

## Field evidence

A real local CV run exposed two independent release-blocking failures:

1. Native PDF import failed inside the Next.js 16/Webpack Route Handler runtime with:
   - `TypeError: Object.defineProperty called on non-object`
   - boundary: dynamic `pdfjs-dist/legacy/build/pdf.mjs` import in `NativeResumeImportProvider`.
2. A prior successful import reached generation, passed deterministic and semantic grounding, then failed provenance materialization with:
   - `Resume composition found no material candidate claims in the approved resume.`

The second failure occurred before Career Vault persistence. The prior UI incorrectly presented composition failure as a storage failure.

## Root-cause contract

### PDF runtime

The native importer already used PDF.js's Node-compatible legacy entry, but Next/Webpack still bundled the dependency in the server Route Handler. The recovery keeps `pdfjs-dist` external to the Next server bundle so Node resolves the package natively, while the browser certificate flow retains its legacy PDF.js alias.

### Resume structure and provenance

`formattedResume` crosses the AI boundary as one JSON string. Real provider output can preserve resume wording while serializing line breaks as literal `\\n` text or compressing standard headings and bullets. Runtime composition is line-oriented, so presentation serialization defects could result in zero discovered material claims.

The recovery adds deterministic presentation-only normalization before provenance materialization and tightens the generation formatting contract. It also removes the unconditional rule that every first non-empty line is presentation-only.

### Support matching

Composition remains fail-closed. Longer rewritten claims require at least two independent support anchors and a minimum overlap score; atomic claims may be supported by one anchor. Unsupported material wording still emits no ResumeClaim and no ResumeVersion.

### Error UX

`COMPOSITION_FAILURE` and `CAREER_VAULT_PERSISTENCE_FAILURE` are separate states. Composition failure now communicates traceability/materialization failure and does not claim that storage was attempted.

## Trust invariants preserved

- No source/candidate evidence -> no candidate fact.
- No candidate assertion support -> no ResumeClaim.
- Job Description requirements remain external market truth and cannot become candidate truth.
- Missing evidence never authorizes invention.
- Guardrail failure never silently continues.
- Career Vault durability is claimed only after persistence and reload verification succeed.

## Regression coverage

The release-hardening suite covers:

- PDF.js browser/server runtime separation;
- Node PDF text extraction;
- literal `\\n` resume serialization;
- compressed one-line standard headings and bullets;
- material first-line claims that must not be discarded as identity headers;
- multi-anchor fact-preserving paraphrases;
- unsupported fabricated material wording remaining rejected;
- composition versus persistence UX separation;
- existing Career Vault, provenance-identity and ResumeVersion contracts.

## Validation discipline

Only the exact final PR head may close this incident. Required checks:

1. clean dependency install;
2. dependency audit;
3. lint;
4. TypeScript typecheck;
5. complete ATS v2 behavior suite;
6. production Next.js/Webpack build.

Earlier red CI attempts are retained as useful evidence of two pre-merge defects found by the gate: an ES target-incompatible test regex and an overlapping-heading normalization bug. Neither failure was bypassed; both were corrected in implementation/test code before the final validation run.

## Release boundary

This change set hardens the two observed real-CV failures. It does not claim that CV Engine is fully release-ready by itself, nor does it weaken the broader ATS v2 evidence, matching, market, or anti-hallucination contracts.
